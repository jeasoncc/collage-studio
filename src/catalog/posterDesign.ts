import type { SceneElement, ShapeElement, TemplatePreset, TextElement } from '../types';
import { chineseFonts } from './photoText';

export const WIDTH = 1080;
export const HEIGHT = 1350;
export type PosterFrame = NonNullable<TemplatePreset['photoFrames']>[number];

export interface PosterDesign {
  key: string;
  name: string;
  category: string;
  description: string;
  color: string;
  frames(count: number): PosterFrame[];
  elements(count: number, id: string): SceneElement[];
}

const elementDefaults = { rotation: 0, opacity: 1, locked: false, visible: true, animation: 'none' as const, shadow: 0 };

export function posterElements(id: string) {
  const text = (key: string, value: string, x: number, y: number, width: number, fontSize: number, color: string, extra: Partial<TextElement> = {}): TextElement => ({
    ...elementDefaults, id: `${id}-${key}`, type: 'text', x: x * WIDTH, y: y * HEIGHT, width: width * WIDTH,
    height: fontSize * (extra.lineHeight ?? 1.2) * value.split('\n').length + fontSize * .2,
    text: value, fontFamily: chineseFonts.sans, fontSize, fontStyle: 'normal', color, align: 'left', lineHeight: 1.2,
    stroke: '', strokeWidth: 0, backgroundColor: 'transparent', curve: 0, ...extra,
  });
  const shape = (key: string, x: number, y: number, width: number, height: number, fill: string, extra: Partial<ShapeElement> = {}): ShapeElement => ({
    ...elementDefaults, id: `${id}-${key}`, type: 'shape', x: x * WIDTH, y: y * HEIGHT, width: width * WIDTH, height: height * HEIGHT,
    shape: 'rect', fill, stroke: '', strokeWidth: 0, ...extra,
  });
  return { text, shape };
}

// Shared edges keep every source visible in a complete, gapless photo region.
export function contactGrid(count: number, region: PosterFrame): PosterFrame[] {
  const rows = Math.max(1, Math.min(count, Math.round(Math.sqrt(count * region.height * HEIGHT / (region.width * WIDTH)))));
  const frames: PosterFrame[] = [];
  for (let row = 0; row < rows; row++) {
    const columns = Math.floor(count / rows) + (row < count % rows ? 1 : 0);
    const top = region.y + region.height * row / rows;
    const bottom = region.y + region.height * (row + 1) / rows;
    for (let column = 0; column < columns; column++) {
      const left = region.x + region.width * column / columns;
      const right = region.x + region.width * (column + 1) / columns;
      frames.push({ x: left, y: top, width: right - left, height: bottom - top });
    }
  }
  return frames;
}

export function edgeFrames(count: number, edge: 'left' | 'right' | 'top' | 'bottom', share = .70): PosterFrame[] {
  if (count === 1) return [{ x: 0, y: 0, width: 1, height: 1 }];
  if (edge === 'left' || edge === 'right') {
    return [
      { x: edge === 'left' ? 0 : 1 - share, y: 0, width: share, height: 1 },
      ...contactGrid(count - 1, { x: edge === 'left' ? share : 0, y: 0, width: 1 - share, height: 1 }),
    ];
  }
  return [
    { x: 0, y: edge === 'top' ? 0 : 1 - share, width: 1, height: share },
    ...contactGrid(count - 1, { x: 0, y: edge === 'top' ? share : 0, width: 1, height: 1 - share }),
  ];
}

export function cornerFrames(count: number, corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right', width = .74, height = .76): PosterFrame[] {
  if (count <= 2) return edgeFrames(count, corner.endsWith('right') ? 'right' : 'left', width);
  const x = corner.endsWith('right') ? 1 - width : 0;
  const y = corner.startsWith('bottom') ? 1 - height : 0;
  const remaining = count - 1;
  const sideCount = Math.max(1, Math.min(remaining - 1, Math.round(remaining * .45)));
  return [
    { x, y, width, height },
    ...contactGrid(sideCount, { x: x === 0 ? width : 0, y, width: 1 - width, height }),
    ...contactGrid(remaining - sideCount, { x: 0, y: y === 0 ? height : 0, width: 1, height: 1 - height }),
  ];
}

export function createPhotoPoster(design: PosterDesign, count: number): TemplatePreset {
  const id = `poster-${design.key}-${count}`;
  return {
    id, name: design.name, category: design.category,
    description: `${count} 张照片 · ${design.description}照片铺满画面，标题、文字与装饰均可编辑。4:5 竖版，无缝拼接。`,
    width: WIDTH, height: HEIGHT, mode: 'free', layoutId: id, photoLayering: 'overlay',
    background: { color: design.color, pattern: 'none', patternColor: design.color, assetId: null },
    padding: 0, gap: 0, cornerRadius: 0, animation: 'none', photoFrames: design.frames(count), elements: design.elements(count, id),
  };
}
