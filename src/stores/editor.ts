import { computed, markRaw, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { useManualRefHistory } from '@vueuse/core';
import { createCrop, createDocument, createDrawing, createElementBase, createFilter, createPhotoFrame, slotRect } from '../defaults';
import { layouts, MAX_COLLAGE_PHOTOS, recommendLayout } from '../catalog/layouts';
import { longComposition } from '../catalog/longComposition';
import { photoPostersForCount } from '../catalog/photoPosters';
import { collageLookDocument } from '../catalog/looks';
import type { CollageLook } from '../catalog/looks';
import { photoTextStyles, photoTextStylePatch } from '../catalog/photoText';
import type { PhotoTextPair, PhotoTextStyle, TextPlacement } from '../catalog/photoText';
import { chooseTextPhoto, photoTextSize, textMinHeight, textPhotoPosition } from '../catalog/textPlacement';
import type { TextPhoto } from '../catalog/textPlacement';
import { disposeAsset, createAsset } from '../services/media';
import { stickerToBlob } from '../catalog/stickers';
import { assetMetadataSchema, validateProject, validateReferences } from '../services/projectSchema';
import type { CollageSetup, CollageSlot, CropChange, CropState, DrawingChange, EditorDocument, EditorMode, EditorProject, ImageElement, ImageShape, LayoutPreset, MediaAsset, PhotoSelectionEntry, SceneElement, Selection, StickerPreset, TemplatePreset, TextElement, TextHeightMeasurer, TransformChange } from '../types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function blankProject(mode: EditorMode = 'grid'): EditorProject {
  const page = createDocument();
  page.mode = mode;
  if (mode === 'free') page.slots = [];
  return { version: 1, id: crypto.randomUUID(), title: page.title, pages: [page], activePageId: page.id };
}
function imageElement(assetId: string, geometry: Partial<ImageElement> = {}): ImageElement {
  return {
    ...createElementBase('image'), type: 'image', assetId, crop: createCrop(), filter: createFilter(), shape: 'rect',
    borderWidth: 0, borderColor: '#ffffff', cornerRadius: 0, trimStart: 0, trimEnd: null, muted: false, ...geometry,
  };
}
function scaledElement(element: SceneElement, sx: number, sy: number): SceneElement {
  const result = clone(element);
  const uniform = Math.min(sx, sy);
  result.x *= sx; result.y *= sy; result.width *= sx; result.height *= sy; result.shadow *= uniform;
  if (result.type === 'text') { result.fontSize = Math.max(1, result.fontSize * uniform); result.strokeWidth *= uniform; }
  if (result.type === 'drawing') {
    result.points = result.points.map((point, index) => point * (index % 2 === 0 ? sx : sy));
    result.strokeWidth *= uniform;
  }
  if (result.type === 'shape') result.strokeWidth *= uniform;
  if (result.type === 'image') { result.borderWidth *= uniform; result.cornerRadius *= uniform; }
  return result;
}
function validateAssets(items: readonly MediaAsset[]) {
  const ids = new Set<string>();
  return items.map(asset => {
    const result = assetMetadataSchema.safeParse({ id: asset.id, name: asset.name, kind: asset.kind, mime: asset.mime, width: asset.width, height: asset.height, duration: asset.duration });
    if (!result.success || !(asset.blob instanceof Blob) || !asset.blob.size || !asset.src || !asset.thumbnail) throw new Error('项目素材数据无效或原始文件缺失，请重新导入完整项目。');
    if (ids.has(asset.id)) throw new Error('素材标识重复，请重新导入文件。');
    ids.add(asset.id);
    return result.data;
  });
}
function validatePhotos(items: readonly MediaAsset[]) {
  if (items.length < 1 || items.length > MAX_COLLAGE_PHOTOS) throw new Error(`请选择 1 至 ${MAX_COLLAGE_PHOTOS} 张照片或视频。`);
  if (items.some(asset => asset.kind !== 'image' && asset.kind !== 'video')) throw new Error('拼图只能使用照片或视频。');
}
function photoSlots(layout: LayoutPreset, photos: readonly ImageElement[]): CollageSlot[] {
  return layout.slots.map((rect, index) => {
    const photo = photos[index];
    return { ...rect, id: photo?.id ?? crypto.randomUUID(), assetId: photo?.assetId || null, crop: clone(photo?.crop ?? createCrop()), filter: clone(photo?.filter ?? createFilter()), shape: photo?.shape ?? 'rect', visible: photo?.visible ?? true, locked: photo?.locked ?? false, trimStart: photo?.trimStart ?? 0, trimEnd: photo?.trimEnd ?? null, muted: photo?.muted ?? false };
  });
}
function slotPhoto(doc: EditorDocument, slot: CollageSlot): ImageElement {
  return imageElement(slot.assetId ?? '', { ...slotRect(doc, slot), id: slot.id, crop: clone(slot.crop), filter: clone(slot.filter), shape: slot.shape, visible: slot.visible, locked: slot.locked, cornerRadius: doc.cornerRadius, trimStart: slot.trimStart ?? 0, trimEnd: slot.trimEnd ?? null, muted: slot.muted ?? false });
}
function arrangePosterPhotos(doc: EditorDocument, photos: readonly ImageElement[]): boolean {
  const style = doc.mode === 'free' ? doc.layoutId.match(/^(poster-.+)-\d+$/)?.[1] : undefined;
  if (!style) return false;
  if (!photos.length) { doc.layoutId = `${style}-0`; return true; }
  const poster = photoPostersForCount(photos.length).find(template => template.layoutId === `${style}-${photos.length}`);
  if (!poster) return false;
  doc.layoutId = poster.layoutId;
  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index]!, frame = poster.photoFrames![index]!;
    photo.x = frame.x * doc.width; photo.y = frame.y * doc.height;
    photo.width = frame.width * doc.width; photo.height = frame.height * doc.height;
    photo.rotation = frame.rotation ?? 0; photo.shape = frame.shape ?? 'rect';
    photo.borderWidth = frame.borderWidth ?? 0; photo.borderColor = frame.borderColor ?? '#ffffff';
    photo.cornerRadius = doc.cornerRadius;
  }
  return true;
}

export const useEditorStore = defineStore('editor', () => {
  const project = ref<EditorProject>(blankProject());
  const assets = shallowRef<Record<string, MediaAsset>>({});
  const selection = ref<Selection>(null);
  const revision = ref(0);
  const cropSession = shallowRef<{ target: Exclude<Selection, null>; pageId: string; crop: CropState; updatedAt: number } | null>(null);
  const cropEditing = computed(() => cropSession.value !== null);
  const document = computed(() => project.value.pages.find(page => page.id === project.value.activePageId) ?? project.value.pages[0]!);
  const selected = computed<SceneElement | null>(() => selection.value?.kind === 'element' ? document.value.elements.find(element => element.id === selection.value!.id) ?? null : null);
  const selectedSlot = computed<CollageSlot | null>(() => selection.value?.kind === 'slot' ? document.value.slots.find(slot => slot.id === selection.value!.id) ?? null : null);
  const selectedAsset = computed<MediaAsset | null>(() => {
    const id = selectedSlot.value?.assetId ?? (selected.value?.type === 'image' ? selected.value.assetId : null);
    return id ? assets.value[id] ?? null : null;
  });
  const fingerprint = (value = project.value) => JSON.stringify({ ...value, activePageId: '' });
  const assetFingerprint = () => JSON.stringify(Object.values(assets.value).map(asset => ({ id: asset.id, name: asset.name, kind: asset.kind, mime: asset.mime, width: asset.width, height: asset.height, duration: asset.duration })));
  let savedProject = fingerprint();
  let savedAssets = assetFingerprint();
  const savedGeneration = ref(0);
  const dirty = computed(() => { void savedGeneration.value; return fingerprint() !== savedProject || assetFingerprint() !== savedAssets; });
  const history = useManualRefHistory<EditorProject>(project, { capacity: 100, clone });
  let committed = fingerprint();
  const canUndo = computed(() => history.canUndo.value || (!cropEditing.value && fingerprint() !== committed));
  const canRedo = computed(() => history.canRedo.value && (cropEditing.value || fingerprint() === committed));

  function checkpoint() {
    if (cropEditing.value || fingerprint() === committed) return;
    history.commit();
    committed = fingerprint();
  }
  function changed(commit = true) {
    document.value.updatedAt = Date.now();
    revision.value++;
    if (commit) checkpoint();
  }
  function setTextDraft(value: string) {
    const text = value.slice(0, 2000);
    const doc = document.value;
    if (doc.textDraft === text) return;
    const updatedAt = Date.now();
    doc.textDraft = text; doc.updatedAt = updatedAt; revision.value++;
    // Draft typing is persisted, but is not a canvas undo step. Carry the latest
    // input across existing history so undo/redo cannot discard unadded text.
    const updateDraft = (snapshot: EditorProject) => {
      const page = snapshot.pages.find(page => page.id === doc.id);
      if (page) { page.textDraft = text; page.updatedAt = updatedAt; }
    };
    updateDraft(history.last.value.snapshot);
    for (const record of history.undoStack.value) updateDraft(record.snapshot);
    for (const record of history.redoStack.value) updateDraft(record.snapshot);
    committed = fingerprint(history.last.value.snapshot);
    if (cropSession.value?.pageId === doc.id) cropSession.value.updatedAt = updatedAt;
  }
  function selectionExists(next: Exclude<Selection, null>) {
    return next.kind === 'slot' ? document.value.mode === 'grid' && document.value.slots.some(slot => slot.id === next.id) : document.value.elements.some(element => element.id === next.id);
  }
  function select(next: Selection) {
    selection.value = next && selectionExists(next) ? { ...next } : null;
  }
  function clearOldAssets(next: MediaAsset[]) {
    const retained = new Set(next.flatMap(asset => [asset.src, asset.thumbnail]));
    for (const old of Object.values(assets.value)) {
      if (next.includes(old)) continue;
      if (!retained.has(old.src) && !retained.has(old.thumbnail)) disposeAsset(old);
      else {
        if (!retained.has(old.src)) URL.revokeObjectURL(old.src);
        if (old.thumbnail !== old.src && !retained.has(old.thumbnail)) URL.revokeObjectURL(old.thumbnail);
      }
    }
  }
  function register(items: MediaAsset[]) {
    const next = { ...assets.value };
    for (const asset of items) {
      const existing = next[asset.id];
      if (existing && existing !== asset && existing.src !== asset.src) throw new Error('素材标识重复，请重新导入文件。');
      markRaw(asset.blob);
      next[asset.id] = markRaw(asset);
    }
    assets.value = next;
  }
  function newProject(mode: EditorMode = 'grid') {
    cropSession.value = null;
    clearOldAssets([]);
    assets.value = {};
    project.value = blankProject(mode);
    selection.value = null;
    history.commit(); history.clear();
    committed = fingerprint();
    revision.value++;
    savedProject = ''; savedAssets = assetFingerprint(); savedGeneration.value++;
  }
  function initializeCollage(items: MediaAsset[], setup: CollageSetup) {
    validatePhotos(items);
    const metadata = validateAssets(items);
    if (!Number.isFinite(setup.width) || !Number.isFinite(setup.height) || setup.width <= 0 || setup.height <= 0) throw new Error('请选择有效的画布尺寸。');
    if (setup.width < 16 || setup.height < 16 || setup.width > 8192 || setup.height > 8192) throw new Error('画布尺寸须在 16 至 8192 像素之间。');
    const next = blankProject();
    const doc = next.pages[0]!;
    doc.width = setup.width; doc.height = setup.height;
    doc.padding = Math.min(doc.padding, Math.min(doc.width, doc.height) / 2 - 1);
    const photos = items.map(asset => imageElement(asset.id));
    if (setup.template) {
      const template = setup.template;
      doc.width = template.width; doc.height = template.height; doc.mode = template.mode; doc.layoutId = template.layoutId;
      doc.background = clone(template.background); doc.padding = template.padding; doc.gap = template.gap; doc.cornerRadius = template.cornerRadius; doc.animation = template.animation;
      const decorations = template.elements.map(element => ({ ...clone(element), id: crypto.randomUUID() }));
      if (template.mode === 'grid') {
        const layout = layouts.find(item => item.id === template.layoutId);
        if (!layout || layout.count < photos.length) throw new Error('所选模板没有足够的照片位置。');
        doc.slots = photoSlots(layout, photos); doc.elements = decorations;
      } else {
        const frames = template.photoFrames ?? [];
        if (frames.length && frames.length < photos.length) throw new Error('所选模板没有足够的照片位置。');
        const layout = recommendLayout(items, doc)!;
        const pictures = frames.length ? frames.map((frame, index) => imageElement(photos[index]?.assetId ?? '', {
          id: photos[index]?.id ?? crypto.randomUUID(), x: frame.x * doc.width, y: frame.y * doc.height, width: frame.width * doc.width, height: frame.height * doc.height,
          rotation: frame.rotation ?? 0, shape: frame.shape ?? 'rect', borderWidth: frame.borderWidth ?? 0, borderColor: frame.borderColor ?? '#ffffff', cornerRadius: doc.cornerRadius,
        })) : photoSlots(layout, photos).map(slot => slotPhoto(doc, slot));
        doc.slots = [];
        if (template.photoLayering === 'overlay') doc.elements = [...pictures, ...decorations];
        else {
          const underlays = decorations.filter(item => item.type === 'shape' && item.animation === 'none');
          const overlays = decorations.filter(item => !(item.type === 'shape' && item.animation === 'none'));
          doc.elements = [...underlays, ...pictures, ...overlays];
        }
      }
    } else {
      const layout = recommendLayout(items, doc)!;
      doc.layoutId = layout.id; doc.slots = photoSlots(layout, photos);
    }
    const validated = validateProject(next);
    validateReferences(validated, metadata);
    clearOldAssets(items); assets.value = {}; register(items);
    cropSession.value = null; project.value = validated; selection.value = null;
    history.commit(); history.clear(); committed = fingerprint(); revision.value++;
    savedProject = ''; savedAssets = assetFingerprint(); savedGeneration.value++;
  }
  function setCollagePhotos(entries: readonly PhotoSelectionEntry[], newAssets: MediaAsset[] = []) {
    if (cropEditing.value) throw new Error('请先完成或取消当前照片裁剪。');
    if (entries.length > MAX_COLLAGE_PHOTOS || new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error(`请选择 0 至 ${MAX_COLLAGE_PHOTOS} 个不重复的照片位置。`);
    const doc = document.value;
    const sources = photoSources();
    const imported: Record<string, MediaAsset> = {};
    for (const asset of newAssets) {
      if (imported[asset.id]) throw new Error('素材标识重复，请重新导入文件。');
      imported[asset.id] = asset;
    }
    const selectedImports: MediaAsset[] = [];
    const photos = entries.map(entry => {
      const source = sources.find(item => item.id === entry.id);
      if (source) {
        if (source.assetId !== entry.assetId) throw new Error('照片位置与素材不匹配，请重新整理。');
        return clone(source);
      }
      const asset = imported[entry.assetId];
      if (entry.id !== `new:${entry.assetId}` || !asset) throw new Error('照片位置不存在，请重新整理。');
      const existing = assets.value[asset.id];
      if (existing && existing !== asset && existing.src !== asset.src) throw new Error('素材标识重复，请重新导入文件。');
      selectedImports.push(asset);
      return imageElement(asset.id);
    });
    const orderedAssets = photos.map(photo => {
      const asset = selectedImports.find(item => item.id === photo.assetId) ?? assets.value[photo.assetId];
      if (!asset) throw new Error('素材不存在，请重新导入。');
      return asset;
    });
    if (orderedAssets.length) validatePhotos(orderedAssets);
    validateAssets(selectedImports);
    if (!selectedImports.length && entries.length === sources.length && entries.every((entry, index) => entry.id === sources[index]!.id)) return;
    if (isPoster() && (photos.length !== sources.length || doc.elements.some(element => element.type === 'image' && !element.assetId && element.locked))) guardPosterChange();
    for (const [index, photo] of sources.entries()) {
      if (photo.locked && entries.findIndex(entry => entry.id === photo.id) !== index) throw new Error('请先解锁需要移除或重排的照片位置。');
    }
    const nextDoc = clone(doc);
    const sourceIds = new Set(sources.map(photo => photo.id));
    if (doc.mode === 'grid') {
      if (doc.layoutId.startsWith('long-')) {
        if (photos.length) {
          const long = longComposition(orderedAssets, doc.width, doc);
          Object.assign(nextDoc, long);
          nextDoc.slots = photoSlots({ id: long.layoutId, name: '照片排列', count: photos.length, slots: long.slots }, photos);
        } else {
          nextDoc.layoutId = 'long-0'; nextDoc.slots = [];
        }
        nextDoc.elements = nextDoc.elements.filter(item => !sourceIds.has(item.id));
      } else {
        const floatingIds = new Set(doc.elements.filter(item => sourceIds.has(item.id)).map(item => item.id));
        const slotted = photos.filter(photo => !floatingIds.has(photo.id));
        const available = doc.slots.filter(slot => !slot.locked || !!slot.assetId);
        if (slotted.length <= available.length) {
          // Keep existing cells, including holes. Reordered entries use occupied
          // cells first; imports fill unlocked holes without absorbing floating photos.
          const positions = [...doc.slots.filter(slot => slot.assetId), ...doc.slots.filter(slot => !slot.assetId && !slot.locked)];
          const assigned = new Map(positions.slice(0, slotted.length).map((slot, index) => [slot.id, slotted[index]!]));
          const assignedIds = new Set(slotted.map(photo => photo.id));
          nextDoc.slots = doc.slots.map(slot => {
            const photo = assigned.get(slot.id);
            if (photo) return photoSlots({ id: doc.layoutId, name: '', count: 1, slots: [slot] }, [photo])[0]!;
            if (!slot.assetId) return clone(slot);
            return { ...clone(slot), id: assignedIds.has(slot.id) ? crypto.randomUUID() : slot.id, assetId: null, crop: createCrop(), filter: createFilter(), trimStart: 0, trimEnd: null, muted: false };
          });
        } else {
          const layout = recommendLayout(slotted.map(photo => selectedImports.find(asset => asset.id === photo.assetId) ?? assets.value[photo.assetId]!), doc)!;
          nextDoc.layoutId = layout.id; nextDoc.slots = photoSlots(layout, slotted);
        }
        const floating = photos.filter(photo => floatingIds.has(photo.id));
        let position = 0;
        nextDoc.elements = nextDoc.elements.flatMap<SceneElement>(item => {
          if (!floatingIds.has(item.id)) return [item];
          const photo = floating[position++];
          return photo ? [photo] : [];
        });
      }
    } else {
      const posterStyle = doc.layoutId.match(/^(poster-.+)-\d+$/)?.[1];
      let pictures: ImageElement[];
      if (arrangePosterPhotos(nextDoc, photos)) pictures = photos;
      else {
        const layout = photos.length ? recommendLayout(orderedAssets, doc)! : undefined;
        const arranged = layout ? photoSlots(layout, photos).map(slot => slotPhoto(nextDoc, slot)) : [];
        pictures = photos.map((photo, index) => sourceIds.has(photo.id) ? photo : arranged[index]!);
      }
      const lastPhotoIndex = doc.elements.reduce((last, item, index) => sourceIds.has(item.id) || (!!posterStyle && item.type === 'image' && !item.assetId) ? index : last, -1);
      let position = 0;
      nextDoc.elements = [];
      doc.elements.forEach((item, index) => {
        if (sourceIds.has(item.id) || (!!posterStyle && item.type === 'image' && !item.assetId)) {
          const photo = pictures[position++];
          if (photo) nextDoc.elements.push(photo);
        } else nextDoc.elements.push(clone(item));
        if (index === lastPhotoIndex) nextDoc.elements.push(...pictures.slice(position));
      });
      if (lastPhotoIndex < 0) nextDoc.elements.push(...pictures);
    }
    for (const photo of sources.filter(photo => photo.locked)) {
      const next = nextDoc.mode === 'grid' && nextDoc.slots.some(slot => slot.id === photo.id)
        ? slotPhoto(nextDoc, nextDoc.slots.find(slot => slot.id === photo.id)!)
        : nextDoc.elements.find(item => item.id === photo.id);
      if (!next || JSON.stringify(next) !== JSON.stringify(photo)) throw new Error('请先解锁需要移除或重排的照片位置。');
    }
    for (const slot of doc.slots.filter(slot => slot.locked && !slot.assetId)) {
      if (JSON.stringify(nextDoc.slots.find(item => item.id === slot.id)) !== JSON.stringify(slot)) throw new Error('请先解锁需要重排的空照片位置。');
    }
    const candidate = clone(project.value);
    candidate.pages[candidate.pages.findIndex(page => page.id === doc.id)] = nextDoc;
    const validated = validateProject(candidate);
    validateReferences(validated, validateAssets([...Object.values(assets.value).filter(asset => !selectedImports.some(item => item.id === asset.id)), ...selectedImports]));
    if (!selectedImports.length && JSON.stringify(nextDoc) === JSON.stringify(doc)) return;
    checkpoint();
    register(selectedImports);
    project.value = validated; selection.value = null; changed();
  }
  function isOrdinaryPhoto(element: SceneElement): element is ImageElement {
    if (element.type !== 'image') return false;
    const kind = assets.value[element.assetId]?.kind;
    return kind === 'image' || kind === 'video';
  }
  function photoCount() {
    let count = 0;
    if (document.value.mode === 'grid') for (const slot of document.value.slots) if (slot.assetId) count++;
    for (const element of document.value.elements) if (isOrdinaryPhoto(element)) count++;
    return count;
  }
  function isPoster() { return document.value.mode === 'free' && document.value.layoutId.startsWith('poster-'); }
  function guardPosterChange() {
    if (!isPoster()) return;
    for (const element of document.value.elements) if (element.locked && element.type === 'image' && (!element.assetId || isOrdinaryPhoto(element))) throw new Error('请先解锁需要重排的照片位置。');
  }
  function reflowPoster() {
    if (!isPoster()) return;
    if (arrangePosterPhotos(document.value, document.value.elements.filter(isOrdinaryPhoto))) document.value.elements = document.value.elements.filter(element => element.type !== 'image' || !!element.assetId);
  }
  function assetDestination(asset: MediaAsset, target: Selection | undefined): Selection {
    return target === undefined ? asset.kind === 'sticker' ? null : selection.value : target;
  }
  function placementPhotoDelta(asset: MediaAsset, target: Selection | undefined): number {
    if (asset.kind === 'audio') return 0;
    const destination = assetDestination(asset, target);
    const previous = destination?.kind === 'element' ? document.value.elements.find(element => element.id === destination.id) : undefined;
    return (asset.kind === 'image' || asset.kind === 'video' ? 1 : 0) - (previous && isOrdinaryPhoto(previous) ? 1 : 0);
  }
  function photoSources(): ImageElement[] {
    const doc = document.value;
    const slotPhotos = doc.mode === 'grid' ? doc.slots.filter(slot => slot.assetId).map(slot => slotPhoto(doc, slot)) : [];
    return [...slotPhotos, ...doc.elements.filter(isOrdinaryPhoto).map(item => clone(item))];
  }
  function assignLayout(layout: LayoutPreset, photos: ImageElement[]) {
    if (photos.length > MAX_COLLAGE_PHOTOS) throw new Error(`最多支持 ${MAX_COLLAGE_PHOTOS} 张照片，请先整理照片。`);
    if (layout.count < photos.length) throw new Error(`此布局只有 ${layout.count} 个照片位置，无法容纳当前 ${photos.length} 张照片。请先在「整理照片」中移除照片。`);
    const doc = document.value;
    doc.mode = 'grid'; doc.layoutId = layout.id;
    doc.slots = photoSlots(layout, photos);
    doc.elements = doc.elements.filter(item => item.type !== 'image' || assets.value[item.assetId]?.kind === 'sticker');
    selection.value = null;
  }
  function longGeometry(slots: readonly CollageSlot[], incoming?: readonly MediaAsset[], presentation: Pick<EditorDocument, 'width' | 'padding' | 'gap' | 'cornerRadius' | 'photoFrame'> = document.value) {
    const photos = slots.filter(slot => slot.assetId);
    if (!photos.length) return { width: presentation.width, height: document.value.height, padding: presentation.padding, gap: presentation.gap, cornerRadius: presentation.cornerRadius, layoutId: 'long-0', slots: [] };
    const ordered = photos.map(slot => {
      const asset = incoming?.find(item => item.id === slot.assetId) ?? assets.value[slot.assetId!];
      if (!asset || (asset.kind !== 'image' && asset.kind !== 'video')) throw new Error('照片位置只能使用照片或视频。');
      return asset;
    });
    const long = longComposition(ordered, presentation.width, presentation);
    return { ...long, slots: photos.map((slot, index) => ({ ...slot, ...long.slots[index]! })) };
  }
  function place(assetId: string, target: Selection | undefined, asset = assets.value[assetId], incoming?: readonly MediaAsset[]): Selection {
    if (!asset) throw new Error('素材不存在，请重新导入。');
    if (asset.kind === 'audio') {
      document.value.audio = { assetId, start: 0, end: asset.duration > 0 ? asset.duration : null, volume: 1 };
      return null;
    }
    const destination = assetDestination(asset, target);
    const destinationPhoto = destination?.kind === 'slot' ? document.value.slots.find(item => item.id === destination.id) : destination?.kind === 'element' ? document.value.elements.find(item => item.id === destination.id && item.type === 'image') : null;
    if (destinationPhoto?.locked) throw new Error('请先解锁要替换的照片位置。');
    if (document.value.mode === 'free' && (asset.kind === 'image' || asset.kind === 'video')) {
      const replacement = destination?.kind === 'element' ? document.value.elements.find(item => item.id === destination.id) : undefined;
      const replacesPhoto = !!replacement && isOrdinaryPhoto(replacement);
      if (!replacesPhoto && photoCount() >= MAX_COLLAGE_PHOTOS) throw new Error(`最多支持 ${MAX_COLLAGE_PHOTOS} 张照片，请先整理照片。`);
    }
    if (destination?.kind === 'slot' && document.value.mode === 'grid') {
      const slot = document.value.slots.find(item => item.id === destination.id);
      if (slot) {
        const replacement = { assetId, crop: createCrop(), filter: createFilter(), trimStart: 0, trimEnd: null, muted: false };
        if (document.value.layoutId.startsWith('long-')) Object.assign(document.value, longGeometry(document.value.slots.map(item => item.id === slot.id ? { ...item, ...replacement } : item), incoming));
        else Object.assign(slot, replacement);
        return destination;
      }
    }
    if (destination?.kind === 'element') {
      const element = document.value.elements.find(item => item.id === destination.id);
      if (element?.type === 'image') {
        element.assetId = assetId; element.crop = createCrop(); element.filter = createFilter(); element.trimStart = 0; element.trimEnd = null; element.muted = false;
        return destination;
      }
    }
    if (document.value.mode === 'grid' && asset.kind !== 'sticker') {
      const slot = document.value.slots.find(item => !item.assetId && !item.locked);
      if (slot) {
        const replacement = { assetId, crop: createCrop(), filter: createFilter(), trimStart: 0, trimEnd: null, muted: false };
        if (document.value.layoutId.startsWith('long-')) Object.assign(document.value, longGeometry(document.value.slots.map(item => item.id === slot.id ? { ...item, ...replacement } : item), incoming));
        else Object.assign(slot, replacement);
        return { kind: 'slot', id: slot.id };
      }
      // A full grid keeps the new original in the media library instead of covering a photo.
      return null;
    }
    const frame = asset.kind !== 'sticker' ? document.value.elements.find(item => item.type === 'image' && !item.assetId && !item.locked) : undefined;
    if (frame?.type === 'image') { frame.assetId = assetId; return { kind: 'element', id: frame.id }; }
    const maxWidth = document.value.width * (asset.kind === 'sticker' ? 0.25 : 0.65);
    const maxHeight = document.value.height * (asset.kind === 'sticker' ? 0.25 : 0.65);
    const ratio = Math.min(maxWidth / Math.max(1, asset.width), maxHeight / Math.max(1, asset.height));
    const width = Math.max(1, asset.width * ratio), height = Math.max(1, asset.height * ratio);
    const item = imageElement(assetId, { x: (document.value.width - width) / 2, y: (document.value.height - height) / 2, width, height });
    if (isPoster() && asset.kind !== 'sticker') {
      let position = document.value.elements.length;
      while (position > 0) {
        const previous = document.value.elements[position - 1]!;
        const previousAsset = previous.type === 'image' ? assets.value[previous.assetId] ?? incoming?.find(asset => asset.id === previous.assetId) : undefined;
        if (previousAsset?.kind === 'image' || previousAsset?.kind === 'video') break;
        position--;
      }
      document.value.elements.splice(position, 0, item);
    } else document.value.elements.push(item);
    return { kind: 'element', id: item.id };
  }
  function addAssets(items: MediaAsset[], target?: Selection) {
    if (!items.length) return;
    let addedCount = 0;
    if (document.value.mode === 'free') {
      for (let index = 0; index < items.length; index++) {
        const asset = items[index]!;
        if (index === 0) addedCount += placementPhotoDelta(asset, target);
        else if (asset.kind === 'image' || asset.kind === 'video') addedCount++;
      }
      if (addedCount > 0 && photoCount() + addedCount > MAX_COLLAGE_PHOTOS) throw new Error(`最多支持 ${MAX_COLLAGE_PHOTOS} 张照片，请先整理照片。`);
      if (addedCount) guardPosterChange();
    }
    let last: Selection = null;
    for (const [index, asset] of items.entries()) last = place(asset.id, index === 0 ? target : null, asset, items) ?? last;
    register(items);
    if (addedCount) reflowPoster();
    selection.value = last;
    changed();
  }
  function placeAsset(assetId: string, target?: Selection) {
    const asset = assets.value[assetId];
    const delta = document.value.mode === 'free' && asset ? placementPhotoDelta(asset, target) : 0;
    if (delta) guardPosterChange();
    selection.value = place(assetId, target);
    if (delta) reflowPoster();
    changed();
  }
  function reflowFreeSpacing(padding: number, gap: number, width: number, height: number) {
    const doc = document.value;
    const sx = (width - padding * 2) / (width - doc.padding * 2);
    const sy = (height - padding * 2) / (height - doc.padding * 2);
    doc.elements = doc.elements.map(element => {
      if (element.locked) return element;
      const photo = element.type === 'image' && assets.value[element.assetId]?.kind !== 'sticker';
      if (!photo && padding === doc.padding) return element;
      const next = padding === doc.padding ? clone(element) : scaledElement(element, sx, sy);
      next.x = padding + (element.x - doc.padding) * sx;
      next.y = padding + (element.y - doc.padding) * sy;
      if (photo && next.type === 'image') {
        // Treat gap as an inset around a stable cell, keeping each photo's center fixed.
        next.width = Math.max(1, (element.width + doc.gap) * sx - gap);
        next.height = Math.max(1, (element.height + doc.gap) * sy - gap);
        next.x = padding + (element.x + element.width / 2 - doc.padding) * sx - next.width / 2;
        next.y = padding + (element.y + element.height / 2 - doc.padding) * sy - next.height / 2;
        next.cornerRadius = element.cornerRadius;
      }
      return next;
    });
  }
  function updateDocument(patch: Partial<EditorDocument>, commit = true) {
    const doc = document.value;
    const width = patch.width ?? doc.width, height = patch.height ?? doc.height;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 16 || height < 16 || width > 8192 || height > 8192) throw new Error('画布尺寸须在 16 至 8192 像素之间。');
    if (patch.mode === 'grid' && doc.mode !== 'grid' && photoSources().length > MAX_COLLAGE_PHOTOS) throw new Error(`最多支持 ${MAX_COLLAGE_PHOTOS} 张照片，请先整理照片。`);
    const remainsLong = doc.layoutId.startsWith('long-') && (!patch.mode || patch.mode === 'grid') && (patch.height === undefined || height === doc.height);
    const geometry = remainsLong && (width !== doc.width || (patch.padding !== undefined && patch.padding !== doc.padding) || (patch.gap !== undefined && patch.gap !== doc.gap) || patch.photoFrame !== undefined)
      ? longGeometry(doc.slots, undefined, { width, padding: patch.padding ?? doc.padding * width / doc.width, gap: patch.gap ?? doc.gap * width / doc.width, cornerRadius: patch.cornerRadius ?? doc.cornerRadius * width / doc.width, photoFrame: patch.photoFrame ?? doc.photoFrame }) : undefined;
    const nextWidth = geometry?.width ?? width, nextHeight = geometry?.height ?? height;
    if (doc.layoutId.startsWith('long-') && !remainsLong) doc.layoutId = 'custom';
    if (nextWidth !== doc.width || nextHeight !== doc.height) {
      doc.elements = doc.elements.map(element => scaledElement(element, nextWidth / doc.width, nextHeight / doc.height));
      const uniform = Math.min(nextWidth / doc.width, nextHeight / doc.height);
      doc.padding *= uniform; doc.gap *= uniform; doc.cornerRadius *= uniform;
    }
    const padding = Math.max(0, Math.min(geometry?.padding ?? patch.padding ?? doc.padding, Math.min(nextWidth, nextHeight) / 2 - 1));
    const gap = Math.max(0, geometry?.gap ?? patch.gap ?? doc.gap);
    if (doc.mode === 'free' && (padding !== doc.padding || gap !== doc.gap)) reflowFreeSpacing(padding, gap, nextWidth, nextHeight);
    const { id: _id, version: _version, mode, ...editable } = clone(patch);
    Object.assign(doc, editable, geometry);
    doc.padding = padding; doc.gap = gap;
    if (patch.cornerRadius !== undefined && doc.mode === 'free') {
      for (const element of doc.elements) {
        if (element.type === 'image' && !element.locked && assets.value[element.assetId]?.kind !== 'sticker') element.cornerRadius = patch.cornerRadius;
      }
    }
    if (doc.audio) {
      const asset = assets.value[doc.audio.assetId];
      if (!asset || asset.kind !== 'audio' || asset.duration <= 0) throw new Error('音乐素材不存在或无法播放，请重新选择音频。');
      doc.audio.start = Math.max(0, Math.min(doc.audio.start ?? 0, Math.max(0, asset.duration - 0.01)));
      doc.audio.end = doc.audio.end === null ? null : Math.max(doc.audio.start + 0.01, Math.min(doc.audio.end ?? asset.duration, asset.duration));
      doc.audio.volume = Math.max(0, Math.min(doc.audio.volume ?? 1, 1));
    }
    if (mode && mode !== doc.mode) changeMode(mode);
    doc.padding = Math.max(0, Math.min(doc.padding, Math.min(doc.width, doc.height) / 2 - 1));
    select(selection.value);
    changed(commit);
  }
  function updateSelected(patch: Partial<SceneElement>, commit = true) {
    const item = selected.value;
    if (item?.type === 'text') guardTextEdit();
    if (!item || (item.locked && patch.locked !== false)) return;
    const { id: _id, type: _type, ...editable } = clone(patch);
    Object.assign(item, editable);
    if (item.type === 'text' && !('height' in editable) && ('text' in editable || 'fontSize' in editable || 'lineHeight' in editable || 'backgroundColor' in editable)) item.height = textMinHeight(item);
    changed(commit);
  }
  function updateSlot(patch: Partial<CollageSlot>, commit = true) {
    if (!selectedSlot.value || (selectedSlot.value.locked && patch.locked !== false)) return;
    const { id: _id, ...editable } = clone(patch);
    Object.assign(selectedSlot.value, editable);
    changed(commit);
  }
  function cropTarget(target: Exclude<Selection, null>, page = document.value) {
    if (target.kind === 'slot') return page.mode === 'grid' ? page.slots.find(slot => slot.id === target.id && !slot.locked) ?? null : null;
    const element = page.elements.find(item => item.id === target.id);
    return element?.type === 'image' && !element.locked ? element : null;
  }
  function beginCropSession(target: Exclude<Selection, null>) {
    const photo = cropTarget(target);
    const asset = photo?.assetId ? assets.value[photo.assetId] : null;
    if (!photo || !asset || (asset.kind !== 'image' && asset.kind !== 'video')) throw new Error('请选择未锁定且已填入照片的位置。');
    if (cropSession.value) cancelCropSession();
    checkpoint();
    const current = cropTarget(target)!;
    cropSession.value = { target: { ...target }, pageId: document.value.id, crop: clone(current.crop), updatedAt: document.value.updatedAt };
    selection.value = { ...target };
  }
  function cancelCropSession() {
    const session = cropSession.value;
    if (!session) return;
    const page = project.value.pages.find(item => item.id === session.pageId);
    if (page) {
      const photo = cropTarget(session.target, page);
      if (photo) photo.crop = clone(session.crop);
      page.updatedAt = session.updatedAt;
    }
    cropSession.value = null; revision.value++;
  }
  function commitCropSession() {
    const session = cropSession.value;
    if (!session) return;
    const page = project.value.pages.find(item => item.id === session.pageId);
    const photo = page ? cropTarget(session.target, page) : null;
    if (!photo || JSON.stringify(photo.crop) === JSON.stringify(session.crop)) {
      cancelCropSession();
      return;
    }
    cropSession.value = null;
    checkpoint();
  }
  function changeCrop(change: CropChange, commit = true) {
    if (cropSession.value && (change.kind !== cropSession.value.target.kind || change.id !== cropSession.value.target.id)) return;
    if (change.kind === 'slot') {
      const slot = document.value.slots.find(item => item.id === change.id);
      if (!slot || slot.locked) return;
      slot.crop = clone(change.crop);
    } else {
      const element = document.value.elements.find(item => item.id === change.id);
      if (element?.type !== 'image' || element.locked) return;
      element.crop = clone(change.crop);
    }
    changed(commit && !cropEditing.value);
  }
  function transform(change: TransformChange) {
    const item = document.value.elements.find(element => element.id === change.id);
    if (item?.type === 'text') guardTextEdit();
    if (!item || item.locked) return;
    const { id: _id, type: _type, ...patch } = clone(change.patch);
    Object.assign(item, patch);
    changed();
  }
  function addDrawing(change: DrawingChange) {
    const item = createDrawing(change);
    if (change.tool === 'eraser') item.eraseTargets = document.value.elements.filter(element => element.type === 'drawing' && element.tool !== 'eraser' && element.visible && !element.locked).map(element => element.id);
    document.value.elements.push(item); selection.value = { kind: 'element', id: item.id }; changed();
  }
  function applyLayout(layout: LayoutPreset) {
    const photos = photoSources();
    assignLayout(layout, photos);
    changed();
  }
  function setMainPhoto(target: Exclude<Selection, null>) {
    if (cropEditing.value) throw new Error('请先完成或取消当前照片调整。');
    const selected = cropTarget(target);
    if (!selected?.assetId) throw new Error('请选择一张未锁定的照片作为海报主图。');
    const photos = photoSources();
    const index = photos.findIndex(photo => photo.id === target.id);
    if (index < 0) return;
    const doc = document.value;
    if (doc.mode !== 'free' || !doc.layoutId.startsWith('poster-')) throw new Error('请先选择一个照片海报。');
    if (photos.length < 2) throw new Error('更换海报主图需要至少 2 张照片。');
    const main = doc.elements.find(item => item.id === photos[0]!.id);
    if (main?.type !== 'image' || main.locked) throw new Error('请先解锁海报主图位置。');
    if (main !== selected) {
      const content = (photo: CollageSlot | ImageElement) => ({ assetId: photo.assetId, crop: clone(photo.crop), filter: clone(photo.filter), shape: photo.shape, trimStart: photo.trimStart, trimEnd: photo.trimEnd, muted: photo.muted });
      const first = content(main), next = content(selected);
      Object.assign(main, next); Object.assign(selected, first);
    }
    selection.value = { kind: 'element', id: main.id };
    changed();
  }
  function changeMode(mode: EditorMode) {
    const doc = document.value;
    if (mode === doc.mode) return;
    if (mode === 'free') {
      const pictures = doc.slots.map(slot => slotPhoto(doc, slot));
      if (doc.layoutId.startsWith('long-')) doc.layoutId = 'custom';
      doc.elements = [...pictures, ...doc.elements]; doc.slots = []; doc.mode = 'free';
    } else {
      const photos = doc.elements.filter((element): element is ImageElement => element.type === 'image' && (!element.assetId || assets.value[element.assetId]?.kind !== 'sticker'));
      if (photos.length > MAX_COLLAGE_PHOTOS) throw new Error(`最多支持 ${MAX_COLLAGE_PHOTOS} 张照片，请先整理照片。`);
      const layout = layouts.find(item => item.id === doc.layoutId && item.count >= photos.length) ?? layouts.find(item => item.id === `grid-${Math.max(1, photos.length)}`)!;
      assignLayout(layout, photos);
    }
    selection.value = null;
  }
  function setMode(mode: EditorMode) { if (mode === document.value.mode) return; changeMode(mode); changed(); }
  function applyLook(look: CollageLook) {
    if (cropEditing.value) throw new Error('请先完成或取消当前照片裁剪。');
    const next = collageLookDocument(document.value, look, assets.value);
    if (JSON.stringify(next) === JSON.stringify(document.value)) return;
    const validated = validateProject({ ...project.value, pages: project.value.pages.map(page => page.id === next.id ? next : page) });
    checkpoint();
    project.value = validated; changed();
  }
  function applyTemplate(template: TemplatePreset) {
    const photos = photoSources();
    const doc = document.value;
    if (photos.length > MAX_COLLAGE_PHOTOS) throw new Error(`最多支持 ${MAX_COLLAGE_PHOTOS} 张照片，请先整理照片。`);
    const layout = template.mode === 'grid' ? layouts.find(item => item.id === template.layoutId) : undefined;
    const frames = template.photoFrames ?? [];
    if (template.mode === 'grid' && !layout) throw new Error('所选模板的照片布局不存在。');
    const capacity = layout?.count ?? frames.length;
    if ((template.mode === 'grid' || frames.length > 0) && capacity < photos.length) throw new Error(`所选模板只有 ${capacity} 个照片位置，无法容纳当前 ${photos.length} 张照片。`);
    const oldWidth = doc.width, oldHeight = doc.height;
    doc.width = template.width; doc.height = template.height; doc.mode = template.mode; doc.layoutId = template.layoutId;
    doc.background = clone(template.background); doc.padding = template.padding; doc.gap = template.gap; doc.cornerRadius = template.cornerRadius; doc.animation = template.animation;
    doc.photoFrame = createPhotoFrame();
    const decorations = template.elements.map(element => ({ ...clone(element), id: crypto.randomUUID() }));
    if (template.mode === 'grid') {
      doc.elements = decorations;
      assignLayout(layout!, photos);
    } else {
      doc.slots = [];
      const pictures = frames.map((frame, index) => imageElement(photos[index]?.assetId ?? '', {
        ...(photos[index] ? clone(photos[index]) : {}), id: photos[index]?.id ?? crypto.randomUUID(),
        x: frame.x * doc.width, y: frame.y * doc.height, width: frame.width * doc.width, height: frame.height * doc.height, rotation: frame.rotation ?? 0,
        shape: frame.shape ?? 'rect', borderWidth: frame.borderWidth ?? 0, borderColor: frame.borderColor ?? '#ffffff', cornerRadius: template.cornerRadius,
      }));
      // Template coordinates and renderer both use a top-left box with rotation about its center.
      const arranged = frames.length ? pictures : photos.map(photo => scaledElement(photo, template.width / oldWidth, template.height / oldHeight));
      if (template.photoLayering === 'overlay') doc.elements = [...arranged, ...decorations];
      else {
        const underlays = decorations.filter(item => item.type === 'shape' && item.animation === 'none');
        const overlays = decorations.filter(item => !(item.type === 'shape' && item.animation === 'none'));
        doc.elements = [...underlays, ...arranged, ...overlays];
      }
    }
    selection.value = null; changed();
  }
  function guardTextEdit() {
    if (cropEditing.value) throw new Error('请先完成或取消当前照片裁剪。');
  }
  function fitPhotoText(item: TextElement, photo: TextPhoto, measure?: TextHeightMeasurer) {
    item.height = textMinHeight(item);
    if (!measure) return;
    item.height = Math.max(item.height, measure(item));
    const maxHeight = photo.content.height * .8;
    if (item.height > maxHeight && item.fontSize > 1) {
      const scale = Math.max(1 / item.fontSize, maxHeight / item.height);
      item.fontSize *= scale; item.strokeWidth *= scale; item.shadow *= scale;
      item.height = Math.max(textMinHeight(item), measure(item));
    }
  }
  function makePhotoText(text: string, style: PhotoTextStyle, photo = chooseTextPhoto(document.value, assets.value, selection.value), measure?: TextHeightMeasurer): TextElement {
    const width = photo.content.width * .88;
    const item: TextElement = { ...createElementBase('text'), type: 'text', width, text, ...photoTextStylePatch(style, photoTextSize(photo, style, text)) };
    fitPhotoText(item, photo, measure);
    Object.assign(item, textPhotoPosition(photo, width, item.height, 'bottom'));
    return item;
  }
  function addText(text?: string, style: PhotoTextStyle = photoTextStyles[0]!, measure?: TextHeightMeasurer) {
    guardTextEdit();
    checkpoint();
    const item = makePhotoText(text ?? style.sample, style, undefined, measure);
    const doc = document.value;
    doc.elements.push(item);
    if (text !== undefined && doc.textDraft === text) doc.textDraft = '';
    selection.value = { kind: 'element', id: item.id }; changed();
  }
  function applyTextStyle(style: PhotoTextStyle, measure?: TextHeightMeasurer) {
    guardTextEdit();
    const item = selected.value;
    if (item?.type !== 'text' || item.locked) return;
    checkpoint();
    const photo = chooseTextPhoto(document.value, assets.value, null, item);
    Object.assign(item, photoTextStylePatch(style, photoTextSize(photo, style, item.text)));
    fitPhotoText(item, photo, measure);
    changed();
  }
  function positionText(position: TextPlacement, renderedHeight?: number) {
    guardTextEdit();
    const item = selected.value;
    if (item?.type !== 'text' || item.locked) return;
    checkpoint();
    const photo = chooseTextPhoto(document.value, assets.value, null, item);
    const height = renderedHeight ?? Math.max(item.height, textMinHeight(item));
    item.height = height;
    Object.assign(item, textPhotoPosition(photo, item.width, height, position));
    changed();
  }
  function addTextPair(pair: PhotoTextPair, measure?: TextHeightMeasurer) {
    guardTextEdit();
    checkpoint();
    const photo = chooseTextPhoto(document.value, assets.value, selection.value);
    const title = makePhotoText(pair.title, photoTextStyles[0]!, photo);
    const subtitle = makePhotoText(pair.subtitle, photoTextStyles[1]!, photo);
    title.fontFamily = pair.heading; subtitle.fontFamily = pair.body;
    fitPhotoText(title, photo, measure); fitPhotoText(subtitle, photo, measure);
    const gap = Math.min(photo.content.width, photo.content.height) * .025;
    const groupHeight = title.height + gap + subtitle.height;
    const group = textPhotoPosition(photo, title.width, groupHeight, 'bottom');
    const angle = photo.rotation * Math.PI / 180;
    const centerX = group.x + title.width / 2, centerY = group.y + groupHeight / 2;
    for (const [item, offset] of [[title, -groupHeight / 2 + title.height / 2], [subtitle, groupHeight / 2 - subtitle.height / 2]] as const) {
      item.x = centerX - Math.sin(angle) * offset - item.width / 2;
      item.y = centerY + Math.cos(angle) * offset - item.height / 2;
    }
    document.value.elements.push(title, subtitle);
    selection.value = { kind: 'element', id: title.id }; changed();
  }
  function addShape(shape: ImageShape) {
    const decorations = document.value.elements.filter(element => element.visible && element.opacity > 0 && (element.type === 'shape' || element.type === 'text' || element.type === 'drawing'));
    const colors = decorations.map(element => {
      const color = (element.type === 'shape' ? element.fill : element.type === 'text' || element.type === 'drawing' ? element.color : '').trim();
      let alpha = 1;
      if (!color || color.toLowerCase() === 'transparent' || color.toLowerCase() === 'none') alpha = 0;
      else if (/^#[\da-f]{8}$/i.test(color)) alpha = parseInt(color.slice(-2), 16) / 255;
      else if (/^#[\da-f]{4}$/i.test(color)) alpha = parseInt(color.slice(-1), 16) / 15;
      else {
        const opacity = color.match(/^(?:rgba|hsla)\([^,]+,[^,]+,[^,]+,\s*([\d.]+)(%)?\s*\)$/i) ?? color.match(/^(?:rgba?|hsla?)\([^/]+\/\s*([\d.]+)(%)?\s*\)$/i);
        if (opacity) alpha = Number(opacity[1]) / (opacity[2] ? 100 : 1);
      }
      return { element, color, alpha: alpha * element.opacity };
    }).filter(candidate => candidate.alpha > 0);
    const fill = colors.find(candidate => candidate.element.type === 'shape' && candidate.element.id === selected.value?.id)?.color
      ?? colors.find(candidate => candidate.element.type === 'shape' && candidate.alpha >= .99)?.color
      ?? colors.find(candidate => candidate.element.type === 'shape')?.color
      ?? colors[0]?.color
      ?? '#c65843';
    const width = document.value.width * 0.25;
    const item: SceneElement = { ...createElementBase('shape'), type: 'shape', shape, x: (document.value.width - width) / 2, y: (document.value.height - width) / 2, width, height: width, fill, stroke: '', strokeWidth: 0 };
    document.value.elements.push(item); selection.value = { kind: 'element', id: item.id }; changed();
  }
  async function addSticker(sticker: StickerPreset): Promise<void> {
    const projectId = project.value.id, pageId = document.value.id;
    const asset = await createAsset(stickerToBlob(sticker), `${sticker.name}.svg`, 'sticker');
    if (project.value.id !== projectId || document.value.id !== pageId) { disposeAsset(asset); throw new Error('页面已切换，请在当前页面重新添加贴纸。'); }
    register([asset]);
    selection.value = place(asset.id, null); changed();
  }
  function deleteSelected() {
    if (selected.value?.type === 'text') guardTextEdit();
    if (selectedSlot.value) {
      if (selectedSlot.value.locked) return;
      if (document.value.layoutId.startsWith('long-')) Object.assign(document.value, longGeometry(document.value.slots.filter(slot => slot.id !== selectedSlot.value!.id)));
      else { selectedSlot.value.assetId = null; selectedSlot.value.crop = createCrop(); selectedSlot.value.filter = createFilter(); selectedSlot.value.trimStart = 0; selectedSlot.value.trimEnd = null; selectedSlot.value.muted = false; }
    }
    else if (selected.value && !selected.value.locked) {
      const reflow = isOrdinaryPhoto(selected.value) && isPoster();
      if (reflow) guardPosterChange();
      document.value.elements = document.value.elements.filter(item => item.id !== selected.value!.id);
      if (reflow) reflowPoster();
    }
    else return;
    selection.value = null; changed();
  }
  function duplicateSelected() {
    const item = selected.value;
    if (item?.type === 'text') guardTextEdit();
    const duplicatesPhoto = (item?.type === 'image' && (assets.value[item.assetId]?.kind === 'image' || assets.value[item.assetId]?.kind === 'video')) || !!selectedSlot.value?.assetId;
    if (duplicatesPhoto && photoCount() >= MAX_COLLAGE_PHOTOS) throw new Error(`最多支持 ${MAX_COLLAGE_PHOTOS} 张照片，请先整理照片。`);
    if (duplicatesPhoto) guardPosterChange();
    if (item) {
      const copy = { ...clone(item), id: crypto.randomUUID(), x: item.x + 24, y: item.y + 24, locked: false };
      document.value.elements.splice(document.value.elements.indexOf(item) + 1, 0, copy);
      if (duplicatesPhoto) reflowPoster();
      selection.value = { kind: 'element', id: copy.id }; changed();
    } else if (selectedSlot.value?.assetId) {
      const slot = selectedSlot.value;
      const empty = document.value.slots.find(candidate => !candidate.assetId && !candidate.locked);
      if (empty) {
        Object.assign(empty, { assetId: slot.assetId, crop: clone(slot.crop), filter: clone(slot.filter), shape: slot.shape, visible: slot.visible, trimStart: slot.trimStart ?? 0, trimEnd: slot.trimEnd ?? null, muted: slot.muted ?? false });
        selection.value = { kind: 'slot', id: empty.id };
      } else {
        const rect = slotRect(document.value, slot);
        const copy = imageElement(slot.assetId!, { ...rect, x: rect.x + 24, y: rect.y + 24, crop: clone(slot.crop), filter: clone(slot.filter), shape: slot.shape, visible: slot.visible, cornerRadius: document.value.cornerRadius, trimStart: slot.trimStart ?? 0, trimEnd: slot.trimEnd ?? null, muted: slot.muted ?? false });
        document.value.elements.push(copy); selection.value = { kind: 'element', id: copy.id };
      }
      changed();
    }
  }
  function moveLayer(direction: 'up' | 'down' | 'front' | 'back') {
    if (selected.value?.type === 'text') guardTextEdit();
    if (!selected.value || selected.value.locked) return;
    const list = document.value.elements, index = list.findIndex(item => item.id === selected.value!.id);
    const destination = direction === 'front' ? list.length - 1 : direction === 'back' ? 0 : Math.max(0, Math.min(list.length - 1, index + (direction === 'up' ? 1 : -1)));
    if (index === destination) return;
    const [item] = list.splice(index, 1); list.splice(destination, 0, item!); changed();
  }
  function swapSlots(first: string, second: string) {
    const a = document.value.slots.find(slot => slot.id === first), b = document.value.slots.find(slot => slot.id === second);
    if (!a || !b || a === b || a.locked || b.locked) return;
    const firstContent = { assetId: a.assetId, crop: a.crop, filter: a.filter, shape: a.shape, trimStart: a.trimStart ?? 0, trimEnd: a.trimEnd ?? null, muted: a.muted ?? false };
    const secondContent = { assetId: b.assetId, crop: b.crop, filter: b.filter, shape: b.shape, trimStart: b.trimStart ?? 0, trimEnd: b.trimEnd ?? null, muted: b.muted ?? false };
    if (document.value.layoutId.startsWith('long-')) Object.assign(document.value, longGeometry(document.value.slots.map(slot => slot.id === first ? { ...slot, ...secondContent } : slot.id === second ? { ...slot, ...firstContent } : slot)));
    else { Object.assign(a, secondContent); Object.assign(b, firstContent); }
    changed();
  }
  function resetCrop() {
    const target = cropSession.value?.target ?? selection.value;
    if (target) changeCrop({ ...target, crop: createCrop() });
  }
  function undo() {
    if (cropEditing.value) cancelCropSession();
    checkpoint();
    if (!history.canUndo.value) return;
    const pageId = document.value.id;
    history.undo(); committed = fingerprint();
    if (document.value.id !== pageId || (selection.value && !selectionExists(selection.value))) selection.value = null;
    revision.value++;
  }
  function redo() {
    if (cropEditing.value) cancelCropSession();
    if (fingerprint() !== committed || !history.canRedo.value) return;
    const pageId = document.value.id;
    history.redo(); committed = fingerprint();
    if (document.value.id !== pageId || (selection.value && !selectionExists(selection.value))) selection.value = null;
    revision.value++;
  }
  function addPage(duplicate = false) {
    if (cropEditing.value) cancelCropSession();
    const doc = duplicate ? clone(document.value) : createDocument();
    doc.id = crypto.randomUUID(); doc.title = `第 ${project.value.pages.length + 1} 页`; doc.createdAt = Date.now(); doc.updatedAt = doc.createdAt;
    if (duplicate) {
      doc.slots.forEach(slot => { slot.id = crypto.randomUUID(); });
      const elementIds = new Map(doc.elements.map(item => [item.id, crypto.randomUUID()]));
      doc.elements.forEach(item => {
        item.id = elementIds.get(item.id)!;
        if (item.type === 'drawing' && item.eraseTargets) item.eraseTargets = item.eraseTargets.map(id => elementIds.get(id) ?? id);
      });
    }
    else { doc.width = document.value.width; doc.height = document.value.height; doc.mode = document.value.mode; if (doc.mode === 'free') doc.slots = []; doc.padding = Math.min(doc.padding, Math.min(doc.width, doc.height) / 2 - 1); }
    project.value.pages.push(doc); project.value.activePageId = doc.id; selection.value = null; changed();
  }
  function selectPage(id: string) {
    if (!project.value.pages.some(page => page.id === id) || project.value.activePageId === id) return;
    if (cropEditing.value) cancelCropSession();
    checkpoint(); project.value.activePageId = id; selection.value = null;
  }
  function deletePage(id: string) {
    const index = project.value.pages.findIndex(page => page.id === id);
    if (index < 0) return;
    if (project.value.pages.length === 1) throw new Error('项目至少需要保留一页。');
    if (cropEditing.value) cancelCropSession();
    project.value.pages.splice(index, 1);
    if (project.value.activePageId === id) project.value.activePageId = project.value.pages[Math.min(index, project.value.pages.length - 1)]!.id;
    selection.value = null; changed();
  }
  function reorderPage(id: string, direction: -1 | 1) {
    const index = project.value.pages.findIndex(page => page.id === id), destination = index + direction;
    if (index < 0 || destination < 0 || destination >= project.value.pages.length) return;
    const [page] = project.value.pages.splice(index, 1); project.value.pages.splice(destination, 0, page!); changed();
  }
  function setAudio(assetId: string | null) {
    if (assetId === null) document.value.audio = null;
    else {
      const asset = assets.value[assetId];
      if (!asset || asset.kind !== 'audio' || asset.duration <= 0) throw new Error('请选择可播放的本地音频素材。');
      document.value.audio = { assetId, start: 0, end: asset.duration, volume: 1 };
    }
    changed();
  }
  function renameProject(title: string) {
    const value = title.trim().slice(0, 256) || '我的拼贴';
    if (project.value.title === value && document.value.title === value) return;
    project.value.title = value; document.value.title = value; changed();
  }
  function markSaved(savedRevision = revision.value) {
    if (cropEditing.value || savedRevision !== revision.value) return;
    savedProject = fingerprint(); savedAssets = assetFingerprint();
    // Vue must invalidate the computed dirty flag even when saving does not alter project data.
    savedGeneration.value++;
  }
  function snapshot(): EditorProject { return clone(project.value); }
  function restore(value: EditorProject, items: MediaAsset[], persistence: 'saved' | 'unsaved') {
    const validated = validateProject(value);
    const metadata = validateAssets(items);
    validateReferences(validated, metadata);
    clearOldAssets(items); assets.value = {}; register(items);
    cropSession.value = null; project.value = clone(validated); selection.value = null;
    history.commit(); history.clear(); committed = fingerprint(); revision.value++;
    savedProject = persistence === 'saved' ? fingerprint() : ''; savedAssets = assetFingerprint(); savedGeneration.value++;
  }
  return {
    project, document, assets, selection, selected, selectedSlot, selectedAsset, dirty, revision, canUndo, canRedo, cropEditing,
    newProject, initializeCollage, setCollagePhotos, beginCropSession, commitCropSession, cancelCropSession, select, addAssets, placeAsset, updateDocument, updateSelected, updateSlot, changeCrop, transform, addDrawing,
    applyLayout, setMainPhoto, applyLook, applyTemplate, setMode, setTextDraft, addText, applyTextStyle, positionText, addTextPair, addShape, addSticker, deleteSelected, duplicateSelected, moveLayer,
    swapSlots, resetCrop, checkpoint, undo, redo, addPage, selectPage, deletePage, reorderPage, setAudio,
    renameProject, markSaved, snapshot, restore,
  };
});
