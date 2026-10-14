<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { Component } from 'vue';
import { useDebounceFn, useEventListener, useIntervalFn } from '@vueuse/core';
import { ArrowLeft, Brush, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Expand, Film, FlipHorizontal, FlipVertical, FolderOpen, Grid2X2, ImagePlus, Images, Layers, LayoutTemplate, Maximize2, MoreHorizontal, Move, Music2, Palette, Play, Plus, Redo2, RefreshCw, RotateCcw, RotateCw, Rows3, Save, Scissors, SlidersHorizontal, Sparkles, Sticker, Trash2, Type, Undo2, Users } from 'lucide-vue-next';
import CanvasCropPreview from './components/CanvasCropPreview.vue';
import TemplatePreview from './components/TemplatePreview.vue';
import EditorCanvas from './components/EditorCanvas.vue';
import EditorPanel from './components/EditorPanel.vue';
import EditorToolDock from './components/EditorToolDock.vue';
import AppDialog from './components/AppDialog.vue';
import PwaStatus from './components/PwaStatus.vue';
import TemplateGallery from './components/TemplateGallery.vue';
import PhotoSelectionSheet from './components/PhotoSelectionSheet.vue';
import PhotoImportProgress from './components/PhotoImportProgress.vue';
import CollageTools from './components/CollageTools.vue';
import PhotoTextTools from './components/PhotoTextTools.vue';
import LayoutGallery from './components/LayoutGallery.vue';
import CollageStyleGallery from './components/CollageStyleGallery.vue';
import AppSelect from './components/AppSelect.vue';
import AppTabBar from './components/AppTabBar.vue';
import AppNumber from './components/AppNumber.vue';
import PanelRange from './components/PanelRange.vue';
import HomeScreen from './components/HomeScreen.vue';
import WorksScreen from './components/WorksScreen.vue';
import type { PwaStatusHandle } from './services/pwa';
import { photoFrameGeometry } from './components/photoFrameGeometry';
import type { PhotoImportItem, PhotoSelectionItem } from './components/photoSelection';
import { useEditorStore } from './stores/editor';
import { layouts, MAX_COLLAGE_PHOTOS } from './catalog/layouts';
import type { CollageLook } from './catalog/looks';
import { examplePhotos } from './examples';
import { createCrop, createPhotoFrame, slotRect, MIN_CROP_ZOOM, MAX_CROP_ZOOM } from './defaults';
import type { EditorCanvasHandle, EditorDocument, ExportOptions, MediaAsset, Selection, TemplatePreset, DrawingChange, CropState, CropChange, CollageSlot, ImageElement } from './types';
import type { EditorTool, PanelAction, PanelName } from './panel';
import type { ExportFrameRenderer } from './services/export';
import { importMedia, getImportFailures, canvasToBlob, createAsset, disposeAsset } from './services/media';
import type { MediaImportProgress } from './services/media';
import { listDrafts, saveDraft, loadDraft, deleteDrafts, exportProject, importProject } from './services/persistence';
import { downloadBlob, shareBlob, exportComposition } from './services/export';
import { ensureTextFont } from './services/fonts';
import { installNativeLinkHandler, isNativeApp, saveNativeFile } from './services/native';
import { photoTextStyles } from './catalog/photoText';
import smartcrop from 'smartcrop';
import { zipSync } from 'fflate';

const store = useEditorStore();
const nativeApp = isNativeApp();
let removeNativeLinkHandler: (() => void) | undefined;
const registrationNumber = window.location.hostname === 'collage.szlh.top' ? '粤ICP备2023103891号-3' : null;
const brandLogoUrl = `${import.meta.env.BASE_URL}icons/icon-192.png`;
const pwaStatus = ref<PwaStatusHandle>();
const view = ref<'home' | 'editor' | 'templates' | 'drafts'>('home');
const projectTitle = ref(store.project.title);
const titleEditing = ref(false);
const textDraft = computed({ get: () => store.document.textDraft, set: (value: string) => store.setTextDraft(value) });
const textPending = ref(false);
let textWork: Promise<void> | undefined;
watch(() => store.project.id, () => {
  projectTitle.value = store.project.title; titleEditing.value = false;
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
const templateGallery = ref<{ closePreview: () => void; openPreview: (template: TemplatePreset, event?: MouseEvent) => void; getPreview: () => TemplatePreset | null; resetFilters: () => void }>();
const templatePreviewOpen = ref(false);
const editorPanel = ref<{ closeTemplatePreview: () => void; openTemplatePreview: (template: TemplatePreset) => void; getTemplatePreview: () => TemplatePreset | null }>();
const photoTextTools = ref<{ addText: () => void }>();
const photoSelection = ref<{ closePreview: () => boolean; openPreview: (id: string) => void; getPreviewId: () => string | null }>();
const photoPreviewOpen = ref(false);
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
let explicitInlineCrop = false;
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
const pendingTextAction = shallowRef<{ kind: 'export' } | { kind: 'leave'; target: 'home' | 'templates' | 'drafts' } | null>(null);
const pendingTextOpen = computed({ get: () => pendingTextAction.value !== null, set: (open: boolean) => { if (!open) pendingTextAction.value = null; } });
const resolvingPendingText = ref(false);
const pendingLeave = ref<{ target: 'home' | 'templates' | 'drafts'; error: string; backupRevision?: number; downloaded?: boolean } | null>(null);
const leaveFailedOpen = computed({ get: () => pendingLeave.value !== null, set: (open: boolean) => { if (!open) pendingLeave.value = null; } });
const sizeOpen = ref(false);
const textOpen = ref(false);
const designBrowser = ref<'layouts' | 'looks' | null>(null);
const designBrowserOpen = computed({ get: () => designBrowser.value !== null, set: (open: boolean) => { if (!open) designBrowser.value = null; } });
const pendingDesign = shallowRef<TemplatePreset | null>(null);
const designConfirmOpen = computed({ get: () => pendingDesign.value !== null, set: (open: boolean) => { if (!open) pendingDesign.value = null; } });
const deleteDraftOpen = ref(false);
const deletePageOpen = ref(false);
const pendingDraftIds = ref<string[]>([]);
const pendingPageId = ref('');
const textValue = ref('');
const customWidth = ref(1080);
const customHeight = ref(1080);
const exportFormat = ref<ExportOptions['format']>('png');
const exportScale = ref(1);
const staticExportQuality = ref(.94);
const motionExportQuality = ref(.94);
const exportQuality = computed(() => isAnimatedExport.value ? motionExportQuality.value : staticExportQuality.value);
const exportFps = ref(24);
const exportAllPages = ref(true);
const exportResult = ref<{ blob: Blob; url: string; name: string } | null>(null);
const shareAvailable = typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
const canShareResult = computed(() => {
  const result = exportResult.value;
  return !!result && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([result.blob], result.name, { type: result.blob.type })] });
});
const pickerOpen = ref(false);
const pickerIntent = ref<'create' | 'manage'>('create');
const pickerItems = shallowRef<PhotoSelectionItem[]>([]);
const creationRatio = ref('1080x1920');
const pendingTemplate = shallowRef<TemplatePreset | null>(null);
const pickerProcessing = ref(false);
const pickerMessage = ref('');
const pickerError = ref('');
const photoImports = ref<PhotoImportItem[]>([]);
const stagedAssets = new Map<string, MediaAsset>();
let filePurpose: 'stage' | 'replace' = 'stage';
const advancedOpen = ref(false);
const exportPreview = ref('');
const exportPagePreviews = shallowRef<Array<{ id: string; url: string }>>([]);
const exportPreviewLoading = ref(false);
let previewGeneration = 0;
const exportFormats: Array<{ value: ExportOptions['format']; label: string }> = [{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }, { value: 'webp', label: 'WebP' }];
const exportSizes = [{ value: 1, label: '标准' }, { value: 2, label: '高清' }, { value: 3, label: '超清' }];
const maxExportScale = computed(() => {
  let maximum = Infinity;
  const onlyPage = isAnimatedExport.value ? doc.value.id : null;
  for (const page of store.project.pages) {
    if (onlyPage && page.id !== onlyPage) continue;
    maximum = Math.min(maximum, 8192 / page.width, 8192 / page.height, Math.sqrt(64_000_000 / (page.width * page.height)));
  }
  return maximum;
});
const compactPanels: Partial<Record<PanelName, true>> = { photos: true, layouts: true, spacing: true, text: true, looks: true, background: true };
const crop = computed(() => store.selectedSlot?.crop ?? (store.selected?.type === 'image' ? store.selected.crop : null));
const placedPhotos = computed<PhotoSelectionItem[]>(() => [
  ...(doc.value.mode === 'grid' ? doc.value.slots.flatMap(slot => slot.assetId && store.assets[slot.assetId] ? [{ id: slot.id, asset: store.assets[slot.assetId]! }] : []) : []),
  ...doc.value.elements.flatMap(element => element.type === 'image' && element.assetId && store.assets[element.assetId] && store.assets[element.assetId]!.kind !== 'sticker' && store.assets[element.assetId]!.kind !== 'audio' ? [{ id: element.id, asset: store.assets[element.assetId]! }] : []),
]);
function photoTarget(id: string): Exclude<Selection, null> { return { kind: doc.value.mode === 'grid' && doc.value.slots.some(slot => slot.id === id) ? 'slot' : 'element', id }; }
const pickerMax = computed(() => {
  const template = pendingTemplate.value;
  if (!template) return MAX_COLLAGE_PHOTOS;
  return template.mode === 'grid' ? layouts.find(layout => layout.id === template.layoutId)?.count ?? MAX_COLLAGE_PHOTOS : template.photoFrames?.length || MAX_COLLAGE_PHOTOS;
});
const pickerRequired = computed(() => {
  const template = pendingTemplate.value;
  if (!template) return pickerIntent.value === 'manage' ? 0 : 1;
  return Math.max(1, template.photoFrames?.length ?? 0, template.mode === 'grid' ? layouts.find(layout => layout.id === template.layoutId)?.count ?? 1 : 1);
});
const drafts = ref<Array<{ id: string; title: string; updatedAt: number; pageCount: number; url: string }>>([]);
const doc = computed(() => store.document);
const designPhotos = computed(() => {
  const photos: Array<CollageSlot | ImageElement> = [...(doc.value.mode === 'grid' ? doc.value.slots : []), ...doc.value.elements.filter(element => element.type === 'image')];
  return photos.flatMap(photo => {
    const asset = photo.assetId ? store.assets[photo.assetId] : undefined;
    if (!asset || asset.kind === 'audio' || asset.kind === 'sticker') return [];
    return [{ source: asset.thumbnail || (asset.kind === 'video' ? '' : asset.src), width: asset.width, height: asset.height, crop: photo.crop, filter: photo.filter, shape: photo.shape, visible: photo.visible, opacity: 'opacity' in photo ? photo.opacity : 1 }];
  });
});
const templatePhotos = computed(() => designPhotos.value.map(photo => ({ ...photo, url: photo.source })));
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
    slots: [{ id: photo.id, assetId: photo.assetId, crop: photo.crop, filter: photo.filter, shape: photo.shape, visible: photo.visible, locked: photo.locked, trimStart: photo.trimStart, trimEnd: photo.trimEnd, muted: photo.muted, x: 0, y: 0, width: 1, height: 1 }],
  };
});
const canvasSelection = computed<Selection>(() => cropMode.value && store.selection ? { kind: 'slot', id: store.selection.id } : store.selection);
const pageNumber = computed(() => store.project.pages.findIndex(page => page.id === doc.value.id) + 1);
const totalDuration = computed(() => store.project.pages.reduce((sum, page) => sum + page.duration, 0));
const hasImageSelection = computed(() => !!store.selectedSlot?.assetId || store.selected?.type === 'image');
const canAdjustPhoto = computed(() => hasImageSelection.value && !(store.selectedSlot ?? store.selected)?.locked && (store.selectedAsset?.kind === 'image' || store.selectedAsset?.kind === 'video'));
const posterComposition = computed(() => doc.value.mode === 'free' && doc.value.layoutId.startsWith('poster-'));
const selectedPhotoNumber = computed(() => placedPhotos.value.findIndex(photo => photo.id === store.selection?.id) + 1);
const musicAsset = computed(() => doc.value.audio ? store.assets[doc.value.audio.assetId] : null);
const toolItems: Array<{ id: PanelName; label: string; icon: Component }> = [
  { id: 'photos', label: '照片', icon: Images }, { id: 'layouts', label: '布局', icon: Grid2X2 },
  { id: 'text', label: '文字', icon: Type }, { id: 'looks', label: '样式', icon: Palette },
  { id: 'background', label: '画布', icon: Expand },
];
const toolIndex = computed(() => moreOpen.value ? toolItems.length : toolItems.findIndex(item => item.id === panel.value || item.id === 'looks' && panel.value === 'spacing'));
const activeToolIndex = computed(() => toolIndex.value < 0 ? toolItems.length : toolIndex.value);
const extraTools: Array<{ id: PanelName; label: string; icon: Component }> = [
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
const exportDimensions = computed(() => !isAnimatedExport.value && store.project.pages.length > 1 ? '按各自画布尺寸' : `${Math.round(doc.value.width * exportScale.value)} × ${Math.round(doc.value.height * exportScale.value)} 像素`);
const swapFirst = ref<string | null>(null);
const dockOpen = computed(() => !cropMode.value && (panelOpen.value || advancedOpen.value));
const inlineDisabled = computed(() => !!busy.value || isSaving.value || textPending.value || !!swapFirst.value || pickerOpen.value || moreOpen.value || selectionActionsOpen.value || pageActionsOpen.value || exportOpen.value || textOpen.value || sizeOpen.value || !!designBrowser.value || !!pendingDesign.value || !!pendingTextAction.value || !!pendingLeave.value);
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
  photoImports.value = [];
  busy.value = label; progress.value = 0; progressMessage.value = '正在准备…'; cancellable.value = canCancel;
  abortController = new AbortController();
  try { await work(abortController.signal, (value, message) => { progress.value = Math.max(0, Math.min(1, value)); progressMessage.value = message; }); }
  catch (error) { notify(error instanceof DOMException && error.name === 'AbortError' ? '已取消操作，原作品未被替换。' : errorMessage(error), !(error instanceof DOMException && error.name === 'AbortError')); }
  finally { busy.value = ''; photoImports.value = []; cancellable.value = false; abortController = undefined; if (view.value === 'editor' && store.dirty) autoSave(); }
}
function choosePanel(id: PanelName) {
  if (store.cropEditing) finishCrop(true);
  const opening = panel.value !== id || !dockOpen.value;
  moreOpen.value = false;
  panelOpen.value = opening && !!compactPanels[id];
  advancedOpen.value = opening && !compactPanels[id];
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
function beginInlineCrop(target: Exclude<Selection, null>, explicit = false) {
  if (inlineDisabled.value || cropMode.value) return;
  try {
    playing.value = false;
    if (store.cropEditing && (store.selection?.kind !== target.kind || store.selection?.id !== target.id)) store.commitCropSession();
    if (!store.cropEditing) store.beginCropSession(target);
    if (!inlineCropMode.value) explicitInlineCrop = explicit;
    inlineCropMode.value = true; tool.value = 'select';
  } catch (error) { notify(errorMessage(error), true); }
}
function endInlineCrop(result: { cancelled: boolean }) {
  if (!inlineCropMode.value || explicitInlineCrop) return;
  finishCrop(!result.cancelled);
}
function finishCrop(confirm: boolean) {
  if (confirm) store.commitCropSession(); else store.cancelCropSession();
  cropMode.value = false; inlineCropMode.value = false; explicitInlineCrop = false;
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
  if (!hasImageSelection.value && placedPhotos.value[0]) store.select(photoTarget(placedPhotos.value[0].id));
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
function beginSelection() {
  if (busy.value || pickerProcessing.value) return;
  clearStagedPhotos(); pickerIntent.value = 'create'; pickerItems.value = [];
  creationRatio.value = '1080x1920'; pendingTemplate.value = null;
  pickerError.value = ''; pickerOpen.value = true;
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
  photoImports.value = [];
}
function preparePhotoImport(files: readonly File[]) {
  photoImports.value = files.map((file, index) => ({ index, name: file.name, stage: 'queued', progress: 0, message: '等待导入' }));
}
function reportPhotoImport(event: MediaImportProgress) {
  const item = photoImports.value[event.index];
  if (!item) return;
  item.stage = event.stage; item.progress = event.progress; item.message = event.message;
  if (event.asset) item.assetId = event.asset.id;
}
async function stagePhotos(files: File[]) {
  if (pickerProcessing.value) return;
  preparePhotoImport(files);
  pickerProcessing.value = true; pickerError.value = ''; pickerMessage.value = '正在读取照片…';
  try {
    const items = await importMedia(files, (_value, message) => { pickerMessage.value = message; }, event => {
      reportPhotoImport(event);
      if (event.stage !== 'complete' || !event.asset) return;
      const asset = event.asset;
      if (asset.kind === 'audio' || asset.kind === 'sticker') {
        disposeAsset(asset);
        const item = photoImports.value[event.index]!;
        delete item.assetId;
        item.stage = 'error'; item.progress = 0; item.message = '请选择照片或视频';
        return;
      }
      stagedAssets.set(asset.id, asset);
      pickerItems.value = [...pickerItems.value, { id: `new:${asset.id}`, asset }];
    });
    const failures = getImportFailures(items);
    if (failures.length) pickerError.value = failures.map(item => `${item.name}：${item.message}`).join('；');
  } catch (error) { pickerError.value = errorMessage(error); }
  finally { pickerProcessing.value = false; pickerMessage.value = ''; }
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
  if (pickerProcessing.value || pickerItems.value.length < pickerRequired.value || pickerItems.value.length > pickerMax.value) return;
  pickerProcessing.value = true; pickerError.value = ''; pickerMessage.value = '正在准备拼图…';
  try {
    if (pickerIntent.value === 'create') {
      await preserveCurrent();
      const [width, height] = creationRatio.value.split('x').map(Number);
      store.initializeCollage(pickerItems.value.map(item => item.asset), { width: width!, height: height!, ...(pendingTemplate.value ? { template: pendingTemplate.value } : {}) });
    } else store.setCollagePhotos(pickerItems.value.map(item => ({ id: item.id, assetId: item.asset.id })), [...stagedAssets.values()]);
    stagedAssets.clear(); pickerOpen.value = false; view.value = 'editor';
    panel.value = 'layouts'; panelOpen.value = false; advancedOpen.value = false;
    tool.value = 'select'; cropMode.value = false; playing.value = false;
    await nextTick();
    try { await captureDraft(); } catch (error) { notify(`自动保存失败：${errorMessage(error)}。作品仍可编辑，请保存项目文件备份。`, true); }
  } catch (error) { pickerError.value = errorMessage(error); }
  finally { pickerProcessing.value = false; pickerMessage.value = ''; }
}
watch(pickerOpen, open => { if (!open && !pickerProcessing.value) { clearStagedPhotos(); pickerItems.value = []; } });
async function receivePhotos(files: File[], target?: Selection) {
  await runBusy('正在导入照片与视频', async (_signal, report) => {
    preparePhotoImport(files);
    const assets = await importMedia(files, report, reportPhotoImport);
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
      const firstPage = project.pages[0]!;
      const thumbnailCanvas = await handle.renderFrame(0, Math.min(.3, 320 / Math.max(firstPage.width, firstPage.height)), firstPage);
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
watch([() => store.revision, () => view.value === 'editor' && !busy.value && !playing.value && !store.cropEditing && !pickerOpen.value], ([, ready]) => {
  if (ready && store.dirty) autoSave();
});
async function saveNow() {
  try {
    commitProjectTitle(); if (store.cropEditing) finishCrop(true); playing.value = false;
    await textWork; await captureDraft(); await refreshDrafts();
    notify(textDraft.value.trim() ? '画布与未添加的文案草稿已保存到本机，下次打开可继续编辑。' : '草稿已保存到本机，下次打开可在「作品」继续编辑。');
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
    creationRatio.value = '1080x1920'; pendingTemplate.value = null;
    pickerError.value = ''; pickerOpen.value = true;
    await stagePhotos(files);
  } catch (error) { notify(errorMessage(error), true); }
  finally { exampleLoading.value = false; }
}
async function leaveEditor(target: 'home' | 'templates' | 'drafts') {
  if (store.cropEditing) finishCrop(false);
  playing.value = false; moreOpen.value = false; advancedOpen.value = false; designBrowser.value = null;
  pendingLeave.value = null; view.value = target;
  try { await refreshDrafts(); } catch (error) { notify(`作品列表读取失败：${errorMessage(error)}。当前会话中的作品仍保留。`, true); }
}
async function navigate(target: 'home' | 'templates' | 'drafts', keepDraft = false) {
  if (busy.value || view.value === target) return;
  if (view.value !== 'editor') { view.value = target; return; }
  if (!keepDraft && textDraft.value.trim()) { pendingTextAction.value = { kind: 'leave', target }; return; }
  try {
    if (store.cropEditing) finishCrop(false);
    playing.value = false; await preserveCurrent();
  } catch (error) {
    pendingLeave.value = { target, error: errorMessage(error) };
    return;
  }
  await leaveEditor(target);
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
    creationRatio.value = `${template.width}x${template.height}`;
    pendingTemplate.value = template; pickerError.value = ''; pickerOpen.value = true; return;
  }
  if (store.cropEditing) finishCrop(true);
  playing.value = false; pendingDesign.value = template;
}
function confirmDesign() {
  const template = pendingDesign.value;
  if (!template || busy.value) return;
  try {
    if (store.cropEditing) finishCrop(true);
    playing.value = false; store.applyTemplate(template); tool.value = 'select';
    pendingDesign.value = null; panelOpen.value = false; advancedOpen.value = false; designBrowser.value = null;
    notify('设计已应用，照片全部保留，文字与装饰可继续编辑；可一步撤销。');
  } catch (error) { notify(errorMessage(error), true); }
}
async function openDraft(id: string) {
  if (store.project.id === id) {
    view.value = 'editor'; panelOpen.value = false; moreOpen.value = false; advancedOpen.value = false; playing.value = false; tool.value = 'select'; cropMode.value = false;
    return;
  }
  await runBusy('正在恢复原始素材', async () => {
    const result = await loadDraft(id);
    store.restore(result.project, result.assets, 'saved'); view.value = 'editor';
    panel.value = 'layouts'; panelOpen.value = false;
    moreOpen.value = false; advancedOpen.value = false; playing.value = false; tool.value = 'select'; cropMode.value = false;
  });
}
function requestDeleteDrafts(ids: string[]) {
  if (busy.value || isSaving.value) return;
  const existing = new Set(drafts.value.map(draft => draft.id));
  pendingDraftIds.value = ids.filter(id => existing.has(id));
  deleteDraftOpen.value = pendingDraftIds.value.length > 0;
}
async function removeDrafts() {
  const ids = pendingDraftIds.value.slice();
  if (!ids.length || busy.value || isSaving.value) return;
  await runBusy('正在删除选中的作品', async () => {
    await deleteDrafts(ids);
    if (ids.includes(store.project.id)) {
      store.newProject();
      store.markSaved();
      overlaySnapshots.clear();
      clearPagePreviews();
    }
    deleteDraftOpen.value = false; pendingDraftIds.value = [];
    await refreshDrafts();
    notify(`已删除 ${ids.length} 份作品。`);
  });
}
async function saveProjectFile() {
  commitProjectTitle(); await textWork;
  let result: { status: 'saved' | 'cancelled' | 'download-started'; revision: number } | undefined;
  await runBusy('正在打包可编辑项目', async (_signal, report) => {
    if (store.cropEditing) finishCrop(true);
    report(.1, '打包所有页面与原始照片、视频、音乐…');
    const revision = store.revision;
    const blob = await exportProject(store.snapshot(), store.assets);
    const saved = await saveExportFile(blob, `${safeName(store.project.title)}.collage`);
    result = { status: saved, revision };
    if (saved !== 'cancelled') notify(saved === 'saved' ? '可编辑项目已保存，可在其他设备导入继续编辑。' : '项目文件已生成，可在其他浏览器导入继续编辑。');
  });
  return result;
}
async function backupBeforeLeaving() {
  const request = pendingLeave.value;
  if (!request || busy.value) return;
  const result = await saveProjectFile();
  if (!result || result.status === 'cancelled' || pendingLeave.value !== request) return;
  request.backupRevision = result.revision; request.downloaded = result.status === 'download-started';
}
async function leaveAfterBackup() {
  const request = pendingLeave.value;
  if (!request || request.backupRevision !== store.revision || busy.value) return;
  await leaveEditor(request.target);
}
async function openProjectFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = ''; if (!file) return;
  try { await preserveCurrent(); }
  catch (error) { notify(`未替换当前作品：${errorMessage(error)}`, true); return; }
  await runBusy('正在读取可编辑项目', async () => {
    const result = await importProject(file);
    result.project.id = crypto.randomUUID();
    store.restore(result.project, result.assets, 'unsaved'); view.value = 'editor'; panel.value = 'layouts'; panelOpen.value = false; moreOpen.value = false; advancedOpen.value = false; playing.value = false; tool.value = 'select'; cropMode.value = false; notify('全部图片与原始素材已恢复。');
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
    store.changeCrop({ kind: target.kind, id: target.id, crop: { ...createCrop(), zoom: Math.max(MIN_CROP_ZOOM, Math.min(MAX_CROP_ZOOM, scale / cover)), x: excessX > .01 ? Math.max(-1, Math.min(1, (asset.width / 2 - region.x - region.width / 2) * scale / excessX)) : 0, y: excessY > .01 ? Math.max(-1, Math.min(1, (asset.height / 2 - region.y - region.height / 2) * scale / excessY)) : 0 } });
    notify('已根据显著性分析调整构图，可继续手动微调。');
  });
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
      case 'document': store.updateDocument(action.patch, action.commit ?? true); break;
      case 'element': store.updateSelected(action.patch, action.commit ?? true); break;
      case 'slot': store.updateSlot(action.patch, action.commit ?? true); break;
      case 'layout': store.applyLayout(action.layout); break;
      case 'mainPhoto': store.setMainPhoto(action.target); notify('已更换海报主图，保留全部照片与海报排版。'); break;
      case 'poster': pendingDesign.value = action.template; break;
      case 'look': applyLook(action.look); break;
      case 'tone': store.updateDocument({ slots: doc.value.slots.map(slot => ({ ...slot, filter: action.filter })), elements: doc.value.elements.map(element => element.type === 'image' && store.assets[element.assetId]?.kind !== 'sticker' ? { ...element, filter: action.filter } : element) }); break;
      case 'template': await chooseTemplate(action.template); break;
      case 'sticker': await store.addSticker(action.sticker); advancedOpen.value = false; break;
      case 'asset': store.placeAsset(action.assetId); break;
      case 'upload': uploadPhotos(); break;
      case 'replace': uploadPhotos(true); break;
      case 'addText': {
        const style = action.style ?? photoTextStyles[0]!;
        await ensureTextFont({ text: action.text ?? style.sample, fontFamily: style.fontFamily, fontStyle: style.fontStyle });
        if (generation !== textActionGeneration || pageId !== doc.value.id) break;
        store.addText(action.text, style, canvas.value?.measureTextHeight); openPhotoText();
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
      case 'addShape': store.addShape(action.shape); tool.value = 'select'; cropMode.value = false; break;
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
      case 'swap': if (store.selectedSlot) { swapFirst.value = store.selectedSlot.id; panelOpen.value = false; advancedOpen.value = false; notify('请点击另一个格子，交换两张照片。'); } break;
      case 'checkpoint': store.checkpoint(); break;
      case 'tool': tool.value = action.tool; cropMode.value = false; break;
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
const pagePreviews = shallowRef<Record<string, { url: string; signature: string }>>({});
let pagePreviewGeneration = 0;
function pageSceneSignature(page: EditorDocument) {
  const { title: _title, textDraft: _draft, createdAt: _created, updatedAt: _updated, ...scene } = page;
  return JSON.stringify(scene);
}
function clearPagePreviews() {
  ++pagePreviewGeneration;
  for (const preview of Object.values(pagePreviews.value)) URL.revokeObjectURL(preview.url);
  pagePreviews.value = {};
}
const refreshPagePreviews = useDebounceFn(async () => {
  const handle = canvas.value;
  if (view.value !== 'editor' || !pageActionsOpen.value || !handle || busy.value || playing.value || store.cropEditing) return;
  const generation = pagePreviewGeneration, projectId = store.project.id;
  try {
    const ids = new Set(store.project.pages.map(page => page.id));
    const retained = { ...pagePreviews.value };
    for (const [id, preview] of Object.entries(retained)) if (!ids.has(id)) { URL.revokeObjectURL(preview.url); delete retained[id]; }
    pagePreviews.value = retained;
    for (const page of store.project.pages) {
      const signature = pageSceneSignature(page);
      if (pagePreviews.value[page.id]?.signature === signature) continue;
      const snapshot = JSON.parse(JSON.stringify(page)) as EditorDocument;
      const frame = await handle.renderFrame(0, Math.min(.3, 160 / Math.max(page.width, page.height)), snapshot);
      let blob: Blob;
      try { blob = await canvasToBlob(frame, 'image/png'); }
      finally { frame.width = frame.height = 0; }
      if (generation !== pagePreviewGeneration || store.project.id !== projectId || view.value !== 'editor') return;
      const current = store.project.pages.find(item => item.id === page.id);
      if (!current || pageSceneSignature(current) !== signature) continue;
      const previous = pagePreviews.value[page.id];
      pagePreviews.value = { ...pagePreviews.value, [page.id]: { url: URL.createObjectURL(blob), signature } };
      if (previous) URL.revokeObjectURL(previous.url);
    }
  } catch (error) {
    if (generation === pagePreviewGeneration && view.value === 'editor') notify(`页面预览生成失败：${errorMessage(error)}`, true);
  }
}, 240);
watch(() => store.project.id, clearPagePreviews);
watch([view, pageActionsOpen, () => store.revision, playing, () => store.cropEditing, busy, pickerOpen], () => {
  ++pagePreviewGeneration;
  if (view.value === 'editor' && pageActionsOpen.value && !busy.value && !playing.value && !store.cropEditing && !pickerOpen.value) void refreshPagePreviews();
}, { flush: 'post' });
function pagePreview(page: EditorDocument) { return pagePreviews.value[page.id]?.url ?? null; }
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
useEventListener(window, 'beforeunload', event => {
  if (view.value !== 'editor' || (!store.dirty && projectTitle.value === store.project.title && !textPending.value && !isSaving.value)) return;
  event.preventDefault(); event.returnValue = '';
});
useEventListener(document, 'visibilitychange', () => {
  if (!document.hidden || view.value !== 'editor' || busy.value || store.cropEditing) return;
  playing.value = false;
  void preserveCurrent().catch(error => notify(`草稿保存失败：${errorMessage(error)}。请备份项目。`, true));
});
async function resolvePendingText(add: boolean) {
  const action = pendingTextAction.value;
  if (!action || resolvingPendingText.value) return;
  resolvingPendingText.value = true;
  try {
    if (add) {
      if (!photoTextTools.value) throw new Error('文字工具尚未就绪，请回到画布继续编辑。');
      photoTextTools.value.addText(); await textWork;
      if (textDraft.value.trim()) return;
    }
    pendingTextAction.value = null;
    if (action.kind === 'leave') await navigate(action.target, true);
    else {
      try { await preserveCurrent(); }
      catch (error) { notify(`本机草稿未保存：${errorMessage(error)}。仍可导出图片或项目备份。`, true); }
      await openExport(true);
    }
    writeRoute(false);
  } catch (error) { notify(errorMessage(error), true); }
  finally { resolvingPendingText.value = false; }
}
async function openExport(keepDraft = false) {
  commitProjectTitle(); if (textWork) await textWork;
  if (store.cropEditing) finishCrop(true);
  playing.value = false; exportFps.value = doc.value.fps;
  if (!keepDraft && textDraft.value.trim()) { pendingTextAction.value = { kind: 'export' }; return; }
  exportScale.value = Math.min(2, Math.max(.5, Math.floor(maxExportScale.value)));
  clearExportResult(); clearExportPreviews(); exportOpen.value = true; exportPreviewLoading.value = true;
  const generation = ++previewGeneration;
  try {
    await nextTick();
    const handle = canvas.value; if (!handle) throw new Error('画布尚未就绪。');
    for (const page of store.project.pages) {
      const previewScale = store.project.pages.length > 1 ? Math.min(.5, 320 / Math.max(page.width, page.height))
        : page.layoutId.startsWith('long-') ? Math.min(.5, 640 / page.width) : Math.min(.5, 640 / Math.max(page.width, page.height));
      const frame = await handle.renderFrame(0, previewScale, page);
      let blob: Blob;
      try { blob = await canvasToBlob(frame, 'image/png'); }
      finally { frame.width = frame.height = 0; }
      if (generation !== previewGeneration || !exportOpen.value) return;
      const url = URL.createObjectURL(blob);
      exportPagePreviews.value = [...exportPagePreviews.value, { id: page.id, url }];
      if (page.id === doc.value.id) exportPreview.value = url;
    }
  } catch (error) { if (generation === previewGeneration) notify(errorMessage(error), true); }
  finally { if (generation === previewGeneration) exportPreviewLoading.value = false; }
}
function clearExportResult() { if (exportResult.value) URL.revokeObjectURL(exportResult.value.url); exportResult.value = null; }
function clearExportPreviews() {
  for (const preview of exportPagePreviews.value) URL.revokeObjectURL(preview.url);
  exportPagePreviews.value = []; exportPreview.value = '';
}
async function generateExport() {
  if (!isAnimatedExport.value && store.project.pages.length > 1) { await generatePageExport(); return; }
  clearExportResult();
  await runBusy('正在生成高清作品', async (signal, report) => {
    const handle = canvas.value; if (!handle) throw new Error('画布尚未就绪，请稍后重试。');
    const pageList = store.project.pages.slice(); const outputDocument = JSON.parse(JSON.stringify(doc.value)) as EditorDocument;
    const allPages = isAnimatedExport.value && exportAllPages.value && pageList.length > 1;
    let total = 0;
    const segments = (allPages ? pageList : [doc.value]).map(page => { const segment = { document: page, start: total, duration: page.duration }; total += page.duration; return segment; });
    const renderer: ExportFrameRenderer = async (time, scale = 1) => {
      const segment = segments.find(item => time >= item.start && time < item.start + item.duration) ?? segments[segments.length - 1]!;
      const frame = await handle.renderFrame(Math.max(0, time - segment.start), scale, segment.document);
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
    } finally { handle.resetPreview(); }
  }, true);
}
async function downloadResult() {
  const result = exportResult.value;
  if (!result) return;
  const save = async () => {
    const saved = await saveExportFile(result.blob, result.name);
    if (saved === 'saved') notify('文件已保存到你选择的位置。');
    else if (saved === 'download-started') notify(result.blob.type === 'application/zip' ? '已发起 ZIP 下载，解压后可获得全部图片。' : isAnimatedExport.value ? '已发起文件下载，请在浏览器下载列表查看。' : '已发起图片下载；手机也可长按预览保存。');
  };
  if (nativeApp) await runBusy('正在保存文件', save);
  else await save();
}
async function saveImage() {
  if (!exportResult.value) await generateExport();
  if (exportResult.value) await downloadResult();
}
watch(exportOpen, open => {
  if (!open) { ++previewGeneration; exportPreviewLoading.value = false; clearExportPreviews(); }
});
async function shareResult() {
  if (!shareAvailable) return;
  if (!exportResult.value) {
    await generateExport();
    if (exportResult.value) notify('分享文件已生成，点“系统分享”选择接收应用；尚未下载或保存到文件。');
    return;
  }
  if (!canShareResult.value) { notify('系统不支持分享此格式，请换用 JPG / PNG 或下载文件。', true); return; }
  try {
    const result = exportResult.value;
    if (!await shareBlob(result.blob, result.name)) notify('已取消分享，作品仍可重新分享或下载。');
  } catch (error) { notify(errorMessage(error), true); }
}
async function generatePageExport() {
  const format = exportFormat.value;
  const extension = format === 'jpeg' ? 'jpg' : format;
  const pages = store.project.pages.slice();
  await runBusy(`正在生成 ${pages.length} 张图片`, async (signal, report) => {
    const handle = canvas.value; if (!handle) throw new Error('画布尚未就绪。');
    const files: Record<string, Uint8Array> = {};
    try {
      for (const [index, page] of pages.entries()) {
        if (signal.aborted) throw new DOMException('导出已取消。', 'AbortError');
        const blob = await exportComposition(page, store.assets, (time, scale) => handle.renderFrame(time, scale, page), { format, scale: exportScale.value, quality: exportQuality.value, duration: page.duration, fps: exportFps.value }, undefined, signal);
        files[`${String(index + 1).padStart(2, '0')}-${safeName(page.title)}.${extension}`] = new Uint8Array(await blob.arrayBuffer());
        report((index + 1) / pages.length, `已生成第 ${index + 1} / ${pages.length} 张图片`);
      }
      if (signal.aborted) throw new DOMException('导出已取消。', 'AbortError');
      const blob = new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
      clearExportResult();
      exportResult.value = { blob, url: URL.createObjectURL(blob), name: `${safeName(store.project.title)}-${pages.length}张图片.zip` };
      notify(`全部 ${pages.length} 张图片已生成，ZIP 内每张图片独立保留原画布尺寸。`);
    } finally { handle.resetPreview(); }
  }, true);
}
useEventListener(window, 'keydown', event => {
  if (event.defaultPrevented) return;
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && event.key.toLowerCase() === 's' && view.value === 'editor') {
    event.preventDefault();
    if (!busy.value && !pickerProcessing.value && !resolvingPendingText.value) void saveNow();
    return;
  }
  if (busy.value || pickerOpen.value || designBrowser.value || pendingDesign.value || pendingTextAction.value || pendingLeave.value || moreOpen.value || selectionActionsOpen.value || pageActionsOpen.value || exportOpen.value || textOpen.value || sizeOpen.value || deleteDraftOpen.value || deletePageOpen.value || view.value !== 'editor') return;
  if (textPending.value) return;
  const target = event.target as HTMLElement | null;
  if (store.cropEditing) { if (event.key === 'Escape') { event.preventDefault(); finishCrop(false); } return; }
  if (target?.closest('input,textarea,select,[role="combobox"],[role="listbox"],[role="dialog"]') || target?.isContentEditable) return;
  if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? store.redo() : store.undo(); }
  else if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); store.redo(); }
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); store.deleteSelected(); }
  else if (event.key === 'Escape') { store.select(null); tool.value = 'select'; cropMode.value = false; swapFirst.value = null; panelOpen.value = false; advancedOpen.value = false; }
});
function dropFiles(event: DragEvent) {
  event.preventDefault(); if (busy.value || pickerProcessing.value) return;
  const files = [...(event.dataTransfer?.files ?? [])]; if (!files.length) return;
  if (!pickerOpen.value) { if (view.value === 'editor') managePhotos(); else beginSelection(); }
  void stagePhotos(files);
}

type AppView = 'home' | 'templates' | 'drafts' | 'editor';
let routeReady = false;
let handlingBack = false;
const overlay = computed(() => photoPreviewOpen.value ? 'photo-preview' : pickerOpen.value ? 'photos' : templatePreviewOpen.value ? 'template-preview' : pendingDesign.value ? 'design-confirm' : pendingTextAction.value ? 'pending-text' : pendingLeave.value ? 'save-failed' : exportOpen.value ? 'export' : textOpen.value ? 'text' : sizeOpen.value ? 'size' : deleteDraftOpen.value ? 'delete-draft' : deletePageOpen.value ? 'delete-page' : designBrowser.value ? `design-${designBrowser.value}` : selectionActionsOpen.value ? 'selection-actions' : pageActionsOpen.value ? 'page-actions' : moreOpen.value ? 'more' : cropMode.value ? 'crop' : inlineCropMode.value && explicitInlineCrop ? 'inline-crop' : null);
function overlaySnapshot(position: number): OverlaySnapshot {
  return {
    position, pageId: doc.value.id, selection: store.selection ? { ...store.selection } : null,
    panel: panel.value, panelOpen: panelOpen.value, advancedOpen: advancedOpen.value,
    pickerIntent: pickerIntent.value, creationRatio: creationRatio.value, pendingTemplate: pendingTemplate.value,
    items: pickerItems.value.map(item => ({ id: item.id, assetId: item.asset.id, asset: item.asset as MediaAsset | undefined })),
    photoPreviewId: photoSelection.value?.getPreviewId() ?? null,
    previewTemplate: editorPanel.value?.getTemplatePreview() ?? templateGallery.value?.getPreview() ?? null,
    pendingDesign: pendingDesign.value, pendingTextAction: pendingTextAction.value,
    pendingLeave: pendingLeave.value ? { ...pendingLeave.value } : null,
    textValue: textValue.value, customWidth: customWidth.value, customHeight: customHeight.value,
    pendingDraftIds: pendingDraftIds.value.slice(), pendingPageId: pendingPageId.value,
    crop: crop.value ? { ...crop.value } : null,
    exportFormat: exportFormat.value, exportScale: exportScale.value,
    staticExportQuality: staticExportQuality.value, motionExportQuality: motionExportQuality.value,
    exportFps: exportFps.value, exportAllPages: exportAllPages.value,
  };
}
interface OverlaySnapshot {
  position: number;
  pageId: string;
  selection: Selection;
  panel: PanelName;
  panelOpen: boolean;
  advancedOpen: boolean;
  pickerIntent: 'create' | 'manage';
  creationRatio: string;
  pendingTemplate: TemplatePreset | null;
  items: Array<{ id: string; assetId: string; asset?: MediaAsset }>;
  photoPreviewId: string | null;
  previewTemplate: TemplatePreset | null;
  pendingDesign: TemplatePreset | null;
  pendingTextAction: { kind: 'export' } | { kind: 'leave'; target: 'home' | 'templates' | 'drafts' } | null;
  pendingLeave: { target: 'home' | 'templates' | 'drafts'; error: string; backupRevision?: number; downloaded?: boolean } | null;
  textValue: string;
  customWidth: number;
  customHeight: number;
  pendingDraftIds: string[];
  pendingPageId: string;
  crop: CropState | null;
  exportFormat: ExportOptions['format'];
  exportScale: number;
  staticExportQuality: number;
  motionExportQuality: number;
  exportFps: number;
  exportAllPages: boolean;
}
const overlaySnapshots = new Map<string, OverlaySnapshot>();
let historyPosition: number = window.history.state?.position ?? 0;
let activeOverlayKey: string | null = window.history.state?.overlayKey ?? null;
function historyOverlayData(snapshot: OverlaySnapshot): OverlaySnapshot {
  // Original files stay in the session cache, never copied into browser history.
  return JSON.parse(JSON.stringify({ ...snapshot, items: snapshot.items.map(({ id, assetId }) => ({ id, assetId })) })) as OverlaySnapshot;
}
function writeRoute(push: boolean) {
  const previous = window.history.state;
  const position = push ? historyPosition + 1 : historyPosition;
  if (push) for (const [key, snapshot] of overlaySnapshots) if (snapshot.position > historyPosition) overlaySnapshots.delete(key);
  const overlayKey = overlay.value ? crypto.randomUUID() : null;
  if (!push && previous?.overlayKey) overlaySnapshots.delete(previous.overlayKey);
  const snapshot = overlayKey ? overlaySnapshot(position) : null;
  if (overlayKey && snapshot) overlaySnapshots.set(overlayKey, snapshot);
  const state = { collageView: view.value, projectId: store.project.id, mainTab: mainTab.value, overlay: overlay.value, position, overlayKey, data: snapshot ? historyOverlayData(snapshot) : null };
  const url = view.value === 'editor' ? `#/edit/${store.project.id}` : `#/${view.value === 'home' ? 'create' : view.value}`;
  if (push) window.history.pushState(state, '', url); else window.history.replaceState(state, '', url);
  historyPosition = position;
  activeOverlayKey = overlayKey;
}
function rememberOverlay() {
  const state = window.history.state;
  if (!routeReady || handlingBack || !state?.overlayKey || state.overlay !== overlay.value) return;
  const snapshot = overlaySnapshot(state.position);
  overlaySnapshots.set(state.overlayKey, snapshot);
  window.history.replaceState({ ...state, data: historyOverlayData(snapshot) }, '');
}
watch([pickerItems, creationRatio, pendingTemplate, pendingDesign, pendingTextAction, () => pendingLeave.value && { ...pendingLeave.value }, textValue, customWidth, customHeight, pendingDraftIds, pendingPageId, () => store.selection, crop, exportFormat, exportScale, staticExportQuality, motionExportQuality, exportFps, exportAllPages, () => photoSelection.value?.getPreviewId(), () => templateGallery.value?.getPreview(), () => editorPanel.value?.getTemplatePreview()], rememberOverlay, { flush: 'post' });
watch([view, () => store.project.id, overlay], ([nextView, id, nextOverlay]) => {
  if (!routeReady || handlingBack || resolvingPendingText.value) return;
  const previous = window.history.state;
  if (nextView !== 'editor' && !nextOverlay && !previous?.overlay) writeRoute(false);
  else if (previous?.collageView === nextView && previous?.projectId === id) {
    if (previous.overlay === 'photo-preview' && nextOverlay === 'photos') window.history.back();
    else if (previous.overlay === 'photos' && nextOverlay === 'photo-preview') writeRoute(true);
    else if (previous.overlay && !nextOverlay) window.history.back();
    else if (previous.overlay || !nextOverlay) writeRoute(false);
    else writeRoute(true);
  } else if (previous?.overlay) writeRoute(false);
  else writeRoute(true);
});
function closeOverlays() {
  templateGallery.value?.closePreview(); editorPanel.value?.closeTemplatePreview();
  pendingDesign.value = null; pendingTextAction.value = null; pendingLeave.value = null;
  pickerOpen.value = false; exportOpen.value = false; moreOpen.value = false; selectionActionsOpen.value = false; pageActionsOpen.value = false;
  textOpen.value = false; sizeOpen.value = false; deleteDraftOpen.value = false; deletePageOpen.value = false; designBrowser.value = null;
  if (store.cropEditing) finishCrop(false);
}
async function restorePicker(snapshot: OverlaySnapshot) {
  clearStagedPhotos(); pickerItems.value = [];
  pickerIntent.value = snapshot.pickerIntent; creationRatio.value = snapshot.creationRatio;
  pendingTemplate.value = snapshot.pendingTemplate; pickerError.value = ''; pickerProcessing.value = true;
  pickerMessage.value = '正在恢复选片…'; pickerOpen.value = true;
  const restored: PhotoSelectionItem[] = [], ids = new Map<string, string>();
  try {
    for (const item of snapshot.items) {
      const placed = pickerIntent.value === 'manage' ? placedPhotos.value.find(photo => photo.id === item.id || item.id.startsWith('new:') && photo.asset.id === item.assetId) : undefined;
      if (placed) { restored.push(placed); ids.set(item.id, placed.id); continue; }
      const original = store.assets[item.assetId] ?? item.asset;
      if (!original) { pickerError.value = '刷新后未确认的照片已不可用，请重新添加；已保存的作品不受影响。'; continue; }
      const asset = await createAsset(original.blob, original.name, original.kind);
      const id = `new:${asset.id}`;
      stagedAssets.set(asset.id, asset); restored.push({ id, asset }); ids.set(item.id, id);
    }
    pickerItems.value = restored;
    // Nested preview entries must follow regenerated file IDs across repeated
    // back/forward cycles, without putting original blobs in history.state.
    for (const cached of overlaySnapshots.values()) {
      for (const item of cached.items) {
        const id = ids.get(item.id);
        if (!id || id === item.id) continue;
        const photo = restored.find(photo => photo.id === id);
        if (!photo) continue;
        item.id = id; item.assetId = photo.asset.id; item.asset = photo.asset;
      }
      if (cached.photoPreviewId) cached.photoPreviewId = ids.get(cached.photoPreviewId) ?? cached.photoPreviewId;
    }
  } catch (error) { clearStagedPhotos(); pickerItems.value = []; throw error; }
  finally { pickerProcessing.value = false; pickerMessage.value = ''; }
  return ids;
}
async function restoreOverlay(kind: NonNullable<typeof overlay.value>, snapshot: OverlaySnapshot) {
  if (view.value === 'editor') { store.selectPage(snapshot.pageId); store.select(snapshot.selection); }
  panel.value = snapshot.panel; panelOpen.value = snapshot.panelOpen; advancedOpen.value = snapshot.advancedOpen;
  switch (kind) {
    case 'photos': case 'photo-preview': {
      const ids = await restorePicker(snapshot); await nextTick();
      if (kind === 'photo-preview' && snapshot.photoPreviewId) photoSelection.value?.openPreview(ids.get(snapshot.photoPreviewId) ?? snapshot.photoPreviewId);
      break;
    }
    case 'template-preview':
      if (!snapshot.previewTemplate) throw new Error('原模板预览已不可用，请重新选择模板。');
      await nextTick();
      if (view.value === 'editor') editorPanel.value?.openTemplatePreview(snapshot.previewTemplate);
      else templateGallery.value?.openPreview(snapshot.previewTemplate);
      break;
    case 'design-confirm': pendingDesign.value = snapshot.pendingDesign; break;
    case 'pending-text': pendingTextAction.value = snapshot.pendingTextAction; break;
    case 'save-failed': pendingLeave.value = snapshot.pendingLeave; break;
    case 'export':
      await openExport(true);
      exportFormat.value = snapshot.exportFormat; exportScale.value = snapshot.exportScale;
      staticExportQuality.value = snapshot.staticExportQuality; motionExportQuality.value = snapshot.motionExportQuality;
      exportFps.value = snapshot.exportFps; exportAllPages.value = snapshot.exportAllPages;
      break;
    case 'text': textValue.value = snapshot.textValue; textOpen.value = true; break;
    case 'size': customWidth.value = snapshot.customWidth; customHeight.value = snapshot.customHeight; sizeOpen.value = true; break;
    case 'delete-draft': pendingDraftIds.value = snapshot.pendingDraftIds.filter(id => drafts.value.some(draft => draft.id === id)); deleteDraftOpen.value = pendingDraftIds.value.length > 0; break;
    case 'delete-page': pendingPageId.value = snapshot.pendingPageId; deletePageOpen.value = true; break;
    case 'design-layouts': designBrowser.value = 'layouts'; break;
    case 'design-looks': designBrowser.value = 'looks'; break;
    case 'selection-actions': selectionActionsOpen.value = true; break;
    case 'page-actions': pageActionsOpen.value = true; break;
    case 'more': moreOpen.value = true; break;
    case 'crop': case 'inline-crop':
      if (!snapshot.selection) throw new Error('原照片位置已不可用，请重新选择照片。');
      if (kind === 'crop') beginCrop(snapshot.selection); else beginInlineCrop(snapshot.selection, true);
      if (store.cropEditing && snapshot.crop) store.changeCrop({ ...snapshot.selection, crop: snapshot.crop }, false);
      break;
  }
}
useEventListener(window, 'popstate', async event => {
  if (!routeReady) return;
  const position: number = event.state?.position ?? historyPosition;
  if (handlingBack || pickerProcessing.value || busy.value || resolvingPendingText.value) {
    const delta = historyPosition - position; if (delta) window.history.go(delta);
    return;
  }
  handlingBack = true;
  const previousPosition = historyPosition, previousOverlayKey = activeOverlayKey;
  historyPosition = position; activeOverlayKey = event.state?.overlayKey ?? null;
  try {
    if (previousOverlayKey && overlay.value) {
      // Number fields commit on blur; capture before dismissing the outgoing dialog.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      await nextTick();
      overlaySnapshots.set(previousOverlayKey, overlaySnapshot(previousPosition));
    }
    const state = event.state;
    const snapshot: OverlaySnapshot | undefined = state?.overlayKey ? overlaySnapshots.get(state.overlayKey) ?? state.data : undefined;
    if (pickerOpen.value && state?.collageView === view.value && state.projectId === store.project.id && (state.overlay === 'photos' || state.overlay === 'photo-preview')) {
      if (state.overlay === 'photos') photoSelection.value?.closePreview();
      else if (snapshot?.photoPreviewId) photoSelection.value?.openPreview(snapshot.photoPreviewId);
      return;
    }
    closeOverlays(); await nextTick();
    if (mainTabs.includes(state?.mainTab)) mainTab.value = state.mainTab;
    const target = state?.collageView as AppView | undefined;
    if (target === 'editor') {
      if (state.projectId !== store.project.id) { await preserveCurrent(); await openDraft(state.projectId); }
      else view.value = 'editor';
    } else { await preserveCurrent(); advancedOpen.value = false; view.value = target === 'templates' || target === 'drafts' ? target : 'home'; await refreshDrafts(); }
    await nextTick();
    if (state?.overlay && snapshot) await restoreOverlay(state.overlay, snapshot);
    else if (state?.overlay) throw new Error('该弹窗状态已不可用，请从对应工具重新打开。');
  } catch (error) {
    const target = event.state?.collageView;
    if (view.value === 'editor' && (target === 'home' || target === 'templates' || target === 'drafts')) pendingLeave.value = { target, error: errorMessage(error) };
    else notify(`导航失败：${errorMessage(error)}。当前作品仍保留。`, true);
    writeRoute(false);
  } finally { await nextTick(); handlingBack = false; rememberOverlay(); }
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
    writeRoute(false);
  }
});
onBeforeUnmount(() => {
  removeNativeLinkHandler?.();
  overlaySnapshots.clear();
  clearTimeout(toastTimer); abortController?.abort(); clearExportResult(); clearStagedPhotos();
  document.documentElement.style.removeProperty('--visible-height');
  document.documentElement.style.removeProperty('--visible-top');
  clearExportPreviews();
  clearPagePreviews();
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
      <button class="brand" aria-label="拼贴时光首页" @click="navigate('home')"><span class="brand-symbol"><img :src="brandLogoUrl" width="40" height="40" alt="" /></span><strong>拼贴时光</strong></button>
      <nav class="header-nav" aria-label="主导航"><button :class="{ active: view === 'home' }" @click="navigate('home')">首页</button><button :class="{ active: view === 'templates' }" @click="navigate('templates')">模板</button><button :class="{ active: view === 'drafts' }" @click="navigate('drafts')">作品</button></nav>
      <div class="app-header-actions"><button v-if="view === 'home' && !nativeApp" class="check-update-button" :disabled="!!busy || !pwaStatus?.state.available || !pwaStatus?.state.online || pwaStatus?.state.checking || pwaStatus?.state.updatePending" @click="pwaStatus?.checkForUpdates()"><RefreshCw :size="16" :class="{ spinning: pwaStatus?.state.checking }" />{{ pwaStatus?.state.checking ? '检查中…' : '检查更新' }}</button></div>
    </header>
    <PwaStatus ref="pwaStatus" :allow-update="view !== 'editor' && !busy && !isSaving && !textPending && !textDraft.trim() && !store.dirty && !overlay" />
    <main class="app-content" @dragover.prevent @drop="dropFiles">
      <section v-show="view === 'home'" class="app-page" data-page="home" :class="{ 'is-current': view === 'home' }">
        <HomeScreen :photos="examplePhotos" :disabled="!!busy || pickerProcessing || textPending" :example-loading="exampleLoading" :registration-number="registrationNumber" @start="beginSelection" @sample="startExample" @browse="browseTemplates" @preview="(template, event) => templateGallery?.openPreview(template, event)" />
      </section>
      <section v-show="view === 'templates'" class="app-page" data-page="templates" :class="{ 'is-current': view === 'templates' }">
        <div class="library-heading"><div><h1>模板</h1><p>先看真实效果，再放入你的照片。</p></div></div>
        <TemplateGallery ref="templateGallery" v-model:query="templateQuery" :disabled="!!busy" @preview="templatePreviewOpen = $event" @select="chooseTemplate" />
      </section>
      <section v-show="view === 'drafts'" class="app-page" data-page="drafts" :class="{ 'is-current': view === 'drafts' }">
        <WorksScreen :drafts="drafts" :disabled="!!busy || isSaving" @start="beginSelection" @import="projectInput?.click()" @open="openDraft" @delete="requestDeleteDrafts" />
      </section>
    </main>
    <AppTabBar :active="mainTab" @select="navigate" />
  </div>

  <main v-if="view === 'editor'" class="editor-view" :class="{ 'crop-session': cropMode, 'inline-crop-session': inlineCropMode, 'keyboard-open': keyboardOpen }" @dragover.prevent @drop="dropFiles">
    <header class="editor-header">
      <template v-if="cropMode"><button class="text-button" @click="finishCrop(false)">取消</button><h1>全屏精修</h1><button class="text-button accent-text" @click="finishCrop(true)">完成</button></template>
      <template v-else>
        <button class="icon-button" aria-label="返回" :disabled="store.cropEditing" @click="navigate(mainTab)"><ArrowLeft :size="23" /></button>
        <div class="editor-project"><input v-model="projectTitle" class="project-title" aria-label="作品名称" maxlength="80" :disabled="store.cropEditing" @focus="titleEditing = true" @blur="commitProjectTitle" @keydown.enter="event => { if (!event.isComposing) (event.target as HTMLInputElement).blur(); }" /><span class="save-status">{{ inlineCropMode ? '正在调整取景' : isSaving ? '正在保存草稿…' : textPending ? '正在准备文字…' : store.dirty || projectTitle !== store.project.title ? '等待自动保存' : '草稿已存本机' }}</span></div>
        <div class="editor-header-actions"><button class="icon-button" aria-label="撤销" :disabled="!store.canUndo || store.cropEditing || !!busy || textPending" @click="store.undo()"><Undo2 :size="21" /></button><button class="icon-button" aria-label="重做" :disabled="!store.canRedo || store.cropEditing || !!busy || textPending" @click="store.redo()"><Redo2 :size="21" /></button><button class="primary-button" :disabled="store.cropEditing" @click="openExport()">导出<Download :size="17" /></button></div>
      </template>
    </header>
    <div class="editor-body" :class="{ 'panel-open': dockOpen, 'text-open': dockOpen && panel === 'text' }">
      <section class="workspace">
        <div v-if="cropMode" class="canvas-topline"><span>拖动平移 · 双指缩放</span></div>
        <div class="canvas-stage"><EditorCanvas ref="canvas" :document="canvasDocument" :assets="store.assets" :selection="canvasSelection" :tool="tool" :brush-color="brushColor" :brush-size="brushSize" :brush-opacity="highlighter ? .4 : 1" :crop-mode="cropMode" :inline-crop-mode="inlineCropMode" :inline-disabled="inlineDisabled" :playing="playing" @select="select" @transform="store.transform" @crop="changeCanvasCrop" @inline-start="beginInlineCrop" @inline-end="endInlineCrop" @draw="draw" @request-asset="requestAsset" @edit-text="openText" @error="message => notify(message, true)"><CanvasCropPreview v-if="cropPreview !== 'off' && !cropMode" :width="doc.width" :height="doc.height" :ratio="Number(cropPreview)" /></EditorCanvas><button v-if="!photoCount && !doc.elements.length" class="canvas-empty-prompt" @click="managePhotos"><ImagePlus :size="27" /><strong>添加照片</strong></button></div>
        <div v-if="inlineCropMode || swapFirst || store.selection" class="context-actions" :class="{ 'inline-crop-actions': inlineCropMode, 'has-selection': !!store.selection && !inlineCropMode }">
          <template v-if="inlineCropMode && crop"><span class="selection-label">取景</span><button aria-label="缩小照片取景" @click="adjustCrop({ zoom: Math.max(MIN_CROP_ZOOM, crop.zoom - .2) })">−</button><span class="selection-label">{{ crop.zoom.toFixed(1) }}×</span><button aria-label="放大照片取景" @click="adjustCrop({ zoom: Math.min(MAX_CROP_ZOOM, crop.zoom + .2) })">+</button><button @click="finishCrop(false)">取消</button><button class="accent-text" @click="finishCrop(true)">完成</button></template>
          <template v-else-if="swapFirst"><span class="selection-label">点另一张照片交换位置</span><button @click="swapFirst = null">取消交换</button></template>
          <template v-else-if="store.selection">
            <div class="context-scroll">
            <button v-if="canAdjustPhoto" @click="store.selectedAsset?.kind === 'image' ? beginInlineCrop(store.selection, true) : beginCrop(store.selection)"><Move :size="16" />取景</button>
            <button v-if="canAdjustPhoto" @click="openPhotoText"><Type :size="16" />加字</button>
            <button v-if="hasImageSelection && !(store.selectedSlot ?? store.selected)?.locked" @click="uploadPhotos(true)"><ImagePlus :size="16" />替换</button>
            <button v-if="canAdjustPhoto" aria-label="调整所选照片" @click="openPhotoAdjustments"><SlidersHorizontal :size="16" />调整</button>
            <template v-if="store.selected?.type === 'text'"><button :disabled="store.selected.locked" @click="openText(store.selected.id)"><Type :size="16" />改文字</button><button @click="openPhotoText"><Palette :size="16" />字样</button></template>
            <template v-if="store.selected?.type === 'shape'"><button @click="openShapeEditor"><Palette :size="16" />编辑形状</button><button :disabled="store.selected.locked" aria-label="删除所选形状，可撤销" @click="handleAction({ type: 'remove' })"><Trash2 :size="16" />删除</button></template>
            <button aria-label="所选元素操作" @click="selectionActionsOpen = true"><MoreHorizontal :size="18" />操作</button>
            </div>
            <button class="selection-done" @click="store.select(null)">完成</button>
          </template>
        </div>
        <p v-if="tool !== 'select'" class="canvas-caption">在画布上绘制</p>
        <p v-if="cropPreview !== 'off' && !cropMode" class="crop-preview-note">模拟居中裁切，不参与导出；不同微信入口的裁切规则不同，以实际界面为准。</p>
      </section>
      <Transition name="dock">
        <EditorToolDock :open="dockOpen" :title="advancedOpen && panel === 'photos' ? '照片精细调整' : panelTitle" :text="panel === 'text'" :disabled="store.cropEditing" :keyboard-open="keyboardOpen" :focus-key="panel === 'layers' && store.selection ? `${store.selection.kind}:${store.selection.id}` : undefined" @close="panelOpen = false; advancedOpen = false">
          <div v-if="!advancedOpen && ['layouts', 'spacing', 'looks'].includes(panel)" class="dock-shortcuts" role="group" aria-label="排版与样式"><button :aria-pressed="panel === 'layouts'" @click="panel = 'layouts'">构图</button><button :aria-pressed="panel === 'spacing'" @click="panel = 'spacing'">留白圆角</button><button :aria-pressed="panel === 'looks'" @click="panel = 'looks'">照片风格</button></div>
          <PhotoTextTools ref="photoTextTools" v-show="panel === 'text' && !advancedOpen" v-model:draft="textDraft" :pending="textPending" :document="doc" :assets="store.assets" :selection="store.selection" @action="handleAction" />
          <template v-if="!advancedOpen">
            <div v-if="panel === 'photos'" class="dock-shortcuts"><button :disabled="!photoCount" @click="openPhotoAdjustments"><SlidersHorizontal :size="17" />精细调整所选照片</button></div>
            <label v-if="panel === 'background'" class="form-row">社交裁切预览<AppSelect :value="cropPreview" :options="cropPreviewOptions" label="微信裁切预览" @change="value => cropPreview = String(value)" /></label>
            <CollageTools v-if="panel !== 'text' && compactPanels[panel]" :panel="panel" :document="doc" :assets="store.assets" :selection="store.selection" @action="handleAction" @manage-photos="managePhotos" @crop="beginCrop" @browse="value => designBrowser = value" />
          </template>
          <template v-else>
            <div v-if="panel === 'photos' && placedPhotos.length" class="adjustment-photos" aria-label="选择要调整的照片"><button v-for="(photo, index) in placedPhotos" :key="photo.id" :aria-label="`调整第 ${index + 1} 张照片`" :aria-pressed="store.selection?.id === photo.id" @click="store.select(photoTarget(photo.id))"><img :src="photo.asset.thumbnail || photo.asset.src" alt="" /><span>{{ index + 1 }}</span></button></div>
            <EditorPanel ref="editorPanel" v-model:text-draft="textDraft" :preview-photos="templatePhotos" :text-pending="textPending" :panel="panel" :document="doc" :assets="store.assets" :selection="store.selection" :tool="tool" :brush-color="brushColor" :brush-size="brushSize" :highlighter="highlighter" :crop-mode="cropMode" @template-preview="open => templatePreviewOpen = open" @action="handleAction" />
          </template>
        </EditorToolDock>
      </Transition>
      <nav v-if="!cropMode" class="tools-nav" :class="{ 'has-active': dockOpen || moreOpen }" aria-label="拼图工具" :style="{ '--tool-count': toolItems.length + 1, '--tool-index': activeToolIndex }"><button v-for="item in toolItems" :key="item.id" class="tool-button" :class="{ active: (panel === item.id || item.id === 'looks' && panel === 'spacing') && dockOpen }" :data-tool="item.id" :aria-pressed="(panel === item.id || item.id === 'looks' && panel === 'spacing') && dockOpen" :disabled="store.cropEditing || !!busy || textPending" @click="choosePanel(item.id)"><span class="tool-icon"><component :is="item.icon" :size="23" /></span>{{ item.label }}</button><button class="tool-button" :class="{ active: moreOpen || (dockOpen && toolIndex < 0) }" data-tool="more" aria-haspopup="dialog" :disabled="store.cropEditing || !!busy || textPending" @click="moreOpen = true"><span class="tool-icon"><MoreHorizontal :size="24" /></span>工具</button></nav>
      <section v-else-if="crop" class="crop-controls" aria-label="照片裁切工具"><PanelRange label="照片缩放" :value="crop.zoom" :min="MIN_CROP_ZOOM" :max="MAX_CROP_ZOOM" :step=".01" unit="×" @input="zoom => adjustCrop({ zoom })" /><div class="crop-actions"><button @click="adjustCrop({ rotation: (crop.rotation + 450) % 360 - 180 })"><RotateCcw :size="22" />左转</button><button @click="adjustCrop({ rotation: (crop.rotation + 630) % 360 - 180 })"><RotateCw :size="22" />右转</button><button :aria-pressed="crop.flipX" @click="adjustCrop({ flipX: !crop.flipX })"><FlipHorizontal :size="22" />翻转</button><button :aria-pressed="crop.flipY" @click="adjustCrop({ flipY: !crop.flipY })"><FlipVertical :size="22" />上下</button><button @click="adjustCrop(createCrop())"><Undo2 :size="22" />重置</button></div></section>
    </div>
    <audio v-if="musicAsset" ref="musicPlayer" :src="musicAsset.src" preload="auto" @loadedmetadata="syncMusic" @timeupdate="musicTimeUpdate" @ended="() => { if (musicPlayer && playing) { musicPlayer.currentTime = doc.audio?.start ?? 0; void musicPlayer.play(); } }" />
  </main>

  <AppDialog v-model:open="selectionActionsOpen" :title="selectedPhotoNumber ? `照片 ${selectedPhotoNumber}` : store.selected?.type === 'text' ? '文字操作' : '元素操作'">
    <div v-if="store.selection" class="selection-action-list">
      <button v-if="canAdjustPhoto" @click="selectionAction(() => { if (store.selection) beginCrop(store.selection); })"><Maximize2 :size="21" /><span>全屏精修</span></button>
      <button v-if="hasImageSelection && !(store.selectedSlot ?? store.selected)?.locked" @click="selectionAction(() => uploadPhotos(true))"><ImagePlus :size="21" /><span>替换照片</span></button>
      <button v-if="canAdjustPhoto && store.selectedSlot && photoCount > 1" @click="selectionAction(() => handleAction({ type: 'swap' }))"><Rows3 :size="21" /><span>交换照片位置</span></button>
      <button v-if="canAdjustPhoto && posterComposition && photoCount >= 2" @click="selectionAction(() => { if (store.selection) handleAction({ type: 'mainPhoto', target: store.selection }); })"><Users :size="21" /><span>设为海报主图</span></button>
      <button v-if="store.selected?.type === 'shape'" @click="selectionAction(openShapeEditor)"><Palette :size="21" /><span>编辑形状 · 颜色与大小</span></button>
      <button v-if="store.selected" :disabled="store.selected.locked" @click="selectionAction(() => store.duplicateSelected())"><Copy :size="21" /><span>复制元素</span></button>
      <button class="destructive-action" :disabled="(store.selectedSlot ?? store.selected)?.locked" @click="selectionAction(() => store.deleteSelected())"><Trash2 :size="21" /><span>删除所选{{ hasImageSelection ? '照片' : '元素' }}</span><small>可撤销</small></button>
    </div>
    <template #footer><button class="secondary-button wide" @click="selectionActionsOpen = false">返回画布</button></template>
  </AppDialog>
  <AppDialog v-model:open="pageActionsOpen" :title="`作品中的图片 · ${store.project.pages.length} 张`">
    <div class="selection-action-list">
      <div class="legacy-page-grid"><button v-for="(page, index) in store.project.pages" :key="page.id" class="legacy-page-card" :aria-pressed="page.id === doc.id" :aria-label="`编辑第 ${index + 1} 张图片`" @click="selectPage(page.id)"><img v-if="pagePreview(page)" :src="pagePreview(page)!" alt="" /><span>第 {{ index + 1 }} 张</span></button></div>
      <button :disabled="pageNumber === 1" @click="pageActionsOpen = false; store.reorderPage(doc.id, -1)"><ChevronLeft :size="21" /><span>向前移动此页</span></button>
      <button :disabled="pageNumber === store.project.pages.length" @click="pageActionsOpen = false; store.reorderPage(doc.id, 1)"><ChevronRight :size="21" /><span>向后移动此页</span></button>
      <button class="destructive-action" :disabled="store.project.pages.length <= 1" @click="pageActionsOpen = false; pendingPageId = doc.id; deletePageOpen = true"><Trash2 :size="21" /><span>删除当前页</span><small>可撤销</small></button>
    </div>
    <template #footer><button class="secondary-button wide" @click="pageActionsOpen = false">返回画布</button></template>
  </AppDialog>
  <PhotoSelectionSheet ref="photoSelection" v-model:open="pickerOpen" :items="pickerItems" :imports="photoImports" :intent="pickerIntent" :ratio="creationRatio" :processing="pickerProcessing" :processing-message="pickerMessage" :error="pickerError" :required-count="pickerRequired" :max-photos="pickerMax" :lock-configuration="!!pendingTemplate" @preview="open => photoPreviewOpen = open" @ratio="value => creationRatio = value" @add="addPickerPhotos" @remove="removePickerPhotos" @confirm="confirmPhotos" />
  <AppDialog v-model:open="designConfirmOpen" :title="pendingDesign?.name ?? '应用设计'" :description="`保留全部 ${photoCount} 张照片；替换本页的排版、文字与装饰。取消不修改，应用后可一步撤销。`" wide>
    <div v-if="pendingDesign" class="poster-confirm-preview"><TemplatePreview :template="pendingDesign" :photos="templatePhotos" eager /></div>
    <p class="form-note">预览使用你的照片。应用后可编辑文字与装饰；未添加的文案仍保留在本页草稿中。</p>
    <template #footer><div class="dialog-actions"><button class="secondary-button" @click="pendingDesign = null">取消</button><button class="primary-button" @click="confirmDesign">确认替换并应用</button></div></template>
  </AppDialog>
  <AppDialog v-model:open="designBrowserOpen" :title="designBrowser === 'layouts' ? '挑选构图' : '挑选照片风格'" :description="designBrowser === 'layouts' ? '用你的照片看主次、比例与留白。点选后立即应用。' : '相纸、拍立得、胶片与画廊留白。保留照片的裁剪与摆放。'" wide>
    <div class="design-browser-content">
      <LayoutGallery v-if="designBrowser === 'layouts'" :count="designPhotos.length" :document="doc" :assets="store.assets" :selected-id="doc.mode === 'grid' ? doc.layoutId : undefined" :preview-photos="designPhotos" @select="layout => handleAction({ type: 'layout', layout })" />
      <CollageStyleGallery v-else-if="designBrowser === 'looks'" :document="doc" :assets="store.assets" @select="look => handleAction({ type: 'look', look })" />
    </div>
    <template #footer><div class="design-browser-actions"><span>点选即生效 · 可撤销</span><button class="primary-button" @click="designBrowser = null">回到画布</button></div></template>
  </AppDialog>
  <AppDialog v-model:open="moreOpen" title="工具与作品">
    <h3 class="more-section-title">装饰与高级工具</h3>
    <div class="extra-tools"><button v-for="item in extraTools" :key="item.id" @click="choosePanel(item.id)"><component :is="item.icon" :size="22" /><span>{{ item.label }}</span><ChevronRight :size="17" /></button><button @click="openPhotoAdjustments"><SlidersHorizontal :size="22" /><span>照片高级调整</span><ChevronRight :size="17" /></button><button @click="moreOpen = false; panel = 'background'; panelOpen = false; advancedOpen = true"><Palette :size="22" /><span>背景与纹理</span><ChevronRight :size="17" /></button></div>
    <h3 class="more-section-title">作品管理</h3>
    <div class="more-project-actions"><button v-if="store.project.pages.length > 1" class="secondary-button" @click="moreOpen = false; pageActionsOpen = true"><Images :size="18" />切换图片 · {{ store.project.pages.length }} 张</button><button class="secondary-button" @click="moreOpen = false; mediaInput?.click()"><Film :size="18" />导入视频 / GIF</button><button class="secondary-button" @click="moreOpen = false; togglePlaying()"><Play :size="18" />{{ playing ? '停止预览' : '播放动画' }}</button><button v-if="store.project.pages.length > 1" class="secondary-button" @click="moreOpen = false; previewAllPages = !previewAllPages"><Film :size="18" />{{ previewAllPages ? '关闭连续预览' : '连续预览全部图片' }}</button><button class="secondary-button" @click="moreOpen = false; saveNow()"><Save :size="18" />保存本机草稿</button><button class="secondary-button" @click="moreOpen = false; saveProjectFile()"><FolderOpen :size="18" />导出项目备份</button><button class="secondary-button" @click="openSize"><Maximize2 :size="18" />调整尺寸与比例</button></div>
  </AppDialog>
  <AppDialog v-model:open="pendingTextOpen" title="还有文案尚未添加" :description="pendingTextAction?.kind === 'export' ? '文案会保留在本机草稿中，但尚未出现在图片里。请决定是否先添加再导出。' : '可以先添加到画布，或保留文案草稿，下次打开继续编辑。'" :locked="resolvingPendingText">
    <p class="pending-draft-preview">{{ textDraft }}</p>
    <template #footer><div class="pending-text-actions"><button class="primary-button" :disabled="resolvingPendingText || textPending" @click="resolvePendingText(true)">添加文案并继续</button><button class="secondary-button" :disabled="resolvingPendingText" @click="resolvePendingText(false)">保留草稿并继续</button><button class="link-button" :disabled="resolvingPendingText" @click="pendingTextAction = null">返回编辑</button></div></template>
  </AppDialog>
  <AppDialog v-model:open="leaveFailedOpen" title="本机草稿保存失败" description="作品仍保留在当前会话中。请重试保存，或导出完整项目备份并确认保存成功后离开。">
    <p class="form-note">{{ pendingLeave?.error }}</p>
    <p v-if="pendingLeave?.backupRevision === store.revision" class="form-note">{{ pendingLeave.downloaded ? '项目下载已发起。请确认 .collage 文件已经下载成功，再确认离开。' : '项目备份已保存，可以确认离开。' }}</p>
    <template #footer><div class="dialog-actions"><button class="secondary-button" @click="pendingLeave && navigate(pendingLeave.target, true)">重试保存并离开</button><button class="secondary-button" @click="backupBeforeLeaving">导出项目备份</button><button v-if="pendingLeave?.backupRevision === store.revision" class="primary-button" @click="leaveAfterBackup">确认备份已保存并离开</button><button class="link-button" @click="pendingLeave = null">返回编辑</button></div></template>
  </AppDialog>
  <AppDialog v-model:open="exportOpen" title="导出作品" :description="store.project.pages.some(page => page.textDraft.trim()) ? '未添加的文案已保留在草稿中，导出的图片只包含画布内容。' : '草稿留在本机；图片用于分享，项目备份用于继续编辑。'">
    <div class="export-preview" :class="{ 'long-preview': doc.layoutId.startsWith('long-') && !isAnimatedExport && store.project.pages.length === 1 }" :aria-busy="exportPreviewLoading">
      <div v-if="exportPreviewLoading" class="preview-loading"><span class="spinner" />正在准备预览</div>
      <div v-else-if="!isAnimatedExport && exportPagePreviews.length > 1" class="export-page-previews"><figure v-for="(preview, index) in exportPagePreviews" :key="preview.id"><img :src="preview.url" :alt="`第 ${index + 1} 张图片导出预览`" /><figcaption>第 {{ index + 1 }} 张</figcaption></figure></div>
      <video v-else-if="exportResult?.blob.type.startsWith('video/')" :src="exportResult.url" controls playsinline />
      <img v-else-if="exportResult?.blob.type.startsWith('image/') || exportPreview" :src="exportResult?.blob.type.startsWith('image/') ? exportResult.url : exportPreview" :alt="`${store.project.title}导出预览`" />
    </div>
    <p v-if="!isAnimatedExport && store.project.pages.length > 1" class="form-note">这份历史作品包含 {{ store.project.pages.length }} 张图片，导出会生成全部图片并打包为 ZIP，不会只导出当前图片。</p>
    <div class="export-options"><div class="option-heading"><span>格式</span><small>{{ exportFormat === 'png' ? '无损 · 支持透明' : exportFormat === 'jpeg' ? '适合照片分享' : exportFormat === 'webp' ? '轻量 · 支持透明' : '动态作品' }}</small></div><div class="segmented-control" aria-label="图片格式"><button v-for="format in exportFormats" :key="format.value" :aria-pressed="exportFormat === format.value" @click="exportFormat = format.value; clearExportResult()">{{ format.label }}</button></div><div class="option-heading"><span>清晰度</span><small>{{ exportDimensions }}</small></div><div class="segmented-control" aria-label="图片清晰度"><button v-for="size in exportSizes" :key="size.value" :disabled="size.value > maxExportScale" :aria-pressed="exportScale === size.value" @click="exportScale = size.value; clearExportResult()">{{ size.label }}<small>{{ size.value }}×</small></button></div></div>
    <label v-if="exportFormat === 'jpeg' || exportFormat === 'webp'" class="form-row">图片画质<AppSelect :value="staticExportQuality" :options="[{ value: .75, label: '节省空间' }, { value: .94, label: '高画质' }, { value: 1, label: '最高画质' }]" label="静态图片画质" @change="value => { staticExportQuality = Number(value); clearExportResult(); }" /></label>
    <p v-if="maxExportScale < 2" class="form-note">当前尺寸接近导出上限：最长边 8192 像素、总计 6400 万像素。请降低导出清晰度或调整画布尺寸。</p>
    <details class="motion-export"><summary>动态图与视频</summary><label class="form-row">动态格式<AppSelect :value="exportFormat" :options="[{ value: 'png', label: '静态图片' }, { value: 'gif', label: 'GIF · 无声音' }, { value: 'mp4', label: 'MP4 · 视频' }, { value: 'webm', label: 'WebM · 视频' }]" label="动态导出格式" @change="value => { exportFormat = value as ExportOptions['format']; clearExportResult(); }" /></label><div v-if="isAnimatedExport" class="form-columns"><label class="form-row">帧率<AppSelect :value="exportFps" :options="[8, 12, 24, 30].map(value => ({ value, label: `${value} fps` }))" label="导出帧率" @change="value => { exportFps = Number(value); clearExportResult(); }" /></label><label class="form-row">画质<AppSelect :value="motionExportQuality" :options="[{ value: .75, label: '节省空间' }, { value: .94, label: '高画质' }, { value: 1, label: '最高画质' }]" label="导出画质" @change="value => { motionExportQuality = Number(value); clearExportResult(); }" /></label></div><label v-if="isAnimatedExport && store.project.pages.length > 1" class="check-row"><input v-model="exportAllPages" type="checkbox" @change="clearExportResult" />合成全部 {{ store.project.pages.length }} 页</label><p class="form-note">视频保留音乐与原声；GIF 没有声音。编码不支持时会提示，不偷偷换格式。</p></details>
    <div class="dialog-actions secondary-export-actions"><button class="link-button" @click="saveProjectFile">导出项目备份</button></div>
    <template #footer><div class="export-save-actions"><button class="primary-button" :disabled="exportPreviewLoading || !!busy" @click="saveImage"><Download :size="20" />{{ isAnimatedExport ? nativeApp ? '保存动态作品' : '下载动态作品' : store.project.pages.length > 1 ? `${nativeApp ? '保存' : '下载'} ${store.project.pages.length} 张图片` : nativeApp ? '保存到文件' : '下载图片' }}</button><button v-if="shareAvailable" class="secondary-button" :disabled="exportPreviewLoading || !!busy || !!exportResult && !canShareResult" @click="shareResult">{{ exportResult ? '系统分享' : '准备分享' }}</button><p class="export-save-hint">{{ !isAnimatedExport && store.project.pages.length > 1 ? '以 ZIP 保存全部图片，解压后即可逐张查看或分享；项目备份仍保留全部原始素材。' : nativeApp ? '保存到系统文件位置，不会自动写入相册；继续编辑请另存项目备份。' : isAnimatedExport ? '生成后下载到浏览器下载列表；支持的平台也可直接系统分享。' : '下载生成高清图片；手机长按保存请在文件生成后进行，避免保存低清预览。' }}</p><p v-if="shareAvailable && exportResult && !canShareResult" class="export-save-hint">系统不支持分享此文件，请下载后从系统文件应用分享。</p></div></template>
  </AppDialog>
  <AppDialog v-model:open="sizeOpen" title="自定义画布" :description="doc.layoutId.startsWith('long-') ? '高度按照片比例自动计算；调整宽度会保留留白与相框。' : '改变尺寸时，照片与文字会按比例调整。'">
    <div class="form-columns size-fields">
      <div class="form-row"><AppNumber label="画布宽度" unit="px" :value="customWidth" :min="160" :max="4096" @input="value => customWidth = value" /></div>
      <div class="form-row"><AppNumber :label="doc.layoutId.startsWith('long-') ? '高度自动计算' : '画布高度'" unit="px" :value="customHeight" :min="160" :max="4096" :disabled="doc.layoutId.startsWith('long-')" @input="value => customHeight = value" /></div>
    </div>
    <template #footer><div class="dialog-actions"><button class="primary-button" @click="applySize">应用尺寸</button></div></template>
  </AppDialog>
  <AppDialog v-model:open="textOpen" title="写在照片上" description="支持多行；完成后可以拖动摆放，或在文字工具中调整字样。"><label class="form-row">文字内容<textarea v-model="textValue" maxlength="2000" aria-label="编辑文字内容" /></label><template #footer><div class="dialog-actions text-edit-actions"><button class="secondary-button" @click="textOpen = false">取消</button><button class="primary-button" @click="applyText">完成</button></div></template></AppDialog>
  <AppDialog v-model:open="deleteDraftOpen" :title="`删除选中的 ${pendingDraftIds.length} 份作品？`" description="会删除这些作品在当前浏览器中的草稿与原始素材副本，其他作品和已导出的项目文件不受影响。"><template #footer><div class="dialog-actions"><button class="secondary-button" :disabled="!!busy" @click="deleteDraftOpen = false">保留</button><button class="danger-button" :disabled="!!busy || !pendingDraftIds.length" @click="removeDrafts">删除 {{ pendingDraftIds.length }} 份作品</button></div></template></AppDialog>
  <AppDialog v-model:open="deletePageOpen" title="删除当前页面？" description="其他页面和素材库会保留。此操作可通过撤销恢复。"><template #footer><div class="dialog-actions"><button class="secondary-button" @click="deletePageOpen = false">保留</button><button class="danger-button" @click="deletePage">删除页面</button></div></template></AppDialog>
  <AppDialog :open="!!busy" :title="busy" description="操作在设备本地执行。处理大文件时请保持页面打开。" locked>
    <div v-if="photoImports.length" class="file-import-list"><article v-for="item in photoImports" :key="item.index" class="file-import-row"><span class="file-import-name">{{ item.name }}</span><PhotoImportProgress :item="item" /></article></div>
    <div v-else class="progress-box"><div class="spinner" /><p>{{ progressMessage }}</p><progress :value="progress" max="1" aria-label="处理进度" /><small>{{ Math.round(progress * 100) }}%</small></div>
    <div v-if="cancellable" class="dialog-actions"><button class="secondary-button" @click="abortController?.abort()">取消操作</button></div>
  </AppDialog>
</template>
