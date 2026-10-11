import type { EditorDocument, MediaAsset, PhotoFrameSpec } from '../types';
import { longComposition } from './longComposition';

export interface CollageLook {
  id: string;
  name: string;
  description: string;
  category: 'gallery' | 'paper' | 'film';
  color: string;
  pattern: EditorDocument['background']['pattern'];
  patternColor: string;
  paddingRatio: number;
  gapRatio: number;
  cornerRadiusRatio: number;
  photoFrame: PhotoFrameSpec;
}

export const collageLooks: CollageLook[] = [
  {
    id: 'gallery-white', name: '白色画廊', description: '纯白留边与细缝，让照片成为主角', category: 'gallery',
    color: '#ffffff', pattern: 'none', patternColor: '#e6e6e1',
    paddingRatio: .045, gapRatio: .014, cornerRadiusRatio: .003,
    photoFrame: { kind: 'none', color: '#ffffff', insetRatio: 0, footerRatio: 0, shadowRatio: 0 },
  },
  {
    id: 'cream-paper', name: '棉纸装裱', description: '宽幅暖白卡纸，适合安静的风景组照', category: 'paper',
    color: '#eee9df', pattern: 'paper', patternColor: '#bfb5a3',
    paddingRatio: .045, gapRatio: .027, cornerRadiusRatio: .003,
    photoFrame: { kind: 'paper', color: '#fffdf5', insetRatio: .085, footerRatio: 0, shadowRatio: .009 },
  },
  {
    id: 'sage', name: '旅行即影', description: '淡绿相册底与加宽下缘，收藏旅行片段', category: 'film',
    color: '#dce4da', pattern: 'none', patternColor: '#b8c4b5',
    paddingRatio: .05, gapRatio: .035, cornerRadiusRatio: .008,
    photoFrame: { kind: 'instant', color: '#fffdf5', insetRatio: .055, footerRatio: .19, shadowRatio: .023 },
  },
  {
    id: 'charcoal-film', name: '暗房接触印样', description: '黑色胶片边与真实齿孔，紧凑记录每一帧', category: 'film',
    color: '#222622', pattern: 'none', patternColor: '#454b46',
    paddingRatio: .03, gapRatio: .016, cornerRadiusRatio: 0,
    photoFrame: { kind: 'film', color: '#111511', insetRatio: .067, footerRatio: 0, shadowRatio: 0 },
  },
  {
    id: 'mist-gray', name: '悬浮印片', description: '雾灰留白、细白边与轻影，像浮起的纸质照片', category: 'gallery',
    color: '#e9eceb', pattern: 'none', patternColor: '#cbd1ce',
    paddingRatio: .065, gapRatio: .045, cornerRadiusRatio: .008,
    photoFrame: { kind: 'paper', color: '#ffffff', insetRatio: .018, footerRatio: 0, shadowRatio: .038 },
  },
  {
    id: 'terracotta', name: '暖调相簿', description: '陶土纸页配窄奶油衬边，适合日常与人像', category: 'paper',
    color: '#c6a491', pattern: 'paper', patternColor: '#957864',
    paddingRatio: .055, gapRatio: .029, cornerRadiusRatio: .004,
    photoFrame: { kind: 'paper', color: '#f8ecd8', insetRatio: .036, footerRatio: .018, shadowRatio: .012 },
  },
  {
    id: 'sea-salt', name: '柔角印片', description: '清浅底色与柔圆白边，轻盈排列生活照片', category: 'paper',
    color: '#edf2ef', pattern: 'none', patternColor: '#c8d5ce',
    paddingRatio: .038, gapRatio: .027, cornerRadiusRatio: .045,
    photoFrame: { kind: 'paper', color: '#ffffff', insetRatio: .022, footerRatio: 0, shadowRatio: .013 },
  },
  {
    id: 'full-bleed', name: '满版照片', description: '无边无缝，保留原有构图的完整视觉冲击', category: 'gallery',
    color: '#ffffff', pattern: 'none', patternColor: '#e6e6e1',
    paddingRatio: 0, gapRatio: 0, cornerRadiusRatio: 0,
    photoFrame: { kind: 'none', color: '#ffffff', insetRatio: 0, footerRatio: 0, shadowRatio: 0 },
  },
  {
    id: 'museum-black', name: '深色展厅', description: '宽幅炭黑装裱与展墙留白，突出光影层次', category: 'gallery',
    color: '#343a37', pattern: 'none', patternColor: '#515953',
    paddingRatio: .067, gapRatio: .034, cornerRadiusRatio: 0,
    photoFrame: { kind: 'paper', color: '#161c19', insetRatio: .1, footerRatio: 0, shadowRatio: .019 },
  },
  {
    id: 'instant-classic', name: '经典拍立得', description: '厚白边、宽下缘与纸影，给记忆一个实体相框', category: 'film',
    color: '#e4e0d8', pattern: 'paper', patternColor: '#b8b1a4',
    paddingRatio: .07, gapRatio: .046, cornerRadiusRatio: .002,
    photoFrame: { kind: 'instant', color: '#ffffff', insetRatio: .065, footerRatio: .26, shadowRatio: .034 },
  },
  {
    id: 'archive-film', name: '暖白底片册', description: '暖白档案页配宽黑齿孔边，适合系列叙事', category: 'film',
    color: '#f3eddf', pattern: 'paper', patternColor: '#c1b79e',
    paddingRatio: .052, gapRatio: .035, cornerRadiusRatio: .003,
    photoFrame: { kind: 'film', color: '#242522', insetRatio: .095, footerRatio: .025, shadowRatio: .017 },
  },
];

// A long strip uses its width: changing its height must not change the recipe on reapplication.
function presentationSide(document: EditorDocument): number {
  return document.mode === 'grid' && document.layoutId.startsWith('long-')
    ? document.width : Math.min(document.width, document.height);
}

/** The same pure recipe powers the applied document and every style preview. */
export function collageLookDocument(document: EditorDocument, look: CollageLook, assets: Record<string, MediaAsset>): EditorDocument {
  const side = presentationSide(document);
  const result: EditorDocument = {
    ...document,
    background: { color: look.color, pattern: look.pattern, patternColor: look.patternColor, assetId: null },
    padding: look.paddingRatio * side,
    gap: look.gapRatio * side,
    cornerRadius: look.cornerRadiusRatio * side,
    photoFrame: { ...look.photoFrame },
    slots: document.slots,
    elements: document.mode === 'free' ? document.elements.map(element => {
      if (element.type !== 'image') return element;
      const asset = assets[element.assetId];
      if (asset?.kind !== 'image' && asset?.kind !== 'video') return element;
      return { ...element, cornerRadius: look.cornerRadiusRatio * Math.min(element.width, element.height) };
    }) : document.elements,
  };
  if (document.mode === 'grid' && document.layoutId.startsWith('long-')) {
    const filled = result.slots.filter(slot => slot.assetId !== null);
    const photos = filled.map(slot => {
      const asset = assets[slot.assetId!];
      if (!asset || (asset.kind !== 'image' && asset.kind !== 'video')) {
        throw new Error('长拼照片素材缺失或不可用，请重新导入后再选择风格。');
      }
      return asset;
    });
    const composition = longComposition(photos, document.width, result);
    Object.assign(result, composition, {
      slots: composition.slots.map((rect, index) => ({ ...filled[index]!, ...rect })),
    });
  }
  return result;
}

export function matchingCollageLook(document: EditorDocument, assets?: Record<string, MediaAsset>): CollageLook | undefined {
  if (document.background.assetId) return undefined;
  const side = presentationSide(document);
  const near = (actual: number, expected: number) => Math.abs(actual - expected) <= .01;
  return collageLooks.find(look =>
    document.background.color.toLowerCase() === look.color.toLowerCase() &&
    document.background.pattern === look.pattern &&
    document.background.patternColor.toLowerCase() === look.patternColor.toLowerCase() &&
    near(document.padding, look.paddingRatio * side) &&
    near(document.gap, look.gapRatio * side) &&
    near(document.cornerRadius, look.cornerRadiusRatio * side) &&
    document.photoFrame.kind === look.photoFrame.kind &&
    document.photoFrame.color.toLowerCase() === look.photoFrame.color.toLowerCase() &&
    Math.abs(document.photoFrame.insetRatio - look.photoFrame.insetRatio) < 1e-6 &&
    Math.abs(document.photoFrame.footerRatio - look.photoFrame.footerRatio) < 1e-6 &&
    Math.abs(document.photoFrame.shadowRatio - look.photoFrame.shadowRatio) < 1e-6 &&
    (document.mode !== 'free' || !assets || document.elements.every(element => {
      if (element.type !== 'image') return true;
      const asset = assets[element.assetId];
      return (asset?.kind !== 'image' && asset?.kind !== 'video') ||
        near(element.cornerRadius, look.cornerRadiusRatio * Math.min(element.width, element.height));
    })),
  );
}
