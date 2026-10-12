import Konva from 'konva';
import type { MediaAsset } from '../types';
import { imagePreviewSource } from '../services/media';

export interface CanvasMedia {
  src: string;
  source: HTMLImageElement | HTMLVideoElement;
  ready: Promise<void>;
  dispose: () => void;
}

export function loadCanvasMedia(asset: MediaAsset): CanvasMedia {
  const src = asset.kind === 'video' ? asset.src : imagePreviewSource(asset);
  const source = asset.kind === 'video' ? document.createElement('video') : new Image();
  let cleanup = () => {};
  let cancelLoad = () => {};
  const ready = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => fail(), 30000);
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error(`无法读取素材“${asset.name}”，请重新导入。`)); };
    cancelLoad = done;
    cleanup = () => {
      clearTimeout(timer);
      source.removeEventListener('error', fail);
      source.removeEventListener('load', done);
      source.removeEventListener('loadeddata', done);
    };
    source.addEventListener('error', fail, { once: true });
    if (source instanceof HTMLVideoElement) {
      source.preload = 'auto';
      source.playsInline = true;
      source.muted = true;
      source.addEventListener('loadeddata', done, { once: true });
    } else {
      source.decoding = 'async';
      source.addEventListener('load', done, { once: true });
    }
    source.src = src;
    if (source instanceof HTMLVideoElement) source.load();
  });
  return { src, source, ready, dispose: () => {
    cancelLoad();
    if (source instanceof HTMLVideoElement) { source.pause(); source.removeAttribute('src'); source.load(); }
    else source.src = '';
  } };
}

export async function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.max(0, Math.min(Number.isFinite(video.duration) ? Math.max(0, video.duration - .001) : time, time));
  if (Math.abs(video.currentTime - target) < .001 && video.readyState >= 2 && !video.seeking) return;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error('视频定位超时，请重试导出。')), 15000);
    const finish = (error?: Error) => {
      clearTimeout(timer); video.removeEventListener('seeked', done); video.removeEventListener('error', failed);
      if (error) reject(error); else resolve();
    };
    const done = () => finish();
    const failed = () => finish(new Error('无法解码视频帧。'));
    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', failed, { once: true });
    video.currentTime = target;
  });
}

// Konva 10 exposes these cache primitives. Refresh the existing scene cache in place,
// then invalidate only its filtered pixels: filtered video never allocates a cache per frame.
export function refreshMediaCache(node: Konva.Image) {
  const cache = node._getCanvasCache();
  if (!cache) return;
  const context = cache.scene.getContext();
  context.clear();
  context.save();
  context.translate(-cache.x, -cache.y);
  try { node.getSceneFunc()?.call(node, context, node); }
  finally { context.restore(); }
  node._filterUpToDate = false;
}
