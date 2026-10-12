<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { Component } from 'vue';
import { useDebounceFn, useEventListener, useIntervalFn } from '@vueuse/core';
import { ArrowLeft, Brush, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Expand, Film, FlipHorizontal, FlipVertical, FolderOpen, Grid2X2, ImagePlus, Images, Info, Layers, LayoutTemplate, Maximize2, MoreHorizontal, Move, Music2, Palette, Play, Plus, Redo2, RotateCcw, RotateCw, Rows3, Save, Scissors, SlidersHorizontal, Sparkles, Sticker, Trash2, Type, Undo2, Users } from 'lucide-vue-next';
import CanvasCropPreview from './components/CanvasCropPreview.vue';
import TemplatePreview from './components/TemplatePreview.vue';
import EditorCanvas from './components/EditorCanvas.vue';
import EditorPanel from './components/EditorPanel.vue';
import AppDialog from './components/AppDialog.vue';
import PwaStatus from './components/PwaStatus.vue';
import TemplateGallery from './components/TemplateGallery.vue';
import PhotoSelectionSheet from './components/PhotoSelectionSheet.vue';
import CollageTools from './components/CollageTools.vue';
import PhotoTextTools from './components/PhotoTextTools.vue';
import LayoutGallery from './components/LayoutGallery.vue';
import CollageStyleGallery from './components/CollageStyleGallery.vue';
import AppSelect from './components/AppSelect.vue';
import AppTabBar from './components/AppTabBar.vue';
import AppNumber from './components/AppNumber.vue';
import PanelRange from './components/PanelRange.vue';
import HomeScreen from './components/HomeScreen.vue';
import { photoFrameGeometry } from './components/photoFrameGeometry';
import type { PhotoSelectionItem } from './components/photoSelection';
import { useEditorStore } from './stores/editor';
import { layouts, MAX_COLLAGE_PHOTOS } from './catalog/layouts';
import type { CollageLook } from './catalog/looks';
import { examplePhotos } from './examples';
import { createCrop, createPhotoFrame, slotRect } from './defaults';
import type { EditorCanvasHandle, EditorDocument, ExportOptions, MediaAsset, Selection, TemplatePreset, DrawingChange, CutoutModelKind, CollageCreationMode, CropState, CropChange } from './types';
import type { EditorTool, PanelAction, PanelName } from './panel';
import type { ExportFrameRenderer } from './services/export';
import { importMedia, getImportFailures, canvasToBlob, createAsset, disposeAsset } from './services/media';
import { listDrafts, saveDraft, loadDraft, deleteDraft, exportProject, importProject } from './services/persistence';
import { downloadBlob, shareBlob, exportComposition } from './services/export';
import { removeBackground } from './services/ai';
import { ensureTextFont } from './services/fonts';
import { installNativeLinkHandler, isNativeApp, saveNativeFile } from './services/native';
import { photoTextStyles } from './catalog/photoText';
import smartcrop from 'smartcrop';
import { zipSync } from 'fflate';

const store = useEditorStore();
const nativeApp = isNativeApp();
let removeNativeLinkHandler: (() => void) | undefined;
const registrationNumber = window.location.hostname === 'collage.szlh.top' ? '粤ICP备2023103891号-3' : null;
const thirdPartyNoticesUrl = `${import.meta.env.BASE_URL}third-party-notices.txt`;
const view = ref<'home' | 'editor' | 'templates' | 'drafts'>('home');
const projectTitle = ref(store.project.title);
const titleEditing = ref(false);
const textDraft = ref('');
const textPending = ref(false);
let textDraftRevision = 0;
let textWork: Promise<void> | undefined;
watch(textDraft, () => { textDraftRevision++; }, { flush: 'sync' });
watch(() => store.project.id, () => {
  projectTitle.value = store.project.title; titleEditing.value = false; textDraft.value = '';
});
watch(() => store.project.title, title => { if (!titleEditing.value) projectTitle.value = title; });
function commitProjectTitle() {
  titleEditing.value = false;
  if (projectTitle.value !== store.project.title) store.renameProject(projectTitle.value);
  projectTitle.value = store.project.title;
}
const keyboardOpen = ref(false);
function syncViewport() {
  const viewport = window.visualViewport;
  const height = viewport && viewport.scale === 1 ? viewport.height : window.innerHeight;
  const top = viewport && viewport.scale === 1 ? viewport.offsetTop : 0;
  document.documentElement.style.setProperty('--visible-height', `${height}px`);
  document.documentElement.style.setProperty('--visible-top', `${top}px`);
  keyboardOpen.value = window.innerWidth <= 700 && (!!document.activeElement?.matches('.photo-text-tools textarea') || keyboardOpen.value) && (height < 500 || window.innerHeight - height > 120);
  if (keyboardOpen.value) void nextTick(() => {
    const field = document.activeElement;
    if (field instanceof HTMLTextAreaElement && field.matches('.photo-text-tools textarea')) field.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}
useEventListener(window, 'resize', syncViewport);
useEventListener(window.visualViewport, 'resize', syncViewport);
useEventListener(window.visualViewport, 'scroll', syncViewport);
useEventListener(document, 'focusin', syncViewport);
useEventListener(document, 'focusout', syncViewport);
syncViewport();
const mainTab = ref<'home' | 'templates' | 'drafts'>('home');
const tabDirection = ref(1);
const mainTabs = ['home', 'templates', 'drafts'] as const;
watch(view, next => {
  if (next === 'editor') return;
  keyboardOpen.value = false;
  tabDirection.value = mainTabs.indexOf(next) >= mainTabs.indexOf(mainTab.value) ? 1 : -1;
  mainTab.value = next;
});
const templateGallery = ref<{ closePreview: () => void; openPreview: (template: TemplatePreset, event?: MouseEvent) => void; resetFilters: () => void }>();
const templatePreviewOpen = ref(false);
const panel = ref<PanelName>('layouts');
const panelOpen = ref(true);
const moreOpen = ref(false);
const selectionActionsOpen = ref(false);
const pageActionsOpen = ref(false);
watch(() => store.document.id, () => { pageActionsOpen.value = false; });
watch(() => store.selection?.id, () => { selectionActionsOpen.value = false; });
const exampleLoading = ref(false);
const tool = ref<EditorTool>('select');
const brushColor = ref('#32433a');
const brushSize = ref(12);
const highlighter = ref(false);
const cropMode = ref(false);
const inlineCropMode = ref(false);
const cropPreview = ref('off');
const cropPreviewOptions = [
  { value: 'off', label: '微信裁切预览' },
  { value: '1', label: '方形 1:1' },
  { value: '.8', label: '竖图 4:5' },
  { value: '1.7777777778', label: '横图 16:9' },
];
const delayedCheckpoint = useDebounceFn(() => store.checkpoint(), 180);
let cropContext: { panelOpen: boolean; advancedOpen: boolean } | undefined;
const playing = ref(false);
const previewAllPages = ref(false);
const canvas = ref<EditorCanvasHandle>();
const photosInput = ref<HTMLInputElement>();
const mediaInput = ref<HTMLInputElement>();
const audioInput = ref<HTMLInputElement>();
const projectInput = ref<HTMLInputElement>();
const musicPlayer = ref<HTMLAudioElement>();
const busy = ref('');
const progress = ref(0);
const progressMessage = ref('');
const cancellable = ref(false);
let abortController: AbortController | undefined;
const toast = ref<{ message: string; error: boolean } | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let pendingTarget: Selection | undefined;
let saving: Promise<void> | undefined;
const isSaving = ref(false);
const templateQuery = ref('');
const exportOpen = ref(false);
const sizeOpen = ref(false);
const textOpen = ref(false);
const designBrowser = ref<'layouts' | 'looks' | null>(null);
const designBrowserOpen = computed({ get: () => designBrowser.value !== null, set: (open: boolean) => { if (!open) designBrowser.value = null; } });
const pendingPoster = shallowRef<TemplatePreset | null>(null);
const posterOpen = computed({ get: () => pendingPoster.value !== null, set: (open: boolean) => { if (!open) pendingPoster.value = null; } });
const deleteDraftOpen = ref(false);
const deletePageOpen = ref(false);
const pendingDraftId = ref('');
const pendingPageId = ref('');
const textValue = ref('');
const customWidth = ref(1080);
const customHeight = ref(1080);
const exportFormat = ref<ExportOptions['format']>('png');
const exportScale = ref(1);
const exportQuality = ref(.94);
const exportFps = ref(24);
const exportAllPages = ref(true);
const exportResult = ref<{ blob: Blob; url: string; name: string } | null>(null);
const canShareResult = computed(() => {
  const result = exportResult.value;
  return !!result && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([result.blob], result.name, { type: result.blob.type })] });
});
const pickerOpen = ref(false);
const pickerIntent = ref<'create' | 'manage'>('create');
const pickerItems = shallowRef<PhotoSelectionItem[]>([]);
const creationMode = ref<CollageCreationMode>('grid');
const creationRatio = ref('1080x1080');
const pendingTemplate = shallowRef<TemplatePreset | null>(null);
const pickerProcessing = ref(false);
const pickerMessage = ref('');
const pickerError = ref('');
const stagedAssets = new Map<string, MediaAsset>();
let filePurpose: 'stage' | 'replace' = 'stage';
const advancedOpen = ref(false);
const exportPreview = ref('');
const exportPreviewLoading = ref(false);
let previewGeneration = 0;
const exportFormats: Array<{ value: ExportOptions['format']; label: string }> = [{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }, { value: 'webp', label: 'WebP' }];
const exportSizes = [{ value: 1, label: '标准' }, { value: 2, label: '高清' }, { value: 3, label: '超清' }];
const maxExportScale = computed(() => Math.min(8192 / doc.value.width, 8192 / doc.value.height, Math.sqrt(64_000_000 / (doc.value.width * doc.value.height))));
const compactPanels: Partial<Record<PanelName, true>> = { photos: true, layouts: true, spacing: true, text: true, looks: true, background: true };
const crop = computed(() => store.selectedSlot?.crop ?? (store.selected?.type === 'image' ? store.selected.crop : null));
const placedPhotos = computed<PhotoSelectionItem[]>(() => doc.value.mode === 'grid'
  ? doc.value.slots.flatMap(slot => slot.assetId && store.assets[slot.assetId] ? [{ id: slot.id, asset: store.assets[slot.assetId]! }] : [])
  : doc.value.elements.flatMap(element => element.type === 'image' && element.assetId && store.assets[element.assetId]?.kind !== 'sticker' ? [{ id: element.id, asset: store.assets[element.assetId]! }] : []));
const pickerMax = computed(() => {
  const template = pendingTemplate.value;
  if (!template) return MAX_COLLAGE_PHOTOS;
  return template.mode === 'grid' ? layouts.find(layout => layout.id === template.layoutId)?.count ?? MAX_COLLAGE_PHOTOS : template.photoFrames?.length || MAX_COLLAGE_PHOTOS;
});
const pickerRequired = computed(() => {
  const template = pendingTemplate.value;
  if (!template) return 1;
  return Math.max(1, template.photoFrames?.length ?? 0, template.mode === 'grid' ? layouts.find(layout => layout.id === template.layoutId)?.count ?? 1 : 1);
});
const drafts = ref<Array<{ id: string; title: string; updatedAt: number; pageCount: number; url: string }>>([]);
const doc = computed(() => store.document);
const designPhotos = computed(() => {
  const photos = [...(doc.value.mode === 'grid' ? doc.value.slots : []), ...doc.value.elements.filter(element => element.type === 'image')];
  return photos.flatMap(photo => {
    const asset = photo.assetId ? store.assets[photo.assetId] : undefined;
    if (!asset || asset.kind === 'audio' || asset.kind === 'sticker') return [];
    return [{ source: asset.thumbnail || (asset.kind === 'video' ? '' : asset.src), width: asset.width, height: asset.height, crop: photo.crop, filter: photo.filter, shape: photo.shape }];
  });
});
const posterPhotos = computed(() => designPhotos.value.map((photo, index) => ({ ...photo, url: photo.source, crop: index === 0 ? createCrop() : photo.crop })));
const canvasDocument = computed<EditorDocument>(() => {
  if (!cropMode.value) return doc.value;
  const image = store.selected?.type === 'image' ? store.selected : null;
  const photo = store.selectedSlot ?? image;
  if (!photo) return doc.value;
  const outer = 'type' in photo ? photo : slotRect(doc.value, photo);
  const asset = photo.assetId ? store.assets[photo.assetId] : undefined;
  const frame = asset?.kind === 'sticker' ? { ...outer, inset: 0 } : photoFrameGeometry(outer.width, outer.height, doc.value.photoFrame, asset?.width, asset?.height);
  return {
    ...doc.value, mode: 'grid', width: frame.width, height: frame.height,
    padding: 0, gap: 0, photoFrame: createPhotoFrame(), cornerRadius: Math.max(0, (image?.cornerRadius ?? doc.value.cornerRadius) - frame.inset),
    background: { ...doc.value.background, assetId: null }, elements: [],
    slots: [{ id: photo.id, assetId: photo.assetId, crop: photo.crop, filter: photo.filter, shape: photo.shape, trimStart: photo.trimStart, trimEnd: photo.trimEnd, muted: photo.muted, x: 0, y: 0, width: 1, height: 1 }],
  };
});
const canvasSelection = computed<Selection>(() => cropMode.value && store.selection ? { kind: 'slot', id: store.selection.id } : store.selection);
const pageNumber = computed(() => store.project.pages.findIndex(page => page.id === doc.value.id) + 1);
const totalDuration = computed(() => store.project.pages.reduce((sum, page) => sum + page.duration, 0));
const hasImageSelection = computed(() => !!store.selectedSlot?.assetId || store.selected?.type === 'image');
const canAdjustPhoto = computed(() => hasImageSelection.value && !store.selected?.locked && (store.selectedAsset?.kind === 'image' || store.selectedAsset?.kind === 'video'));
const posterComposition = computed(() => doc.value.mode === 'free' && doc.value.layoutId.startsWith('poster-'));
const selectedPhotoNumber = computed(() => placedPhotos.value.findIndex(photo => photo.id === store.selection?.id) + 1);
const musicAsset = computed(() => doc.value.audio ? store.assets[doc.value.audio.assetId] : null);
const toolItems: Array<{ id: PanelName; label: string; icon: Component }> = [
  { id: 'photos', label: '照片', icon: Images }, { id: 'layouts', label: '布局', icon: Grid2X2 },
  { id: 'text', label: '文字', icon: Type },
  { id: 'background', label: '画布', icon: Expand },
];
const toolIndex = computed(() => moreOpen.value ? toolItems.length : toolItems.findIndex(item => item.id === panel.value));
const activeToolIndex = computed(() => toolIndex.value < 0 ? toolItems.length : toolIndex.value);
const extraTools: Array<{ id: PanelName; label: string; icon: Component }> = [
  { id: 'spacing', label: '留白与圆角', icon: SlidersHorizontal }, { id: 'looks', label: '照片风格', icon: Palette },
  { id: 'templates', label: '设计模板', icon: LayoutTemplate },
  { id: 'stickers', label: '贴纸装饰', icon: Sticker }, { id: 'draw', label: '形状与涂鸦', icon: Brush },
  { id: 'layers', label: '图层管理', icon: Layers }, { id: 'animation', label: '动画效果', icon: Sparkles },
  { id: 'audio', label: '背景音乐', icon: Music2 },
];
const panelTitles: Record<PanelName, string> = { photos: '照片', layouts: '构图与海报', spacing: '留白 · 间距 · 圆角', looks: '照片风格', background: '画布', templates: '设计模板', text: '文字', stickers: '贴纸', draw: '形状与涂鸦', layers: '图层', animation: '动画', audio: '音乐' };
const panelTitle = computed(() => panelTitles[panel.value]);
const photoCount = computed(() => placedPhotos.value.length);
const motionFormats: Partial<Record<ExportOptions['format'], true>> = { gif: true, mp4: true, webm: true };
const isAnimatedExport = computed(() => !!motionFormats[exportFormat.value]);
const exportDimensions = computed(() => `${Math.round(doc.value.width * exportScale.value)} × ${Math.round(doc.value.height * exportScale.value)}`);
const swapFirst = ref<string | null>(null);
const inlineDisabled = computed(() => !!busy.value || isSaving.value || textPending.value || !!swapFirst.value || pickerOpen.value || advancedOpen.value || moreOpen.value || selectionActionsOpen.value || pageActionsOpen.value || exportOpen.value || textOpen.value || sizeOpen.value || !!designBrowser.value || !!pendingPoster.value);
let previewStarted = 0;
let previewOriginalPage = '';

function notify(message: string, error = false) {
  toast.value = { message, error };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = null; }, error ? 7000 : 4200);
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : '操作失败，请重试。'; }
async function runBusy(label: string, work: (signal: AbortSignal, report: (value: number, message: string) => void) => Promise<void>, canCancel = false) {
  if (busy.value) return;
  playing.value = false;
  busy.value = label; progress.value = 0; progressMessage.value = '正在准备…'; cancellable.value = canCancel;
  abortController = new AbortController();
  try { await work(abortController.signal, (value, message) => { progress.value = Math.max(0, Math.min(1, value)); progressMessage.value = message; }); }
  catch (error) { notify(error instanceof DOMException && error.name === 'AbortError' ? '已取消操作，原作品未被替换。' : errorMessage(error), !(error instanceof DOMException && error.name === 'AbortError')); }
  finally { busy.value = ''; cancellable.value = false; abortController = undefined; if (view.value === 'editor' && store.dirty) autoSave(); }
}
function choosePanel(id: PanelName) {
  if (store.cropEditing) finishCrop(true);
  moreOpen.value = false;
  if (compactPanels[id]) {
    panelOpen.value = panel.value !== id || !panelOpen.value;
    advancedOpen.value = false;
  } else { advancedOpen.value = true; panelOpen.value = false; }
  panel.value = id;
  if (id !== 'draw') tool.value = 'select';
}
function openShapeEditor() {
  tool.value = 'select';
  choosePanel('draw');
}
function applyLook(look: CollageLook) {
  store.applyLook(look);
  cropMode.value = false; tool.value = 'select'; store.select(null);
}
function select(selection: Selection) {
  if (busy.value || textPending.value || store.cropEditing) return;
  if (swapFirst.value && selection?.kind === 'slot') {
    if (selection.id !== swapFirst.value) store.swapSlots(swapFirst.value, selection.id);
    swapFirst.value = null; notify('照片已交换。'); store.select(null); return;
  }
  store.select(selection);
  if (store.selected?.type === 'image' && !store.selected.assetId) uploadPhotos(true);
}
function openPhotoText() {
  if (store.cropEditing) finishCrop(true);
  panel.value = 'text'; panelOpen.value = true; advancedOpen.value = false; moreOpen.value = false;
  tool.value = 'select'; playing.value = false;
}
function beginCrop(target: Exclude<Selection, null>) {
  try {
    if (store.cropEditing) finishCrop(true);
    playing.value = false; store.beginCropSession(target);
    cropContext = { panelOpen: panelOpen.value, advancedOpen: advancedOpen.value };
    cropMode.value = true; tool.value = 'select'; panelOpen.value = false; advancedOpen.value = false;
  } catch (error) { notify(errorMessage(error), true); }
}
function beginInlineCrop(target: Exclude<Selection, null>) {
  if (inlineDisabled.value || cropMode.value) return;
  try {
    playing.value = false;
    if (store.cropEditing && (store.selection?.kind !== target.kind || store.selection?.id !== target.id)) store.commitCropSession();
    if (!store.cropEditing) store.beginCropSession(target);
    inlineCropMode.value = true; tool.value = 'select';
  } catch (error) { notify(errorMessage(error), true); }
}
function endInlineCrop(result: { cancelled: boolean }) {
  if (!inlineCropMode.value) return;
  finishCrop(!result.cancelled);
}
function finishCrop(confirm: boolean) {
  if (confirm) store.commitCropSession(); else store.cancelCropSession();
  cropMode.value = false; inlineCropMode.value = false;
  if (cropContext) { panelOpen.value = cropContext.panelOpen; advancedOpen.value = cropContext.advancedOpen; cropContext = undefined; }
  autoSave();
}
function adjustCrop(patch: Partial<CropState>) {
  if (!store.selection || !crop.value) return;
  store.changeCrop({ ...store.selection, crop: { ...crop.value, ...patch } }, false);
}
function changeCanvasCrop(change: CropChange) {
  const target = store.cropEditing ? store.selection : change;
  if (!target) return;
  store.changeCrop({ kind: target.kind, id: target.id, crop: change.crop }, false);
  if (!store.cropEditing) delayedCheckpoint();
}
function openPhotoAdjustments() {
  if (!hasImageSelection.value && placedPhotos.value[0]) store.select({ kind: doc.value.mode === 'grid' ? 'slot' : 'element', id: placedPhotos.value[0].id });
  moreOpen.value = false; panelOpen.value = false; panel.value = 'photos'; advancedOpen.value = true;
}
function requestAsset(slotId: string) { store.select({ kind: 'slot', id: slotId }); uploadPhotos(true); }
function uploadPhotos(replace = false) {
  if (!replace) { managePhotos(); addPickerPhotos(); return; }
  if (store.cropEditing) finishCrop(true);
  filePurpose = 'replace'; pendingTarget = store.selection;
  if (photosInput.value) { photosInput.value.multiple = false; photosInput.value.click(); }
}
async function onPhotos(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])]; input.value = '';
  if (!files.length) return;
  if (filePurpose === 'stage') await stagePhotos(files);
  else {
    const target = pendingTarget; pendingTarget = undefined;
    await receivePhotos(files.slice(0, 1), target);
  }
}
async function onMedia(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])]; input.value = '';
  if (!files.length) return;
  managePhotos(); await stagePhotos(files);
}
function beginSelection(mode: CollageCreationMode = 'grid') {
  if (busy.value || pickerProcessing.value) return;
  clearStagedPhotos(); pickerIntent.value = 'create'; pickerItems.value = [];
  creationMode.value = mode; creationRatio.value = '1080x1080'; pendingTemplate.value = null;
  pickerError.value = ''; pickerOpen.value = true; addPickerPhotos();
}
function managePhotos() {
  if (store.cropEditing) finishCrop(true);
  clearStagedPhotos(); pendingTemplate.value = null;
  pickerIntent.value = 'manage'; pickerItems.value = placedPhotos.value.slice();
  pickerError.value = ''; pickerOpen.value = true;
}
function addPickerPhotos() {
  filePurpose = 'stage';
  if (photosInput.value) { photosInput.value.multiple = true; photosInput.value.click(); }
}
function clearStagedPhotos() {
  for (const asset of stagedAssets.values()) disposeAsset(asset);
  stagedAssets.clear();
}
async function stagePhotos(files: File[]) {
  if (pickerProcessing.value) return;
  if (pickerItems.value.length + files.length > pickerMax.value) { pickerError.value = pendingTemplate.value ? `这个模板需要 ${pickerMax.value} 张照片，请按照片位置重新选择。` : `一张拼图最多 ${MAX_COLLAGE_PHOTOS} 张照片，请减少选择后重试。`; return; }
  pickerProcessing.value = true; pickerError.value = ''; pickerMessage.value = '正在读取照片…';
  try {
    const items = await importMedia(files, (_value, message) => { pickerMessage.value = message; });
    for (const asset of items) {
      if (asset.kind === 'audio' || asset.kind === 'sticker') { disposeAsset(asset); continue; }
      stagedAssets.set(asset.id, asset);
      pickerItems.value = [...pickerItems.value, { id: `new:${asset.id}`, asset }];
    }
    const failures = getImportFailures(items);
    if (failures.length) pickerError.value = failures.map(item => `${item.name}：${item.message}`).join('；');
  } catch (error) { pickerError.value = errorMessage(error); }
  finally { pickerProcessing.value = false; pickerMessage.value = ''; }
}
function reorderPicker(ids: string[]) {
  const byId = new Map(pickerItems.value.map(item => [item.id, item]));
  if (ids.length !== byId.size || !ids.every(id => byId.has(id))) return;
  pickerItems.value = ids.map(id => byId.get(id)!);
}
function removePickerPhotos(ids: string[]) {
  if (pickerProcessing.value) return;
  const removing = new Set(ids);
  const remaining = pickerItems.value.filter(item => !removing.has(item.id));
  const retainedAssets = new Set(remaining.map(item => item.asset.id));
  for (const item of pickerItems.value) {
    const asset = removing.has(item.id) && !retainedAssets.has(item.asset.id) ? stagedAssets.get(item.asset.id) : undefined;
    if (asset) { disposeAsset(asset); stagedAssets.delete(asset.id); }
  }
  pickerItems.value = remaining;
}
async function confirmPhotos() {
  if (pickerProcessing.value || pickerItems.value.length < pickerRequired.value) return;
  pickerProcessing.value = true; pickerError.value = ''; pickerMessage.value = '正在准备拼图…';
  try {
    if (pickerIntent.value === 'create') {
      await preserveCurrent();
      const [width, height] = creationRatio.value.split('x').map(Number);
      store.initializeCollage(pickerItems.value.map(item => item.asset), { mode: creationMode.value, width: width!, height: height!, ...(pendingTemplate.value ? { template: pendingTemplate.value } : {}) });
    } else store.setCollagePhotos(pickerItems.value.map(item => ({ id: item.id, assetId: item.asset.id })), [...stagedAssets.values()]);
    stagedAssets.clear(); pickerOpen.value = false; view.value = 'editor';
    panel.value = 'layouts'; panelOpen.value = window.innerHeight >= 740; advancedOpen.value = false;
    tool.value = 'select'; cropMode.value = false; playing.value = false;
    await nextTick();
    try { await captureDraft(); } catch (error) { notify(`自动保存失败：${errorMessage(error)}。作品仍可编辑，请保存项目文件备份。`, true); }
  } catch (error) { pickerError.value = errorMessage(error); }
  finally { pickerProcessing.value = false; pickerMessage.value = ''; }
}
watch(pickerOpen, open => { if (!open && !pickerProcessing.value) { clearStagedPhotos(); pickerItems.value = []; } });
async function receivePhotos(files: File[], target?: Selection) {
  await runBusy('正在导入照片与视频', async (_signal, report) => {
    const assets = await importMedia(files, report);
    const visual = assets.filter(asset => asset.kind !== 'audio');
    store.addAssets(assets, target);
    const audio = assets.find(asset => asset.kind === 'audio');
    if (audio && !visual.length) { store.setAudio(audio.id); panel.value = 'audio'; }
    view.value = 'editor'; panelOpen.value = false;
    const failures = getImportFailures(assets);
    notify(failures.length ? `已导入 ${assets.length} 个文件；${failures.map(item => `${item.name}：${item.message}`).join('；')}` : `已导入 ${assets.length} 个文件，原文件只保存在此浏览器。`, failures.length > 0);
  });
}
async function refreshDrafts() {
  const result = await listDrafts();
  for (const draft of drafts.value) URL.revokeObjectURL(draft.url);
  drafts.value = result.map(draft => ({ ...draft, url: URL.createObjectURL(draft.thumbnail) }));
}
async function captureDraft() {
  await nextTick();
  if (view.value !== 'editor' || !canvas.value || playing.value || store.cropEditing) return;
  if (saving) { await saving; if (!store.dirty) return; }
  if (!store.dirty) return;
  const projectId = store.project.id;
  const handle = canvas.value;
  isSaving.value = true;
  saving = (async () => {
    do {
      const revision = store.revision;
      const project = store.snapshot();
      const assets = { ...store.assets };
      const thumbnailCanvas = await handle.renderFrame(0, Math.min(.3, 320 / Math.max(doc.value.width, doc.value.height)));
      let thumbnail: Blob;
      try { thumbnail = await canvasToBlob(thumbnailCanvas, 'image/png'); }
      finally { thumbnailCanvas.width = thumbnailCanvas.height = 0; }
      await saveDraft(project, assets, thumbnail);
      if (store.project.id !== projectId) return;
      store.markSaved(revision);
    } while (store.dirty && view.value === 'editor' && !playing.value && !store.cropEditing);
  })();
  try { await saving; } finally { saving = undefined; isSaving.value = false; }
}
const autoSave = useDebounceFn(async () => {
  if (view.value !== 'editor' || busy.value || playing.value || store.cropEditing || pickerOpen.value || !store.dirty) return;
  try { await captureDraft(); } catch (error) { notify(`草稿保存失败：${errorMessage(error)}。请导出项目文件备份。`, true); }
}, 2000);
watch(() => store.revision, () => autoSave());
async function saveNow() {
  try {
    commitProjectTitle(); if (store.cropEditing) finishCrop(true); playing.value = false;
    await textWork; await captureDraft(); await refreshDrafts();
    notify(textDraft.value.trim() ? '画布草稿已保存；未添加的文案只保留在当前会话。' : '草稿已保存，下次打开可在“我的作品”继续编辑。');
  }
  catch (error) { notify(errorMessage(error), true); }
}
async function preserveCurrent() {
  if (view.value !== 'editor') return;
  commitProjectTitle(); await textWork;
  if (store.dirty || saving) await captureDraft();
}
async function startExample() {
  if (busy.value || exampleLoading.value) return;
  exampleLoading.value = true;
  try {
    const files = await Promise.all(examplePhotos.map(async photo => {
      const response = await fetch(photo.url);
      if (!response.ok) throw new Error('照片无法读取，请稍后重试。');
      return new File([await response.blob()], photo.name, { type: 'image/webp' });
    }));
    clearStagedPhotos(); pickerIntent.value = 'create'; pickerItems.value = [];
    creationMode.value = 'grid'; creationRatio.value = '1080x1350'; pendingTemplate.value = null;
    pickerError.value = ''; pickerOpen.value = true;
    await stagePhotos(files);
  } catch (error) { notify(errorMessage(error), true); }
  finally { exampleLoading.value = false; }
}
async function navigate(target: 'home' | 'templates' | 'drafts') {
  if (busy.value || view.value === target) return;
  if (view.value !== 'editor') { view.value = target; return; }
  try { if (store.cropEditing) finishCrop(false); playing.value = false; await preserveCurrent(); moreOpen.value = false; advancedOpen.value = false; designBrowser.value = null; view.value = target; await refreshDrafts(); }
  catch (error) { notify(`未离开当前作品：${errorMessage(error)}`, true); }
}
function browseTemplates(query = '') {
  templateGallery.value?.resetFilters();
  templateQuery.value = query;
  void navigate('templates');
}
function selectionAction(action: () => void) {
  selectionActionsOpen.value = false;
  action();
}
async function chooseTemplate(template: TemplatePreset) {
  if (busy.value) return;
  if (view.value !== 'editor') {
    clearStagedPhotos(); pickerIntent.value = 'create'; pickerItems.value = [];
    creationMode.value = template.mode; creationRatio.value = `${template.width}x${template.height}`;
    pendingTemplate.value = template; pickerError.value = ''; pickerOpen.value = true; addPickerPhotos(); return;
  }
  try {
    if (store.cropEditing) finishCrop(true);
    playing.value = false; store.applyTemplate(template); advancedOpen.value = false; tool.value = 'select';
    notify('模板已应用。');
  } catch (error) { notify(errorMessage(error), true); }
}
function confirmPoster() {
  const template = pendingPoster.value;
  if (!template || busy.value) return;
  try {
    if (store.cropEditing) finishCrop(true);
    playing.value = false; store.applyTemplate(template); tool.value = 'select';
    pendingPoster.value = null; panelOpen.value = false; designBrowser.value = null;
    notify('海报已应用。照片紧密拼接，标题与装饰可继续编辑；可一步撤销。');
  } catch (error) { notify(errorMessage(error), true); }
}
async function openDraft(id: string) {
  await runBusy('正在恢复原始素材', async () => {
    const resume = store.project.id === id;
    const selection = resume ? store.selection : null;
    const result = await loadDraft(id);
    store.restore(result.project, result.assets, 'saved'); view.value = 'editor';
    if (resume) store.select(selection);
    else { panel.value = 'layouts'; panelOpen.value = window.innerHeight >= 740; }
    moreOpen.value = false; advancedOpen.value = false; playing.value = false; tool.value = 'select'; cropMode.value = false;
  });
}
async function removeDraft() {
  const id = pendingDraftId.value; deleteDraftOpen.value = false;
  try { await deleteDraft(id); await refreshDrafts(); notify('草稿已删除。'); }
  catch (error) { notify(errorMessage(error), true); }
}
async function saveProjectFile() {
  commitProjectTitle(); await textWork;
  await runBusy('正在打包可编辑项目', async (_signal, report) => {
    if (store.cropEditing) finishCrop(true);
    report(.1, '打包所有页面与原始照片、视频、音乐…');
    const blob = await exportProject(store.snapshot(), store.assets);
    const saved = await saveExportFile(blob, `${safeName(store.project.title)}.collage`);
    if (saved !== 'cancelled') notify(saved === 'saved' ? '可编辑项目已保存，可在其他设备导入继续编辑。' : '项目文件已生成，可在其他浏览器导入继续编辑。');
  });
}
async function openProjectFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = ''; if (!file) return;
  try { await preserveCurrent(); }
  catch (error) { notify(`未替换当前作品：${errorMessage(error)}`, true); return; }
  await runBusy('正在读取可编辑项目', async () => {
    const result = await importProject(file);
    result.project.id = crypto.randomUUID();
    store.restore(result.project, result.assets, 'unsaved'); view.value = 'editor'; panel.value = 'layouts'; panelOpen.value = window.innerHeight >= 740; moreOpen.value = false; advancedOpen.value = false; playing.value = false; tool.value = 'select'; cropMode.value = false; notify('全部页面与原始素材已恢复。');
    await nextTick();
    await captureDraft();
  });
}
function safeName(value: string) { return value.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '我的拼贴'; }
async function saveExportFile(blob: Blob, filename: string): Promise<'saved' | 'cancelled' | 'download-started'> {
  if (nativeApp) return saveNativeFile(blob, filename);
  downloadBlob(blob, filename);
  return 'download-started';
}
function selectedCropTarget() {
  if (store.selectedSlot) { const outer = slotRect(doc.value, store.selectedSlot), asset = store.selectedSlot.assetId ? store.assets[store.selectedSlot.assetId] : undefined; return { kind: 'slot' as const, id: store.selectedSlot.id, ...photoFrameGeometry(outer.width, outer.height, doc.value.photoFrame, asset?.width, asset?.height) }; }
  if (store.selected?.type === 'image') {
    const asset = store.assets[store.selected.assetId], photo = store.selected;
    const frame = asset?.kind === 'sticker' ? photo : photoFrameGeometry(photo.width, photo.height, doc.value.photoFrame, asset?.width, asset?.height);
    return { kind: 'element' as const, id: photo.id, width: frame.width, height: frame.height };
  }
  return null;
}
async function smartCrop() {
  const target = selectedCropTarget(); const asset = store.selectedAsset;
  if (!target || !asset || asset.kind === 'video') { notify('请先选择一张照片，再使用智能构图。'); return; }
  await runBusy('正在分析照片构图', async () => {
    const image = new Image(); image.src = asset.src; await image.decode();
    const result = await smartcrop.crop(image, { width: Math.round(target.width), height: Math.round(target.height) });
    const region = result.topCrop;
    const cover = Math.max(target.width / asset.width, target.height / asset.height);
    const scale = Math.max(target.width / region.width, target.height / region.height);
    const excessX = (asset.width * scale - target.width) / 2, excessY = (asset.height * scale - target.height) / 2;
    store.changeCrop({ kind: target.kind, id: target.id, crop: { ...createCrop(), zoom: Math.max(1, scale / cover), x: excessX > .01 ? Math.max(-1, Math.min(1, (asset.width / 2 - region.x - region.width / 2) * scale / excessX)) : 0, y: excessY > .01 ? Math.max(-1, Math.min(1, (asset.height / 2 - region.y - region.height / 2) * scale / excessY)) : 0 } });
    notify('已根据显著性分析调整构图，可继续手动微调。');
  });
}
async function cutout(model: CutoutModelKind) {
  const asset = store.selectedAsset;
  if (!asset) { notify('请先选择需要抠图的照片。'); return; }
  await runBusy(model === 'portrait' ? '本地人像抠图' : '本地主体抠图', async (signal, report) => {
    const blob = await removeBackground(asset, model, report, signal);
    if (signal.aborted) throw new DOMException('操作已取消。', 'AbortError');
    const replacement = await createAsset(blob, `${asset.name.replace(/\.[^.]+$/, '')}-抠图.png`);
    store.replaceSelectedAsset(replacement); notify('已替换为透明 PNG，原照片仍保留在素材库。');
  }, true);
}
let textActionGeneration = 0;
function handleAction(action: PanelAction) {
  if (busy.value) return;
  const textEdit = action.type === 'element' && 'text' in action.patch;
  if (textPending.value && !textEdit && action.type !== 'checkpoint') return;
  const fontAction = action.type === 'addText' || action.type === 'textStyle' || action.type === 'textPair';
  if (!fontAction) return applyPanelAction(action);
  textPending.value = true;
  textWork = applyPanelAction(action).finally(() => { textPending.value = false; textWork = undefined; });
  return textWork;
}
async function applyPanelAction(action: PanelAction) {
  const generation = action.type === 'element' && 'text' in action.patch || action.type === 'checkpoint' ? textActionGeneration : ++textActionGeneration;
  const pageId = doc.value.id;
  try {
    switch (action.type) {
      case 'document': if (action.patch.mode) store.setMode(action.patch.mode); else store.updateDocument(action.patch, action.commit ?? true); break;
      case 'element': store.updateSelected(action.patch, action.commit ?? true); break;
      case 'slot': store.updateSlot(action.patch, action.commit ?? true); break;
      case 'layout': store.applyLayout(action.layout); break;
      case 'mainPhoto': store.setMainPhoto(action.target); notify('已更换海报主图，保留全部照片与海报排版。'); break;
      case 'poster': pendingPoster.value = action.template; break;
      case 'look': applyLook(action.look); break;
      case 'tone': store.updateDocument({ slots: doc.value.slots.map(slot => ({ ...slot, filter: action.filter })), elements: doc.value.elements.map(element => element.type === 'image' && store.assets[element.assetId]?.kind !== 'sticker' ? { ...element, filter: action.filter } : element) }); break;
      case 'template': await chooseTemplate(action.template); break;
      case 'sticker': await store.addSticker(action.sticker); advancedOpen.value = false; break;
      case 'asset': store.placeAsset(action.assetId); break;
      case 'upload': uploadPhotos(); break;
      case 'replace': uploadPhotos(true); break;
      case 'addText': {
        const style = action.style ?? photoTextStyles[0]!;
        const submittedDraft = textDraft.value;
        const submittedRevision = textDraftRevision;
        await ensureTextFont({ text: action.text ?? style.sample, fontFamily: style.fontFamily, fontStyle: style.fontStyle });
        if (generation !== textActionGeneration || pageId !== doc.value.id) break;
        store.addText(action.text, style, canvas.value?.measureTextHeight); openPhotoText();
        if (textDraftRevision === submittedRevision && textDraft.value === submittedDraft && submittedDraft === action.text) textDraft.value = '';
        break;
      }
      case 'textStyle': {
        const text = store.selected;
        if (text?.type !== 'text') break;
        await ensureTextFont({ text: text.text, fontFamily: action.style.fontFamily, fontStyle: action.style.fontStyle });
        if (generation !== textActionGeneration || pageId !== doc.value.id || store.selected?.id !== text.id) break;
        store.applyTextStyle(action.style, canvas.value?.measureTextHeight);
        break;
      }
      case 'textPosition': {
        const id = store.selected?.type === 'text' ? store.selected.id : null;
        if (!id) break;
        const bounds = await canvas.value?.elementBounds(id);
        if (store.selected?.id === id) store.positionText(action.position, bounds?.height);
        break;
      }
      case 'textPair': {
        await Promise.all([ensureTextFont({ text: action.pair.title, fontFamily: action.pair.heading, fontStyle: 'bold' }), ensureTextFont({ text: action.pair.subtitle, fontFamily: action.pair.body, fontStyle: 'normal' })]);
        if (generation !== textActionGeneration || pageId !== doc.value.id) break;
        store.addTextPair(action.pair, canvas.value?.measureTextHeight); openPhotoText();
        break;
      }
      case 'selection': store.select(action.selection); break;
      case 'editText': openText(action.id); break;
      case 'addShape': store.addShape(action.shape); tool.value = 'select'; cropMode.value = false; advancedOpen.value = false; break;
      case 'backgroundAsset': store.updateDocument({ background: { ...doc.value.background, assetId: action.assetId } }); break;
      case 'remove': store.deleteSelected(); break;
      case 'duplicate': store.duplicateSelected(); break;
      case 'layer': store.moveLayer(action.direction); break;
      case 'select':
        store.select({ kind: doc.value.slots.some(slot => slot.id === action.id) ? 'slot' : 'element', id: action.id });
        if (panel.value !== 'layers') advancedOpen.value = false;
        break;
      case 'resetCrop': store.resetCrop(); break;
      case 'smartCrop': await smartCrop(); break;
      case 'cutout': await cutout(action.model); break;
      case 'swap': if (store.selectedSlot) { swapFirst.value = store.selectedSlot.id; panelOpen.value = false; advancedOpen.value = false; notify('请点击另一个格子，交换两张照片。'); } break;
      case 'checkpoint': store.checkpoint(); break;
      case 'tool': tool.value = action.tool; cropMode.value = false; advancedOpen.value = false; break;
      case 'brush': if (action.color) brushColor.value = action.color; if (action.size) brushSize.value = action.size; if (action.highlighter !== undefined) highlighter.value = action.highlighter; break;
      case 'uploadAudio': audioInput.value?.click(); break;
      case 'clearAudio': store.setAudio(null); break;
    }
  } catch (error) { notify(errorMessage(error), true); }
}
async function onAudio(event: Event) {
  const input = event.target as HTMLInputElement; const files = [...(input.files ?? [])]; input.value = ''; if (!files.length) return;
  await runBusy('正在导入背景音乐', async (_signal, report) => {
    const items = await importMedia(files, report); store.addAssets(items); const music = items.find(item => item.kind === 'audio');
    if (!music) throw new Error('请选择包含有效音轨的音频文件。');
    store.setAudio(music.id); panel.value = 'audio'; advancedOpen.value = true;
  });
}
function draw(change: DrawingChange) { store.addDrawing(highlighter.value && change.tool === 'pen' ? { ...change, tool: 'highlighter' } : change); }
function openText(id: string) { store.select({ kind: 'element', id }); if (store.selected?.type === 'text' && !store.selected.locked) { textValue.value = store.selected.text; textOpen.value = true; } }
function applyText() { store.updateSelected({ text: textValue.value }); textOpen.value = false; }
function applySize() {
  const long = doc.value.layoutId.startsWith('long-');
  if (!Number.isInteger(customWidth.value) || customWidth.value < 160 || customWidth.value > 4096 || (!long && (!Number.isInteger(customHeight.value) || customHeight.value < 160 || customHeight.value > 4096))) { notify('画布宽高必须为 160–4096 的整数像素。', true); return; }
  try { store.updateDocument(long ? { width: customWidth.value } : { width: customWidth.value, height: customHeight.value }); sizeOpen.value = false; }
  catch (error) { notify(errorMessage(error), true); }
}
function openSize() {
  customWidth.value = Math.round(doc.value.width); customHeight.value = Math.round(doc.value.height);
  moreOpen.value = false; sizeOpen.value = true;
}
function pagePreview(page: EditorDocument) {
  const id = page.mode === 'grid' ? page.slots.find(slot => slot.assetId)?.assetId : page.elements.find(element => element.type === 'image' && element.assetId)?.type === 'image' ? (page.elements.find(element => element.type === 'image' && element.assetId) as { assetId: string }).assetId : null;
  return id ? store.assets[id]?.thumbnail : null;
}
function addPage(duplicate = false) { playing.value = false; store.addPage(duplicate); panelOpen.value = false; }
function selectPage(id: string) { playing.value = false; store.selectPage(id); cropMode.value = false; }
function deletePage() { store.deletePage(pendingPageId.value); deletePageOpen.value = false; }
function togglePlaying() { panelOpen.value = false; tool.value = 'select'; playing.value = !playing.value; }
function syncMusic() {
  const player = musicPlayer.value; const audio = doc.value.audio;
  if (!player || !audio) return;
  player.volume = Math.max(0, Math.min(1, audio.volume));
  if (playing.value) { player.currentTime = Math.max(0, audio.start); void player.play().catch(() => notify('浏览器阻止了音乐预览，请再次点击播放。')); }
  else player.pause();
}
function musicTimeUpdate() { const player = musicPlayer.value; const audio = doc.value.audio; if (player && audio && audio.end !== null && player.currentTime >= audio.end) { player.currentTime = audio.start; if (playing.value) void player.play(); } }
const { pause: pauseSlideshow, resume: resumeSlideshow } = useIntervalFn(() => {
  if (!playing.value || !previewAllPages.value) return;
  let time = ((performance.now() - previewStarted) / 1000) % totalDuration.value;
  const page = store.project.pages.find(item => { if (time < item.duration) return true; time -= item.duration; return false; });
  if (page && page.id !== doc.value.id) store.selectPage(page.id);
}, 80, { immediate: false });
watch(playing, async value => {
  if (value) { previewStarted = performance.now(); previewOriginalPage = doc.value.id; if (previewAllPages.value) { store.selectPage(store.project.pages[0]!.id); resumeSlideshow(); } }
  else { pauseSlideshow(); if (previewAllPages.value && previewOriginalPage) store.selectPage(previewOriginalPage); autoSave(); }
  await nextTick(); syncMusic();
});
watch(() => doc.value.id, async () => { await nextTick(); syncMusic(); });
async function openExport() {
  commitProjectTitle(); await textWork;
  if (store.cropEditing) finishCrop(true);
  playing.value = false; exportFps.value = doc.value.fps;
  exportScale.value = Math.min(2, Math.max(.5, Math.floor(maxExportScale.value)));
  clearExportResult(); exportOpen.value = true; exportPreviewLoading.value = true;
  const generation = ++previewGeneration;
  try {
    await nextTick();
    const handle = canvas.value; if (!handle) throw new Error('画布尚未就绪。');
    const frame = await handle.renderFrame(0, Math.min(.5, 640 / Math.max(doc.value.width, doc.value.height)));
    const blob = await canvasToBlob(frame, 'image/png'); frame.width = frame.height = 0;
    if (generation !== previewGeneration || !exportOpen.value) return;
    if (exportPreview.value) URL.revokeObjectURL(exportPreview.value);
    exportPreview.value = URL.createObjectURL(blob);
  } catch (error) { if (generation === previewGeneration) notify(errorMessage(error), true); }
  finally { if (generation === previewGeneration) exportPreviewLoading.value = false; }
}
function clearExportResult() { if (exportResult.value) URL.revokeObjectURL(exportResult.value.url); exportResult.value = null; }
async function generateExport() {
  clearExportResult();
  await runBusy('正在生成高清作品', async (signal, report) => {
    const handle = canvas.value; if (!handle) throw new Error('画布尚未就绪，请稍后重试。');
    const originalPage = doc.value.id; const pageList = store.project.pages.slice(); const outputDocument = JSON.parse(JSON.stringify(doc.value)) as EditorDocument;
    const allPages = isAnimatedExport.value && exportAllPages.value && pageList.length > 1;
    let total = 0;
    const segments = (allPages ? pageList : [doc.value]).map(page => { const segment = { document: page, start: total, duration: page.duration }; total += page.duration; return segment; });
    const renderer: ExportFrameRenderer = async (time, scale = 1) => {
      const segment = segments.find(item => time >= item.start && time < item.start + item.duration) ?? segments[segments.length - 1]!;
      if (doc.value.id !== segment.document.id) { store.selectPage(segment.document.id); await nextTick(); }
      const frame = await handle.renderFrame(Math.max(0, time - segment.start), scale);
      const width = Math.round(outputDocument.width * scale), height = Math.round(outputDocument.height * scale);
      if (frame.width === width && frame.height === height) return frame;
      const fitted = document.createElement('canvas'); fitted.width = width; fitted.height = height;
      const context = fitted.getContext('2d'); if (!context) throw new Error('无法创建幻灯片画布。');
      context.fillStyle = outputDocument.background.color; context.fillRect(0, 0, width, height);
      const ratio = Math.min(width / frame.width, height / frame.height); context.drawImage(frame, (width - frame.width * ratio) / 2, (height - frame.height * ratio) / 2, frame.width * ratio, frame.height * ratio); frame.width = frame.height = 0;
      return fitted;
    };
    renderer.audioSegments = segments;
    try {
      const blob = await exportComposition(outputDocument, store.assets, renderer, { format: exportFormat.value, scale: exportScale.value, quality: exportQuality.value, duration: total, fps: exportFps.value }, report, signal);
      if (signal.aborted) throw new DOMException('导出已取消。', 'AbortError');
      clearExportResult();
      const extension = exportFormat.value === 'jpeg' ? 'jpg' : exportFormat.value;
      exportResult.value = { blob, url: URL.createObjectURL(blob), name: `${safeName(store.project.title)}.${extension}` };
      notify(nativeApp ? '作品已生成，可以选择文件保存位置。' : '作品已生成，可下载或使用系统分享。');
    } finally { store.selectPage(originalPage); await nextTick(); handle.resetPreview(); }
  }, true);
}
async function downloadResult() {
  const result = exportResult.value;
  if (!result) return;
  const save = async () => {
    const saved = await saveExportFile(result.blob, result.name);
    if (saved === 'saved') notify('文件已保存到你选择的位置。');
    else if (saved === 'download-started') notify(isAnimatedExport.value ? '已发起文件下载，请在浏览器下载列表查看。' : '已发起图片下载；手机也可长按预览保存。');
  };
  if (nativeApp) await runBusy('正在保存文件', save);
  else await save();
}
async function saveImage() {
  if (!exportResult.value) await generateExport();
  if (exportResult.value) await downloadResult();
}
watch(exportOpen, open => {
  if (!open) { ++previewGeneration; exportPreviewLoading.value = false; if (exportPreview.value) URL.revokeObjectURL(exportPreview.value); exportPreview.value = ''; }
});
async function shareResult() { if (!exportResult.value) return; try { if (!await shareBlob(exportResult.value.blob, exportResult.value.name)) notify('此浏览器没有文件分享入口，请下载保存；手机可长按预览图片保存。'); } catch (error) { notify(errorMessage(error), true); } }
async function exportPages() {
  await runBusy('正在导出全部页面', async (signal, report) => {
    const handle = canvas.value; if (!handle) throw new Error('画布尚未就绪。');
    const originalPage = doc.value.id; const files: Record<string, Uint8Array> = {};
    try {
      for (const [index, page] of store.project.pages.entries()) {
        if (signal.aborted) throw new DOMException('导出已取消。', 'AbortError');
        store.selectPage(page.id); await nextTick();
        const frame = await handle.renderFrame(0, exportScale.value); const blob = await canvasToBlob(frame, 'image/png'); frame.width = frame.height = 0;
        files[`${String(index + 1).padStart(2, '0')}-${safeName(page.title)}.png`] = new Uint8Array(await blob.arrayBuffer()); report((index + 1) / store.project.pages.length, `正在导出第 ${index + 1} 页`);
      }
      const bytes = zipSync(files, { level: 0 });
      const saved = await saveExportFile(new Blob([bytes], { type: 'application/zip' }), `${safeName(store.project.title)}-全部页面.zip`);
      if (saved === 'saved') notify('全部页面已保存为 ZIP 文件。');
    } finally { store.selectPage(originalPage); await nextTick(); handle.resetPreview(); }
  }, true);
}
useEventListener(window, 'keydown', event => {
  if (event.defaultPrevented || busy.value || pickerOpen.value || advancedOpen.value || designBrowser.value || pendingPoster.value || moreOpen.value || selectionActionsOpen.value || pageActionsOpen.value || exportOpen.value || textOpen.value || sizeOpen.value || deleteDraftOpen.value || deletePageOpen.value || view.value !== 'editor') return;
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); void saveNow(); return; }
  if (textPending.value) return;
  const target = event.target as HTMLElement | null;
  if (store.cropEditing) { if (event.key === 'Escape') { event.preventDefault(); finishCrop(false); } return; }
  if (target?.closest('input,textarea,select,[role="combobox"],[role="listbox"],[role="dialog"]') || target?.isContentEditable) return;
  if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? store.redo() : store.undo(); }
  else if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); store.redo(); }
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); store.deleteSelected(); }
  else if (event.key === 'Escape') { store.select(null); tool.value = 'select'; cropMode.value = false; swapFirst.value = null; panelOpen.value = false; }
});
function dropFiles(event: DragEvent) {
  event.preventDefault(); if (busy.value || pickerProcessing.value) return;
  const files = [...(event.dataTransfer?.files ?? [])]; if (!files.length) return;
  if (!pickerOpen.value) { if (view.value === 'editor') managePhotos(); else { clearStagedPhotos(); pickerItems.value = []; pendingTemplate.value = null; pickerIntent.value = 'create'; pickerOpen.value = true; } }
  void stagePhotos(files);
}

type AppView = 'home' | 'templates' | 'drafts' | 'editor';
let routeReady = false;
let handlingBack = false;
const overlay = computed(() => pickerOpen.value ? 'photos' : templatePreviewOpen.value ? 'template-preview' : pendingPoster.value ? 'poster' : exportOpen.value ? 'export' : textOpen.value ? 'text' : sizeOpen.value ? 'size' : deleteDraftOpen.value ? 'delete-draft' : deletePageOpen.value ? 'delete-page' : advancedOpen.value ? 'advanced' : designBrowser.value ? `design-${designBrowser.value}` : selectionActionsOpen.value ? 'selection-actions' : pageActionsOpen.value ? 'page-actions' : moreOpen.value ? 'more' : cropMode.value ? 'crop' : null);
watch([view, () => store.project.id, overlay], ([nextView, id, nextOverlay]) => {
  if (!routeReady || handlingBack) return;
  const previous = window.history.state;
  const state = { collageView: nextView, projectId: id, mainTab: mainTab.value, overlay: nextOverlay };
  const url = nextView === 'editor' ? `#/edit/${id}` : `#/${nextView === 'home' ? 'create' : nextView}`;
  if (nextView !== 'editor' && !nextOverlay && !previous?.overlay) window.history.replaceState(state, '', url);
  else if (previous?.collageView === nextView && previous?.projectId === id) {
    if (previous.overlay && !nextOverlay) window.history.back();
    else if (previous.overlay || !nextOverlay) window.history.replaceState(state, '', url);
    else window.history.pushState(state, '', url);
  } else if (previous?.overlay) window.history.replaceState(state, '', url);
  else window.history.pushState(state, '', url);
});
useEventListener(window, 'popstate', async event => {
  if (!routeReady || handlingBack) return;
  handlingBack = true;
  try {
    if (pickerProcessing.value || busy.value) { window.history.go(1); return; }
    templateGallery.value?.closePreview();
    pendingPoster.value = null;
    pickerOpen.value = false; exportOpen.value = false; advancedOpen.value = false; moreOpen.value = false; selectionActionsOpen.value = false; pageActionsOpen.value = false;
    textOpen.value = false; sizeOpen.value = false; deleteDraftOpen.value = false; deletePageOpen.value = false; designBrowser.value = null;
    if (store.cropEditing) finishCrop(false);
    if (mainTabs.includes(event.state?.mainTab)) mainTab.value = event.state.mainTab;
    const target = event.state?.collageView as AppView | undefined;
    if (target === 'editor') {
      if (event.state.projectId !== store.project.id) { await preserveCurrent(); await openDraft(event.state.projectId); }
      else view.value = 'editor';
    } else if (target === 'home' || target === 'templates' || target === 'drafts') { await preserveCurrent(); view.value = target; await refreshDrafts(); }
    else { await preserveCurrent(); view.value = 'home'; }
    window.history.replaceState({ collageView: view.value, projectId: store.project.id, mainTab: mainTab.value, overlay: null }, '', view.value === 'editor' ? `#/edit/${store.project.id}` : `#/${view.value === 'home' ? 'create' : view.value}`);
  } catch (error) { notify(`返回失败：${errorMessage(error)}。当前作品仍保留。`, true); }
  finally { await nextTick(); handlingBack = false; }
});
useEventListener(window, 'native-link-error', event => notify(errorMessage((event as CustomEvent<string>).detail), true));
onMounted(async () => {
  removeNativeLinkHandler = installNativeLinkHandler();
  syncViewport();
  const restoredTab = window.history.state?.mainTab;
  if (mainTabs.includes(restoredTab)) mainTab.value = restoredTab;
  try {
    await refreshDrafts();
    const match = window.location.hash.match(/^#\/edit\/([a-zA-Z0-9-]+)$/);
    if (match && drafts.value.some(draft => draft.id === match[1])) await openDraft(match[1]!);
    else if (window.location.hash === '#/drafts') view.value = 'drafts';
    else if (window.location.hash === '#/templates') view.value = 'templates';
  } catch (error) { notify(`作品存储不可用：${errorMessage(error)}。仍可编辑和导出图片。`, true); }
  finally {
    await nextTick(); routeReady = true;
    window.history.replaceState({ collageView: view.value, projectId: store.project.id, mainTab: mainTab.value, overlay: null }, '', view.value === 'editor' ? `#/edit/${store.project.id}` : `#/${view.value === 'home' ? 'create' : view.value}`);
  }
});
onBeforeUnmount(() => {
  removeNativeLinkHandler?.();
  clearTimeout(toastTimer); abortController?.abort(); clearExportResult(); clearStagedPhotos();
  document.documentElement.style.removeProperty('--visible-height');
  document.documentElement.style.removeProperty('--visible-top');
  if (exportPreview.value) URL.revokeObjectURL(exportPreview.value);
  for (const draft of drafts.value) URL.revokeObjectURL(draft.url);
});
</script>

<template>
  <input ref="photosInput" class="hidden-input" type="file" accept="image/*,.heic,.heif" multiple aria-label="上传照片" @change="onPhotos" />
  <input ref="mediaInput" class="hidden-input" type="file" accept="video/*,image/gif" multiple aria-label="导入视频或动画" @change="onMedia" />
  <input ref="audioInput" class="hidden-input" type="file" accept="audio/*,.m4a,.wav,.mp3,.ogg" aria-label="上传背景音乐" @change="onAudio" />
  <input ref="projectInput" class="hidden-input" type="file" :accept="nativeApp ? undefined : '.collage,.zip'" aria-label="导入可编辑项目" @change="openProjectFile" />
  <Transition name="toast"><div v-if="toast" class="toast" :class="{ error: toast.error }" role="status"><Info v-if="toast.error" :size="18" /><CheckCircle2 v-else :size="18" />{{ toast.message }}</div></Transition>

  <div v-show="view !== 'editor'" class="app-shell" :style="{ '--page-direction': tabDirection }">
    <header class="app-header">
      <button class="brand" aria-label="拼贴时光首页" @click="navigate('home')"><span class="brand-symbol"><Layers :size="23" /></span><strong>拼贴时光</strong></button>
      <nav class="header-nav" aria-label="主导航"><button :class="{ active: view === 'home' }" @click="navigate('home')">拼图</button><button :class="{ active: view === 'templates' }" @click="navigate('templates')">模板</button><button :class="{ active: view === 'drafts' }" @click="navigate('drafts')">作品</button></nav>
      <div class="app-header-actions"><a class="icon-button" aria-label="素材与许可" :href="thirdPartyNoticesUrl" target="_blank" rel="noopener noreferrer"><Info :size="20" /></a><button class="icon-button" aria-label="导入项目文件" title="导入项目文件" @click="projectInput?.click()"><FolderOpen :size="21" /></button></div>
    </header>
    <PwaStatus :allow-update="view !== 'editor' && !busy && !isSaving && !textPending && !textDraft.trim() && !store.dirty && !overlay" />
    <main class="app-content" @dragover.prevent @drop="dropFiles">
      <section v-show="view === 'home'" class="app-page" data-page="home" :class="{ 'is-current': view === 'home' }">
        <HomeScreen :photos="examplePhotos" :drafts="drafts" :disabled="!!busy || pickerProcessing || textPending" :example-loading="exampleLoading" :registration-number="registrationNumber" @start="beginSelection" @sample="startExample" @browse="browseTemplates" @draft="openDraft" @preview="(template, event) => templateGallery?.openPreview(template, event)" @works="navigate('drafts')" />
      </section>
      <section v-show="view === 'templates'" class="app-page" data-page="templates" :class="{ 'is-current': view === 'templates' }">
        <div class="library-heading"><div><h1>模板</h1><p>先看真实效果，再放入你的照片。</p></div><input v-model="templateQuery" class="search-field" type="search" placeholder="搜索模板" aria-label="搜索模板" /></div>
        <TemplateGallery ref="templateGallery" v-model:query="templateQuery" :disabled="!!busy" @preview="templatePreviewOpen = $event" @select="chooseTemplate" />
      </section>
      <section v-show="view === 'drafts'" class="app-page" data-page="drafts" :class="{ 'is-current': view === 'drafts' }">
        <div class="library-heading"><div><h1>我的作品</h1><p>{{ drafts.length }} 份拼图 · 点击继续编辑</p></div><button class="secondary-button" @click="projectInput?.click()"><FolderOpen :size="18" />导入项目</button></div>
        <div v-if="!drafts.length" class="empty-state"><FolderOpen :size="40" /><h2>还没有作品</h2><p>从几张喜欢的照片开始。</p><button class="primary-button" @click="beginSelection('grid')"><Plus :size="18" />开始拼图</button></div>
        <div v-else class="draft-grid">
          <article v-for="draft in drafts" :key="draft.id" class="draft-card">
            <button class="draft-open" :aria-label="`打开作品 ${draft.title}`" @click="openDraft(draft.id)"><img :src="draft.url" :alt="draft.title" loading="lazy" /></button>
            <div class="draft-detail"><div><strong>{{ draft.title }}</strong><small>{{ draft.pageCount }} 页 · {{ new Date(draft.updatedAt).toLocaleDateString('zh-CN') }}</small></div><button class="icon-button" :aria-label="`删除作品 ${draft.title}`" @click="pendingDraftId = draft.id; deleteDraftOpen = true"><Trash2 :size="20" /></button></div>
          </article>
        </div>
      </section>
    </main>
    <AppTabBar :active="mainTab" @select="navigate" />
  </div>

  <main v-if="view === 'editor'" class="editor-view" :class="{ 'crop-session': cropMode, 'inline-crop-session': inlineCropMode, 'keyboard-open': keyboardOpen }" @dragover.prevent @drop="dropFiles">
    <header class="editor-header">
      <template v-if="cropMode"><button class="text-button" @click="finishCrop(false)">取消</button><h1>全屏精修</h1><button class="text-button accent-text" @click="finishCrop(true)">完成</button></template>
      <template v-else>
        <button class="icon-button" aria-label="返回" :disabled="store.cropEditing" @click="navigate(mainTab)"><ArrowLeft :size="23" /></button>
        <div class="editor-project"><input v-model="projectTitle" class="project-title" aria-label="作品名称" maxlength="80" :disabled="store.cropEditing" @focus="titleEditing = true" @blur="commitProjectTitle" @keydown.enter="event => { if (!event.isComposing) (event.target as HTMLInputElement).blur(); }" /><span class="save-status">{{ inlineCropMode ? '正在原位调整照片' : isSaving ? '正在保存…' : textPending ? '正在准备文字…' : store.dirty || projectTitle !== store.project.title ? '未保存' : textDraft.trim() ? '文案待添加' : '已保存' }}</span></div>
        <div class="editor-header-actions"><button class="icon-button" aria-label="撤销" :disabled="!store.canUndo || store.cropEditing || !!busy || textPending" @click="store.undo()"><Undo2 :size="21" /></button><button class="icon-button" aria-label="重做" :disabled="!store.canRedo || store.cropEditing || !!busy || textPending" @click="store.redo()"><Redo2 :size="21" /></button><button class="primary-button" :disabled="store.cropEditing" @click="openExport">保存<Download :size="17" /></button></div>
      </template>
    </header>
    <div class="editor-body" :class="{ 'panel-open': panelOpen && !cropMode, 'text-open': panelOpen && panel === 'text' && !cropMode }">
      <section class="workspace">
        <div class="canvas-topline"><span>{{ cropMode ? '拖动平移 · 双指缩放' : `${photoCount} 张照片` }}</span><div v-if="!cropMode" class="crop-preview-select"><AppSelect :value="cropPreview" :options="cropPreviewOptions" label="微信裁切预览" :disabled="store.cropEditing" @change="value => cropPreview = String(value)" /></div><button v-if="!cropMode" class="quiet-button" :disabled="store.cropEditing" @click="choosePanel('background')">{{ doc.layoutId.startsWith('long-') ? '长图' : `${Math.round(doc.width)} × ${Math.round(doc.height)}` }}<ChevronDown :size="14" /></button></div>
        <div class="context-actions" :class="{ 'inline-crop-actions': inlineCropMode, 'has-selection': !!store.selection && !inlineCropMode }">
          <template v-if="inlineCropMode && crop"><span class="selection-label">取景</span><button aria-label="缩小照片取景" @click="adjustCrop({ zoom: Math.max(1, crop.zoom - .2) })">−</button><span class="selection-label">{{ crop.zoom.toFixed(1) }}×</span><button aria-label="放大照片取景" @click="adjustCrop({ zoom: Math.min(8, crop.zoom + .2) })">+</button><button @click="finishCrop(false)">取消</button><button class="accent-text" @click="finishCrop(true)">完成</button></template>
          <template v-else-if="swapFirst"><span class="selection-label">点另一张照片交换位置</span><button @click="swapFirst = null">取消交换</button></template>
          <template v-else-if="store.selection">
            <button v-if="canAdjustPhoto" @click="store.selectedAsset?.kind === 'image' ? beginInlineCrop(store.selection) : beginCrop(store.selection)"><Move :size="16" />取景</button>
            <button v-if="canAdjustPhoto" @click="openPhotoText"><Type :size="16" />加字</button>
            <template v-if="store.selected?.type === 'text'"><button :disabled="store.selected.locked" @click="openText(store.selected.id)"><Type :size="16" />改文字</button><button @click="openPhotoText"><Palette :size="16" />字样</button></template>
            <template v-if="store.selected?.type === 'shape'"><button @click="openShapeEditor"><Palette :size="16" />编辑形状</button><button :disabled="store.selected.locked" aria-label="删除所选形状，可撤销" @click="handleAction({ type: 'remove' })"><Trash2 :size="16" />删除</button></template>
            <button aria-label="更多所选元素操作" @click="selectionActionsOpen = true"><MoreHorizontal :size="18" />更多</button>
            <button class="selection-done" @click="store.select(null)">完成</button>
          </template>
          <template v-else><span class="selection-label">长按调整取景 · 点选编辑</span><button @click="managePhotos"><Images :size="16" />整理照片</button></template>
        </div>
        <div class="canvas-stage"><EditorCanvas ref="canvas" :document="canvasDocument" :assets="store.assets" :selection="canvasSelection" :tool="tool" :brush-color="brushColor" :brush-size="brushSize" :brush-opacity="highlighter ? .4 : 1" :crop-mode="cropMode" :inline-crop-mode="inlineCropMode" :inline-disabled="inlineDisabled" :playing="playing" @select="select" @transform="store.transform" @crop="changeCanvasCrop" @inline-start="beginInlineCrop" @inline-end="endInlineCrop" @draw="draw" @request-asset="requestAsset" @edit-text="openText" @error="message => notify(message, true)"><CanvasCropPreview v-if="cropPreview !== 'off' && !cropMode" :width="doc.width" :height="doc.height" :ratio="Number(cropPreview)" /></EditorCanvas><button v-if="!photoCount && !doc.elements.length" class="canvas-empty-prompt" @click="managePhotos"><ImagePlus :size="27" /><strong>添加照片</strong></button></div>
        <p class="canvas-caption">{{ swapFirst ? '交换的是照片位置，不是照片内的取景' : tool !== 'select' ? '在画布上绘制' : store.cropEditing ? '拖动平移 · 双指缩放 · 只调整所选照片' : store.selected?.type === 'text' ? '拖动摆放 · 点「改文字」编辑 · 控点缩放和旋转' : panel === 'text' && panelOpen ? '点照片选择加字位置 · 照片排版保持不变' : doc.mode === 'grid' ? '长按照片调整取景 · 点选后可交换位置' : '拖动摆放 · 长按调整取景 · 控点缩放和旋转' }}</p>
        <p v-if="cropPreview !== 'off' && !cropMode" class="crop-preview-note">模拟居中裁切，不参与导出；不同微信入口的裁切规则不同，以实际界面为准。</p>
        <div v-if="store.project.pages.length > 1 && !cropMode" class="page-strip" aria-label="作品页面"><button v-for="(page, index) in store.project.pages" :key="page.id" class="page-card" :class="{ active: page.id === doc.id }" :aria-label="`第 ${index + 1} 页`" @click="selectPage(page.id)"><img v-if="pagePreview(page)" :src="pagePreview(page)!" alt="" /><span>{{ index + 1 }}</span></button><button class="text-button" @click="addPage()"><Plus :size="18" />新增</button><button class="text-button" @click="pageActionsOpen = true"><MoreHorizontal :size="20" />页面</button></div>
      </section>
      <Transition name="dock"><aside v-show="panelOpen && !cropMode && compactPanels[panel]" class="tool-dock" :class="{ 'text-dock': panel === 'text', 'spacing-dock': panel === 'spacing' }"><header class="dock-heading"><h2>{{ panelTitle }}</h2><button class="icon-button" aria-label="收起工具面板" :disabled="store.cropEditing" @click="panelOpen = false"><ChevronDown :size="20" /></button></header><PhotoTextTools v-show="panel === 'text'" v-model:draft="textDraft" :pending="textPending" :document="doc" :assets="store.assets" :selection="store.selection" @action="handleAction" /><CollageTools v-if="panel !== 'text' && compactPanels[panel]" :panel="panel" :document="doc" :assets="store.assets" :selection="store.selection" @action="handleAction" @manage-photos="managePhotos" @crop="beginCrop" @browse="value => designBrowser = value" /></aside></Transition>
      <nav v-if="!cropMode" class="tools-nav" :class="{ 'has-active': panelOpen || moreOpen }" aria-label="拼图工具" :style="{ '--tool-count': toolItems.length + 1, '--tool-index': activeToolIndex }"><button v-for="item in toolItems" :key="item.id" class="tool-button" :class="{ active: panel === item.id && panelOpen }" :data-tool="item.id" :aria-pressed="panel === item.id && panelOpen" :disabled="store.cropEditing || !!busy || textPending" @click="choosePanel(item.id)"><span class="tool-icon"><component :is="item.icon" :size="23" /></span>{{ item.label }}</button><button class="tool-button" :class="{ active: moreOpen || (panelOpen && toolIndex < 0) }" data-tool="more" aria-haspopup="dialog" :disabled="store.cropEditing || !!busy || textPending" @click="moreOpen = true"><span class="tool-icon"><MoreHorizontal :size="24" /></span>更多</button></nav>
      <section v-else-if="crop" class="crop-controls" aria-label="照片裁切工具"><PanelRange label="照片缩放" :value="crop.zoom" :min="1" :max="8" :step=".01" unit="×" @input="zoom => adjustCrop({ zoom })" /><div class="crop-actions"><button @click="adjustCrop({ rotation: (crop.rotation + 450) % 360 - 180 })"><RotateCcw :size="22" />左转</button><button @click="adjustCrop({ rotation: (crop.rotation + 630) % 360 - 180 })"><RotateCw :size="22" />右转</button><button :aria-pressed="crop.flipX" @click="adjustCrop({ flipX: !crop.flipX })"><FlipHorizontal :size="22" />翻转</button><button :aria-pressed="crop.flipY" @click="adjustCrop({ flipY: !crop.flipY })"><FlipVertical :size="22" />上下</button><button @click="adjustCrop(createCrop())"><Undo2 :size="22" />重置</button></div></section>
    </div>
    <audio v-if="musicAsset" ref="musicPlayer" :src="musicAsset.src" preload="auto" @loadedmetadata="syncMusic" @timeupdate="musicTimeUpdate" @ended="() => { if (musicPlayer && playing) { musicPlayer.currentTime = doc.audio?.start ?? 0; void musicPlayer.play(); } }" />
  </main>

  <AppDialog v-model:open="selectionActionsOpen" :title="selectedPhotoNumber ? `照片 ${selectedPhotoNumber}` : store.selected?.type === 'text' ? '文字操作' : '元素操作'">
    <div v-if="store.selection" class="selection-action-list">
      <button v-if="canAdjustPhoto" @click="selectionAction(() => { if (store.selection) beginCrop(store.selection); })"><Maximize2 :size="21" /><span>全屏精修</span></button>
      <button v-if="hasImageSelection && !store.selected?.locked" @click="selectionAction(() => uploadPhotos(true))"><ImagePlus :size="21" /><span>替换照片</span></button>
      <button v-if="canAdjustPhoto && store.selectedSlot && photoCount > 1" @click="selectionAction(() => handleAction({ type: 'swap' }))"><Rows3 :size="21" /><span>交换照片位置</span></button>
      <button v-if="canAdjustPhoto && posterComposition && photoCount >= 2" @click="selectionAction(() => { if (store.selection) handleAction({ type: 'mainPhoto', target: store.selection }); })"><Users :size="21" /><span>设为海报主图</span></button>
      <button v-if="store.selected?.type === 'shape'" @click="selectionAction(openShapeEditor)"><Palette :size="21" /><span>编辑形状 · 颜色与大小</span></button>
      <button v-if="store.selected" :disabled="store.selected.locked" @click="selectionAction(() => store.duplicateSelected())"><Copy :size="21" /><span>复制元素</span></button>
      <button class="destructive-action" :disabled="store.selected?.locked" @click="selectionAction(() => store.deleteSelected())"><Trash2 :size="21" /><span>删除所选{{ hasImageSelection ? '照片' : '元素' }}</span><small>可撤销</small></button>
    </div>
    <template #footer><button class="secondary-button wide" @click="selectionActionsOpen = false">返回画布</button></template>
  </AppDialog>
  <AppDialog v-model:open="pageActionsOpen" :title="`第 ${pageNumber} 页 · 页面操作`">
    <div class="selection-action-list">
      <button @click="pageActionsOpen = false; addPage()"><Plus :size="21" /><span>新增页面</span></button>
      <button @click="pageActionsOpen = false; addPage(true)"><Copy :size="21" /><span>复制当前页</span></button>
      <button :disabled="pageNumber === 1" @click="pageActionsOpen = false; store.reorderPage(doc.id, -1)"><ChevronLeft :size="21" /><span>向前移动此页</span></button>
      <button :disabled="pageNumber === store.project.pages.length" @click="pageActionsOpen = false; store.reorderPage(doc.id, 1)"><ChevronRight :size="21" /><span>向后移动此页</span></button>
      <button class="destructive-action" :disabled="store.project.pages.length <= 1" @click="pageActionsOpen = false; pendingPageId = doc.id; deletePageOpen = true"><Trash2 :size="21" /><span>删除当前页</span><small>可撤销</small></button>
    </div>
    <template #footer><button class="secondary-button wide" @click="pageActionsOpen = false">返回画布</button></template>
  </AppDialog>
  <PhotoSelectionSheet v-model:open="pickerOpen" v-model:mode="creationMode" :items="pickerItems" :intent="pickerIntent" :ratio="creationRatio" :processing="pickerProcessing" :processing-message="pickerMessage" :error="pickerError" :required-count="pickerRequired" :max-photos="pickerMax" :lock-configuration="!!pendingTemplate" @ratio="value => creationRatio = value" @add="addPickerPhotos" @reorder="reorderPicker" @remove="removePickerPhotos" @confirm="confirmPhotos" />
  <AppDialog v-model:open="posterOpen" :title="pendingPoster?.name ?? '应用照片海报'" :description="`保留全部 ${photoCount} 张照片；替换本页的排版、文字与装饰。取消不修改，应用后可一步撤销。`" wide>
    <div v-if="pendingPoster" class="poster-confirm-preview"><TemplatePreview :template="pendingPoster" :photos="posterPhotos" eager /></div>
    <p class="form-note">照片紧密拼接，标题、题字与装饰叠加在照片之上。应用后可点文字编辑、长按照片调整取景。</p>
    <template #footer><div class="dialog-actions"><button class="secondary-button" @click="pendingPoster = null">取消</button><button class="primary-button" @click="confirmPoster">应用海报</button></div></template>
  </AppDialog>
  <AppDialog v-model:open="designBrowserOpen" :title="designBrowser === 'layouts' ? '挑选构图' : '挑选照片风格'" :description="designBrowser === 'layouts' ? '用你的照片看主次、比例与留白。点选后立即应用。' : '相纸、拍立得、胶片与画廊留白。保留照片的模式、裁剪与摆放。'" wide>
    <div class="design-browser-content">
      <LayoutGallery v-if="designBrowser === 'layouts'" :count="designPhotos.length" :document="doc" :assets="store.assets" :selected-id="doc.mode === 'grid' ? doc.layoutId : undefined" :preview-photos="designPhotos" @select="layout => handleAction({ type: 'layout', layout })" />
      <CollageStyleGallery v-else-if="designBrowser === 'looks'" :document="doc" :assets="store.assets" @select="look => handleAction({ type: 'look', look })" />
    </div>
    <template #footer><div class="design-browser-actions"><span>点选即生效 · 可撤销</span><button class="primary-button" @click="designBrowser = null">回到画布</button></div></template>
  </AppDialog>
  <AppDialog v-model:open="advancedOpen" :title="panelTitle" description="完成后关闭面板，继续编辑拼图。" wide>
    <div v-if="panel === 'photos' && placedPhotos.length" class="adjustment-photos" aria-label="选择要调整的照片"><button v-for="(photo, index) in placedPhotos" :key="photo.id" :aria-label="`调整第 ${index + 1} 张照片`" :aria-pressed="store.selection?.id === photo.id" @click="store.select({ kind: doc.mode === 'grid' ? 'slot' : 'element', id: photo.id })"><img :src="photo.asset.thumbnail || photo.asset.src" alt="" /><span>{{ index + 1 }}</span></button></div>
    <EditorPanel v-model:text-draft="textDraft" :text-pending="textPending" :panel="panel" :document="doc" :assets="store.assets" :selection="store.selection" :tool="tool" :brush-color="brushColor" :brush-size="brushSize" :highlighter="highlighter" :crop-mode="cropMode" @action="handleAction" /><template #footer><div class="dialog-actions"><button class="primary-button" @click="advancedOpen = false">完成</button></div></template>
  </AppDialog>
  <AppDialog v-model:open="moreOpen" title="更多工具">
    <div class="extra-tools"><button v-for="item in extraTools" :key="item.id" @click="choosePanel(item.id)"><component :is="item.icon" :size="22" /><span>{{ item.label }}</span><ChevronRight :size="17" /></button><button @click="openPhotoAdjustments"><SlidersHorizontal :size="22" /><span>照片高级调整</span><ChevronRight :size="17" /></button><button @click="moreOpen = false; panel = 'background'; panelOpen = false; advancedOpen = true"><Palette :size="22" /><span>背景与纹理</span><ChevronRight :size="17" /></button></div>
    <div class="more-project-actions"><button class="secondary-button" @click="moreOpen = false; addPage()"><Plus :size="18" />新增页面</button><button class="secondary-button" @click="moreOpen = false; mediaInput?.click()"><Film :size="18" />导入视频 / GIF</button><button class="secondary-button" @click="moreOpen = false; togglePlaying()"><Play :size="18" />{{ playing ? '停止预览' : '播放动画' }}</button><button class="secondary-button" @click="moreOpen = false; previewAllPages = !previewAllPages"><Film :size="18" />{{ previewAllPages ? '关闭多页预览' : '预览全部页面' }}</button><button class="secondary-button" @click="moreOpen = false; saveNow()"><Save :size="18" />保存草稿</button><button class="secondary-button" @click="moreOpen = false; saveProjectFile()"><FolderOpen :size="18" />备份项目</button><button class="secondary-button" @click="openSize"><Maximize2 :size="18" />自定义尺寸</button></div>
  </AppDialog>
  <AppDialog v-model:open="exportOpen" title="保存作品" :description="textDraft.trim() ? '有文案尚未添加，图片只包含画布上的内容。' : '不加水印。保存后也能继续编辑。'">
    <div class="export-preview" :aria-busy="exportPreviewLoading"><div v-if="exportPreviewLoading && !exportPreview" class="preview-loading"><span class="spinner" />正在准备预览</div><video v-else-if="exportResult?.blob.type.startsWith('video/')" :src="exportResult.url" controls playsinline /><img v-else-if="exportResult || exportPreview" :src="exportResult?.url || exportPreview" :alt="`${store.project.title}导出预览`" /></div>
    <div class="export-options"><div class="option-heading"><span>格式</span><small>{{ exportFormat === 'png' ? '无损 · 支持透明' : exportFormat === 'jpeg' ? '适合照片分享' : exportFormat === 'webp' ? '轻量 · 支持透明' : '动态作品' }}</small></div><div class="segmented-control" aria-label="图片格式"><button v-for="format in exportFormats" :key="format.value" :aria-pressed="exportFormat === format.value" @click="exportFormat = format.value; clearExportResult()">{{ format.label }}</button></div><div class="option-heading"><span>清晰度</span><small>{{ exportDimensions }} 像素</small></div><div class="segmented-control" aria-label="图片清晰度"><button v-for="size in exportSizes" :key="size.value" :disabled="size.value > maxExportScale" :aria-pressed="exportScale === size.value" @click="exportScale = size.value; clearExportResult()">{{ size.label }}<small>{{ size.value }}×</small></button></div></div>
    <details class="motion-export"><summary>动态图与视频</summary><label class="form-row">动态格式<AppSelect :value="exportFormat" :options="[{ value: 'png', label: '静态图片' }, { value: 'gif', label: 'GIF · 无声音' }, { value: 'mp4', label: 'MP4 · 视频' }, { value: 'webm', label: 'WebM · 视频' }]" label="动态导出格式" @change="value => { exportFormat = value as ExportOptions['format']; clearExportResult(); }" /></label><div v-if="isAnimatedExport" class="form-columns"><label class="form-row">帧率<AppSelect :value="exportFps" :options="[8, 12, 24, 30].map(value => ({ value, label: `${value} fps` }))" label="导出帧率" @change="value => { exportFps = Number(value); clearExportResult(); }" /></label><label class="form-row">画质<AppSelect :value="exportQuality" :options="[{ value: .75, label: '节省空间' }, { value: .94, label: '高画质' }, { value: 1, label: '最高画质' }]" label="导出画质" @change="value => { exportQuality = Number(value); clearExportResult(); }" /></label></div><label v-if="isAnimatedExport && store.project.pages.length > 1" class="check-row"><input v-model="exportAllPages" type="checkbox" @change="clearExportResult" />合成全部 {{ store.project.pages.length }} 页</label><p class="form-note">视频保留音乐与原声；GIF 没有声音。编码不支持时会提示，不偷偷换格式。</p></details>
    <div class="dialog-actions secondary-export-actions"><button v-if="store.project.pages.length > 1" class="link-button" @click="exportPages">全部页面打包</button><button class="link-button" @click="saveProjectFile">保存可编辑项目</button></div>
    <template #footer><div class="export-save-actions"><button class="primary-button" :disabled="exportPreviewLoading || !!busy" @click="saveImage"><Download :size="20" />{{ isAnimatedExport ? nativeApp ? '生成并保存' : '生成并下载' : exportResult ? nativeApp ? '再次保存图片' : '再次下载图片' : '保存图片' }}</button><button v-if="exportResult && canShareResult" class="secondary-button" @click="shareResult">系统分享</button><p v-if="exportResult" class="export-save-hint">{{ nativeApp ? '保存到你选择的文件位置；重要作品也请备份可编辑项目。' : isAnimatedExport ? '文件已生成，可再次下载。' : '手机可长按上方图片保存到相册。' }}</p></div></template>
  </AppDialog>
  <AppDialog v-model:open="sizeOpen" title="自定义画布" :description="doc.layoutId.startsWith('long-') ? '长图按照片原比例自动计算高度；调整宽度会保留留白与相框。' : '改变尺寸时，照片与文字会按比例调整。'">
    <div class="form-columns size-fields">
      <div class="form-row"><AppNumber label="画布宽度" unit="px" :value="customWidth" :min="160" :max="4096" @input="value => customWidth = value" /></div>
      <div class="form-row"><AppNumber :label="doc.layoutId.startsWith('long-') ? '高度自动计算' : '画布高度'" unit="px" :value="customHeight" :min="160" :max="4096" :disabled="doc.layoutId.startsWith('long-')" @input="value => customHeight = value" /></div>
    </div>
    <template #footer><div class="dialog-actions"><button class="primary-button" @click="applySize">应用尺寸</button></div></template>
  </AppDialog>
  <AppDialog v-model:open="textOpen" title="写在照片上" description="支持多行；完成后可以拖动摆放，或在文字工具中调整字样。"><label class="form-row">文字内容<textarea v-model="textValue" maxlength="2000" aria-label="编辑文字内容" /></label><template #footer><div class="dialog-actions text-edit-actions"><button class="secondary-button" @click="textOpen = false">取消</button><button class="primary-button" @click="applyText">完成</button></div></template></AppDialog>
  <AppDialog v-model:open="deleteDraftOpen" title="删除这份作品？" description="会删除当前浏览器中的草稿与存储副本。已导出的项目文件不会受影响。"><template #footer><div class="dialog-actions"><button class="secondary-button" @click="deleteDraftOpen = false">保留</button><button class="danger-button" @click="removeDraft">删除草稿</button></div></template></AppDialog>
  <AppDialog v-model:open="deletePageOpen" title="删除当前页面？" description="其他页面和素材库会保留。此操作可通过撤销恢复。"><template #footer><div class="dialog-actions"><button class="secondary-button" @click="deletePageOpen = false">保留</button><button class="danger-button" @click="deletePage">删除页面</button></div></template></AppDialog>
  <AppDialog :open="!!busy" :title="busy" description="操作在设备本地执行。处理大文件时请保持页面打开。" locked><div class="progress-box"><div class="spinner" /><p>{{ progressMessage }}</p><progress :value="progress" max="1" aria-label="处理进度" /><small>{{ Math.round(progress * 100) }}%</small></div><div v-if="cancellable" class="dialog-actions"><button class="secondary-button" @click="abortController?.abort()">取消操作</button></div></AppDialog>
</template>
