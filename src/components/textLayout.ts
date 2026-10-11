import Konva from 'konva';
import type { TextElement } from '../types';

export function textNodeConfig(element: TextElement): Konva.TextConfig {
  return {
    text: element.text, width: element.width, fontFamily: element.fontFamily,
    fontSize: element.fontSize, fontStyle: element.fontStyle, fill: element.color,
    align: element.align, lineHeight: element.lineHeight, stroke: element.stroke,
    strokeWidth: element.strokeWidth, shadowColor: '#20202d', shadowBlur: element.shadow,
    shadowOffsetY: element.shadow * .3, shadowOpacity: .3, listening: false,
  };
}

export function textPadding(element: TextElement): number {
  return element.backgroundColor && element.backgroundColor !== 'transparent' ? element.fontSize * .28 : 0;
}

let ruler: Konva.Text | undefined;
export function textFrameHeight(minimum: number, natural: number): number {
  // A fractional padded height can lose the last line when Konva subtracts padding.
  return Math.max(minimum, Math.ceil(natural) + 1);
}

export function measureTextHeight(element: TextElement): number {
  if (element.curve) return element.height;
  ruler ??= new Konva.Text({ listening: false });
  ruler.setAttrs({ ...textNodeConfig(element), height: undefined, padding: textPadding(element), wrap: 'word' });
  return textFrameHeight(0, ruler.height());
}
