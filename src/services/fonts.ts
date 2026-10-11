import type { SceneElement, TextElement } from '../types';

type FontText = Pick<TextElement, 'text' | 'fontFamily' | 'fontStyle'>;

export function ensureTextFont(text: FontText): Promise<FontFace[]> | undefined {
  if (!text.text) return;
  const family = text.fontFamily.split(',').map(name => {
    const trimmed = name.trim();
    return /^(sans-serif|serif|monospace|cursive|fantasy|system-ui)$/i.test(trimmed) ? trimmed : `"${trimmed.replace(/^["']|["']$/g, '').replace(/"/g, '\\"')}"`;
  }).join(', ');
  const font = `${text.fontStyle} 16px ${family}`;
  // CJK font packs are Unicode-subsetted. fonts.ready alone does not request
  // the chosen face or newly typed glyphs before canvas measurement.
  if (!document.fonts.check(font, text.text)) return document.fonts.load(font, text.text);
}

export async function ensureSceneFonts(elements: readonly SceneElement[]): Promise<void> {
  let pending: Promise<FontFace[]>[] | undefined;
  for (const element of elements) if (element.type === 'text' && element.visible) {
    const load = ensureTextFont(element);
    if (load) (pending ??= []).push(load);
  }
  if (pending) await Promise.all(pending);
}
