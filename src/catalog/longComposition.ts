import type { NormalizedRect, PhotoFrameSpec } from '../types';

export function longComposition(
  photos: readonly { width: number; height: number }[],
  requestedWidth: number,
  presentation: { padding: number; gap: number; cornerRadius: number; photoFrame: PhotoFrameSpec },
) {
  const { photoFrame } = presentation;
  const inset = photoFrame.kind === 'none' ? 0 : photoFrame.insetRatio;
  const footer = photoFrame.kind === 'none' ? 0 : photoFrame.footerRatio;
  const innerWidth = requestedWidth - presentation.padding * 2;
  const heights = photos.map(photo => innerWidth * ((1 - inset * 2) * photo.height / photo.width + inset * 2 + footer));
  const requestedHeight = photos.length ? heights.reduce((sum, height) => sum + height, presentation.padding * 2 + presentation.gap * (photos.length - 1)) : requestedWidth;
  const scale = Math.min(1, 8192 / requestedWidth, 8192 / requestedHeight);
  const width = requestedWidth * scale, height = requestedHeight * scale;
  const padding = presentation.padding * scale, gap = presentation.gap * scale;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 16 || height < 16 || innerWidth <= 0 || photos.some((photo, index) => innerWidth * (1 - inset * 2) * scale < 16 || (heights[index]! - innerWidth * (inset * 2 + footer)) * scale < 16 || photo.width <= 0 || photo.height <= 0)) throw new Error('照片比例或留白过于极端，无法在 16 至 8192 像素的画布内完整排列。');
  const innerHeight = height - padding * 2;
  let offset = 0;
  const slots: NormalizedRect[] = heights.map((photoHeight, index) => {
    const y = offset / innerHeight;
    offset += photoHeight * scale + (index > 0 ? gap / 2 : 0) + (index < heights.length - 1 ? gap / 2 : 0);
    return { x: 0, y, width: 1, height: index === heights.length - 1 ? 1 - y : offset / innerHeight - y };
  });
  return { width, height, padding, gap, cornerRadius: presentation.cornerRadius * scale, layoutId: `long-${photos.length}`, slots };
}
