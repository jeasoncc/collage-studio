import { ImageProcessor, PreTrainedModel, RawImage, env, pipeline } from '@huggingface/transformers';
import type { CutoutModelKind } from '../types';
import ortModuleUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import ortBinaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

declare const __COLLAGE_NATIVE__: boolean;

export type BackgroundRequest = { type: 'remove'; id: string; blob: Blob; model: CutoutModelKind } | { type: 'cancel'; id: string };
export type BackgroundResponse =
  | { type: 'progress'; id: string; progress: number; message: string }
  | { type: 'result'; id: string; blob: Blob }
  | { type: 'error'; id: string; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
env.allowLocalModels = false;
env.useBrowserCache = true;
if (__COLLAGE_NATIVE__) {
  env.backends.onnx.wasm!.wasmPaths = {
    mjs: new URL(ortModuleUrl, import.meta.url).href,
    wasm: new URL(ortBinaryUrl, import.meta.url).href,
  };
}
const requests = new Map<string, Blob>();
interface CutoutModel { remove(blob: Blob): Promise<RawImage>; dispose(): Promise<void>; }
let modelPromise: Promise<CutoutModel> | null = null;
let loadedKind: CutoutModelKind | null = null;
let queue = Promise.resolve();

function report(id: string, progress: number, message: string) {
  if (requests.has(id)) scope.postMessage({ type: 'progress', id, progress, message } satisfies BackgroundResponse);
}
async function getModel(kind: CutoutModelKind): Promise<CutoutModel> {
  if (modelPromise && loadedKind !== kind) {
    await (await modelPromise).dispose();
    modelPromise = null;
  }
  if (!modelPromise) {
    loadedKind = kind;
    const progress_callback = (event: { status: string; progress?: number }) => {
      const progress = typeof event.progress === 'number' ? Math.min(.72, event.progress / 100 * .72) : .03;
      const message = kind === 'portrait' ? '正在下载 / 加载 MODNet 人像模型（Apache-2.0），照片留在本机…' : '正在下载 / 加载 U²-Netp 通用模型（Apache-2.0，约 4.6 MB），照片留在本机…';
      for (const id of requests.keys()) report(id, progress, message);
    };
    modelPromise = (async () => {
      if (kind === 'portrait') {
        const model = await pipeline('background-removal', 'Xenova/modnet', { dtype: 'fp32', device: 'wasm', progress_callback });
        return { remove: (blob: Blob) => model(blob), dispose: async () => { await model.dispose(); } };
      }
      const modelId = 'BritishWerewolf/U-2-Netp';
      // The provider's custom Auto classes are not registered in Transformers.js;
      // use its generic image processor and encoder-only ONNX model contract.
      const processor = await ImageProcessor.from_pretrained(modelId);
      const model = await PreTrainedModel.from_pretrained(modelId, { dtype: 'fp32', device: 'wasm', progress_callback });
      const { input_name, output_composite } = model.config as typeof model.config & { input_name: string; output_composite: string };
      return {
        remove: async (blob: Blob) => {
          const image = await RawImage.read(blob);
          const { pixel_values, reshaped_input_sizes } = await processor(image);
          const output = await model({ [input_name]: pixel_values });
          const [height, width] = reshaped_input_sizes[0]!;
          const paddedMask = RawImage.fromTensor(output[output_composite][0].mul_(255).to('uint8'));
          const mask = await (await paddedMask.crop([0, 0, width - 1, height - 1])).resize(image.width, image.height);
          return image.putAlpha(mask);
        },
        dispose: async () => { await model.dispose(); },
      };
    })().catch((error: unknown) => { modelPromise = null; loadedKind = null; throw error; });
  }
  return modelPromise;
}
async function remove(id: string, blob: Blob, kind: CutoutModelKind) {
  try {
    if (!requests.has(id)) return;
    report(id, .01, kind === 'portrait' ? '正在准备快速人像模型…' : '正在准备轻量通用模型；适合人物、宠物和物品，请检查细小边缘。');
    const model = await getModel(kind);
    if (!requests.has(id)) return;
    report(id, .78, '正在本机进行真实主体分割，照片不会上传…');
    const result = await model.remove(blob);
    if (!requests.has(id)) return;
    const canvas = new OffscreenCanvas(result.width, result.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建抠图画布。');
    const rgba = result.data instanceof Uint8ClampedArray ? result.data : new Uint8ClampedArray(result.data.buffer, result.data.byteOffset, result.data.byteLength);
    // Browser image decoding and RawImage's RGBA conversion own a non-shared pixel buffer.
    context.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, result.width, result.height), 0, 0);
    report(id, 0.95, '正在生成透明 PNG…');
    const output = await canvas.convertToBlob({ type: 'image/png' });
    canvas.width = canvas.height = 0;
    if (requests.has(id)) scope.postMessage({ type: 'result', id, blob: output } satisfies BackgroundResponse);
  } catch (error) {
    if (requests.has(id)) scope.postMessage({ type: 'error', id, message: `本地抠图失败：${error instanceof Error ? error.message : String(error)}。请检查模型下载网络与设备内存；原照片没有被替换。` } satisfies BackgroundResponse);
  } finally { requests.delete(id); }
}
scope.onmessage = (event: MessageEvent<BackgroundRequest>) => {
  const message = event.data;
  if (message.type === 'cancel') { requests.delete(message.id); return; }
  requests.set(message.id, message.blob);
  // Shared model initialization is single-flight; ONNX inference is serialized to avoid session races.
  queue = queue.then(() => remove(message.id, message.blob, message.model)).catch(() => undefined);
};
