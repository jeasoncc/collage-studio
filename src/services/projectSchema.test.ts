import { describe, expect, it } from 'vitest';
import { createDocument, createDrawing } from '../defaults';
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
  it('migrates legacy local documents and archive manifests without losing existing contents', () => {
    const value = project();
    value.pages[0]!.slots[0]!.assetId = metadata.id;
    const { textDraft: _draft, ...legacy } = value.pages[0]!;
    const historical = { ...value, pages: [legacy] };
    const restored = validateProject(JSON.parse(JSON.stringify(historical)));
    expect(restored.pages[0]).toEqual({ ...legacy, textDraft: '' });
    const manifest = manifestSchema.parse({
      format: 'collage-studio', version: 1, project: historical,
      assets: [{ metadata, path: 'assets/photo', size: 20, sha256: 'a'.repeat(64) }],
    });
    expect(manifest.project.pages[0]).toEqual({ ...legacy, textDraft: '' });
    expect(manifest.assets[0]!.metadata).toEqual(metadata);
  });
  it('round-trips per-page draft input and enforces its separate size limit', () => {
    const value = project();
    value.pages[0]!.textDraft = '  原样保留\n未添加文字  ';
    const second = createDocument();
    second.textDraft = '字'.repeat(2000);
    value.pages.push(second);
    const manifest = manifestSchema.parse(JSON.parse(JSON.stringify({
      format: 'collage-studio', version: 1, project: value, assets: [],
    })));
    expect(manifest.project).toEqual(value);
    const imported = validateProject(manifest.project);
    expect(imported.pages.map(page => page.textDraft)).toEqual(['  原样保留\n未添加文字  ', '字'.repeat(2000)]);
    second.textDraft += '字';
    expect(() => validateProject(value)).toThrow('项目数据无效');
    for (const draft of [null, 42]) {
      expect(() => validateProject({ ...value, pages: [{ ...value.pages[0]!, textDraft: draft }] })).toThrow('项目数据无效');
    }
  });
  it('normalizes historical slots to visible and unlocked across local restores and archive imports', () => {
    const value = project();
    value.pages[0]!.slots[0]!.assetId = metadata.id;
    const legacy = {
      ...value,
      pages: value.pages.map(page => ({
        ...page,
        slots: page.slots.map(({ visible: _visible, locked: _locked, ...slot }) => slot),
      })),
    };
    const restored = validateProject(JSON.parse(JSON.stringify(legacy)));
    expect(restored).toEqual(value);
    const manifest = manifestSchema.parse({
      format: 'collage-studio', version: 1, project: legacy,
      assets: [{ metadata, path: 'assets/photo', size: 20, sha256: 'a'.repeat(64) }],
    });
    expect(manifest.project).toEqual(value);
    expect(manifest.project.pages[0]!.slots.every(slot => slot.visible && !slot.locked)).toBe(true);
  });
  it('round-trips hidden and locked slots and rejects malformed state before restoring a project', () => {
    const value = project();
    value.pages[0]!.slots[0]!.visible = false;
    value.pages[0]!.slots[0]!.locked = true;
    expect(validateProject(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(manifestSchema.parse({ format: 'collage-studio', version: 1, project: value, assets: [] }).project).toEqual(value);
    for (const patch of [{ visible: null }, { locked: 'false' }]) {
      const page = value.pages[0]!;
      expect(() => validateProject({ ...value, pages: [{ ...page, slots: [{ ...page.slots[0]!, ...patch }, page.slots[1]!] }] })).toThrow('项目数据无效');
    }
  });
  it('persists eraser targets without assigning them to legacy drawings and bounds imported target identities', () => {
    const value = project();
    const ink = createDrawing({ points: [10, 20, 100, 120], tool: 'pen', color: '#000000', width: 5 });
    const eraser = createDrawing({ points: [10, 20, 100, 120], tool: 'eraser', color: '#000000', width: 10 });
    eraser.eraseTargets = [ink.id];
    value.pages[0]!.elements = [ink, eraser];
    expect(validateProject(JSON.parse(JSON.stringify(value)))).toEqual(value);
    const manifest = manifestSchema.parse({ format: 'collage-studio', version: 1, project: value, assets: [] });
    expect(manifest.project.pages[0]!.elements).toEqual([ink, eraser]);
    const { eraseTargets: _targets, ...legacyEraser } = eraser;
    const legacy = { ...value, pages: [{ ...value.pages[0]!, elements: [ink, legacyEraser] }] };
    expect(validateProject(legacy).pages[0]!.elements[1]).not.toHaveProperty('eraseTargets');
    for (const eraseTargets of [null, ['invalid id'], Array.from({ length: 2001 }, () => ink.id)]) {
      expect(() => validateProject({ ...value, pages: [{ ...value.pages[0]!, elements: [ink, { ...eraser, eraseTargets }] }] })).toThrow('项目数据无效');
    }
  });
});
