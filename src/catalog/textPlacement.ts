import { slotRect } from '../defaults';
import { photoFrameGeometry } from '../components/photoFrameGeometry';
import type { EditorDocument, MediaAsset, Selection, TextElement } from '../types';
import type { PhotoTextStyle, TextPlacement } from './photoText';

export interface TextPhoto {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  content: { x: number; y: number; width: number; height: number };
}

export function textPhotos(doc: EditorDocument, assets: Record<string, MediaAsset>): TextPhoto[] {
  const photos: TextPhoto[] = [];
  const add = (id: string, assetId: string | null, rect: { x: number; y: number; width: number; height: number }, rotation = 0) => {
    const asset = assetId ? assets[assetId] : undefined;
    if (!asset || (asset.kind !== 'image' && asset.kind !== 'video')) return;
    photos.push({ id, ...rect, rotation, content: photoFrameGeometry(rect.width, rect.height, doc.photoFrame, asset.width, asset.height) });
  };
  if (doc.mode === 'grid') for (const slot of doc.slots) if (slot.visible) add(slot.id, slot.assetId, slotRect(doc, slot));
  for (const item of doc.elements) if (item.type === 'image' && item.visible && item.opacity > 0) add(item.id, item.assetId, item, item.rotation);
  return photos;
}

function localPoint(photo: TextPhoto, x: number, y: number) {
  const angle = -photo.rotation * Math.PI / 180;
  const dx = x - photo.x - photo.width / 2, dy = y - photo.y - photo.height / 2;
  return { x: dx * Math.cos(angle) - dy * Math.sin(angle) + photo.width / 2, y: dx * Math.sin(angle) + dy * Math.cos(angle) + photo.height / 2 };
}

export function chooseTextPhoto(doc: EditorDocument, assets: Record<string, MediaAsset>, selection: Selection, text?: TextElement): TextPhoto {
  const photos = textPhotos(doc, assets);
  const selected = photos.find(photo => photo.id === selection?.id);
  if (selected) return selected;
  if (text && photos.length) {
    const center = { x: text.x + text.width / 2, y: text.y + text.height / 2 };
    let nearest = photos[0]!, distance = Infinity;
    // Later free layers win when several photos contain the same caption center.
    for (let index = photos.length - 1; index >= 0; index--) {
      const photo = photos[index]!;
      const point = localPoint(photo, center.x, center.y), rect = photo.content;
      const dx = Math.max(rect.x - point.x, 0, point.x - rect.x - rect.width);
      const dy = Math.max(rect.y - point.y, 0, point.y - rect.y - rect.height);
      const next = dx * dx + dy * dy;
      if (next < distance) { nearest = photo; distance = next; }
    }
    return nearest;
  }
  const main = photos.reduce<TextPhoto | undefined>((largest, photo) => !largest || photo.content.width * photo.content.height > largest.content.width * largest.content.height ? photo : largest, undefined);
  return main ?? { id: '', x: 0, y: 0, width: doc.width, height: doc.height, rotation: 0, content: { x: doc.padding, y: doc.padding, width: Math.max(1, doc.width - doc.padding * 2), height: Math.max(1, doc.height - doc.padding * 2) } };
}

export function textMinHeight(text: Pick<TextElement, 'text' | 'fontSize' | 'lineHeight' | 'backgroundColor'>): number {
  const padding = text.backgroundColor && text.backgroundColor !== 'transparent' ? text.fontSize * .28 : 0;
  return text.text.split('\n').length * text.fontSize * text.lineHeight + padding * 2;
}

export function photoTextSize(photo: TextPhoto, style: PhotoTextStyle, text: string): number {
  const lines = text.split('\n').length;
  const paddingRatio = style.backgroundColor === 'transparent' ? 0 : .56;
  return Math.max(1, Math.min(photo.content.width * style.sizeRatio, photo.content.height * .8 / (lines * style.lineHeight + paddingRatio)));
}

export function textPhotoPosition(photo: TextPhoto, width: number, height: number, position: TextPlacement) {
  const rect = photo.content, inset = Math.min(rect.width, rect.height) * .06;
  const localX = rect.x + rect.width / 2;
  const localY = position === 'center' ? rect.y + rect.height / 2
    : position === 'top' ? rect.y + inset + height / 2 : rect.y + rect.height - inset - height / 2;
  const angle = photo.rotation * Math.PI / 180;
  const dx = localX - photo.width / 2, dy = localY - photo.height / 2;
  // Persist an unrotated top-left box; the renderer rotates about its own center.
  return { x: photo.x + photo.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle) - width / 2, y: photo.y + photo.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) - height / 2, rotation: photo.rotation };
}
