import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { registerAacEncoder } from '../../third_party/codecs/aac/src/encoder';
import { ALL_FORMATS, AudioBufferSink, AudioBufferSource, BlobSource, BufferTarget, CanvasSource, Input, Mp4OutputFormat, Output, WebMOutputFormat, canEncodeAudio, canEncodeVideo } from 'mediabunny';
import type { AudioCodec, VideoCodec } from 'mediabunny';
import type { EditorDocument, EditorCanvasHandle, ExportOptions, MediaAsset, ProgressCallback } from '../types';
import { canvasToBlob } from './media';

export interface ExportAudioSegment { document: EditorDocument; start: number; duration: number; }
export interface ExportFrameRenderer {
  (time: number, pixelRatio?: number): Promise<HTMLCanvasElement>;
  /** Optional slideshow audio timeline, supplied by the same owner that renders its pages. */
  audioSegments?: ExportAudioSegment[];
}
interface AudioPlacement { asset: MediaAsset; start: number; sourceStart: number; sourceEnd: number; duration: number; volume: number; loop: boolean; }

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('导出已取消。', 'AbortError');
}
function collectAudio(segments: ExportAudioSegment[], assets: Record<string, MediaAsset>, totalDuration: number): AudioPlacement[] {
  const placements: AudioPlacement[] = [];
  for (const segment of segments) {
    const { document, start } = segment;
    const duration = Math.min(segment.duration, totalDuration - start);
    if (duration <= 0) continue;
    if (document.audio && document.audio.volume > 0) {
      const asset = assets[document.audio.assetId];
      if (!asset) throw new Error('背景音乐原文件缺失，请重新导入后再导出。');
      const sourceStart = Math.max(0, document.audio.start);
      const sourceEnd = Math.min(asset.duration, document.audio.end ?? asset.duration);
      if (sourceEnd <= sourceStart) throw new Error('背景音乐的裁剪范围无效。');
      placements.push({ asset, start, sourceStart, sourceEnd, duration, volume: Math.max(0, Math.min(1, document.audio.volume)), loop: false });
    }
    const clips: Array<{ assetId: string; trimStart: number; trimEnd: number | null; muted: boolean }> = [];
    if (document.background.assetId) clips.push({ assetId: document.background.assetId, trimStart: 0, trimEnd: null, muted: false });
    if (document.mode === 'grid') for (const slot of document.slots) if (slot.assetId) clips.push({ assetId: slot.assetId, trimStart: slot.trimStart ?? 0, trimEnd: slot.trimEnd ?? null, muted: slot.muted ?? false });
    for (const element of document.elements) if (element.type === 'image' && element.visible) clips.push({ assetId: element.assetId, trimStart: element.trimStart, trimEnd: element.trimEnd, muted: element.muted });
    const seen = new Set<string>();
    for (const clip of clips) {
      if (clip.muted) continue;
      const asset = assets[clip.assetId];
      if (asset?.kind !== 'video' || asset.duration <= 0) continue;
      const sourceStart = Math.max(0, clip.trimStart);
      const sourceEnd = Math.min(asset.duration, clip.trimEnd ?? asset.duration);
      if (sourceEnd <= sourceStart) throw new Error(`“${asset.name}”的视频裁剪范围无效。`);
      const key = `${asset.id}:${sourceStart}:${sourceEnd}`;
      if (seen.has(key)) continue;
      seen.add(key);
      placements.push({ asset, start, sourceStart, sourceEnd, duration, volume: 1, loop: true });
    }
  }
  return placements;
}
async function mixAudio(placements: AudioPlacement[], duration: number, signal?: AbortSignal): Promise<AudioBuffer | null> {
  if (!placements.length) return null;
  if (typeof OfflineAudioContext === 'undefined') throw new Error('当前浏览器不支持离线音频混合，无法导出带声音的视频。');
  const context = new OfflineAudioContext(2, Math.ceil(duration * 48_000), 48_000);
  let scheduled = 0;
  for (const placement of placements) {
    checkAbort(signal);
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(placement.asset.blob) });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track) {
        if (placement.asset.kind === 'audio') throw new Error(`“${placement.asset.name}”没有可读取的音轨。`);
        continue;
      }
      const gain = context.createGain();
      gain.gain.value = placement.volume;
      gain.connect(context.destination);
      const selectedLength = placement.sourceEnd - placement.sourceStart;
      const scheduleBuffer = (buffer: AudioBuffer, timestamp: number) => {
        const offset = Math.max(0, placement.sourceStart - timestamp);
        const chunkStart = Math.max(timestamp, placement.sourceStart);
        const chunkEnd = Math.min(timestamp + buffer.duration, placement.sourceEnd);
        if (chunkEnd <= chunkStart) return;
        for (let repeatStart = 0; repeatStart < placement.duration; repeatStart += selectedLength) {
          const localStart = repeatStart + chunkStart - placement.sourceStart;
          const length = Math.min(chunkEnd - chunkStart, placement.duration - localStart);
          if (length > 0) {
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(gain);
            source.start(placement.start + localStart, offset, length);
            scheduled++;
          }
          if (!placement.loop) break;
        }
      };
      if (await track.canDecode()) {
        const sink = new AudioBufferSink(track);
        for await (const chunk of sink.buffers(placement.sourceStart, Math.min(placement.sourceEnd, placement.sourceStart + placement.duration))) {
          checkAbort(signal);
          scheduleBuffer(chunk.buffer, chunk.timestamp);
        }
      } else {
        // Web Audio has real decoders for some formats for which WebCodecs has no AudioDecoder.
        let buffer: AudioBuffer;
        try { buffer = await context.decodeAudioData(await placement.asset.blob.arrayBuffer()); }
        catch { throw new Error(`当前浏览器无法解码“${placement.asset.name}”的声音；请转换为 WAV/MP3，或更换支持此音轨的浏览器。`); }
        scheduleBuffer(buffer, 0);
      }
    } finally { input.dispose(); }
  }
  if (!scheduled) return null;
  checkAbort(signal);
  const result = await context.startRendering();
  checkAbort(signal);
  return result;
}

export async function exportComposition(
  document: EditorDocument,
  assets: Record<string, MediaAsset>,
  renderFrame: EditorCanvasHandle['renderFrame'],
  options: ExportOptions,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<Blob> {
  checkAbort(signal);
  const { format, scale, quality, duration, fps } = options;
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(quality) || quality < 0 || quality > 1) throw new Error('导出倍率或画质无效。');
  const video = format === 'mp4' || format === 'webm';
  const animated = video || format === 'gif';
  let width = Math.max(1, Math.round(document.width * scale));
  let height = Math.max(1, Math.round(document.height * scale));
  if (video) { width += width % 2; height += height % 2; }
  if (width > 8192 || height > 8192 || width * height > 64_000_000) throw new Error('导出尺寸过大，请减小导出倍率（最长边不能超过 8192 像素）。');
  if (animated && (!Number.isFinite(duration) || duration <= 0 || duration > 120 || !Number.isFinite(fps) || fps < 1 || fps > 60)) throw new Error('动画导出支持 1–60 帧/秒，时长需在 0–120 秒之间。');
  const frameCount = animated ? Math.ceil(duration * fps) : 1;
  if (format === 'gif' && width * height * frameCount > 600_000_000) throw new Error('GIF 帧数据过大，请降低尺寸、帧率或时长，或改选 MP4/WebM。');
  const targetCanvas = globalThis.document.createElement('canvas');
  targetCanvas.width = width; targetCanvas.height = height;
  const context = targetCanvas.getContext('2d', { willReadFrequently: format === 'gif' });
  if (!context) throw new Error('无法创建导出画布，请减少尺寸后重试。');
  const drawFrame = async (time: number) => {
    checkAbort(signal);
    const frame = await renderFrame(time, scale);
    checkAbort(signal);
    context.clearRect(0, 0, width, height);
    if (format === 'jpeg' || video) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); }
    context.drawImage(frame, 0, 0, width, height);
  };
  let output: Output | undefined;
  let videoSource: CanvasSource | undefined;
  let audioSource: AudioBufferSource | undefined;
  let cancelPromise: Promise<void> | undefined;
  const abortEncoding = () => { if (output) cancelPromise = output.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', abortEncoding, { once: true });
  try {
    onProgress?.(0, '正在准备干净画面，不包含编辑控件…');
    if (!animated) {
      await drawFrame(0);
      const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : format === 'png' ? 'image/png' : '';
      if (!mime) throw new Error('不支持此导出格式。');
      const blob = await canvasToBlob(targetCanvas, mime, quality);
      checkAbort(signal);
      onProgress?.(1, '图片已生成。');
      return blob;
    }
    if (format === 'gif') {
      const encoder = GIFEncoder();
      try {
        for (let index = 0; index < frameCount; index++) {
          await drawFrame(index / fps);
          const rgba = context.getImageData(0, 0, width, height).data;
          const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true });
          const indexed = applyPalette(rgba, palette, 'rgba4444');
          const transparentIndex = palette.findIndex((color) => color[3] === 0);
          // Cumulative centisecond rounding avoids drift at non-divisor frame rates such as 24 fps.
          const start = Math.round(index / fps * 100);
          const end = Math.round(Math.min(duration, (index + 1) / fps) * 100);
          encoder.writeFrame(indexed, width, height, { palette, delay: Math.max(1, end - start) * 10, repeat: 0, transparent: transparentIndex >= 0, transparentIndex: Math.max(0, transparentIndex), dispose: 2 });
          onProgress?.((index + 1) / frameCount * 0.97, `正在编码 GIF：${index + 1}/${frameCount} 帧（GIF 不含声音）`);
          if (index % 4 === 0) {
            const { promise, resolve } = Promise.withResolvers<void>();
            setTimeout(resolve, 0);
            await promise;
          }
        }
        checkAbort(signal);
        encoder.finish();
        const blob = new Blob([encoder.bytesView()], { type: 'image/gif' });
        onProgress?.(1, 'GIF 动画已生成（此格式不支持音轨）。');
        return blob;
      } finally { encoder.reset(); }
    }
    if (typeof VideoEncoder === 'undefined') throw new Error('当前浏览器不支持 WebCodecs 视频编码，请使用新版 Chrome/Edge，或导出 GIF。');
    const bitrate = Math.round(width * height * fps * (0.045 + quality * 0.12));
    const candidates: VideoCodec[] = format === 'mp4' ? ['avc'] : ['vp9', 'vp8'];
    let codec: VideoCodec | undefined;
    for (const candidate of candidates) if (await canEncodeVideo(candidate, { width, height, bitrate, frameRate: fps })) { codec = candidate; break; }
    if (!codec) throw new Error(`设备不支持所选尺寸的 ${format.toUpperCase()} 视频编码；请降低尺寸或选择其他格式。`);
    checkAbort(signal);
    onProgress?.(0.02, '正在读取并混合背景音乐与视频原声…');
    const renderer = renderFrame as ExportFrameRenderer;
    const placements = collectAudio(renderer.audioSegments ?? [{ document, start: 0, duration }], assets, duration);
    const mixedAudio = await mixAudio(placements, duration, signal);
    const audioCodec: AudioCodec = format === 'mp4' ? 'aac' : 'opus';
    if (mixedAudio) {
      const audioConfig = { numberOfChannels: mixedAudio.numberOfChannels, sampleRate: mixedAudio.sampleRate, bitrate: 192_000 };
      let audioSupported = await canEncodeAudio(audioCodec, audioConfig);
      if (!audioSupported && audioCodec === 'aac') {
        // Keep native AAC where available; use the real local WASM encoder otherwise.
        registerAacEncoder();
        audioSupported = await canEncodeAudio(audioCodec, audioConfig);
      }
      if (!audioSupported) throw new Error(`当前设备不支持 ${format.toUpperCase()} 的 ${audioCodec.toUpperCase()} 音频编码，不能保留声音；请改选另一种视频格式或移除音乐。`);
    }
    const target = new BufferTarget();
    output = new Output({ format: format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target });
    videoSource = new CanvasSource(targetCanvas, { codec, bitrate, keyFrameInterval: 2 });
    output.addVideoTrack(videoSource, { frameRate: fps });
    if (mixedAudio) { audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: 192_000 }); output.addAudioTrack(audioSource); }
    await output.start();
    checkAbort(signal);
    // Each add is awaited. No wall-clock recording, dropped frames, or unflushed background writes.
    for (let index = 0; index < frameCount; index++) {
      const time = index / fps;
      await drawFrame(time);
      await videoSource.add(time, Math.min(1 / fps, duration - time));
      onProgress?.(0.05 + (index + 1) / frameCount * 0.86, `正在编码 ${format.toUpperCase()}：${index + 1}/${frameCount} 帧`);
    }
    videoSource.close();
    if (audioSource && mixedAudio) { checkAbort(signal); await audioSource.add(mixedAudio); audioSource.close(); }
    checkAbort(signal);
    onProgress?.(0.94, '正在封装视频并写入音轨…');
    await output.finalize();
    checkAbort(signal);
    if (!target.buffer) throw new Error('视频编码器未返回有效文件。');
    const blob = new Blob([target.buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
    onProgress?.(1, mixedAudio ? '视频已生成，包含背景音乐与可读取的视频原声。' : '视频已生成，素材没有有效音轨。');
    return blob;
  } catch (error) {
    if (output) await output.cancel().catch(() => undefined);
    if (signal?.aborted) throw new DOMException('导出已取消。', 'AbortError');
    throw error;
  } finally {
    signal?.removeEventListener('abort', abortEncoding);
    if (cancelPromise) await cancelPromise;
    videoSource?.close(); audioSource?.close();
    targetCanvas.width = targetCanvas.height = 0;
  }
}
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.rel = 'noopener';
  document.body.append(link); link.click(); link.remove();
  // The browser may consume the URL asynchronously, notably on mobile Safari.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export async function shareBlob(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  if (!navigator.share || !navigator.canShare?.({ files: [file] })) return false;
  try { await navigator.share({ files: [file], title: '拼贴时光' }); return true; }
  catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return false; throw new Error('系统分享失败，请使用下载保存。'); }
}
