import { z } from 'zod';
import type { EditorProject } from '../types';
import { createPhotoFrame } from '../defaults';

export const MAX_ASSET_BYTES = 150 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 512 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const assetReference = id.nullable();
const number = z.number().finite();
const position = number.min(-100000).max(100000);
const dimension = number.min(0).max(32768);
const color = z.string().max(128).refine(value => !/url\s*\(|[<>]/i.test(value), '颜色值不能包含外部资源。');
const animation = z.enum(['none', 'float', 'pulse', 'wiggle', 'pop', 'fade']);
const shape = z.enum(['rect', 'circle', 'heart', 'star']);
const crop = z.strictObject({ x: number.min(-10).max(10), y: number.min(-10).max(10), zoom: number.min(0.01).max(100), rotation: number.min(-36000).max(36000), flipX: z.boolean(), flipY: z.boolean() });
const filter = z.strictObject({ brightness: number.min(-1).max(1), contrast: number.min(-100).max(100), saturation: number.min(-100).max(100), blur: number.min(0).max(100), grayscale: z.boolean(), sepia: z.boolean() });
const background = z.strictObject({ color, pattern: z.enum(['none', 'dots', 'grid', 'stripes', 'paper', 'checker']), patternColor: color, assetId: assetReference });
const photoFrame = z.strictObject({ kind: z.enum(['none', 'paper', 'instant', 'film']), color, insetRatio: number.min(0).max(.16), footerRatio: number.min(0).max(.3), shadowRatio: number.min(0).max(.08) });
const base = {
  id, x: position, y: position, width: dimension, height: dimension,
  rotation: number.min(-36000).max(36000), opacity: number.min(0).max(1), locked: z.boolean(), visible: z.boolean(), animation, shadow: number.min(0).max(1000),
};
const element = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('image'), assetId: z.union([id, z.literal('')]), crop, filter, shape, borderWidth: number.min(0).max(1000), borderColor: color, cornerRadius: number.min(0).max(32768), trimStart: number.min(0).max(86400), trimEnd: number.min(0).max(86400).nullable(), muted: z.boolean() }),
  z.strictObject({ ...base, type: z.literal('text'), text: z.string().max(100000), fontFamily: z.string().min(1).max(256), fontSize: number.min(1).max(10000), fontStyle: z.enum(['normal', 'bold', 'italic', 'bold italic']), color, align: z.enum(['left', 'center', 'right']), lineHeight: number.min(0.1).max(20), stroke: color, strokeWidth: number.min(0).max(1000), backgroundColor: color, curve: number.min(-10000).max(10000) }),
  z.strictObject({ ...base, type: z.literal('drawing'), points: z.array(position).min(2).max(200000).refine(points => points.length % 2 === 0), color, strokeWidth: number.min(0).max(1000), tool: z.enum(['pen', 'highlighter', 'eraser']) }),
  z.strictObject({ ...base, type: z.literal('shape'), shape, fill: color, stroke: color, strokeWidth: number.min(0).max(1000) }),
]);
const slot = z.strictObject({ id, x: number.min(0).max(1), y: number.min(0).max(1), width: number.positive().max(1), height: number.positive().max(1), assetId: assetReference, crop, filter, shape, trimStart: number.min(0).max(86400).optional(), trimEnd: number.min(0).max(86400).nullable().optional(), muted: z.boolean().optional() }).refine(rect => rect.x + rect.width <= 1.00001 && rect.y + rect.height <= 1.00001, '网格超出画布。');
const audio = z.strictObject({ assetId: id, start: number.min(0).max(86400), end: number.min(0).max(86400).nullable(), volume: number.min(0).max(1) });
const documentSchema = z.strictObject({
  version: z.literal(1), id, title: z.string().max(256), mode: z.enum(['grid', 'free']), width: number.min(16).max(8192), height: number.min(16).max(8192),
  background, layoutId: id, slots: z.array(slot).max(100), elements: z.array(element).max(2000),
  photoFrame: photoFrame.default(createPhotoFrame),
  padding: number.min(0).max(4096), gap: number.min(0).max(4096), cornerRadius: number.min(0).max(4096), duration: number.min(0.1).max(3600), fps: number.min(1).max(120), animation, audio: audio.nullable(), createdAt: number.min(0), updatedAt: number.min(0),
}).superRefine((document, context) => {
  const ids = [...document.slots, ...document.elements].map(item => item.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: '页面图层标识重复。' });
  if (document.padding * 2 >= Math.min(document.width, document.height)) context.addIssue({ code: 'custom', message: '画布边距过大。' });
  for (const item of document.elements) if (item.type === 'image' && item.trimEnd !== null && item.trimEnd <= item.trimStart) context.addIssue({ code: 'custom', message: '视频裁剪终点必须晚于起点。' });
  for (const item of document.slots) if (item.trimEnd !== null && item.trimEnd !== undefined && item.trimEnd <= (item.trimStart ?? 0)) context.addIssue({ code: 'custom', message: '网格视频裁剪终点必须晚于起点。' });
  if (document.audio?.end !== null && document.audio?.end !== undefined && document.audio.end <= document.audio.start) context.addIssue({ code: 'custom', message: '音乐裁剪终点必须晚于起点。' });
});
export const projectSchema = z.strictObject({ version: z.literal(1), id, title: z.string().max(256), pages: z.array(documentSchema).min(1).max(100), activePageId: id }).superRefine((project, context) => {
  if (new Set(project.pages.map(page => page.id)).size !== project.pages.length) context.addIssue({ code: 'custom', message: '页面标识重复。' });
  if (!project.pages.some(page => page.id === project.activePageId)) context.addIssue({ code: 'custom', message: '当前页面不存在。' });
});
export const assetMetadataSchema = z.strictObject({
  id, name: z.string().min(1).max(512), kind: z.enum(['image', 'video', 'sticker', 'audio']),
  mime: z.string().max(128).regex(/^(?:image\/(?:jpeg|png|webp|svg\+xml|gif)|(?:audio|video)\/[a-z0-9.+-]+)$/),
  width: dimension, height: dimension, duration: number.min(0).max(86400),
}).superRefine((asset, context) => {
  if (asset.kind !== 'audio' && (asset.width < 1 || asset.height < 1 || asset.width * asset.height > 60000000)) context.addIssue({ code: 'custom', message: '素材尺寸无效或过大。' });
  if (!(asset.kind === 'audio' ? asset.mime.startsWith('audio/') : asset.kind === 'video' ? asset.mime.startsWith('video/') : asset.mime.startsWith('image/'))) context.addIssue({ code: 'custom', message: '素材类型与格式不匹配。' });
});
export type AssetMetadata = z.infer<typeof assetMetadataSchema>;
export const manifestSchema = z.strictObject({
  format: z.literal('collage-studio'), version: z.literal(1), project: projectSchema,
  assets: z.array(z.strictObject({ metadata: assetMetadataSchema, path: z.string().regex(/^assets\/[a-zA-Z0-9_-]+$/), size: z.number().int().positive().max(MAX_ASSET_BYTES), sha256: z.string().regex(/^[a-f0-9]{64}$/) })).max(2000),
}).superRefine((manifest, context) => {
  const ids = manifest.assets.map(asset => asset.metadata.id);
  if (new Set(ids).size !== ids.length || new Set(manifest.assets.map(asset => asset.path)).size !== ids.length) context.addIssue({ code: 'custom', message: '素材标识或文件路径重复。' });
  if (manifest.assets.some(asset => asset.path !== `assets/${asset.metadata.id}`)) context.addIssue({ code: 'custom', message: '素材路径与标识不匹配。' });
  if (manifest.assets.reduce((total, asset) => total + asset.size, 0) > MAX_PROJECT_BYTES) context.addIssue({ code: 'custom', message: '项目素材总大小超过 512 MB。' });
  try { validateReferences(manifest.project, manifest.assets.map(asset => asset.metadata)); }
  catch (error) { context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : '素材引用无效。' }); }
});

export function validateProject(value: unknown): EditorProject {
  const result = projectSchema.safeParse(value);
  if (!result.success) throw new Error(`项目数据无效：${result.error.issues[0]?.message ?? '格式不正确'} 请使用本编辑器导出的完整项目。`);
  return result.data;
}
export function validateReferences(project: EditorProject, assets: AssetMetadata[]): void {
  const records = new Map(assets.map(asset => [asset.id, asset]));
  if (records.size !== assets.length) throw new Error('素材标识重复，请重新导出项目。');
  const requireAsset = (id: string | null, audioOnly = false) => {
    if (!id) return;
    const asset = records.get(id);
    if (!asset) throw new Error(`项目缺少素材 ${id}，请重新导出包含全部原文件的项目。`);
    if (audioOnly ? asset.kind !== 'audio' : asset.kind === 'audio') throw new Error('项目的图片或音乐引用类型不正确。');
  };
  for (const page of project.pages) {
    requireAsset(page.background.assetId);
    for (const slot of page.slots) {
      requireAsset(slot.assetId);
      const asset = slot.assetId ? records.get(slot.assetId) : null;
      if (asset?.duration && ((slot.trimStart ?? 0) >= asset.duration || (slot.trimEnd !== null && slot.trimEnd !== undefined && slot.trimEnd > asset.duration + 0.1))) throw new Error('网格视频或动图裁剪超出素材时长，请调整后重试。');
    }
    for (const item of page.elements) if (item.type === 'image') {
      requireAsset(item.assetId);
      const asset = records.get(item.assetId);
      if (asset?.duration && (item.trimStart >= asset.duration || (item.trimEnd !== null && item.trimEnd > asset.duration + 0.1))) throw new Error('视频或动图裁剪超出素材时长，请调整后重试。');
    }
    if (page.audio) {
      requireAsset(page.audio.assetId, true);
      const asset = records.get(page.audio.assetId)!;
      if (page.audio.start >= asset.duration || (page.audio.end !== null && page.audio.end > asset.duration + 0.1)) throw new Error('音乐裁剪超出素材时长，请调整后重试。');
    }
  }
}
