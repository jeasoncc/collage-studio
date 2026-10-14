import type { EditorDocument, SceneElement, CollageSlot, LayoutPreset, TemplatePreset, StickerPreset, ImageShape, FilterState, Selection } from './types';
import type { CollageLook } from './catalog/looks';
import type { PhotoTextPair, PhotoTextStyle, TextPlacement } from './catalog/photoText';

export type PanelName = 'photos' | 'layouts' | 'spacing' | 'looks' | 'templates' | 'background' | 'text' | 'stickers' | 'draw' | 'layers' | 'animation' | 'audio';
export type EditorTool = 'select' | 'draw' | 'erase';
export type PanelAction =
  | { type: 'document'; patch: Partial<Omit<EditorDocument, 'mode'>>; commit?: boolean }
  | { type: 'element'; patch: Partial<SceneElement>; commit?: boolean }
  | { type: 'slot'; patch: Partial<CollageSlot>; commit?: boolean }
  | { type: 'layout'; layout: LayoutPreset }
  | { type: 'look'; look: CollageLook }
  | { type: 'tone'; filter: FilterState }
  | { type: 'template'; template: TemplatePreset }
  | { type: 'sticker'; sticker: StickerPreset }
  | { type: 'mainPhoto'; target: Exclude<Selection, null> }
  | { type: 'poster'; template: TemplatePreset }
  | { type: 'asset'; assetId: string }
  | { type: 'upload' }
  | { type: 'replace' }
  | { type: 'addText'; text?: string; style?: PhotoTextStyle }
  | { type: 'textStyle'; style: PhotoTextStyle }
  | { type: 'textPosition'; position: TextPlacement }
  | { type: 'textPair'; pair: PhotoTextPair }
  | { type: 'selection'; selection: Selection }
  | { type: 'editText'; id: string }
  | { type: 'addShape'; shape: ImageShape }
  | { type: 'backgroundAsset'; assetId: string | null }
  | { type: 'remove' }
  | { type: 'duplicate' }
  | { type: 'layer'; direction: 'up' | 'down' | 'front' | 'back' }
  | { type: 'select'; id: string }
  | { type: 'resetCrop' }
  | { type: 'smartCrop' }
  | { type: 'swap' }
  | { type: 'checkpoint' }
  | { type: 'tool'; tool: EditorTool }
  | { type: 'brush'; color?: string; size?: number; highlighter?: boolean }
  | { type: 'uploadAudio' }
  | { type: 'clearAudio' };
