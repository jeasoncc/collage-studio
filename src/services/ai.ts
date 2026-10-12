import type { MediaAsset, ProgressCallback, CutoutModelKind } from '../types';
import type { BackgroundRequest, BackgroundResponse } from '../workers/background.worker';
import { canvasToBlob, getAnimatedFrame } from './media';

interface PendingRemoval {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
  progress?: ProgressCallback;
  latestProgress: number;
  cleanup: () => void;
}
const pending = new Map<string, PendingRemoval>();
let backgroundWorker: Worker | null = null;

function startWorker(): Worker {
  if (backgroundWorker) return backgroundWorker;
  const worker = new Worker(new URL('../workers/background.worker.ts', import.meta.url), { type: 'module' });
  backgroundWorker = worker;
  worker.onmessage = (event: MessageEvent<BackgroundResponse>) => {
    if (backgroundWorker !== worker) return;
    const message = event.data;
    const request = pending.get(message.id);
    if (!request) return;
    if (message.type === 'progress') {
      request.latestProgress = Math.max(request.latestProgress, message.progress);
      request.progress?.(request.latestProgress, message.message);
      return;
    }
    pending.delete(message.id);
    request.cleanup();
    if (message.type === 'result') {
      request.progress?.(1, '本地分割完成，已生成透明 PNG；复杂主体请检查边缘效果。');
      request.resolve(message.blob);
    } else request.reject(new Error(message.message));
  };
  worker.onerror = (event) => {
    event.preventDefault();
    if (backgroundWorker !== worker) return;
    worker.terminate(); backgroundWorker = null;
    for (const request of pending.values()) { request.cleanup(); request.reject(new Error('抠图模型工作线程无法运行，请使用支持 WebAssembly 的现代浏览器，并检查模型下载网络。')); }
    pending.clear();
  };
  return worker;
}

export async function removeBackground(asset: MediaAsset, model: CutoutModelKind, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<Blob> {
  if (asset.kind === 'video' || asset.kind === 'audio') throw new Error('抠图仅支持静态照片，不能直接处理音视频。');
  if (asset.width * asset.height > 20_000_000) throw new Error('照片超过 2000 万像素，请缩小后再进行抠图。');
  if (signal?.aborted) throw new DOMException('抠图已取消。', 'AbortError');
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') throw new Error('当前浏览器不支持本机抠图模型，请使用新版 Chrome、Edge 或 Safari。');
  let input = asset.blob;
  if (asset.mime === 'image/gif') {
    onProgress?.(0, 'GIF 仅对第一帧进行抠图，结果为静态透明 PNG。');
    input = await canvasToBlob(await getAnimatedFrame(asset, 0));
  } else if (asset.mime === 'image/svg+xml' || (asset.mime === 'image/webp'
    && navigator.userAgent.includes('AppleWebKit') && !navigator.userAgent.includes('Chrome/') && !navigator.userAgent.includes('Chromium/'))) {
    // WebKit's worker decoder cannot read WebP; rasterize with its working main-thread decoder.
    const image = new Image(); image.src = asset.src;
    try { await image.decode(); } catch { throw new Error('无法读取此图片。'); }
    const canvas = document.createElement('canvas'); canvas.width = asset.width; canvas.height = asset.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建图片画布。');
    context.drawImage(image, 0, 0);
    input = await canvasToBlob(canvas);
    canvas.width = canvas.height = 0;
  }
  if (signal?.aborted) throw new DOMException('抠图已取消。', 'AbortError');
  const worker = startWorker();
  const id = crypto.randomUUID();
  const { promise, resolve, reject } = Promise.withResolvers<Blob>();
  const cancel = () => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id); request.cleanup();
    worker.postMessage({ type: 'cancel', id } satisfies BackgroundRequest);
    reject(new DOMException('抠图已取消。', 'AbortError'));
    // Terminating an unused worker stops a download/inference immediately. Other callers stay alive.
    if (!pending.size && backgroundWorker === worker) { worker.terminate(); backgroundWorker = null; }
  };
  pending.set(id, { resolve, reject, progress: onProgress, latestProgress: 0, cleanup: () => signal?.removeEventListener('abort', cancel) });
  signal?.addEventListener('abort', cancel, { once: true });
  worker.postMessage({ type: 'remove', id, blob: input, model } satisfies BackgroundRequest);
  return promise;
}


