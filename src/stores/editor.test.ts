import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createCrop, createElementBase, slotRect } from '../defaults';
import { layouts, MAX_COLLAGE_PHOTOS } from '../catalog/layouts';
import { templates } from '../catalog/templates';
import { photoPostersForCount } from '../catalog/photoPosters';
import { collageLooks, matchingCollageLook } from '../catalog/looks';
import { photoFrameGeometry } from '../components/photoFrameGeometry';
import { photoTextPairs, photoTextStyles } from '../catalog/photoText';
import type { CollageSlot, ImageElement, SceneElement, TextElement } from '../types';
import type { MediaAsset, TemplatePreset } from '../types';

// Browser decoding is outside these behavior-only state tests. No renderer/export API is replaced.
vi.mock('../services/media', () => ({ disposeAsset: vi.fn() }));
import { useEditorStore } from './editor';
import { disposeAsset } from '../services/media';

function photo(id: string, patch: Partial<MediaAsset> = {}): MediaAsset {
  const blob = new Blob(['state-fixture'], { type: 'image/png' });
  return { id, name: `${id}.png`, kind: 'image', mime: 'image/png', width: 640, height: 480, duration: 0, blob, src: `blob:fixture-${id}`, thumbnail: `blob:thumbnail-${id}`, ...patch };
}
beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); setActivePinia(createPinia()); });

describe('editor project history', () => {
  it('undoes a continuous edit as one gesture and clears unsafe selection', () => {
    const store = useEditorStore();
    store.addText('原文字');
    const original = store.snapshot();
    store.updateSelected({ x: 123 }, false);
    store.updateSelected({ x: 234 }, false);
    store.checkpoint();
    store.undo();
    expect(store.snapshot()).toEqual(original);
    expect(store.selection).toBeNull();
    store.redo();
    expect(store.document.elements[0]?.x).toBe(234);
  });
  it('resets history on new project and restore instead of undoing to disposed originals', () => {
    const store = useEditorStore();
    store.addAssets([photo('first')]);
    store.newProject('free');
    expect(store.canUndo).toBe(false);
    expect(store.assets).toEqual({});
    store.addText();
    const snapshot = store.snapshot();
    store.restore(snapshot, [], 'saved');
    expect(store.canUndo).toBe(false);
    expect(store.dirty).toBe(false);
  });
  it('marks the current revision saved but not edits made during an asynchronous save', () => {
    const store = useEditorStore();
    store.addText();
    expect(store.dirty).toBe(true);
    const revision = store.revision;
    store.updateSelected({ x: 100 });
    store.markSaved(revision);
    expect(store.dirty).toBe(true);
    store.markSaved();
    expect(store.dirty).toBe(false);
  });
  it('keeps a new blank project unsaved until its own revision is persisted', () => {
    const store = useEditorStore();
    store.markSaved();
    store.newProject('free');
    expect(store.dirty).toBe(true);
    expect(store.canUndo).toBe(false);
    store.markSaved();
    expect(store.dirty).toBe(false);
  });
  it('keeps an imported copy unsaved until its first persistence completes', () => {
    const store = useEditorStore();
    store.addText('中文备份');
    store.markSaved();
    const imported = store.snapshot();
    imported.id = crypto.randomUUID();
    store.restore(imported, [], 'unsaved');
    expect(store.dirty).toBe(true);
    expect(store.canUndo).toBe(false);
    store.undo();
    expect(store.dirty).toBe(true);
    store.markSaved();
    expect(store.dirty).toBe(false);
  });
});

describe('photo-preserving transitions', () => {
  it('preserves grid crop, geometry, video trims and library originals when switching modes', () => {
    const store = useEditorStore();
    store.addAssets([photo('one'), photo('two'), photo('surplus')]);
    store.select({ kind: 'slot', id: store.document.slots[0]!.id });
    store.updateSlot({ trimStart: 1, trimEnd: 3, muted: true });
    const rect = slotRect(store.document, store.document.slots[0]!);
    const originalBlob = store.assets.one!.blob;
    store.setMode('free');
    const element = store.document.elements[0]!;
    expect(element).toMatchObject({ ...rect, assetId: 'one', trimStart: 1, trimEnd: 3, muted: true });
    store.setMode('grid');
    expect(store.document.slots.map(slot => slot.assetId)).toEqual(['one', 'two']);
    expect(store.document.slots[0]).toMatchObject({ trimStart: 1, trimEnd: 3, muted: true });
    const beforeLayout = store.snapshot();
    expect(() => store.applyLayout(layouts[0]!)).toThrow(/只有 1 个照片位置/);
    expect(store.snapshot()).toEqual(beforeLayout);
    store.applyLayout(layouts.find(layout => layout.id === 'hero-2')!);
    expect(store.document.slots.map(slot => slot.assetId)).toEqual(['one', 'two']);
    expect(Object.keys(store.assets)).toEqual(['one', 'two', 'surplus']);
    store.undo();
    expect(store.document.slots.map(slot => slot.assetId)).toEqual(['one', 'two']);
    expect(store.assets.one!.blob).toBe(originalBlob);
  });
  it('creates empty rotated template frames, fills them, and keeps overlay ordering', () => {
    const store = useEditorStore();
    const template: TemplatePreset = {
      id: 'test-template', name: '测试', category: '极简', description: '', width: 800, height: 600, mode: 'free', layoutId: 'grid-1',
      background: { color: '#ffffff', pattern: 'none', patternColor: '#eeeeee', assetId: null }, padding: 20, gap: 10, cornerRadius: 0, animation: 'none',
      photoFrames: [{ x: .125, y: .25, width: .5, height: .5, rotation: -12 }],
      elements: [
        { ...createElementBase('shape'), type: 'shape', shape: 'rect', fill: '#ffffff', stroke: '', strokeWidth: 0 },
        { ...createElementBase('shape'), type: 'shape', shape: 'star', fill: '#ff0000', stroke: '', strokeWidth: 0, animation: 'pulse' },
      ],
    };
    store.applyTemplate(template);
    expect(store.document.elements.map(element => element.type)).toEqual(['shape', 'image', 'shape']);
    const frame = store.document.elements[1]!;
    expect(frame).toMatchObject({ assetId: '', x: 100, y: 150, width: 400, height: 300, rotation: -12 });
    store.addAssets([photo('frame-photo')]);
    expect(store.document.elements[1]).toMatchObject({ id: frame.id, assetId: 'frame-photo', x: 100, y: 150, width: 400, height: 300, rotation: -12 });
  });
  it('keeps drawn world points fixed and includes the visible stroke in selectable bounds', () => {
    const store = useEditorStore();
    store.newProject('free');
    store.addDrawing({ points: [100, 200, 140, 260], tool: 'pen', color: '#000000', width: 8 });
    const item = store.selected;
    if (item?.type !== 'drawing') throw new Error('Drawing was not created');
    expect(item.points.map((point, index) => point + (index % 2 ? item.y : item.x))).toEqual([100, 200, 140, 260]);
    expect(item.x).toBeLessThanOrEqual(96);
    expect(item.y).toBeLessThanOrEqual(196);
    expect(item.x + item.width).toBeGreaterThanOrEqual(144);
    expect(item.y + item.height).toBeGreaterThanOrEqual(264);
    store.updateDocument({ width: 2160, height: 2160 });
    const resized = store.selected;
    if (resized?.type !== 'drawing') throw new Error('Resized drawing is missing');
    expect(resized.points.map((point, index) => point + (index % 2 ? resized.y : resized.x))).toEqual([200, 400, 280, 520]);
    expect(resized.strokeWidth).toBe(16);
  });
  it('scales readable text with the canvas instead of retaining its previous pixel size', () => {
    const store = useEditorStore();
    store.addText('A resized caption');
    store.updateSelected({ fontSize: 80 });
    store.updateDocument({ width: 2160, height: 2160 });
    expect(store.selected).toMatchObject({ fontSize: 160 });
  });
  it('keeps shared media through page duplication, deletion and undo', () => {
    const store = useEditorStore();
    const asset = photo('shared');
    store.addAssets([asset]);
    const firstPage = store.document.id;
    store.addPage(true);
    const secondPage = store.document.id;
    expect(secondPage).not.toBe(firstPage);
    expect(store.document.slots[0]?.assetId).toBe('shared');
    store.deletePage(firstPage);
    expect(store.assets.shared).toBe(asset);
    store.undo();
    expect(store.project.pages).toHaveLength(2);
    store.selectPage(firstPage);
    expect(store.selection).toBeNull();
  });
});

describe('photo-first collage creation', () => {
  it('validates every input before replacing existing work or disposing its originals', () => {
    const store = useEditorStore();
    store.addAssets([photo('original')]);
    store.addText('保留作品');
    const original = store.snapshot();
    const asset = store.assets.original;
    const setup = { mode: 'grid' as const, width: 1080, height: 1350 };
    const invalidItems = [
      [], Array.from({ length: MAX_COLLAGE_PHOTOS + 1 }, (_, index) => photo(`too-many-${index}`)),
      [photo('bad-width', { width: 0 })], [photo('bad-height', { height: Infinity })],
      [photo('sticker', { kind: 'sticker' })], [photo('audio', { kind: 'audio', mime: 'audio/mp3' })],
      [photo('empty-file', { blob: new Blob() })], [photo('duplicate'), photo('duplicate')],
    ];
    for (const items of invalidItems) expect(() => store.initializeCollage(items, setup)).toThrow();
    expect(() => store.initializeCollage([photo('valid')], { ...setup, width: 8193 })).toThrow();
    expect(() => store.initializeCollage([photo('valid')], { ...setup, height: NaN })).toThrow();
    expect(store.snapshot()).toEqual(original);
    expect(store.assets.original).toBe(asset);
    expect(store.canUndo).toBe(true);
    expect(disposeAsset).not.toHaveBeenCalled();
  });
  it('creates an ordered recommended photo grid as the unsaved undo baseline', () => {
    const store = useEditorStore();
    const items = [photo('portrait', { width: 480, height: 800 }), photo('landscape'), photo('square', { width: 640, height: 640 })];
    store.initializeCollage(items, { mode: 'grid', width: 1080, height: 1350 });
    expect(store.document.slots.map(slot => slot.assetId)).toEqual(items.map(asset => asset.id));
    expect(store.assets.portrait!.blob).toBe(items[0]!.blob);
    const created = store.snapshot();
    expect(store.canUndo).toBe(false);
    expect(store.dirty).toBe(true);
    store.undo();
    expect(store.snapshot()).toEqual(created);
    store.markSaved();
    expect(store.dirty).toBe(false);
  });
  it('arranges free photos in distinct usable grid-derived frames', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one'), photo('two'), photo('three')], { mode: 'free', width: 1080, height: 1080 });
    const pictures = store.document.elements.filter(item => item.type === 'image');
    expect(store.document.mode).toBe('free');
    expect(store.document.slots).toEqual([]);
    expect(pictures.map(item => item.assetId)).toEqual(['one', 'two', 'three']);
    expect(new Set(pictures.map(item => `${item.x},${item.y}`)).size).toBe(3);
    expect(pictures.every(item => item.width > 16 && item.height > 16)).toBe(true);
    expect(store.canUndo).toBe(false);
  });
  it('stitches full-width original proportions without gaps and survives restore', () => {
    const store = useEditorStore();
    const items = [photo('landscape', { width: 1200, height: 600 }), photo('portrait', { width: 600, height: 1500 })];
    store.initializeCollage(items, { mode: 'long', width: 1440, height: 1080 });
    expect(store.document).toMatchObject({ mode: 'grid', padding: 0, gap: 0, cornerRadius: 0 });
    expect(store.document.layoutId).toMatch(/^long-/);
    let bottom = 0;
    store.document.slots.forEach((slot, index) => {
      const frame = slotRect(store.document, slot);
      expect(frame.x).toBe(0);
      expect(frame.y).toBeCloseTo(bottom);
      expect(frame.width).toBe(store.document.width);
      expect(frame.width / frame.height).toBeCloseTo(items[index]!.width / items[index]!.height);
      expect(slot.crop).toMatchObject({ x: 0, y: 0, zoom: 1, rotation: 0 });
      bottom = frame.y + frame.height;
    });
    expect(bottom).toBeCloseTo(store.document.height);
    const stitched = store.snapshot();
    store.restore(stitched, items, 'saved');
    expect(store.snapshot()).toEqual(stitched);
    expect(store.canUndo).toBe(false);
  });
  it('reduces long width to fit the height limit and rejects impossible geometry nondestructively', () => {
    const store = useEditorStore();
    const items = Array.from({ length: 12 }, (_, index) => photo(`tall-${index}`, { width: 400, height: 4000 }));
    store.initializeCollage(items, { mode: 'long', width: 1080, height: 1080 });
    expect(store.document.width).toBeCloseTo(8192 / 120);
    expect(store.document.height).toBeLessThanOrEqual(8192);
    const original = store.snapshot();
    expect(() => store.initializeCollage([photo('extreme', { width: 1, height: 32768 })], { mode: 'long', width: 1080, height: 1080 })).toThrow();
    expect(store.snapshot()).toEqual(original);
    expect(disposeAsset).not.toHaveBeenCalled();
  });
  it('respects a free template and refuses to silently discard photos beyond its frames', () => {
    const store = useEditorStore();
    const template: TemplatePreset = {
      id: 'framed', name: '相框', category: '极简', description: '', width: 800, height: 600, mode: 'free', layoutId: 'grid-1',
      background: { color: '#ffffff', pattern: 'none', patternColor: '#eeeeee', assetId: null },
      padding: 20, gap: 10, cornerRadius: 12, animation: 'none', elements: [],
      photoFrames: [{ x: .125, y: .25, width: .5, height: .5, rotation: -12, shape: 'heart' }],
    };
    store.initializeCollage([photo('framed-photo')], { mode: 'grid', width: 1080, height: 1080, template });
    expect(store.document).toMatchObject({ mode: 'free', width: 800, height: 600, cornerRadius: 12 });
    expect(store.document.elements[0]).toMatchObject({ assetId: 'framed-photo', x: 100, y: 150, width: 400, height: 300, rotation: -12, shape: 'heart' });
    const original = store.snapshot();
    expect(() => store.initializeCollage([photo('one'), photo('two')], { mode: 'free', width: 1080, height: 1080, template })).toThrow();
    expect(store.snapshot()).toEqual(original);
    expect(disposeAsset).not.toHaveBeenCalled();
  });
});

describe('atomic collage photo management', () => {
  it('reorders, removes and adds in one undo while crop/filter/video content follows its entry', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one'), photo('two'), photo('three')], { mode: 'grid', width: 1080, height: 1080 });
    const [one, , three] = store.document.slots;
    store.select({ kind: 'slot', id: one!.id });
    store.updateSlot({ crop: { ...one!.crop, zoom: 1.6, x: .2 }, filter: { ...one!.filter, sepia: true }, shape: 'heart', trimStart: 1, trimEnd: 3, muted: true });
    const original = store.snapshot();
    const geometry = store.document.slots.map(({ x, y, width, height }) => ({ x, y, width, height }));
    const added = photo('four'), unused = photo('unused');
    store.setCollagePhotos([{ id: three!.id, assetId: 'three' }, { id: one!.id, assetId: 'one' }, { id: 'new:four', assetId: 'four' }], [added, unused]);
    expect(store.document.slots.map(slot => slot.assetId)).toEqual(['three', 'one', 'four']);
    expect(store.document.slots.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual(geometry);
    expect(store.document.slots[1]).toMatchObject({ id: one!.id, crop: { zoom: 1.6, x: .2 }, filter: { sepia: true }, shape: 'heart', trimStart: 1, trimEnd: 3, muted: true });
    expect(store.assets.four!.blob).toBe(added.blob);
    expect(store.assets.unused).toBeUndefined();
    expect(store.assets.two).toBeDefined();
    expect(store.selection).toBeNull();
    store.undo();
    expect(store.snapshot()).toEqual(original);
    expect(store.assets.two).toBeDefined();
    expect(store.assets.four).toBeDefined();
    expect(disposeAsset).not.toHaveBeenCalled();
  });
  it('changes layout count so newly added photos are actually placed', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one')], { mode: 'grid', width: 1080, height: 1350 });
    const original = store.snapshot();
    store.setCollagePhotos([{ id: store.document.slots[0]!.id, assetId: 'one' }, { id: 'new:two', assetId: 'two' }], [photo('two')]);
    expect(store.document.slots.map(slot => slot.assetId)).toEqual(['one', 'two']);
    expect(layouts.find(layout => layout.id === store.document.layoutId)?.count).toBe(2);
    store.undo();
    expect(store.snapshot()).toEqual(original);
  });
  it('keeps duplicate assets distinct by entry id and validates before registering or editing', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('shared')], { mode: 'grid', width: 1080, height: 1080 });
    store.applyLayout(layouts.find(layout => layout.id === 'grid-2')!);
    store.select({ kind: 'slot', id: store.document.slots[0]!.id });
    store.duplicateSelected();
    const [first, second] = store.document.slots;
    store.updateSlot({ crop: { ...second!.crop, zoom: 2 } });
    store.setCollagePhotos([{ id: second!.id, assetId: 'shared' }, { id: first!.id, assetId: 'shared' }]);
    expect(store.document.slots.map(slot => slot.crop.zoom)).toEqual([2, 1]);
    const original = store.snapshot();
    const imported = photo('must-not-register');
    const invalid = [
      [], [{ id: first!.id, assetId: 'shared' }, { id: first!.id, assetId: 'shared' }],
      [{ id: first!.id, assetId: 'wrong' }], [{ id: 'missing', assetId: 'shared' }],
      [{ id: 'new:must-not-register', assetId: imported.id }, { id: 'missing', assetId: 'shared' }],
    ];
    for (const entries of invalid) expect(() => store.setCollagePhotos(entries, [imported])).toThrow();
    expect(store.snapshot()).toEqual(original);
    expect(store.assets[imported.id]).toBeUndefined();
  });
  it('reflows reordered long photos at original proportions and undoes its canvas dimensions', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('wide', { width: 800, height: 400 }), photo('tall', { width: 400, height: 1200 })], { mode: 'long', width: 800, height: 1080 });
    const original = store.snapshot();
    const tall = store.document.slots[1]!;
    store.setCollagePhotos([{ id: tall.id, assetId: 'tall' }, { id: 'new:square', assetId: 'square' }], [photo('square', { width: 400, height: 400 })]);
    expect(store.document).toMatchObject({ width: 800, height: 3200, padding: 0, gap: 0, cornerRadius: 0 });
    expect(slotRect(store.document, store.document.slots[0]!).height).toBeCloseTo(2400);
    expect(slotRect(store.document, store.document.slots[1]!).y).toBeCloseTo(2400);
    store.undo();
    expect(store.snapshot()).toEqual(original);
  });
  it('retains free frame geometry and decorations while placing added photos visibly', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one'), photo('two')], { mode: 'free', width: 1080, height: 1080 });
    const first = store.document.elements[0]!, second = store.document.elements[1]!;
    store.select({ kind: 'element', id: first.id });
    store.updateSelected({ x: 70, y: 80, rotation: -15 });
    store.addText('保留装饰');
    const original = store.snapshot();
    const decoration = store.document.elements[2]!;
    store.setCollagePhotos([{ id: second.id, assetId: 'two' }, { id: first.id, assetId: 'one' }, { id: 'new:three', assetId: 'three' }], [photo('three')]);
    const images = store.document.elements.filter(item => item.type === 'image');
    expect(images.map(item => item.assetId)).toEqual(['two', 'one', 'three']);
    expect(images[1]).toMatchObject({ id: first.id, x: 70, y: 80, rotation: -15 });
    expect(images[2]!.visible).toBe(true);
    expect(images[2]!.width).toBeGreaterThan(16);
    expect(store.document.elements.find(item => item.id === decoration.id)).toEqual(decoration);
    store.undo();
    expect(store.snapshot()).toEqual(original);
  });
});

describe('full photo albums', () => {
  const counts = [13, 16, MAX_COLLAGE_PHOTOS];
  const pictures = (store: ReturnType<typeof useEditorStore>): Array<CollageSlot | ImageElement> => store.document.mode === 'grid'
    ? store.document.slots.filter(slot => slot.assetId)
    : store.document.elements.filter((item): item is ImageElement => item.type === 'image' && !!item.assetId);
  const entries = (store: ReturnType<typeof useEditorStore>) => pictures(store).map(item => ({ id: item.id, assetId: item.assetId! }));

  for (const count of counts) {
    for (const mode of ['grid', 'free', 'long'] as const) {
      it(`retains ${count} ordered photos, identities and crops through ${mode} creation, mode conversion and restore`, () => {
        const store = useEditorStore();
        const items = Array.from({ length: count }, (_, index) => photo(`album-${index}`, { width: index % 2 ? 600 : 900, height: 600 }));
        store.initializeCollage(items, { mode, width: 1080, height: 1350 });
        const initial = entries(store);
        expect(initial.map(item => item.assetId)).toEqual(items.map(item => item.id));
        const first = pictures(store)[0]!;
        const last = pictures(store)[count - 1]!;
        const target = { kind: store.document.mode === 'grid' ? 'slot' as const : 'element' as const, id: last.id };
        store.changeCrop({ ...target, crop: { ...last.crop, x: .13, y: -.09, zoom: 1.7, rotation: 90, flipX: true } });
        const cropped = JSON.parse(JSON.stringify(pictures(store).map(item => ({ id: item.id, assetId: item.assetId, crop: item.crop }))));
        const creation = store.snapshot();
        store.setMode(store.document.mode === 'grid' ? 'free' : 'grid');
        store.setMode(store.document.mode === 'grid' ? 'free' : 'grid');
        expect(pictures(store).map(item => ({ id: item.id, assetId: item.assetId, crop: item.crop }))).toEqual(cropped);
        expect(pictures(store)[0]!.id).toBe(first.id);
        expect(pictures(store)).toHaveLength(count);
        const converted = store.snapshot();
        store.restore(converted, items, 'saved');
        expect(store.snapshot()).toEqual(converted);
        expect(entries(store)).toEqual(initial);
        store.restore(creation, items, 'saved');
        expect(pictures(store).map(item => ({ id: item.id, assetId: item.assetId, crop: item.crop }))).toEqual(cropped);
      });

      it(`reorders and replaces the tail of a ${count}-photo ${mode} album atomically, cancels crop and undoes`, () => {
        const store = useEditorStore();
        const items = Array.from({ length: count }, (_, index) => photo(`manage-${index}`));
        store.initializeCollage(items, { mode, width: 1080, height: 1350 });
        const last = pictures(store)[count - 1]!;
        const target = { kind: store.document.mode === 'grid' ? 'slot' as const : 'element' as const, id: last.id };
        store.select(target);
        store.changeCrop({ ...target, crop: { ...last.crop, zoom: 1.5, x: .08 } });
        const original = store.snapshot();
        const order = entries(store).reverse();
        // A draft management order is external to the store until confirmation.
        expect(entries(store).map(item => item.assetId)).toEqual(items.map(item => item.id));
        store.beginCropSession(target);
        expect(store.cropEditing).toBe(true);
        store.changeCrop({ ...target, crop: { ...last.crop, zoom: 2.1 } }, false);
        expect(() => store.setCollagePhotos(order)).toThrow(/裁剪/);
        store.cancelCropSession();
        expect(store.snapshot()).toEqual(original);
        store.setCollagePhotos(order);
        expect(entries(store)).toEqual(order);
        expect(pictures(store)[0]!.crop).toMatchObject({ zoom: 1.5, x: .08 });
        store.undo();
        expect(store.snapshot()).toEqual(original);
        const added = photo('new-tail');
        const replacement = [...order.slice(0, -1), { id: `new:${added.id}`, assetId: added.id }];
        store.setCollagePhotos(replacement, [added]);
        expect(entries(store).map(item => item.assetId)).toEqual(replacement.map(item => item.assetId));
        expect(pictures(store)).toHaveLength(count);
        expect(store.assets[added.id]).toBe(added);
        store.undo();
        expect(store.snapshot()).toEqual(original);
      });
    }
  }

  it('adds photos across the old limit and up to twenty without losing existing entries', () => {
    const store = useEditorStore();
    store.initializeCollage(Array.from({ length: 12 }, (_, index) => photo(`retained-${index}`)), { mode: 'grid', width: 1080, height: 1350 });
    const retained = entries(store);
    const added = Array.from({ length: 8 }, (_, index) => photo(`added-${index}`));
    store.setCollagePhotos([...retained, ...added.map(asset => ({ id: `new:${asset.id}`, assetId: asset.id }))], added);
    expect(entries(store).slice(0, 12)).toEqual(retained);
    expect(entries(store).map(item => item.assetId)).toEqual([...retained.map(item => item.assetId), ...added.map(item => item.id)]);
    expect(pictures(store)).toHaveLength(MAX_COLLAGE_PHOTOS);
    store.undo();
    expect(entries(store)).toEqual(retained);
  });

  it('rejects the twenty-first photo before replacing work or registering an import', () => {
    const store = useEditorStore();
    const items = Array.from({ length: MAX_COLLAGE_PHOTOS }, (_, index) => photo(`limit-${index}`));
    store.initializeCollage(items, { mode: 'grid', width: 1080, height: 1080 });
    const before = store.snapshot(), revision = store.revision;
    const surplus = photo('twenty-first');
    for (const mode of ['grid', 'free', 'long'] as const) {
      expect(() => store.initializeCollage([...items, surplus], { mode, width: 1080, height: 1080 })).toThrow(/20/);
    }
    expect(() => store.setCollagePhotos([...entries(store), { id: `new:${surplus.id}`, assetId: surplus.id }], [surplus])).toThrow(/20/);
    expect(store.snapshot()).toEqual(before);
    expect(store.revision).toBe(revision);
    expect(store.assets[surplus.id]).toBeUndefined();
    expect(store.canUndo).toBe(false);
    expect(disposeAsset).not.toHaveBeenCalled();
  });

  it('rejects undersized layouts and both free and grid templates without hiding album photos', () => {
    const store = useEditorStore();
    store.initializeCollage(Array.from({ length: MAX_COLLAGE_PHOTOS }, (_, index) => photo(`safe-${index}`)), { mode: 'free', width: 1080, height: 1350 });
    const before = store.snapshot(), revision = store.revision;
    expect(() => store.applyLayout(layouts.find(layout => layout.id === 'grid-13')!)).toThrow(/13/);
    expect(() => store.applyTemplate(templates.find(template => template.id === 'album-thirteen')!)).toThrow(/13/);
    expect(() => store.applyTemplate(templates.find(template => template.id === 'contact-sheet')!)).toThrow(/6/);
    expect(store.snapshot()).toEqual(before);
    expect(store.revision).toBe(revision);
    expect(store.canUndo).toBe(false);
  });

  it('creates every editable photo collection with complete capacity and restores its actual materials', () => {
    const collections = templates.filter(template => template.category === '照片集');
    expect(collections.length).toBeGreaterThanOrEqual(8);
    expect(collections.length).toBeLessThanOrEqual(12);
    expect(new Set(collections.map(template => template.photoFrames!.length))).toEqual(new Set([13, 14, 15, 16, 17, 18, 19, 20]));
    for (const template of collections) {
      const store = useEditorStore();
      const count = template.photoFrames!.length;
      const items = Array.from({ length: count }, (_, index) => photo(`template-${index}`));
      store.initializeCollage(items, { mode: 'grid', width: 1080, height: 1080, template });
      expect(pictures(store)).toHaveLength(count);
      expect(entries(store).map(item => item.assetId)).toEqual(items.map(item => item.id));
      const frames = pictures(store);
      frames.forEach((item, index) => {
        const frame = template.photoFrames![index]!;
        expect(item).toMatchObject({ x: frame.x * template.width, y: frame.y * template.height, width: frame.width * template.width, height: frame.height * template.height, borderWidth: frame.borderWidth, borderColor: frame.borderColor });
        expect(item.width).toBeGreaterThan(100);
        expect(item.height).toBeGreaterThan(100);
      });
      expect(store.document.elements.some(item => item.type === 'shape' || item.type === 'drawing')).toBe(true);
      const saved = store.snapshot();
      store.restore(saved, items, 'saved');
      expect(store.snapshot()).toEqual(saved);
      expect(entries(store).map(item => item.assetId)).toEqual(items.map(item => item.id));
    }
  });

  it('applies twenty-frame materials while retaining photo identities, order and crops, with one undo', () => {
    const store = useEditorStore();
    store.initializeCollage(Array.from({ length: MAX_COLLAGE_PHOTOS }, (_, index) => photo(`material-${index}`)), { mode: 'grid', width: 1080, height: 1350 });
    const last = store.document.slots[MAX_COLLAGE_PHOTOS - 1]!;
    store.changeCrop({ kind: 'slot', id: last.id, crop: { ...last.crop, zoom: 1.8, y: .12 } });
    const before = store.snapshot(), ordered = entries(store);
    for (const id of ['wall-twenty', 'film-twenty']) {
      const template = templates.find(item => item.id === id)!;
      store.applyTemplate(template);
      expect(entries(store)).toEqual(ordered);
      expect(pictures(store)[MAX_COLLAGE_PHOTOS - 1]!.crop).toMatchObject({ zoom: 1.8, y: .12 });
      expect(store.document.elements.some(item => item.type === 'shape')).toBe(true);
      store.undo();
      expect(store.snapshot()).toEqual(before);
    }
  });
});

describe('album capacity at direct editor entry points', () => {
  it('rejects overflowing free imports and duplication before changing the page or media library', () => {
    const store = useEditorStore();
    store.initializeCollage(Array.from({ length: 13 }, (_, index) => photo(`import-${index}`)), { mode: 'free', width: 1080, height: 1350 });
    const beforeBatch = store.snapshot();
    const incoming = Array.from({ length: 8 }, (_, index) => photo(`overflow-${index}`));
    expect(() => store.addAssets(incoming, null)).toThrow(/20/);
    expect(store.snapshot()).toEqual(beforeBatch);
    expect(incoming.every(asset => !store.assets[asset.id])).toBe(true);
    store.addAssets(incoming.slice(0, 7), null);
    expect(store.document.elements.filter(item => item.type === 'image')).toHaveLength(MAX_COLLAGE_PHOTOS);
    const full = store.snapshot(), revision = store.revision;
    expect(() => store.addAssets([incoming[7]!], null)).toThrow(/20/);
    store.select({ kind: 'element', id: store.document.elements[0]!.id });
    expect(() => store.duplicateSelected()).toThrow(/20/);
    expect(store.snapshot()).toEqual(full);
    expect(store.revision).toBe(revision);
    // Replacing an existing photo does not consume another position.
    store.addAssets([incoming[7]!]);
    expect(store.document.elements[0]).toMatchObject({ assetId: incoming[7]!.id });
    expect(store.document.elements.filter(item => item.type === 'image')).toHaveLength(MAX_COLLAGE_PHOTOS);
  });

  it('keeps older over-capacity projects readable but rejects lossy mode and template conversion', () => {
    const store = useEditorStore();
    const items = Array.from({ length: MAX_COLLAGE_PHOTOS }, (_, index) => photo(`legacy-${index}`));
    store.initializeCollage(items, { mode: 'free', width: 1080, height: 1350 });
    const legacy = store.snapshot();
    const first = legacy.pages[0]!.elements[0]!;
    legacy.pages[0]!.elements.push({ ...first, id: 'legacy-extra-frame' });
    store.restore(legacy, items, 'saved');
    expect(store.document.elements.filter(item => item.type === 'image')).toHaveLength(21);
    const before = store.snapshot(), revision = store.revision;
    expect(() => store.setMode('grid')).toThrow(/20/);
    expect(() => store.updateDocument({ mode: 'grid', width: 1440 })).toThrow(/20/);
    expect(() => store.applyTemplate(templates.find(template => template.id === 'film-twenty')!)).toThrow(/20/);
    expect(store.snapshot()).toEqual(before);
    expect(store.revision).toBe(revision);
    expect(store.canUndo).toBe(false);
  });
});

describe('transactional photo crop', () => {
  it('cancels a draft including reset without changing saved state or redo history', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one')], { mode: 'grid', width: 1080, height: 1080 });
    store.updateDocument({ gap: 50 });
    store.undo(); store.markSaved();
    const original = store.snapshot();
    const slot = store.document.slots[0]!;
    vi.spyOn(Date, 'now').mockReturnValue(store.document.updatedAt + 1000);
    store.beginCropSession({ kind: 'slot', id: slot.id });
    expect(store.cropEditing).toBe(true);
    store.changeCrop({ kind: 'slot', id: slot.id, crop: { ...slot.crop, zoom: 2, x: .25 } });
    store.checkpoint(); store.markSaved();
    store.resetCrop();
    store.changeCrop({ kind: 'slot', id: slot.id, crop: { ...slot.crop, zoom: 3 } }, true);
    store.cancelCropSession();
    expect(store.snapshot()).toEqual(original);
    expect(store.cropEditing).toBe(false);
    expect(store.dirty).toBe(false);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(true);
    store.redo();
    expect(store.document.gap).toBe(50);
  });
  it('checkpoints previous pending work, preserves its dirty state on cancel, and commits crop once', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one')], { mode: 'grid', width: 1080, height: 1080 });
    store.markSaved();
    const baseline = store.snapshot();
    store.updateDocument({ gap: 50 }, false);
    const pending = store.snapshot();
    const slot = store.document.slots[0]!;
    store.beginCropSession({ kind: 'slot', id: slot.id });
    store.changeCrop({ kind: 'slot', id: slot.id, crop: { ...slot.crop, zoom: 2 } });
    store.cancelCropSession();
    expect(store.snapshot()).toEqual(pending);
    expect(store.dirty).toBe(true);
    store.beginCropSession({ kind: 'slot', id: slot.id });
    store.changeCrop({ kind: 'slot', id: slot.id, crop: { ...slot.crop, zoom: 2 } });
    store.changeCrop({ kind: 'slot', id: slot.id, crop: { ...slot.crop, zoom: 3 } }, false);
    store.commitCropSession();
    const cropped = store.snapshot();
    expect(store.cropEditing).toBe(false);
    store.undo();
    expect(store.snapshot()).toEqual(pending);
    store.undo();
    expect(store.snapshot()).toEqual(baseline);
    store.redo(); store.redo();
    expect(store.snapshot()).toEqual(cropped);
  });
  it('does not commit a no-op crop and rejects locked, empty or non-photo targets', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one')], { mode: 'free', width: 1080, height: 1080 });
    const image = store.document.elements[0]!;
    store.markSaved();
    const original = store.snapshot();
    store.beginCropSession({ kind: 'element', id: image.id });
    store.resetCrop(); store.commitCropSession();
    expect(store.snapshot()).toEqual(original);
    expect(store.dirty).toBe(false);
    expect(store.canUndo).toBe(false);
    store.select({ kind: 'element', id: image.id }); store.updateSelected({ locked: true });
    expect(() => store.beginCropSession({ kind: 'element', id: image.id })).toThrow();
    store.addText();
    expect(() => store.beginCropSession(store.selection!)).toThrow();
    expect(() => store.beginCropSession({ kind: 'slot', id: 'missing' })).toThrow();
    expect(store.cropEditing).toBe(false);
  });
  it('restores a free photo crop without disturbing its frame, filter or saved state', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one')], { mode: 'free', width: 1080, height: 1080 });
    const image = store.document.elements.find(item => item.type === 'image')!;
    store.select({ kind: 'element', id: image.id });
    store.updateSelected({ x: 80, rotation: -12 });
    store.markSaved();
    const original = store.snapshot();
    store.beginCropSession({ kind: 'element', id: image.id });
    store.changeCrop({ kind: 'element', id: image.id, crop: { ...image.crop, zoom: 1.5, rotation: 90, flipX: true } });
    store.cancelCropSession();
    expect(store.snapshot()).toEqual(original);
    expect(store.dirty).toBe(false);
  });
  it('clears an active transaction on a validated restore or new project', () => {
    const store = useEditorStore();
    const asset = photo('one');
    store.initializeCollage([asset], { mode: 'grid', width: 1080, height: 1080 });
    const original = store.snapshot(), slot = store.document.slots[0]!;
    store.beginCropSession({ kind: 'slot', id: slot.id });
    store.changeCrop({ kind: 'slot', id: slot.id, crop: { ...slot.crop, zoom: 2 } });
    const draft = store.snapshot();
    expect(() => store.initializeCollage([], { mode: 'grid', width: 1080, height: 1080 })).toThrow();
    expect(() => store.restore(original, [], 'saved')).toThrow();
    expect(store.snapshot()).toEqual(draft);
    expect(store.cropEditing).toBe(true);
    store.restore(original, [asset], 'saved');
    expect(store.cropEditing).toBe(false);
    expect(store.dirty).toBe(false);
    store.beginCropSession({ kind: 'slot', id: slot.id });
    store.newProject();
    expect(store.cropEditing).toBe(false);
    expect(store.canUndo).toBe(false);
  });
});

describe('long-stitch photo mutations', () => {
  it('reflows a differently proportioned replacement without changing the other photo and undoes once', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('wide', { width: 640, height: 320 }), photo('tall', { width: 320, height: 640 })], { mode: 'long', width: 1080, height: 1080 });
    const before = store.snapshot();
    const target = { kind: 'slot' as const, id: store.document.slots[0]!.id };
    store.select(target);
    store.addAssets([photo('square', { width: 480, height: 480 })], target);
    expect(store.document.height).toBe(3240);
    expect(slotRect(store.document, store.document.slots[0]!).height).toBeCloseTo(1080);
    expect(slotRect(store.document, store.document.slots[1]!).height).toBeCloseTo(2160);
    expect(store.document.slots[1]!.crop).toEqual(before.pages[0]!.slots[1]!.crop);
    store.undo();
    expect(store.snapshot()).toEqual(before);
    expect(store.canUndo).toBe(false);
  });

  it('swaps unequal-aspect photos with their crop and reflows both frame positions as one edit', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('wide', { width: 640, height: 320 }), photo('tall', { width: 320, height: 640 })], { mode: 'long', width: 1080, height: 1080 });
    const first = store.document.slots[0]!.id, second = store.document.slots[1]!.id;
    store.changeCrop({ kind: 'slot', id: second, crop: { x: .2, y: -.1, zoom: 1.3, rotation: 90, flipX: true, flipY: false } });
    const before = store.snapshot();
    store.swapSlots(first, second);
    expect(store.document.slots[0]!.assetId).toBe('tall');
    expect(store.document.slots[0]!.crop).toEqual(before.pages[0]!.slots[1]!.crop);
    expect(slotRect(store.document, store.document.slots[0]!).height).toBeCloseTo(2160);
    expect(slotRect(store.document, store.document.slots[1]!).y).toBeCloseTo(2160);
    expect(slotRect(store.document, store.document.slots[1]!).height).toBeCloseTo(540);
    store.undo();
    expect(store.snapshot()).toEqual(before);
  });

  it('preserves stitch mode for color changes but retains deliberate spacing after swapping styled photos', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('wide', { width: 640, height: 320 }), photo('tall', { width: 320, height: 640 })], { mode: 'long', width: 1080, height: 1080 });
    store.updateDocument({ background: { ...store.document.background, color: '#edf0e7' } });
    const stitched = store.snapshot();
    store.select({ kind: 'slot', id: store.document.slots[0]!.id });
    store.replaceSelectedAsset(photo('square', { width: 480, height: 480 }));
    expect(store.document.height).toBe(3240);
    expect(store.document.background.color).toBe('#edf0e7');
    store.undo();
    expect(store.snapshot()).toEqual(stitched);
    store.updateDocument({ padding: 32, gap: 12, cornerRadius: 8 });
    const styled = store.snapshot();
    store.swapSlots(store.document.slots[0]!.id, store.document.slots[1]!.id);
    expect(store.document.padding).toBe(32);
    expect(store.document.gap).toBe(12);
    expect(store.document.cornerRadius).toBe(8);
    store.undo();
    expect(store.snapshot()).toEqual(styled);
    store.undo();
    expect(store.snapshot()).toEqual(stitched);
  });

  it('leaves stitch mode when explicitly changing height or switching to free photos', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('wide'), photo('tall', { width: 320, height: 640 })], { mode: 'long', width: 1080, height: 1080 });
    const stitched = store.snapshot();
    store.updateDocument({ width: 900, height: 2400 });
    expect(store.document.width).toBe(900);
    expect(store.document.height).toBe(2400);
    const resized = store.snapshot();
    store.select({ kind: 'slot', id: store.document.slots[0]!.id });
    store.replaceSelectedAsset(photo('square', { width: 480, height: 480 }));
    expect(store.document.width).toBe(900);
    expect(store.document.height).toBe(2400);
    store.undo();
    expect(store.snapshot()).toEqual(resized);
    store.undo();
    expect(store.snapshot()).toEqual(stitched);
    store.setMode('free');
    expect(store.document.mode).toBe('free');
    expect(store.document.elements.filter(item => item.type === 'image').map(item => item.assetId)).toEqual(['wide', 'tall']);
    store.undo();
    expect(store.snapshot()).toEqual(stitched);
  });
});

describe('photographic style transitions', () => {
  const instant = collageLooks.find(look => look.photoFrame.kind === 'instant' && look.photoFrame.footerRatio >= .25)!;

  function expectOriginalLongPhotos(store: ReturnType<typeof useEditorStore>) {
    expect(store.document.mode).toBe('grid');
    expect(store.document.layoutId.startsWith('long-')).toBe(true);
    for (const slot of store.document.slots) {
      const asset = store.assets[slot.assetId!]!;
      const rect = slotRect(store.document, slot);
      const frame = photoFrameGeometry(rect.width, rect.height, store.document.photoFrame, asset.width, asset.height);
      expect(frame.outerWidth).toBeCloseTo(rect.width, 7);
      expect(frame.outerHeight).toBeCloseTo(rect.height, 7);
      expect(frame.width / frame.height).toBeCloseTo(asset.width / asset.height, 7);
    }
  }

  it('preserves free photo placement, crop and decorations in one undo', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('landscape'), photo('portrait', { width: 480, height: 800 })], { mode: 'free', width: 1080, height: 1350 });
    const first = store.document.elements[0]!;
    store.select({ kind: 'element', id: first.id });
    if (store.selected?.type !== 'image') throw new Error('Photo is missing');
    store.updateSelected({ x: 80, y: 130, width: 700, height: 320, rotation: -17, crop: { ...store.selected.crop, zoom: 1.6, x: .18, flipX: true }, filter: { ...store.selected.filter, sepia: true } });
    store.addText('保留这段记忆');
    store.addAssets([photo('stamp', { kind: 'sticker' })]);
    const before = store.snapshot();
    store.applyLook(instant);
    expect(store.document.mode).toBe('free');
    expect(store.document.photoFrame.kind).toBe('instant');
    for (const old of before.pages[0]!.elements) {
      const current = store.document.elements.find(element => element.id === old.id)!;
      if (old.type !== 'image' || old.assetId === 'stamp') expect(current).toEqual(old);
      else expect(current).toMatchObject({ id: old.id, assetId: old.assetId, x: old.x, y: old.y, width: old.width, height: old.height, rotation: old.rotation, crop: old.crop, filter: old.filter });
    }
    expect(matchingCollageLook(store.document, store.assets)?.id).toBe(instant.id);
    const applied = store.snapshot();
    store.applyLook(instant);
    store.undo();
    expect(store.snapshot()).toEqual(before);
    store.redo();
    expect(store.snapshot()).toEqual(applied);
  });

  it('preserves grid composition and photo content while changing real materials', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one'), photo('two'), photo('three')], { mode: 'grid', width: 1080, height: 1350 });
    const slot = store.document.slots[0]!;
    store.select({ kind: 'slot', id: slot.id });
    store.updateSlot({ crop: { ...slot.crop, zoom: 1.3, x: -.2 }, filter: { ...slot.filter, grayscale: true } });
    const before = store.snapshot();
    store.applyLook(instant);
    expect(store.document.layoutId).toBe(before.pages[0]!.layoutId);
    expect(store.document.slots).toEqual(before.pages[0]!.slots);
    expect(store.document.photoFrame.footerRatio).toBeGreaterThan(.2);
    store.undo();
    expect(store.snapshot()).toEqual(before);
  });

  it('retains full source proportions through every long recipe, spacing, reorder and replacement', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('wide', { width: 1200, height: 600 }), photo('tall', { width: 600, height: 1200 }), photo('square', { width: 600, height: 600 })], { mode: 'long', width: 1080, height: 1080 });
    const original = store.document.slots.map(slot => ({ id: slot.id, assetId: slot.assetId, crop: slot.crop, filter: slot.filter }));
    for (const look of collageLooks) {
      store.applyLook(look);
      expectOriginalLongPhotos(store);
      expect(store.document.slots.map(slot => ({ id: slot.id, assetId: slot.assetId, crop: slot.crop, filter: slot.filter }))).toEqual(original);
      expect(matchingCollageLook(store.document, store.assets)?.id).toBe(look.id);
    }
    store.updateDocument({ padding: 36, gap: 42, cornerRadius: 8 });
    expectOriginalLongPhotos(store);
    const [first, second, third] = store.document.slots;
    store.setCollagePhotos([{ id: third!.id, assetId: third!.assetId! }, { id: first!.id, assetId: first!.assetId! }, { id: second!.id, assetId: second!.assetId! }]);
    expectOriginalLongPhotos(store);
    expect(store.document).toMatchObject({ padding: 36, gap: 42, cornerRadius: 8 });
    store.select({ kind: 'slot', id: store.document.slots[0]!.id });
    store.replaceSelectedAsset(photo('new-tall', { width: 600, height: 1800 }));
    expectOriginalLongPhotos(store);
    store.updateDocument({ width: 900 });
    expectOriginalLongPhotos(store);
  });

  it('scales capped long prints consistently and does not require two undos for the same recipe', () => {
    const store = useEditorStore();
    store.initializeCollage(Array.from({ length: 12 }, (_, index) => photo(`tall-${index}`, { width: 720, height: 2560 })), { mode: 'long', width: 1080, height: 1080 });
    const before = store.snapshot();
    store.applyLook(instant);
    expect(store.document.height).toBeLessThanOrEqual(8192);
    expectOriginalLongPhotos(store);
    expect(matchingCollageLook(store.document, store.assets)?.id).toBe(instant.id);
    store.applyLook(instant);
    store.undo();
    expect(store.snapshot()).toEqual(before);
  });

  it('rejects unavailable long media before changing the document or history', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('gone')], { mode: 'long', width: 1080, height: 1080 });
    delete store.assets.gone;
    const before = store.snapshot(), revision = store.revision;
    expect(() => store.applyLook(instant)).toThrow('素材缺失');
    expect(store.snapshot()).toEqual(before);
    expect(store.revision).toBe(revision);
    expect(store.canUndo).toBe(false);
  });
});

describe('editable photo typography', () => {
  const instant = collageLooks.find(look => look.photoFrame.kind === 'instant' && look.photoFrame.footerRatio >= .25)!;
  function caption(store: { selected: SceneElement | null }): TextElement {
    if (store.selected?.type !== 'text') throw new Error('Caption is missing');
    return store.selected;
  }

  it('places every recipe inside selected framed photo content, not its material footer', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('wide'), photo('tall', { width: 400, height: 900 })], { mode: 'grid', width: 1080, height: 1350 });
    store.applyLook(instant);
    const slot = store.document.slots[1]!;
    const outer = slotRect(store.document, slot);
    const asset = store.assets[slot.assetId!]!;
    const content = photoFrameGeometry(outer.width, outer.height, store.document.photoFrame, asset.width, asset.height);
    const before = store.snapshot().pages[0]!;
    for (const style of photoTextStyles) {
      store.select({ kind: 'slot', id: slot.id });
      store.addText('第一行\n第二行', style);
      const item = caption(store);
      expect(item.x).toBeCloseTo(outer.x + content.x + content.width * .06);
      expect(item.width).toBeCloseTo(content.width * .88);
      expect(item.y).toBeGreaterThanOrEqual(outer.y + content.y);
      expect(item.y + item.height).toBeLessThanOrEqual(outer.y + content.y + content.height);
      expect(item.height).toBeCloseTo(item.fontSize * (style.lineHeight * 2 + (style.backgroundColor === 'transparent' ? 0 : .56)));
    }
    expect(store.document.slots).toEqual(before.slots);
    expect(store.document).toMatchObject({ mode: before.mode, layoutId: before.layoutId, photoFrame: before.photoFrame });
  });

  it.each(['grid', 'long', 'free'] as const)('keeps %s photos, mode, crops and filters untouched and sizes to a photo', mode => {
    const store = useEditorStore();
    store.initializeCollage([photo('one'), photo('two'), photo('three')], { mode, width: 1080, height: 1080 });
    const target = store.document.mode === 'grid' ? { kind: 'slot' as const, id: store.document.slots[1]!.id } : { kind: 'element' as const, id: store.document.elements[1]!.id };
    store.select(target);
    if (store.selectedSlot) store.updateSlot({ crop: { ...store.selectedSlot.crop, zoom: 1.6 }, filter: { ...store.selectedSlot.filter, sepia: true } });
    else if (store.selected?.type === 'image') store.updateSelected({ crop: { ...store.selected.crop, zoom: 1.6 }, filter: { ...store.selected.filter, sepia: true } });
    const before = store.snapshot().pages[0]!;
    const rect = target.kind === 'slot' ? slotRect(store.document, store.selectedSlot!) : store.selected!;
    store.addText('短标题');
    expect(caption(store).fontSize).toBeLessThan(rect.width * .12);
    expect(caption(store).height).toBeLessThan(rect.height);
    expect(store.document.slots).toEqual(before.slots);
    expect(store.document.elements.filter(item => item.type !== 'text')).toEqual(before.elements);
    expect(store.document).toMatchObject({ mode: before.mode, width: before.width, height: before.height, layoutId: before.layoutId });
  });

  it('places and repositions rotated captions in photo-local coordinates about the photo center', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one')], { mode: 'free', width: 1080, height: 1080 });
    const image = store.document.elements[0]!;
    store.select({ kind: 'element', id: image.id });
    store.updateSelected({ x: 200, y: 240, width: 500, height: 300, rotation: 90 });
    const before = store.snapshot().pages[0]!.elements[0];
    store.addText('旋转的记忆');
    const item = caption(store), inset = 300 * .06;
    expect(item.rotation).toBe(90);
    expect(item.x + item.width / 2).toBeCloseTo(450 - (150 - inset - item.height / 2));
    expect(item.y + item.height / 2).toBeCloseTo(390);
    store.positionText('top', 80);
    expect(caption(store).x + item.width / 2).toBeCloseTo(450 - (-150 + inset + 40));
    expect(caption(store).height).toBe(80);
    expect(store.document.elements[0]).toEqual(before);
  });

  it('uses the photo under a caption, then the nearest photo, rather than the main photo', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one'), photo('two')], { mode: 'free', width: 1080, height: 1080 });
    const first = store.document.elements[0]!, second = store.document.elements[1]!;
    store.select({ kind: 'element', id: first.id });
    store.updateSelected({ x: 50, y: 100, width: 400, height: 400 });
    store.select({ kind: 'element', id: second.id });
    store.updateSelected({ x: 600, y: 100, width: 300, height: 300 });
    store.addText('第二张照片');
    store.positionText('center', 60);
    expect(caption(store).x + caption(store).width / 2).toBeCloseTo(750);
    expect(caption(store).y + 30).toBeCloseTo(250);
    store.updateSelected({ x: 930, y: 180 });
    store.positionText('top', 60);
    expect(caption(store).x + caption(store).width / 2).toBeCloseTo(750);
    expect(caption(store).y).toBeCloseTo(118);
  });

  it('chooses the largest visible photo as main and ignores hidden photos and stickers', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('small'), photo('main'), photo('hidden')], { mode: 'free', width: 1080, height: 1080 });
    const [small, main, hidden] = store.document.elements;
    store.select({ kind: 'element', id: small!.id });
    store.updateSelected({ x: 10, y: 20, width: 200, height: 200 });
    store.select({ kind: 'element', id: main!.id });
    store.updateSelected({ x: 500, y: 100, width: 400, height: 400 });
    store.select({ kind: 'element', id: hidden!.id });
    store.updateSelected({ width: 1000, height: 1000, visible: false });
    store.addAssets([photo('sticker', { kind: 'sticker' })]);
    store.updateSelected({ width: 2000, height: 2000 });
    store.addText('主照片');
    expect(caption(store).width).toBeCloseTo(400 * .88);
    expect(caption(store).x + caption(store).width / 2).toBeCloseTo(700);
    store.select({ kind: 'element', id: hidden!.id });
    store.addText('仍然是主照片');
    expect(caption(store).width).toBeCloseTo(400 * .88);
  });

  it('shrinks explicit text backplates on metric edits, preserves supplied heights and undoes pending wording separately', () => {
    const store = useEditorStore();
    store.addText('第一行\n第二行', photoTextStyles[1]!);
    store.updateSelected({ height: 500 });
    store.updateSelected({ text: '短句', fontSize: 20, lineHeight: 1.5 });
    expect(caption(store).height).toBeCloseTo(30 + 20 * .56);
    store.updateSelected({ backgroundColor: 'transparent' });
    expect(caption(store).height).toBe(30);
    store.updateSelected({ fontSize: 10, height: 90 });
    expect(caption(store).height).toBe(90);
    store.updateSelected({ text: '保留尚未提交的文字' }, false);
    const pending = store.snapshot();
    store.applyTextStyle(photoTextStyles[2]!);
    store.undo(); expect(store.snapshot()).toEqual(pending);
    store.redo();
    const id = store.document.elements[0]!.id;
    store.select({ kind: 'element', id });
    store.updateSelected({ text: '定位之前的文字' }, false);
    const positionedPending = store.snapshot();
    store.positionText('top', 75);
    store.undo(); expect(store.snapshot()).toEqual(positionedPending);
    store.select({ kind: 'element', id });
    store.updateSelected({ text: '组合之前的文字' }, false);
    const pairPending = store.snapshot();
    store.addTextPair(photoTextPairs[0]!);
    store.undo(); expect(store.snapshot()).toEqual(pairPending);
  });

  it.each(photoTextPairs)('adds $name as two editable font layers in one undo', pair => {
    const store = useEditorStore();
    store.initializeCollage([photo('one')], { mode: 'grid', width: 1080, height: 1080 });
    const before = store.snapshot();
    store.addTextPair(pair);
    const texts = store.document.elements.filter(item => item.type === 'text');
    expect(texts).toHaveLength(2);
    expect(texts[0]!.y + texts[0]!.height).toBeLessThan(texts[1]!.y);
    const after = store.snapshot();
    const originalSubtitle = texts[1]!.text;
    store.updateSelected({ text: '单独编辑标题' });
    expect(texts[1]!.text).toBe(originalSubtitle);
    store.undo(); expect(store.snapshot()).toEqual(after);
    store.undo(); expect(store.snapshot()).toEqual(before);
    store.redo(); expect(store.snapshot()).toEqual(after);
  });

  it('changes typography and measured positioning as separate one-undo actions, retaining user content and pose', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one')], { mode: 'grid', width: 1080, height: 1080 });
    store.addText('自己的文字\n第二段');
    store.updateSelected({ rotation: 12 });
    const id = caption(store).id, original = store.snapshot();
    const { x, y, width, rotation, text, fontSize } = caption(store);
    store.applyTextStyle(photoTextStyles[2]!);
    expect(caption(store)).toMatchObject({ x, y, width, rotation, text });
    expect(caption(store).fontSize).not.toBe(fontSize);
    const styled = store.snapshot();
    store.undo(); expect(store.snapshot()).toEqual(original);
    store.redo(); store.select({ kind: 'element', id });
    store.positionText('center', 123);
    expect(caption(store).height).toBe(123);
    store.undo(); expect(store.snapshot()).toEqual(styled);
  });

  it('preserves arbitrary multiline content through layout, look, resize and project restore', () => {
    const store = useEditorStore();
    const asset = photo('one');
    store.initializeCollage([asset], { mode: 'grid', width: 1080, height: 1080 });
    const text = '中文、标点「」\n\n A long line — 保留原文 ';
    store.addText(text, photoTextStyles[1]!);
    const id = caption(store).id, height = caption(store).height, fontSize = caption(store).fontSize;
    store.applyLayout(layouts[0]!); store.applyLook(instant);
    store.updateDocument({ width: 2160, height: 2160 });
    const item = store.document.elements.find(element => element.id === id)!;
    expect(item).toMatchObject({ text, height: height * 2, fontSize: fontSize * 2 });
    const saved = store.snapshot();
    store.restore(saved, [asset], 'saved');
    expect(store.snapshot()).toEqual(saved);
    expect(store.canUndo).toBe(false);
  });

  it('leaves locked captions untouched and blocks text changes throughout crop editing', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one')], { mode: 'grid', width: 1080, height: 1080 });
    store.addText('不能改动');
    const id = caption(store).id;
    store.updateSelected({ locked: true });
    const locked = store.snapshot();
    store.applyTextStyle(photoTextStyles[2]!); store.positionText('top', 100);
    expect(store.snapshot()).toEqual(locked);
    store.updateSelected({ locked: false });
    store.beginCropSession({ kind: 'slot', id: store.document.slots[0]!.id });
    store.select({ kind: 'element', id });
    const before = store.snapshot();
    for (const change of [
      () => store.addText('新文字'), () => store.addTextPair(photoTextPairs[0]!),
      () => store.applyTextStyle(photoTextStyles[1]!), () => store.positionText('bottom'),
      () => store.updateSelected({ text: '替换' }), () => store.transform({ id, patch: { x: 12 } }),
      () => store.deleteSelected(), () => store.duplicateSelected(), () => store.moveLayer('front'),
    ]) expect(change).toThrow('裁剪');
    expect(store.snapshot()).toEqual(before);
    expect(store.cropEditing).toBe(true);
  });
});

describe('in-place composition controls', () => {
  it('changes free photo gaps around fixed centers, without moving text, and undoes the whole drag', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one'), photo('two')], { mode: 'free', width: 1080, height: 1350 });
    store.addText('标题保持位置');
    const before = store.snapshot();
    const originals = before.pages[0]!.elements.filter(element => element.type === 'image');
    const title = before.pages[0]!.elements.find(element => element.type === 'text')!;
    store.updateDocument({ gap: store.document.gap + 8 }, false);
    store.updateDocument({ gap: store.document.gap + 16 }, false);
    store.checkpoint();
    for (const original of originals) {
      const next = store.document.elements.find(element => element.id === original.id)!;
      expect(next.width).toBeCloseTo(original.width - 24);
      expect(next.height).toBeCloseTo(original.height - 24);
      expect(next.x + next.width / 2).toBeCloseTo(original.x + original.width / 2);
      expect(next.y + next.height / 2).toBeCloseTo(original.y + original.height / 2);
      expect(next).toMatchObject({ crop: original.crop, filter: original.filter });
    }
    expect(store.document.elements.find(element => element.id === title.id)).toEqual(title);
    store.undo();
    expect(store.snapshot()).toEqual(before);
  });

  it('reflows free composition padding and fixed gaps reversibly, including a simultaneous canvas resize', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one'), photo('two')], { mode: 'free', width: 1080, height: 1350 });
    const original = store.snapshot().pages[0]!;
    const photoBefore = original.elements.find(element => element.type === 'image')!;
    store.updateDocument({ gap: original.gap + 24 });
    store.updateDocument({ padding: original.padding + 100 });
    store.updateDocument({ gap: original.gap });
    store.updateDocument({ padding: original.padding });
    const restored = store.document.elements.find(element => element.id === photoBefore.id)!;
    for (const field of ['x', 'y', 'width', 'height'] as const) expect(restored[field]).toBeCloseTo(photoBefore[field]);
    const padding = original.padding * 2 + 80, gap = original.gap * 2 + 20;
    store.updateDocument({ width: original.width * 2, height: original.height * 2, padding, gap });
    const changed = store.document.elements.find(element => element.id === photoBefore.id)!;
    const sx = (original.width * 2 - padding * 2) / (original.width * 2 - original.padding * 4);
    expect(changed.x + changed.width / 2).toBeCloseTo(padding + (photoBefore.x + photoBefore.width / 2 - original.padding) * 2 * sx);
    expect(changed.width).toBeCloseTo((photoBefore.width + original.gap) * 2 * sx - gap);
    expect(changed).toMatchObject({ crop: photoBefore.crop, filter: photoBefore.filter });
  });

  it('applies global corners to free photos but leaves locked pictures and stickers unchanged', () => {
    const store = useEditorStore();
    store.initializeCollage([photo('one'), photo('locked')], { mode: 'free', width: 1080, height: 1080 });
    const photos = store.document.elements.filter(element => element.type === 'image');
    store.select({ kind: 'element', id: photos[1]!.id }); store.updateSelected({ locked: true });
    store.addAssets([photo('sticker', { kind: 'sticker' })]);
    const sticker = store.document.elements.find(element => element.type === 'image' && element.assetId === 'sticker')!;
    const locked = store.snapshot().pages[0]!.elements.find(element => element.id === photos[1]!.id)!;
    const stickerBefore = JSON.parse(JSON.stringify(sticker));
    store.updateDocument({ cornerRadius: 57, gap: store.document.gap + 10 });
    expect(store.document.elements.find(element => element.id === photos[0]!.id)).toMatchObject({ cornerRadius: 57 });
    expect(store.document.elements.find(element => element.id === locked.id)).toEqual(locked);
    expect(store.document.elements.find(element => element.id === sticker.id)).toEqual(stickerBefore);
    store.updateDocument({ cornerRadius: 0 });
    expect(store.document.elements.find(element => element.id === photos[0]!.id)).toMatchObject({ cornerRadius: 0 });
  });


  it.each([2, 3, 20])('keeps all %i originals tightly stitched through editable text, main-photo replacement, undo and restore', count => {
    const store = useEditorStore();
    const assets = Array.from({ length: count }, (_, index) => photo(`poster-${index}`));
    store.initializeCollage(assets, { mode: 'grid', width: 1080, height: 1350 });
    const before = store.snapshot();
    store.applyTemplate(photoPostersForCount(count)[0]!);
    const photos = store.document.elements.filter(element => element.type === 'image');
    expect(photos.map(element => element.assetId)).toEqual(assets.map(asset => asset.id));
    const title = store.document.elements.filter(element => element.type === 'text').reduce((largest, element) => element.fontSize > largest.fontSize ? element : largest);
    store.select({ kind: 'element', id: title.id }); store.updateSelected({ text: '每一张照片，都是难忘的相聚' });
    const positions = photos.map(element => ({ x: element.x, y: element.y, width: element.width, height: element.height, rotation: element.rotation }));
    const chosenIndex = Math.min(9, count - 1);
    store.setMainPhoto({ kind: 'element', id: photos[chosenIndex]!.id });
    const next = store.document.elements.filter(element => element.type === 'image');
    expect(next[0]!.assetId).toBe(assets[chosenIndex]!.id);
    expect(new Set(next.map(element => element.assetId))).toEqual(new Set(assets.map(asset => asset.id)));
    expect(next.map(element => ({ x: element.x, y: element.y, width: element.width, height: element.height, rotation: element.rotation }))).toEqual(positions);
    for (const picture of next) {
      const asset = store.assets[picture.assetId]!;
      const printed = photoFrameGeometry(picture.width, picture.height, store.document.photoFrame, asset.width, asset.height);
      expect(printed.x).toBe(0);
      expect(printed.y).toBe(0);
      expect(printed.width).toBe(picture.width);
      expect(printed.height).toBe(picture.height);
    }
    const saved = store.snapshot();
    store.restore(saved, assets, 'saved'); expect(store.snapshot()).toEqual(saved);
    expect(store.document.elements.find(element => element.id === title.id)).toMatchObject({ text: '每一张照片，都是难忘的相聚' });
    store.restore(before, assets, 'saved');
    store.applyTemplate(photoPostersForCount(count)[1]!);
    store.undo(); expect(store.snapshot()).toEqual(before);
  });
});
