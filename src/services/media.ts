import pica from 'pica';
import { heicToPng } from '../../third_party/codecs/heic';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { GifFrame } from 'gifuct-js';
import type { MediaAsset, ProgressCallback } from '../types';

const resizer = pica();
const MAX_BYTES = 150 * 1024 * 1024;
const MAX_PIXELS = 60_000_000;
const PREVIEW_SIDE = 1280;
const imagePreviews = new WeakMap<MediaAsset, string>();
const IMAGE_TYPES: Record<string, true> = { 'image/jpeg': true, 'image/png': true, 'image/webp': true, 'image/svg+xml': true, 'image/gif': true };
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/mp4',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac',
};
export interface ImportFailure { name: string; message: string; }
export interface MediaImportProgress {
  index: number;
  name: string;
  stage: 'reading' | 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
  asset?: MediaAsset;
}
type AssetProgress = (stage: 'reading' | 'processing', progress: number, message: string) => void;
const importFailures = new WeakMap<MediaAsset[], ImportFailure[]>();
export function getImportFailures(assets: MediaAsset[]): ImportFailure[] {
  return importFailures.get(assets) ?? [];
}
interface GifPlayback {
  frames: GifFrame[];
  ends: number[];
  duration: number;
  canvas: HTMLCanvasElement;
  patchCanvas: HTMLCanvasElement;
  background: string | null;
  index: number;
  restore: ImageData | null;
}
const animatedImages = new WeakMap<MediaAsset, GifPlayback>();

function canvas(width: number, height: number): HTMLCanvasElement {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  return result;
}
function context2d(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = target.getContext('2d');
  if (!context) throw new Error('浏览器无法创建图像画布，请检查设备可用内存。');
  return context;
}
function validateDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    throw new Error('图像尺寸无效或超过 6000 万像素，请先缩小文件。');
  }
}
export function canvasToBlob(target: HTMLCanvasElement, mime = 'image/png', quality = 0.92): Promise<Blob> {
  const { promise, resolve, reject } = Promise.withResolvers<Blob>();
  target.toBlob((blob) => {
    if (!blob) reject(new Error('图像编码失败，请减小导出尺寸。'));
    else if (blob.type !== mime) reject(new Error(`当前浏览器不支持 ${mime.split('/')[1]?.toUpperCase()} 编码。`));
    else resolve(blob);
  }, mime, quality);
  return promise;
}
function loadImage(src: string): Promise<HTMLImageElement> {
  const { promise, resolve, reject } = Promise.withResolvers<HTMLImageElement>();
  const image = new Image();
  const timer = setTimeout(() => { image.src = ''; reject(new Error('图片解码超时，请检查文件是否损坏。')); }, 30_000);
  image.onload = () => { clearTimeout(timer); resolve(image); };
  image.onerror = () => { clearTimeout(timer); reject(new Error('无法读取这张图片，文件可能已损坏或浏览器不支持此格式。')); };
  image.src = src;
  return promise;
}
async function thumbnail(source: CanvasImageSource, width: number, height: number): Promise<string> {
  const scale = Math.min(1, 320 / Math.max(width, height));
  const preview = canvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  try {
    const context = context2d(preview);
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, preview.width, preview.height);
    return URL.createObjectURL(await canvasToBlob(preview));
  } finally {
    preview.width = preview.height = 0;
  }
}
async function resizeImage(image: HTMLImageElement, maxSide: number): Promise<HTMLCanvasElement> {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const target = canvas(Math.max(1, Math.round(image.naturalWidth * scale)), Math.max(1, Math.round(image.naturalHeight * scale)));
  try {
    await resizer.resize(image, target);
    return target;
  } catch (error) {
    target.width = target.height = 0;
    throw error;
  }
}
/** Runtime-only preview; project files and drafts retain the unchanged original. */
export function imagePreviewSource(asset: MediaAsset): string {
  return imagePreviews.get(asset) ?? asset.src;
}
/** Decode originals one at a time and retain only the pixels needed by the export. */
export async function resizeAssetImage(asset: MediaAsset, maxSide: number): Promise<HTMLCanvasElement> {
  const image = await loadImage(asset.src);
  try { return await resizeImage(image, maxSide); }
  finally { image.src = ''; }
}
function readGifBytes(blob: Blob, onProgress?: AssetProgress): Promise<ArrayBuffer> {
  if (!onProgress) return blob.arrayBuffer();
  const { promise, resolve, reject } = Promise.withResolvers<ArrayBuffer>();
  const reader = new FileReader();
  const cleanup = () => { reader.onload = reader.onerror = reader.onabort = reader.onprogress = null; };
  reader.onprogress = (event) => {
    if (event.lengthComputable && event.total > 0) onProgress('reading', 0.4 + 0.15 * Math.min(1, event.loaded / event.total), '正在读取 GIF 动画数据…');
  };
  reader.onload = () => {
    const result = reader.result;
    cleanup();
    if (result instanceof ArrayBuffer) resolve(result);
    else reject(new Error('无法读取 GIF 动画数据。'));
  };
  reader.onerror = () => { const error = reader.error; cleanup(); reject(error ?? new Error('无法读取 GIF 动画数据。')); };
  reader.onabort = () => { cleanup(); reject(new Error('GIF 动画数据读取中断。')); };
  reader.readAsArrayBuffer(blob);
  return promise;
}
async function inspectGif(blob: Blob, onProgress?: AssetProgress): Promise<GifPlayback> {
  const bytes = await readGifBytes(blob, onProgress);
  onProgress?.('processing', 0.55, 'GIF 数据已读取，正在解码动画帧…');
  const gif = parseGIF(bytes);
  validateDimensions(gif.lsd.width, gif.lsd.height);
  let totalPixels = 0;
  for (const frame of gif.frames) {
    if (!frame.image) continue;
    const { left, top, width, height } = frame.image.descriptor;
    if (width < 1 || height < 1 || left + width > gif.lsd.width || top + height > gif.lsd.height) throw new Error('GIF 包含无效的帧尺寸。');
    totalPixels += width * height;
    if (totalPixels > 100_000_000) throw new Error('GIF 动画过大，请压缩帧数或尺寸后再导入。');
  }
  const frames = decompressFrames(gif, true);
  if (!frames.length) throw new Error('GIF 不包含可读取的图像帧。');
  let duration = 0;
  const ends = frames.map((frame) => { duration += Math.max(20, frame.delay || 100) / 1000; return duration; });
  const backgroundColor = gif.gct?.[gif.lsd.backgroundColorIndex];
  const background = backgroundColor && !frames.some((frame) => frame.transparentIndex !== undefined) ? `rgb(${backgroundColor.join(',')})` : null;
  const target = canvas(gif.lsd.width, gif.lsd.height);
  if (background) { const context = context2d(target); context.fillStyle = background; context.fillRect(0, 0, target.width, target.height); }
  return { frames, ends, duration, canvas: target, patchCanvas: canvas(1, 1), index: -1, restore: null, background };
}
function compositeGif(playback: GifPlayback, time: number): HTMLCanvasElement {
  const localTime = ((time % playback.duration) + playback.duration) % playback.duration;
  const targetIndex = Math.max(0, playback.ends.findIndex((end) => localTime < end));
  const context = context2d(playback.canvas);
  if (targetIndex < playback.index) {
    context.clearRect(0, 0, playback.canvas.width, playback.canvas.height);
    if (playback.background) { context.fillStyle = playback.background; context.fillRect(0, 0, playback.canvas.width, playback.canvas.height); }
    playback.index = -1;
    playback.restore = null;
  }
  while (playback.index < targetIndex) {
    if (playback.index >= 0) {
      const previous = playback.frames[playback.index]!;
      if (previous.disposalType === 2) {
        context.clearRect(previous.dims.left, previous.dims.top, previous.dims.width, previous.dims.height);
        if (playback.background) { context.fillStyle = playback.background; context.fillRect(previous.dims.left, previous.dims.top, previous.dims.width, previous.dims.height); }
      }
      if (previous.disposalType === 3 && playback.restore) context.putImageData(playback.restore, 0, 0);
    }
    const frame = playback.frames[++playback.index]!;
    playback.restore = frame.disposalType === 3 ? context.getImageData(0, 0, playback.canvas.width, playback.canvas.height) : null;
    playback.patchCanvas.width = frame.dims.width;
    playback.patchCanvas.height = frame.dims.height;
    context2d(playback.patchCanvas).putImageData(new ImageData(frame.patch, frame.dims.width, frame.dims.height), 0, 0);
    context.drawImage(playback.patchCanvas, frame.dims.left, frame.dims.top);
  }
  return playback.canvas;
}
/** Deterministic, disposal-aware GIF sampling; the returned canvas is reused on the next call. */
export async function getAnimatedFrame(asset: MediaAsset, time: number): Promise<HTMLCanvasElement> {
  if (asset.mime !== 'image/gif') throw new Error('只有 GIF 素材支持动画帧采样。');
  let playback = animatedImages.get(asset);
  if (!playback) { playback = await inspectGif(asset.blob); animatedImages.set(asset, playback); }
  return compositeGif(playback, time);
}
async function sanitizeSticker(blob: Blob): Promise<Blob> {
  const xml = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml');
  if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'svg') throw new Error('贴纸 SVG 文件无效。');
  const tags: Record<string, true> = { svg: true, g: true, path: true, rect: true, circle: true, ellipse: true, line: true, polyline: true, polygon: true, defs: true, linearGradient: true, radialGradient: true, stop: true, clipPath: true, mask: true, title: true, desc: true };
  const attributes: Record<string, true> = { xmlns: true, viewBox: true, width: true, height: true, x: true, y: true, x1: true, x2: true, y1: true, y2: true, cx: true, cy: true, r: true, rx: true, ry: true, d: true, points: true, fill: true, 'fill-rule': true, 'fill-opacity': true, stroke: true, 'stroke-width': true, 'stroke-linecap': true, 'stroke-linejoin': true, 'stroke-opacity': true, opacity: true, transform: true, id: true, offset: true, 'stop-color': true, 'stop-opacity': true, gradientUnits: true, gradientTransform: true, 'clip-path': true, mask: true };
  for (const element of Array.from(xml.querySelectorAll('*'))) {
    if (!tags[element.localName]) throw new Error('贴纸包含不允许的 SVG 内容。');
    for (const attribute of Array.from(element.attributes)) {
      const value = attribute.value.trim();
      if (!attributes[attribute.name] || /(?:https?:|data:|javascript:|@import)/i.test(value) || (/url\(/i.test(value) && !/^url\(#[\w-]+\)$/.test(value))) element.removeAttribute(attribute.name);
    }
  }
  return new Blob([new XMLSerializer().serializeToString(xml.documentElement)], { type: 'image/svg+xml' });
}
function waitForMedia(element: HTMLMediaElement, event: 'loadedmetadata' | 'loadeddata', action: () => void): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const cleanup = () => { clearTimeout(timer); element.removeEventListener(event, done); element.removeEventListener('error', failed); };
  const done = () => { cleanup(); resolve(); };
  const failed = () => { cleanup(); reject(new Error('无法解码音视频，请转换为浏览器支持的 MP4、WebM、MP3 或 WAV 格式。')); };
  const timer = setTimeout(() => { cleanup(); reject(new Error('音视频读取超时，请检查文件。')); }, 30_000);
  element.addEventListener(event, done, { once: true });
  element.addEventListener('error', failed, { once: true });
  action();
  return promise;
}
async function mediaMetadata(src: string, blob: Blob, kind: 'video' | 'audio', onProgress?: AssetProgress) {
  const element = document.createElement(kind);
  element.preload = 'auto';
  element.muted = true;
  if (element instanceof HTMLVideoElement) element.playsInline = true;
  try {
    await waitForMedia(element, kind === 'video' ? 'loadeddata' : 'loadedmetadata', () => { element.src = src; element.load(); });
    onProgress?.('processing', 0.45, kind === 'video' ? '视频首帧已解码，正在读取时长…' : '音频信息已读取，正在确认时长…');
    let duration = element.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      // Recorded WebM often omits container duration; demux packets instead of rejecting a valid clip.
      const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
      try { duration = await input.computeDuration(); } finally { input.dispose(); }
    }
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('音视频没有有效时长，无法导入。');
    onProgress?.('processing', 0.65, '音视频时长已确认，正在生成缩略图…');
    if (element instanceof HTMLVideoElement) {
      validateDimensions(element.videoWidth, element.videoHeight);
      const preview = await thumbnail(element, element.videoWidth, element.videoHeight);
      onProgress?.('processing', 0.85, '视频缩略图已生成。');
      return { width: element.videoWidth, height: element.videoHeight, duration, thumbnail: preview };
    }
    const preview = canvas(320, 200);
    try {
      const ctx = context2d(preview);
      ctx.fillStyle = '#f5e9ff'; ctx.fillRect(0, 0, 320, 200);
      ctx.fillStyle = '#8b5cf6'; ctx.font = 'bold 80px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('♫', 160, 118);
      ctx.font = '16px sans-serif'; ctx.fillText(`${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`, 160, 162);
      const audioThumbnail = URL.createObjectURL(await canvasToBlob(preview));
      onProgress?.('processing', 0.85, '音频缩略图已生成。');
      return { width: 0, height: 0, duration, thumbnail: audioThumbnail };
    } finally { preview.width = preview.height = 0; }
  } finally {
    element.pause(); element.removeAttribute('src'); element.load();
  }
}

export function createAsset(input: Blob, name: string, requestedKind?: MediaAsset['kind']): Promise<MediaAsset> {
  return buildAsset(input, name, requestedKind);
}
async function buildAsset(input: Blob, name: string, requestedKind?: MediaAsset['kind'], onProgress?: AssetProgress): Promise<MediaAsset> {
  if (!input.size) throw new Error('文件为空，无法导入。');
  if (input.size > MAX_BYTES) throw new Error('单个素材不能超过 150 MB，请先压缩。');
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  const declaredMime = input.type.toLowerCase().split(';')[0] ?? '';
  let mime = (!declaredMime || declaredMime === 'application/octet-stream') ? MIME_BY_EXTENSION[extension] ?? '' : declaredMime;
  let blob = input;
  if (mime === 'image/heic' || mime === 'image/heif') {
    try {
      onProgress?.('processing', 0, '正在转换 HEIC 图片…');
      blob = await heicToPng(blob);
      onProgress?.('processing', 0.25, 'HEIC 已转换为 PNG，正在读取图像…');
      mime = 'image/png';
    } catch { throw new Error('HEIC 转换失败，请从相册另存为 JPEG 后重试。'); }
  }
  const kind: MediaAsset['kind'] = requestedKind ?? (mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'image');
  if ((kind === 'image' || kind === 'sticker') && !IMAGE_TYPES[mime]) throw new Error('不支持此文件。图片支持 JPEG、PNG、WebP、SVG、GIF 和 HEIC。');
  if ((kind === 'audio' && !mime.startsWith('audio/')) || (kind === 'video' && !mime.startsWith('video/'))) throw new Error('文件格式与素材类型不匹配。');
  if (mime === 'image/svg+xml' && kind === 'sticker') blob = await sanitizeSticker(blob);
  if (blob.type !== mime) blob = new Blob([blob], { type: mime });
  onProgress?.('reading', 0.05, '文件格式已确认，正在解码…');
  const src = URL.createObjectURL(blob);
  let thumbnailUrl = '';
  let imageAsset: MediaAsset | undefined;
  try {
    if (kind === 'video' || kind === 'audio') {
      const metadata = await mediaMetadata(src, blob, kind, onProgress);
      thumbnailUrl = metadata.thumbnail;
      return { id: crypto.randomUUID(), name, kind, mime, blob, src, ...metadata };
    }
    const image = await loadImage(src);
    try {
      validateDimensions(image.naturalWidth, image.naturalHeight);
      onProgress?.('processing', 0.4, '图像已解码，正在处理图片…');
      const gif = mime === 'image/gif' ? await inspectGif(blob, onProgress) : null;
      onProgress?.('processing', 0.65, gif ? 'GIF 动画帧已解码，正在生成缩略图…' : '图像尺寸已确认，正在生成缩略图…');
      const asset: MediaAsset = imageAsset = { id: crypto.randomUUID(), name, kind, mime, width: image.naturalWidth, height: image.naturalHeight, duration: gif && gif.frames.length > 1 ? gif.duration : 0, blob, src, thumbnail: '' };
      if (gif) animatedImages.set(asset, gif);
      thumbnailUrl = await thumbnail(gif ? compositeGif(gif, 0) : image, asset.width, asset.height);
      asset.thumbnail = thumbnailUrl;
      onProgress?.('processing', 0.85, '图片缩略图已生成。');
      if (!gif && Math.max(asset.width, asset.height) > PREVIEW_SIDE) {
        const preview = await resizeImage(image, PREVIEW_SIDE);
        onProgress?.('processing', 0.9, '显示预览已缩小，正在编码…');
        try { imagePreviews.set(asset, URL.createObjectURL(await canvasToBlob(preview))); }
        finally { preview.width = preview.height = 0; }
        onProgress?.('processing', 0.95, '显示预览已生成。');
      }
      return asset;
    } finally { image.src = ''; }
  } catch (error) {
    if (imageAsset) disposeAsset(imageAsset);
    else {
      URL.revokeObjectURL(src);
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
    }
    throw error;
  }
}
/**
 * Per-file progress measures completed milestones, not elapsed time:
 * format 5%, HEIC conversion 25%, image decode 40% (media metadata 45%),
 * validated frames/duration 65%, thumbnail 85%, optional preview resize/encode 90%/95%.
 * GIF bytes use the existing required read, scaled to 40–55%; opaque browser/HEIC reads
 * only report milestones. Only a successfully returned asset receives complete/100%.
 * Observed assets share ownership with the returned array; do not dispose them twice.
 */
export async function importMedia(files: File[] | FileList, onProgress?: ProgressCallback, onFileProgress?: (event: MediaImportProgress) => void): Promise<MediaAsset[]> {
  const list = Array.from(files);
  const assets: MediaAsset[] = [];
  const failures: ImportFailure[] = [];
  for (const [index, file] of list.entries()) {
    onProgress?.(index / list.length, `正在本地读取 ${file.name}…`);
    let progress = 0;
    const report: AssetProgress | undefined = onFileProgress ? (stage, value, message) => {
      progress = Math.max(progress, Math.min(0.99, value));
      onFileProgress({ index, name: file.name, stage, progress, message });
    } : undefined;
    report?.('reading', 0, `正在本地读取 ${file.name}…`);
    let asset: MediaAsset;
    try { asset = await buildAsset(file, file.name, undefined, report); }
    catch (error) {
      const message = error instanceof Error ? error.message : '文件无法读取。';
      failures.push({ name: file.name, message });
      onFileProgress?.({ index, name: file.name, stage: 'error', progress, message });
      onProgress?.((index + 1) / list.length, `${file.name}：${message}`);
      continue;
    }
    assets.push(asset);
    onFileProgress?.({ index, name: file.name, stage: 'complete', progress: 1, message: '已导入。', asset });
  }
  importFailures.set(assets, failures);
  if (!assets.length && failures.length) throw new AggregateError(failures.map((failure) => new Error(`${failure.name}：${failure.message}`)), failures.map((failure) => `${failure.name}：${failure.message}`).join('\n'));
  onProgress?.(1, failures.length ? `已导入 ${assets.length} 个素材；${failures.map((failure) => `${failure.name}：${failure.message}`).join('；')}` : `已导入 ${assets.length} 个素材，原文件仅保存在本机。`);
  return assets;
}
export function disposeAsset(asset: MediaAsset): void {
  URL.revokeObjectURL(asset.src);
  if (asset.thumbnail !== asset.src) URL.revokeObjectURL(asset.thumbnail);
  const preview = imagePreviews.get(asset);
  if (preview) { URL.revokeObjectURL(preview); imagePreviews.delete(asset); }
  const gif = animatedImages.get(asset);
  if (gif) { gif.canvas.width = gif.canvas.height = gif.patchCanvas.width = gif.patchCanvas.height = 0; animatedImages.delete(asset); }
}
