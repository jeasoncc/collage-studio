import { describe, expect, it } from 'vitest';
import { createDocument } from '../defaults';
import type { EditorProject } from '../types';
import { manifestSchema, validateProject, validateReferences } from './projectSchema';

function project(): EditorProject {
  const page = createDocument();
  return { version: 1, id: 'test-project', title: '测试项目', pages: [page], activePageId: page.id };
}
const metadata = { id: 'photo', name: 'photo.png', kind: 'image' as const, mime: 'image/png', width: 640, height: 480, duration: 0 };

describe('editable project validation', () => {
  it('rejects missing media, wrong audio references, duplicate pages and excessive bounds', () => {
    const value = project();
    value.pages[0]!.slots[0]!.assetId = 'photo';
    expect(() => validateReferences(value, [])).toThrow('缺少素材');
    value.pages[0]!.audio = { assetId: 'photo', start: 0, end: null, volume: 1 };
    expect(() => validateReferences(value, [metadata])).toThrow('引用类型');
    value.pages.push(value.pages[0]!);
    expect(() => validateProject(value)).toThrow('页面标识重复');
    const oversized = project();
    oversized.pages[0]!.width = 99999;
    expect(() => validateProject(oversized)).toThrow('项目数据无效');
  });
  it('rejects unsafe archive paths, repeated identities and manifest references to absent assets', () => {
    const value = project();
    value.pages[0]!.slots[0]!.assetId = 'photo';
    const entry = { metadata, path: 'assets/photo', size: 20, sha256: 'a'.repeat(64) };
    const valid = { format: 'collage-studio', version: 1, project: value, assets: [entry] };
    expect(manifestSchema.safeParse(valid).success).toBe(true);
    expect(manifestSchema.safeParse({ ...valid, assets: [] }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...valid, assets: [entry, entry] }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...valid, assets: [{ ...entry, path: '../photo' }] }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...valid, assets: [{ ...entry, size: 151 * 1024 * 1024 }] }).success).toBe(false);
  });
  it('loads historical unframed projects without changing their photo composition', () => {
    const value = project();
    const { photoFrame: _frame, ...legacy } = value.pages[0]!;
    const restored = validateProject({ ...value, pages: [legacy] });
    expect(restored.pages[0]!.photoFrame).toMatchObject({ kind: 'none', insetRatio: 0, footerRatio: 0, shadowRatio: 0 });
    expect(restored.pages[0]!.slots).toEqual(legacy.slots);
    expect(restored.pages[0]!.background).toEqual(legacy.background);
  });
  it('round-trips photographic materials and rejects corrupt frame dimensions', () => {
    const value = project();
    value.pages[0]!.photoFrame = { kind: 'instant', color: '#fffdf5', insetRatio: .065, footerRatio: .26, shadowRatio: .034 };
    expect(validateProject(JSON.parse(JSON.stringify(value))).pages[0]!.photoFrame).toEqual(value.pages[0]!.photoFrame);
    for (const patch of [{ kind: 'unknown' }, { insetRatio: .5 }, { footerRatio: -.1 }, { shadowRatio: Infinity }]) {
      expect(() => validateProject({ ...value, pages: [{ ...value.pages[0]!, photoFrame: { ...value.pages[0]!.photoFrame, ...patch } }] })).toThrow('项目数据无效');
    }
  });
});
