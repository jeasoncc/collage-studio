import type { TextElement } from '../types';

export const chineseFonts = {
  sans: 'Noto Sans SC Variable',
  serif: 'Noto Serif SC Variable',
  brush: 'Ma Shan Zheng',
  kai: 'LXGW WenKai',
  display: 'Smiley Sans Oblique',
  fangsong: 'Zhuque Fangsong',
} as const;

export type TextPlacement = 'top' | 'center' | 'bottom';
export interface PhotoTextStyle {
  id: string;
  name: string;
  sample: string;
  description: string;
  fontFamily: string;
  fontStyle: TextElement['fontStyle'];
  sizeRatio: number;
  color: string;
  backgroundColor: string;
  align: TextElement['align'];
  lineHeight: number;
  shadowRatio: number;
  stroke: string;
  strokeRatio: number;
}

export const photoTextStyles: readonly PhotoTextStyle[] = [
  { id: 'photo-title', name: '照片标题', sample: '山海之间', description: '清晰白字与轻影，让标题留在照片里', fontFamily: chineseFonts.sans, fontStyle: 'bold', sizeRatio: .085, color: '#ffffff', backgroundColor: 'transparent', align: 'left', lineHeight: 1.18, shadowRatio: .1, stroke: '', strokeRatio: 0 },
  { id: 'cinema-caption', name: '电影字幕', sample: '风经过，我们停在这一刻。', description: '细白字与暗色衬底，复杂照片也能读清', fontFamily: chineseFonts.sans, fontStyle: 'normal', sizeRatio: .043, color: '#fffdf8', backgroundColor: '#18211bd9', align: 'center', lineHeight: 1.45, shadowRatio: 0, stroke: '', strokeRatio: 0 },
  { id: 'editorial', name: '杂志大字', sample: '慢慢生活', description: '宋体大标题，把照片做成自己的封面', fontFamily: chineseFonts.serif, fontStyle: 'normal', sizeRatio: .105, color: '#ffffff', backgroundColor: 'transparent', align: 'left', lineHeight: 1.15, shadowRatio: .08, stroke: '', strokeRatio: 0 },
  { id: 'paper-note', name: '纸签小记', sample: '今天，也值得收藏', description: '暖白纸签与深色文字，适合日常片段', fontFamily: chineseFonts.sans, fontStyle: 'normal', sizeRatio: .047, color: '#29382e', backgroundColor: '#fff8e9ed', align: 'left', lineHeight: 1.35, shadowRatio: 0, stroke: '', strokeRatio: 0 },
  { id: 'outlined', name: '醒目描边', sample: '把快乐定格', description: '白字配深色细描边，跨越明暗区域', fontFamily: chineseFonts.sans, fontStyle: 'bold', sizeRatio: .075, color: '#ffffff', backgroundColor: 'transparent', align: 'center', lineHeight: 1.25, shadowRatio: 0, stroke: '#25392e', strokeRatio: .045 },
  { id: 'date-stamp', name: '日期印记', sample: '2026.07 · SUMMER', description: '等宽小字与黑色标签，记录地点和日期', fontFamily: 'monospace', fontStyle: 'normal', sizeRatio: .035, color: '#fff4d9', backgroundColor: '#18221aeb', align: 'left', lineHeight: 1.3, shadowRatio: 0, stroke: '', strokeRatio: 0 },
];

export function photoTextStylePatch(style: PhotoTextStyle, fontSize: number): Pick<TextElement, 'fontFamily' | 'fontSize' | 'fontStyle' | 'color' | 'backgroundColor' | 'align' | 'lineHeight' | 'shadow' | 'stroke' | 'strokeWidth' | 'curve'> {
  return { fontFamily: style.fontFamily, fontSize, fontStyle: style.fontStyle, color: style.color, backgroundColor: style.backgroundColor, align: style.align, lineHeight: style.lineHeight, shadow: fontSize * style.shadowRatio, stroke: style.stroke, strokeWidth: fontSize * style.strokeRatio, curve: 0 };
}

export const photoTextFontCategories = [
  { value: 'chinese', label: '全部中文' },
  { value: 'sans', label: '简洁黑体' },
  { value: 'serif', label: '宋体 / 仿宋' },
  { value: 'kai', label: '文楷' },
  { value: 'display', label: '标题黑体' },
  { value: 'brush', label: '毛笔手写' },
  { value: 'latin', label: '英文' },
  { value: 'digits', label: '数字' },
] as const;
export type PhotoTextFontCategory = (typeof photoTextFontCategories)[number]['value'];
export interface PhotoTextFont {
  value: string;
  label: string;
  sample: string;
  kind: '中文' | '英文' | '数字';
  category: Exclude<PhotoTextFontCategory, 'chinese'>;
  description: string;
}
export const photoTextFonts: readonly PhotoTextFont[] = [
  { value: chineseFonts.sans, label: '简洁黑体', sample: '山海之间', kind: '中文', category: 'sans', description: '清晰克制，适合字幕与日常正文' },
  { value: chineseFonts.serif, label: '书刊宋体', sample: '慢慢生活', kind: '中文', category: 'serif', description: '笔画有粗细对比，适合书刊与杂志标题' },
  { value: chineseFonts.kai, label: '霞鹜文楷', sample: '风起有信', kind: '中文', category: 'kai', description: '温润的楷书笔意，适合小记与诗句' },
  { value: chineseFonts.display, label: '得意黑', sample: '把快乐定格', kind: '中文', category: 'display', description: '窄身自然倾斜的现代标题黑体，适合短标题' },
  { value: chineseFonts.fangsong, label: '朱雀仿宋', sample: '岁月有声', kind: '中文', category: 'serif', description: '舒展的活字仿宋，适合书卷小字；上游技术预览版' },
  { value: chineseFonts.brush, label: '毛笔手写', sample: '此刻如诗', kind: '中文', category: 'brush', description: '毛笔书写的起落，适合短句与心情标题' },
  { value: 'DM Sans Variable', label: 'DM Sans', sample: 'little moments', kind: '英文', category: 'latin', description: '清晰的英文字母，不提供中文字形' },
  { value: 'Playfair Display', label: 'Playfair', sample: 'Little stories', kind: '英文', category: 'latin', description: '优雅的英文衬线标题，不提供中文字形' },
  { value: 'Caveat', label: 'Caveat', sample: 'little moments', kind: '英文', category: 'latin', description: '轻松的英文手写，不提供中文字形' },
  { value: 'monospace', label: '等宽数字', sample: '2026.10', kind: '数字', category: 'digits', description: '使用设备的等宽字体，适合日期与编号' },
];

export interface PhotoTextPair { name: string; title: string; subtitle: string; heading: string; body: string }
export const photoTextPairs: readonly PhotoTextPair[] = [
  { name: '杂志标题 + 简洁正文', title: '美好，正在发生', subtitle: '把值得珍藏的日常，写成自己的故事', heading: chineseFonts.serif, body: chineseFonts.sans },
  { name: '手写心情 + 中文黑体', title: '把心情写下来', subtitle: '记录生活里闪闪发光的小事', heading: chineseFonts.brush, body: chineseFonts.sans },
  { name: '得意标题 + 文楷小记', title: '团聚的每一刻', subtitle: '和喜欢的人一起，把平凡日子过成纪念', heading: chineseFonts.display, body: chineseFonts.kai },
  { name: '文楷标题 + 仿宋正文', title: '风起有信，花开有期', subtitle: '走过的山海，见过的风景，都留在心里', heading: chineseFonts.kai, body: chineseFonts.fangsong },
  { name: '宋体标题 + 仿宋小字', title: '岁月，值得珍藏', subtitle: '把今天的温柔，写进明天的回忆', heading: chineseFonts.serif, body: chineseFonts.fangsong },
  { name: '英文标题 + 中文正文', title: 'little moments', subtitle: '日常有光，心里有爱', heading: 'Caveat', body: chineseFonts.sans },
];
