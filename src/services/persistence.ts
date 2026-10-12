import Dexie from 'dexie';
import type { Table } from 'dexie';
import { strFromU8, strToU8, unzipSync, zip } from 'fflate';
import type { Zippable } from 'fflate';
import { markRaw } from 'vue';
import type { EditorProject, MediaAsset } from '../types';
import { createAsset, disposeAsset } from './media';
import { assetMetadataSchema, manifestSchema, MAX_ASSET_BYTES, MAX_MANIFEST_BYTES, MAX_PROJECT_BYTES, validateProject, validateReferences } from './projectSchema';
import type { AssetMetadata } from './projectSchema';

interface StoredAsset { metadata: AssetMetadata; blob: Blob }
interface DraftRecord { id: string; project: EditorProject; assets: StoredAsset[]; thumbnail: Blob; updatedAt: number }
class DraftDatabase extends Dexie {
  drafts!: Table<DraftRecord, string>;
  constructor() { super('collage-studio-local'); this.version(1).stores({ drafts: '&id,updatedAt' }); }
}
const database = new DraftDatabase();
const copyProject = (project: EditorProject): EditorProject => validateProject(JSON.parse(JSON.stringify(project)));
function actionable(prefix: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : '';
  if (detail) return new Error(`${prefix}：${detail}`, { cause: error });
  return new Error(`${prefix}。请检查文件完整性、浏览器存储权限及可用空间，然后重试。`);
}
function metadataOf(asset: MediaAsset): AssetMetadata {
  return assetMetadataSchema.parse({ id: asset.id, name: asset.name, kind: asset.kind, mime: asset.mime, width: asset.width, height: asset.height, duration: asset.duration });
}
function storedAssets(project: EditorProject, assets: Record<string, MediaAsset>): StoredAsset[] {
  const list = Object.values(assets).map(asset => {
    if (!(asset.blob instanceof Blob) || !asset.blob.size || asset.blob.size > MAX_ASSET_BYTES) throw new Error('原始素材为空或超过 150 MB，请重新导入。');
    return { metadata: metadataOf(asset), blob: asset.blob };
  });
  if (list.length > 2000 || list.reduce((sum, asset) => sum + asset.blob.size, 0) > MAX_PROJECT_BYTES) throw new Error('素材数量超过 2000 或项目超过 512 MB，请拆分为多个项目。');
  validateReferences(project, list.map(asset => asset.metadata));
  return list;
}
async function hydrate(project: EditorProject, stored: StoredAsset[]): Promise<{ project: EditorProject; assets: MediaAsset[] }> {
  const assets: MediaAsset[] = [];
  try {
    if (!Array.isArray(stored) || stored.length > 2000) throw new Error('草稿素材列表损坏，请导入备份项目。');
    let total = 0;
    const validated = stored.map(item => {
      const metadata = assetMetadataSchema.parse(item.metadata);
      if (!(item.blob instanceof Blob) || !item.blob.size || item.blob.size > MAX_ASSET_BYTES) throw new Error('草稿缺少原始素材或素材过大，请导入备份项目。');
      total += item.blob.size;
      if (total > MAX_PROJECT_BYTES) throw new Error('项目素材总大小超过 512 MB，请拆分项目。');
      return { metadata, blob: item.blob };
    });
    validateReferences(project, validated.map(item => item.metadata));
    for (const { metadata, blob } of validated) {
      const asset = await createAsset(blob.type === metadata.mime ? blob : new Blob([blob], { type: metadata.mime }), metadata.name, metadata.kind);
      assets.push(asset);
      if (asset.width !== metadata.width || asset.height !== metadata.height || Math.abs(asset.duration - metadata.duration) > 0.25) throw new Error(`素材“${metadata.name}”与项目记录不一致，请重新导出。`);
      // Keep the original identity and editable metadata while retaining freshly decoded runtime resources.
      Object.assign(asset, metadata);
      markRaw(asset.blob);
      markRaw(asset);
    }
    return { project, assets };
  } catch (error) {
    for (const asset of assets) disposeAsset(asset);
    throw error;
  }
}
export async function listDrafts(): Promise<Array<{ id: string; title: string; updatedAt: number; pageCount: number; thumbnail: Blob }>> {
  try {
    return (await database.drafts.orderBy('updatedAt').reverse().toArray()).map(draft => ({ id: draft.id, title: draft.project.title, updatedAt: draft.updatedAt, pageCount: draft.project.pages.length, thumbnail: draft.thumbnail }));
  } catch (error) { throw actionable('无法读取本机草稿', error); }
}
export async function saveDraft(project: EditorProject, assets: Record<string, MediaAsset>, thumbnail: Blob): Promise<void> {
  try {
    const snapshot = copyProject(project);
    if (!(thumbnail instanceof Blob) || !thumbnail.size || thumbnail.size > 10 * 1024 * 1024) throw new Error('草稿封面为空或超过 10 MB，请重新保存。');
    await database.drafts.put({ id: snapshot.id, project: snapshot, assets: storedAssets(snapshot, assets), thumbnail, updatedAt: Date.now() });
  } catch (error) { throw actionable('草稿保存失败', error); }
}
export async function loadDraft(id: string): Promise<{ project: EditorProject; assets: MediaAsset[] }> {
  try {
    const draft = await database.drafts.get(id);
    if (!draft) throw new Error('草稿不存在，可能已被删除或浏览器已清理存储，请导入项目备份。');
    return await hydrate(copyProject(draft.project), draft.assets);
  } catch (error) { throw actionable('草稿打开失败', error); }
}
export async function deleteDraft(id: string): Promise<void> {
  try { await database.drafts.delete(id); }
  catch (error) { throw actionable('草稿删除失败', error); }
}
async function digest(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function exportProject(project: EditorProject, assets: Record<string, MediaAsset>): Promise<Blob> {
  try {
    const snapshot = copyProject(project);
    const originals = storedAssets(snapshot, assets);
    const files: Zippable = {};
    const entries = [];
    for (const asset of originals) {
      const bytes = new Uint8Array(await asset.blob.arrayBuffer());
      const path = `assets/${asset.metadata.id}`;
      files[path] = [bytes, { level: 0 }];
      entries.push({ metadata: asset.metadata, path, size: bytes.byteLength, sha256: await digest(bytes) });
    }
    const manifest = manifestSchema.parse({ format: 'collage-studio', version: 1, project: snapshot, assets: entries });
    const manifestBytes = strToU8(JSON.stringify(manifest));
    if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) throw new Error('项目编辑数据超过 8 MB，请减少绘图点或拆分页面。');
    files['manifest.json'] = manifestBytes;
    files['manifest.sha256'] = strToU8(await digest(manifestBytes));
    const zipped = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, result) => error ? reject(error) : resolve(result)));
    return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/x-collage' });
  } catch (error) { throw actionable('项目导出失败', error); }
}
export async function importProject(file: File): Promise<{ project: EditorProject; assets: MediaAsset[] }> {
  try {
    if (!file.size || file.size > MAX_PROJECT_BYTES + MAX_MANIFEST_BYTES + 1024 * 1024) throw new Error('项目文件为空或超过 521 MB，请选择完整的 .collage 项目。');
    const names = new Set<string>();
    let expanded = 0;
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter(entry) {
        if (names.has(entry.name)) throw new Error('项目压缩包存在重复文件，请重新导出。');
        names.add(entry.name);
        if (names.size > 2002 || (entry.name !== 'manifest.json' && entry.name !== 'manifest.sha256' && !/^assets\/[a-zA-Z0-9_-]{1,128}$/.test(entry.name))) throw new Error('项目压缩包包含非法路径或多余文件，请重新导出。');
        const limit = entry.name === 'manifest.json' ? MAX_MANIFEST_BYTES : entry.name === 'manifest.sha256' ? 64 : MAX_ASSET_BYTES;
        if (!entry.originalSize || entry.originalSize > limit) throw new Error('项目压缩包中的文件为空或解压后过大，请重新导出。');
        expanded += entry.originalSize;
        if (expanded > MAX_PROJECT_BYTES + MAX_MANIFEST_BYTES + 64) throw new Error('项目解压大小超过安全限制，请拆分项目。');
        return true;
      },
    });
    const manifestBytes = files['manifest.json'];
    if (!manifestBytes) throw new Error('项目缺少 manifest.json，请选择本编辑器导出的 .collage 文件。');
    const checksum = files['manifest.sha256'];
    if (!checksum || checksum.byteLength !== 64 || strFromU8(checksum) !== await digest(manifestBytes)) throw new Error('项目清单校验失败，请重新传输或重新导出完整项目。');
    const parsed = manifestSchema.safeParse(JSON.parse(strFromU8(manifestBytes)));
    if (!parsed.success) throw new Error(`项目清单损坏：${parsed.error.issues[0]?.message ?? '数据格式错误'} 请重新导出。`);
    const manifest = parsed.data;
    if (Object.keys(files).length !== manifest.assets.length + 2) throw new Error('项目文件数量与清单不一致，请重新导出。');
    const originals: StoredAsset[] = [];
    for (const entry of manifest.assets) {
      const bytes = files[entry.path];
      if (!bytes || bytes.byteLength !== entry.size) throw new Error(`素材“${entry.metadata.name}”缺失或损坏，请重新导出包含原始文件的项目。`);
      if (await digest(bytes) !== entry.sha256) throw new Error(`素材“${entry.metadata.name}”校验失败，请重新传输完整项目。`);
      originals.push({ metadata: entry.metadata, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: entry.metadata.mime }) });
    }
    return await hydrate(manifest.project, originals);
  } catch (error) { throw actionable('项目导入失败', error); }
}
