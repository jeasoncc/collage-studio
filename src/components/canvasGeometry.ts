import type { AnimationKind, CropState, ImageShape } from '../types';

export function shapePath(shape: ImageShape, width: number, height: number, radius = 0): string {
  const w = Math.max(1, width), h = Math.max(1, height);
  if (shape === 'circle') return `M ${w / 2} 0 A ${w / 2} ${h / 2} 0 1 1 ${w / 2} ${h} A ${w / 2} ${h / 2} 0 1 1 ${w / 2} 0 Z`;
  if (shape === 'heart') return `M ${w / 2} ${h} C ${w * .42} ${h * .87} 0 ${h * .57} 0 ${h * .28} C 0 ${-h * .08} ${w * .4} ${-h * .08} ${w / 2} ${h * .22} C ${w * .6} ${-h * .08} ${w} ${-h * .08} ${w} ${h * .28} C ${w} ${h * .57} ${w * .58} ${h * .87} ${w / 2} ${h} Z`;
  if (shape === 'star') {
    const points = Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .43 : 1;
      return `${w / 2 + Math.cos(a) * w / 2 * r} ${h / 2 + Math.sin(a) * h / 2 * r}`;
    });
    return `M ${points.join(' L ')} Z`;
  }
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
}

export function imageGeometry(width: number, height: number, sourceWidth: number, sourceHeight: number, crop: CropState) {
  const radians = crop.rotation * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
  const scale = Math.max((width * cos + height * sin) / Math.max(1, sourceWidth), (height * cos + width * sin) / Math.max(1, sourceHeight)) * Math.max(1, crop.zoom);
  const w = sourceWidth * scale, h = sourceHeight * scale;
  const panX = Math.max(0, w - width * cos - height * sin) / 2 * crop.x;
  const panY = Math.max(0, h - height * cos - width * sin) / 2 * crop.y;
  return {
    x: width / 2 + panX * Math.cos(radians) - panY * Math.sin(radians),
    y: height / 2 + panX * Math.sin(radians) + panY * Math.cos(radians),
    width: w, height: h, offsetX: w / 2, offsetY: h / 2,
    rotation: crop.rotation, scaleX: crop.flipX ? -1 : 1, scaleY: crop.flipY ? -1 : 1,
  };
}

export function animationAt(kind: AnimationKind, time: number, seed = 0) {
  const phase = time * Math.PI * 2 / 2.4 + seed;
  const pose = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  if (kind === 'float') pose.y = Math.sin(phase) * 12;
  if (kind === 'pulse') pose.scale = 1 + Math.sin(phase) * .045;
  if (kind === 'wiggle') pose.rotation = Math.sin(phase * 1.5) * 5;
  if (kind === 'pop') pose.scale = .9 + Math.abs(Math.sin(phase / 2)) * .13;
  if (kind === 'fade') pose.opacity = .45 + (Math.sin(phase) + 1) * .275;
  return pose;
}

export function curvedTextPath(width: number, height: number, degrees: number): string {
  const angle = Math.min(300, Math.max(-300, degrees)) * Math.PI / 180;
  if (Math.abs(angle) < .01) return `M 0 ${height / 2} H ${width}`;
  const radius = width / (2 * Math.sin(Math.abs(angle) / 2));
  const sag = radius * (1 - Math.cos(Math.abs(angle) / 2));
  const baseline = height / 2 + Math.sign(angle) * Math.min(sag / 2, height / 3);
  return `M 0 ${baseline} A ${radius} ${radius} 0 ${Math.abs(angle) > Math.PI ? 1 : 0} ${angle > 0 ? 1 : 0} ${width} ${baseline}`;
}
