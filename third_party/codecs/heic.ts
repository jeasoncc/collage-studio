import createModule from './generated/heif.js';

let modulePromise: Promise<HeifModule> | undefined;

export async function heicToPng(blob: Blob): Promise<Blob> {
  const module = await (modulePromise ??= createModule().catch((error: unknown) => {
    modulePromise = undefined;
    throw error;
  }));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const input = module._malloc(bytes.byteLength);
  if (!input) throw new Error('HEIC memory allocation failed');
  let decoded = 0;
  let canvas: HTMLCanvasElement | undefined;
  try {
    module.HEAPU8.set(bytes, input);
    decoded = module._collage_heif_decode(input, bytes.byteLength);
    if (!decoded) throw new Error('HEIC decoding failed');
    const width = module._collage_heif_width(decoded);
    const height = module._collage_heif_height(decoded);
    const stride = module._collage_heif_stride(decoded);
    const pixels = module._collage_heif_pixels(decoded);
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    const image = context.createImageData(width, height);
    for (let row = 0; row < height; row++) {
      image.data.set(module.HEAPU8.subarray(pixels + row * stride, pixels + row * stride + width * 4), row * width * 4);
    }
    context.putImageData(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas!.toBlob((result) => result ? resolve(result) : reject(new Error('PNG encoding failed')), 'image/png');
    });
  } finally {
    if (decoded) module._collage_heif_free(decoded);
    module._free(input);
    if (canvas) canvas.width = canvas.height = 0;
  }
}

export interface HeifModule {
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _collage_heif_decode(ptr: number, size: number): number;
  _collage_heif_free(decoded: number): void;
  _collage_heif_width(decoded: number): number;
  _collage_heif_height(decoded: number): number;
  _collage_heif_stride(decoded: number): number;
  _collage_heif_pixels(decoded: number): number;
}
