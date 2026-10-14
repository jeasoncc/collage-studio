import type { CropState, FilterState, EditorDocument, ElementBase, SceneElement, DrawingChange, DrawingElement, PhotoFrameSpec, NormalizedRect } from './types';
import { collageLooks } from './catalog/looks';

export const MIN_CROP_ZOOM = 1;
export const MAX_CROP_ZOOM = 8;

export const createCrop = (): CropState => ({ x: 0, y: 0, zoom: MIN_CROP_ZOOM, rotation: 0, flipX: false, flipY: false });
export const createFilter = (): FilterState => ({ brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: false, sepia: false });
export const createPhotoFrame = (): PhotoFrameSpec => ({ kind: 'none', color: '#ffffff', insetRatio: 0, footerRatio: 0, shadowRatio: 0 });
export const createElementBase = (type: SceneElement['type']): ElementBase => ({
  id: crypto.randomUUID(), type, x: 0, y: 0, width: 240, height: 240,
  rotation: 0, opacity: 1, locked: false, visible: true, animation: 'none', shadow: 0,
});
export function createDrawing(change: DrawingChange): DrawingElement {
  const { points, width: strokeWidth } = change;
  if (points.length < 4 || points.length % 2 || points.some(point => !Number.isFinite(point)) || !Number.isFinite(strokeWidth) || strokeWidth <= 0) throw new Error('笔迹坐标或画笔大小无效。');
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let index = 0; index < points.length; index += 2) {
    left = Math.min(left, points[index]!); right = Math.max(right, points[index]!);
    top = Math.min(top, points[index + 1]!); bottom = Math.max(bottom, points[index + 1]!);
  }
  const x = left - strokeWidth / 2, y = top - strokeWidth / 2;
  return {
    ...createElementBase('drawing'), type: 'drawing', x, y,
    width: right - left + strokeWidth, height: bottom - top + strokeWidth,
    points: points.map((point, index) => point - (index % 2 === 0 ? x : y)),
    color: change.color, strokeWidth, tool: change.tool,
  };
}
export function createDocument(): EditorDocument {
  const now = Date.now();
  const look = collageLooks[0]!;
  return {
    version: 1, id: crypto.randomUUID(), title: '我的拼图', mode: 'grid', width: 1080, height: 1080,
    background: { color: look.color, pattern: look.pattern, patternColor: look.patternColor, assetId: null },
    layoutId: 'grid-2',
    slots: [
      { id: crypto.randomUUID(), x: 0, y: 0, width: 0.5, height: 1, assetId: null, crop: createCrop(), filter: createFilter(), shape: 'rect', visible: true, locked: false },
      { id: crypto.randomUUID(), x: 0.5, y: 0, width: 0.5, height: 1, assetId: null, crop: createCrop(), filter: createFilter(), shape: 'rect', visible: true, locked: false },
    ],
    elements: [], textDraft: '', padding: look.paddingRatio * 1080, gap: look.gapRatio * 1080, cornerRadius: look.cornerRadiusRatio * 1080,
    photoFrame: createPhotoFrame(),
    duration: 5, fps: 24, animation: 'none', audio: null, createdAt: now, updatedAt: now,
  };
}
export function slotRect(document: Pick<EditorDocument, 'width' | 'height' | 'padding' | 'gap'>, slot: NormalizedRect) {
  const innerWidth = document.width - document.padding * 2;
  const innerHeight = document.height - document.padding * 2;
  const left = document.padding + slot.x * innerWidth + (slot.x > 0.0001 ? document.gap / 2 : 0);
  const top = document.padding + slot.y * innerHeight + (slot.y > 0.0001 ? document.gap / 2 : 0);
  const right = document.padding + (slot.x + slot.width) * innerWidth - (slot.x + slot.width < 0.9999 ? document.gap / 2 : 0);
  const bottom = document.padding + (slot.y + slot.height) * innerHeight - (slot.y + slot.height < 0.9999 ? document.gap / 2 : 0);
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}
