<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Upload, Image as ImageIcon, Type, Shapes, Pencil, Music, Lock, LockOpen, Eye, EyeOff, Copy, Trash2, ArrowUp, ArrowDown, MoveUp, MoveDown, RotateCcw, FlipHorizontal, FlipVertical, Check, LocateFixed } from 'lucide-vue-next';
import type { AnimationKind, BackgroundSpec, CollageSlot, CropState, EditorDocument, FilterState, ImageElement, ImageShape, MediaAsset, PatternKind, SceneElement, Selection, TemplatePreset } from '../types';
import type { EditorTool, PanelAction, PanelName } from '../panel';
import { filterPresets } from '../catalog/photoStyles';
import { layoutsForCount, MAX_COLLAGE_PHOTOS, recommendLayout } from '../catalog/layouts';
import { MIN_CROP_ZOOM, MAX_CROP_ZOOM } from '../defaults';
import { tinycolor } from 'vue-color';
import { shapePath } from './canvasGeometry';
import LayoutGallery from './LayoutGallery.vue';
import CollageStyleGallery from './CollageStyleGallery.vue';
import TemplateGallery from './TemplateGallery.vue';
import StickerGallery from './StickerGallery.vue';
import PanelRange from './PanelRange.vue';
import PanelMediaGrid from './PanelMediaGrid.vue';
import PhotoTextTools from './PhotoTextTools.vue';
import AppSelect from './AppSelect.vue';
import ColorPicker from './ColorPicker.vue';
import PhotoSpacingControls from './PhotoSpacingControls.vue';
import ShapeControls from './ShapeControls.vue';

const props = defineProps<{ panel: PanelName; document: EditorDocument; assets: Record<string, MediaAsset>; selection: Selection; tool: EditorTool; brushColor: string; brushSize: number; highlighter: boolean; cropMode: boolean; textPending: boolean; previewPhotos?: readonly { url: string; width: number; height: number; crop?: CropState; filter?: FilterState }[] }>();
const textDraft = defineModel<string>('textDraft', { required: true });
const emit = defineEmits<{ action: [action: PanelAction]; templatePreview: [open: boolean] }>();
const act = (action: PanelAction) => emit('action', action);
const checkpoint = () => act({ type: 'checkpoint' });
const templateGallery = ref<{ closePreview: () => void; openPreview: (template: TemplatePreset) => void; getPreview: () => TemplatePreset | null }>();
function closeTemplatePreview() { templateGallery.value?.closePreview(); }
function openTemplatePreview(template: TemplatePreset) { templateGallery.value?.openPreview(template); }
defineExpose({ closeTemplatePreview, openTemplatePreview, getTemplatePreview: () => templateGallery.value?.getPreview() ?? null });
const panelRoot = ref<HTMLElement>();
watch(() => [props.panel, props.selection?.kind, props.selection?.id], async () => {
  if (props.panel !== 'layers') return;
  await nextTick();
  panelRoot.value?.closest<HTMLElement>('.dock-body')?.scrollTo({ top: 0 });
}, { immediate: true });
const selectedSlot = computed(() => props.selection?.kind === 'slot' ? props.document.slots.find(slot => slot.id === props.selection?.id) : undefined);
const selectedElement = computed(() => props.selection?.kind === 'element' ? props.document.elements.find(element => element.id === props.selection?.id) : undefined);
const selectedImage = computed(() => selectedElement.value?.type === 'image' ? selectedElement.value : undefined);
const selectedShape = computed(() => selectedElement.value?.type === 'shape' ? selectedElement.value : undefined);
const selectedDrawing = computed(() => selectedElement.value?.type === 'drawing' ? selectedElement.value : undefined);
const imageTarget = computed(() => selectedSlot.value ?? selectedImage.value);
const selectedAsset = computed(() => imageTarget.value?.assetId ? props.assets[imageTarget.value.assetId] : undefined);
const visualAssets = computed(() => Object.values(props.assets).filter(asset => asset.kind !== 'audio'));
const backgroundAssets = computed(() => visualAssets.value.filter(asset => asset.kind !== 'video'));
const audioAssets = computed(() => Object.values(props.assets).filter(asset => asset.kind === 'audio'));
const musicAsset = computed(() => props.document.audio ? props.assets[props.document.audio.assetId] : undefined);
const layerElements = computed(() => [...props.document.elements].reverse());
const artworkPalette = computed(() => [...new Set([
  ...props.document.elements.flatMap(element => element.type === 'shape' ? [element.fill, element.stroke]
    : element.type === 'text' ? [element.color, element.stroke, element.backgroundColor]
    : element.type === 'drawing' ? [element.color] : [element.borderColor]),
  props.document.photoFrame.color, props.document.background.color, props.document.background.patternColor,
].filter(value => value && tinycolor(value).isValid() && tinycolor(value).getAlpha() > 0))]);
const selectedLayerIndex = computed(() => props.document.elements.findIndex(element => element.id === selectedElement.value?.id));
const previewImages = computed(() => props.document.mode === 'grid'
  ? props.document.slots.map(slot => slot.assetId ? props.assets[slot.assetId]?.thumbnail ?? '' : '')
  : props.document.elements.filter(element => element.type === 'image' && element.assetId).map(element => element.type === 'image' ? props.assets[element.assetId]?.thumbnail ?? '' : ''));
const layoutSuggestion = computed(() => {
  const photos = props.document.mode === 'grid'
    ? props.document.slots.flatMap(slot => slot.assetId && props.assets[slot.assetId] ? [props.assets[slot.assetId]!] : [])
    : props.document.elements.flatMap(element => element.type === 'image' && props.assets[element.assetId] ? [props.assets[element.assetId]!] : []);
  return recommendLayout(photos, props.document);
});
const occupiedPhotoCount = computed(() => props.document.slots.filter(slot => slot.assetId).length
  + props.document.elements.filter(element => element.type === 'image' && element.assetId && props.assets[element.assetId]?.kind !== 'sticker').length);
const layoutPhotoCount = computed(() => props.document.mode === 'grid' ? Math.max(props.document.slots.length, occupiedPhotoCount.value) : occupiedPhotoCount.value);
const photoCount = ref(Math.max(1, layoutPhotoCount.value || 2));
watch(layoutPhotoCount, count => { if (count) photoCount.value = count; });
function changePhotoCount(value: string | number) {
  const count = Math.max(1, Math.min(MAX_COLLAGE_PHOTOS, Number(value)));
  if (count < occupiedPhotoCount.value) return;
  photoCount.value = count;
  const layout = layoutsForCount(count)[0];
  if (layout) act({ type: 'layout', layout });
}
const titles: Record<PanelName, string> = { photos: '照片', layouts: '照片布局', spacing: '留白 · 间距 · 圆角', looks: '拼图风格', templates: '设计模板', background: '背景配色', text: '文字与字体', stickers: '贴纸盒', draw: '形状与涂鸦', layers: '图层管理', animation: '动态效果', audio: '背景音乐' };
const shapes: { value: ImageShape; label: string }[] = [{ value: 'rect', label: '矩形' }, { value: 'circle', label: '圆形' }, { value: 'heart', label: '爱心' }, { value: 'star', label: '星形' }];
const patterns: { value: PatternKind; label: string }[] = [{ value: 'none', label: '纯色' }, { value: 'dots', label: '波点' }, { value: 'grid', label: '细网格' }, { value: 'stripes', label: '条纹' }, { value: 'paper', label: '纸纹' }, { value: 'checker', label: '棋盘格' }];
const animations: { value: AnimationKind; label: string }[] = [{ value: 'none', label: '无动画' }, { value: 'float', label: '轻轻漂浮' }, { value: 'pulse', label: '呼吸缩放' }, { value: 'wiggle', label: '左右摇摆' }, { value: 'pop', label: '弹跳' }, { value: 'fade', label: '渐隐渐现' }];
const photoCountOptions = computed(() => Array.from({ length: MAX_COLLAGE_PHOTOS }, (_, index) => ({ value: index + 1, label: `${index + 1} 张照片`, disabled: index + 1 < occupiedPhotoCount.value })));
const fpsOptions = [12, 15, 24, 25, 30, 60].map(value => ({ value, label: `${value} fps` }));
const audioOptions = computed(() => [{ value: '', label: '选择本地音频', disabled: true }, ...audioAssets.value.map(asset => ({ value: asset.id, label: asset.name }))]);
function checked(event: Event) { return (event.target as HTMLInputElement).checked; }
function patchDocument(patch: Partial<EditorDocument>, commit = true) { act({ type: 'document', patch, commit }); }
function patchElement(patch: Partial<SceneElement>, commit = true) { if (selectedElement.value) act({ type: 'element', patch, commit }); }
function patchImage(patch: Partial<ImageElement> & Partial<CollageSlot>, commit = true) {
  if (imageTarget.value?.locked) return;
  if (selectedSlot.value) act({ type: 'slot', patch, commit });
  else if (selectedImage.value) act({ type: 'element', patch, commit });
}
function patchCrop(patch: Partial<CropState>, commit = true) { if (imageTarget.value) patchImage({ crop: { ...imageTarget.value.crop, ...patch } }, commit); }
function patchFilter(patch: Partial<FilterState>, commit = true) { if (imageTarget.value) patchImage({ filter: { ...imageTarget.value.filter, ...patch } }, commit); }
const filterKeys: readonly (keyof FilterState)[] = ['brightness', 'contrast', 'saturation', 'blur', 'grayscale', 'sepia'];
function matchesFilter(filter: FilterState) {
  const current = imageTarget.value?.filter;
  return !!current && filterKeys.every(key => current[key] === filter[key]);
}
function patchBackground(patch: Partial<BackgroundSpec>, commit = true) { patchDocument({ background: { ...props.document.background, ...patch } }, commit); }
function chooseBrush(mode: 'pen' | 'highlighter' | 'eraser') {
  act({ type: 'tool', tool: mode === 'eraser' ? 'erase' : 'draw' });
  act({ type: 'brush', highlighter: mode === 'highlighter' });
}
function centerSelectedElement() {
  const element = selectedElement.value;
  if (!element || element.locked) return;
  patchElement({ x: (props.document.width - element.width) / 2, y: (props.document.height - element.height) / 2 });
}
function layerName(element: SceneElement) {
  if (element.type === 'text') return element.text.trim().replace(/\s+/g, ' ').slice(0, 32) || '空白文字';
  if (element.type === 'image') return props.assets[element.assetId]?.name || '照片图层';
  if (element.type === 'drawing') return element.tool === 'highlighter' ? '荧光笔涂鸦' : element.tool === 'eraser' ? '橡皮擦笔迹' : '画笔涂鸦';
  const label = shapes.find(shape => shape.value === element.shape)?.label || '形状';
  const filled = tinycolor(element.fill).getAlpha() > 0;
  const stroked = element.strokeWidth > 0 && !!element.stroke && tinycolor(element.stroke).getAlpha() > 0;
  const style = filled ? stroked ? '填充＋描边' : '填充' : stroked ? '空心描边' : '透明';
  return `${label} · ${style} ${props.document.elements.findIndex(item => item.id === element.id) + 1}`;
}
function layerKind(element: SceneElement) {
  if (element.type === 'image') return props.assets[element.assetId]?.kind === 'video' ? '视频' : props.assets[element.assetId]?.mime === 'image/gif' ? 'GIF' : '照片';
  return element.type === 'text' ? '文字' : element.type === 'drawing' ? '涂鸦' : '形状';
}
function selectAudio(assetId: string) { const asset = props.assets[assetId]; if (asset?.kind === 'audio') patchDocument({ audio: { assetId, start: 0, end: asset.duration || null, volume: .7 } }); }
function patchAudio(patch: Partial<NonNullable<EditorDocument['audio']>>, commit = true) { if (props.document.audio) patchDocument({ audio: { ...props.document.audio, ...patch } }, commit); }
</script>

<template>
  <section ref="panelRoot" class="editor-panel" :class="{ 'editor-panel-text': panel === 'text' }" :aria-label="titles[panel]">

    <template v-if="panel === 'photos'">
      <section v-if="imageTarget" class="tool-section">
        <h3>{{ selectedSlot ? '编辑照片格' : '编辑照片 / 视频' }}</h3>
        <p class="asset-caption">{{ selectedAsset?.name || '这个照片格还没有素材' }}</p>
        <p v-if="imageTarget.locked" class="hint">这张照片已锁定，请在「图层管理」中解锁后调整。</p>
        <fieldset class="control-group" :disabled="imageTarget.locked">
        <div class="button-row"><button type="button" @click="act({ type: 'replace' })"><ImageIcon :size="15" aria-hidden="true" />上传并替换</button><button type="button" @click="act({ type: 'swap' })" :disabled="document.mode !== 'grid' || !selectedSlot">交换照片格</button></div>
        <template v-if="selectedAsset">
          <h4>裁剪与构图</h4><p class="hint">可精确微调；也可在画布上点选照片后使用「取景」。</p>
          <PanelRange label="裁剪缩放" :value="imageTarget.crop.zoom" :min="MIN_CROP_ZOOM" :max="MAX_CROP_ZOOM" :step=".01" unit="倍" @input="value => patchCrop({ zoom: value }, false)" @commit="checkpoint" />
          <PanelRange label="水平平移" :value="imageTarget.crop.x" :min="-1" :max="1" :step=".01" @input="value => patchCrop({ x: value }, false)" @commit="checkpoint" />
          <PanelRange label="垂直平移" :value="imageTarget.crop.y" :min="-1" :max="1" :step=".01" @input="value => patchCrop({ y: value }, false)" @commit="checkpoint" />
          <PanelRange label="照片旋转" :value="imageTarget.crop.rotation" :min="-180" :max="180" unit="°" @input="value => patchCrop({ rotation: value }, false)" @commit="checkpoint" />
          <div class="button-row"><button type="button" :aria-pressed="imageTarget.crop.flipX" @click="patchCrop({ flipX: !imageTarget.crop.flipX })"><FlipHorizontal :size="15" aria-hidden="true" />水平翻转</button><button type="button" :aria-pressed="imageTarget.crop.flipY" @click="patchCrop({ flipY: !imageTarget.crop.flipY })"><FlipVertical :size="15" aria-hidden="true" />垂直翻转</button></div>
          <div class="button-row"><button type="button" @click="act({ type: 'resetCrop' })"><RotateCcw :size="15" aria-hidden="true" />重置裁剪</button><button type="button" @click="act({ type: 'smartCrop' })">自动构图</button></div>
          <div class="field"><span>照片形状</span><AppSelect :value="imageTarget.shape" :options="shapes" label="照片形状" @change="value => patchImage({ shape: value as ImageShape })" /></div>
          <template v-if="selectedImage">
            <h4>边框与外观</h4>
            <PanelRange label="边框宽度" :value="selectedImage.borderWidth" :min="0" :max="60" unit="px" @input="value => patchElement({ borderWidth: value }, false)" @commit="checkpoint" />
            <ColorPicker label="边框颜色" :value="selectedImage.borderColor" :palette="artworkPalette" @input="value => patchElement({ borderColor: value }, false)" @commit="checkpoint" />
            <PanelRange label="照片圆角" :value="selectedImage.cornerRadius" :min="0" :max="Math.min(selectedImage.width, selectedImage.height) / 2" unit="px" @input="value => patchElement({ cornerRadius: value }, false)" @commit="checkpoint" />
            <PanelRange label="照片阴影" :value="selectedImage.shadow" :min="0" :max="80" @input="value => patchElement({ shadow: value }, false)" @commit="checkpoint" />
            <PanelRange label="照片不透明度" :value="Math.round(selectedImage.opacity * 100)" :min="0" :max="100" unit="%" @input="value => patchElement({ opacity: value / 100 }, false)" @commit="checkpoint" />
          </template>
          <template v-if="selectedAsset.kind === 'video'">
            <h4>视频片段</h4>
            <PanelRange label="视频开始时间" :value="imageTarget.trimStart ?? 0" :min="0" :max="Math.max(0, (imageTarget.trimEnd ?? selectedAsset.duration) - .01)" :step=".01" unit="秒" @input="value => patchImage({ trimStart: value }, false)" @commit="checkpoint" />
            <PanelRange label="视频结束时间" :value="imageTarget.trimEnd ?? selectedAsset.duration" :min="Math.min(selectedAsset.duration, (imageTarget.trimStart ?? 0) + .01)" :max="selectedAsset.duration" :step=".01" unit="秒" @input="value => patchImage({ trimEnd: value }, false)" @commit="checkpoint" />
            <label class="check-field"><input type="checkbox" :checked="imageTarget.muted ?? false" @change="event => patchImage({ muted: checked(event) })" />视频静音</label>
          </template>
          <details class="photo-details"><summary>滤镜与照片微调</summary>
          <h4>滤镜</h4>
          <div class="chips" role="group" aria-label="照片滤镜"><button v-for="preset in filterPresets" :key="preset.label" type="button" :aria-pressed="matchesFilter(preset.filter)" @click="patchImage({ filter: { ...preset.filter } })">{{ preset.label }}</button></div>
          <PanelRange label="亮度" :value="imageTarget.filter.brightness" :min="-1" :max="1" :step=".01" @input="value => patchFilter({ brightness: value }, false)" @commit="checkpoint" />
          <PanelRange label="对比度" :value="imageTarget.filter.contrast" :min="-100" :max="100" @input="value => patchFilter({ contrast: value }, false)" @commit="checkpoint" />
          <PanelRange label="饱和度" :value="imageTarget.filter.saturation" :min="-1" :max="1" :step=".01" @input="value => patchFilter({ saturation: value }, false)" @commit="checkpoint" />
          <PanelRange label="模糊" :value="imageTarget.filter.blur" :min="0" :max="20" :step=".1" @input="value => patchFilter({ blur: value }, false)" @commit="checkpoint" />
          <div class="button-row"><label class="check-field"><input type="checkbox" :checked="imageTarget.filter.grayscale" @change="event => patchFilter({ grayscale: checked(event) })" />黑白</label><label class="check-field"><input type="checkbox" :checked="imageTarget.filter.sepia" @change="event => patchFilter({ sepia: checked(event) })" />棕褐色</label></div>
          </details>
        </template>
        <p v-else class="hint">选择上方本地素材或上传照片，填入当前照片格。</p>
        </fieldset>
      </section>
      <p v-else class="empty-guidance">在画布上选择一张照片、视频或照片格，即可调整裁剪、滤镜与外观。</p>
    </template>

    <template v-else-if="panel === 'layouts'">
      <div class="field"><span>照片数量</span><AppSelect :value="photoCount" :options="photoCountOptions" label="照片数量" @change="changePhotoCount" /></div>
      <p class="hint">支持 1–{{ MAX_COLLAGE_PHOTOS }} 张。减少照片请先使用「整理照片」，更换布局不会隐藏已有照片。</p>
      <button v-if="layoutSuggestion" type="button" class="wide recommend-layout" @click="act({ type: 'layout', layout: layoutSuggestion })"><Check :size="14" aria-hidden="true" />按照片比例推荐布局</button>
      <LayoutGallery :count="photoCount" :document="document" :assets="assets" :selected-id="document.mode === 'grid' ? document.layoutId : undefined" :preview-images="previewImages" :aspect-ratio="document.width / document.height" @select="layout => act({ type: 'layout', layout })" />
    </template>

    <template v-else-if="panel === 'looks'">
      <CollageStyleGallery :document="document" :assets="assets" @select="look => act({ type: 'look', look })" />
      <section v-if="document.mode === 'grid'" class="tool-section"><h3>统一照片色调</h3><p class="hint">一次应用到全部照片；不改变照片位置和裁切。</p><div class="chips"><button v-for="preset in filterPresets" :key="preset.label" type="button" :aria-label="`全部照片：${preset.label}`" @click="act({ type: 'tone', filter: { ...preset.filter } })">{{ preset.label }}</button></div></section>
    </template>

    <template v-else-if="panel === 'spacing'">
      <PhotoSpacingControls :document="document" :assets="assets" @action="act" />
    </template>

    <template v-else-if="panel === 'templates'">
      <p class="hint">用当前照片预览。应用前会确认替换本页排版、文字与装饰，保留全部照片。</p>
      <TemplateGallery ref="templateGallery" :photos="previewPhotos" :current-ratio="document.width / document.height" @preview="open => emit('templatePreview', open)" @select="template => act({ type: 'template', template })" />
    </template>

    <template v-else-if="panel === 'background'">
      <ColorPicker label="背景颜色" :value="document.background.color" :palette="artworkPalette" allow-transparent @input="value => patchBackground({ color: value }, false)" @commit="checkpoint" />
      <label class="check-field"><input type="checkbox" :checked="document.background.color === 'transparent'" @change="event => patchBackground(checked(event) ? { color: 'transparent', pattern: 'none', assetId: null } : { color: '#ffffff' })" />透明背景</label>
      <p class="hint">透明背景可用于 PNG、WebP 导出；图案或背景照片会覆盖透明区域。</p>
      <div class="field"><span>背景图案</span><AppSelect :value="document.background.pattern" :options="patterns" label="背景图案" @change="value => patchBackground({ pattern: value as PatternKind })" /></div>
      <ColorPicker label="图案颜色" :value="document.background.patternColor" :palette="artworkPalette" @input="value => patchBackground({ patternColor: value }, false)" @commit="checkpoint" />
      <section class="tool-section"><h3>照片背景</h3><button type="button" class="wide" @click="act({ type: 'upload' })"><Upload :size="16" aria-hidden="true" />上传背景照片</button><p class="hint">上传后点击下方照片设为背景，不影响前景素材。</p><PanelMediaGrid :assets="backgroundAssets" :selected-id="document.background.assetId" label="设为背景" @select="assetId => act({ type: 'backgroundAsset', assetId })" /><button type="button" class="wide" :disabled="!document.background.assetId" @click="act({ type: 'backgroundAsset', assetId: null })">移除背景照片</button></section>
    </template>

    <template v-else-if="panel === 'text'">
      <PhotoTextTools v-model:draft="textDraft" :document="document" :assets="assets" :selection="selection" :pending="textPending" @action="act" />
    </template>

    <template v-else-if="panel === 'stickers'"><StickerGallery @select="sticker => act({ type: 'sticker', sticker })" /><p class="hint">选中画布上的贴纸后，可在图层与动态面板调整透明度、顺序和动画。</p></template>

    <template v-else-if="panel === 'draw'">
      <section class="tool-section"><h3>添加形状</h3>
        <button type="button" class="primary wide" @click="act({ type: 'addShape', shape: 'rect' })"><Shapes :size="17" aria-hidden="true" />＋ 添加矩形</button>
        <div class="chips" role="group" aria-label="添加其他形状"><button v-for="shape in shapes.filter(item => item.value !== 'rect')" :key="shape.value" type="button" @click="act({ type: 'addShape', shape: shape.value })"><Shapes :size="15" aria-hidden="true" />添加{{ shape.label }}</button></div>
        <p class="hint">添加后自动回到选择模式。被照片遮住的装饰，可在「工具 → 图层管理」中选择。</p>
      </section>
      <section v-if="selectedShape" class="tool-section"><ShapeControls :key="selectedShape.id" :shape="selectedShape" :canvas-width="document.width" :canvas-height="document.height" :fill-color="brushColor" :palette="artworkPalette" @action="act" /></section>
      <p v-else class="hint">选择画布上的形状，可修改填充、描边、大小、不透明度或删除。</p>
      <h3>自由涂鸦</h3>
      <div class="segmented" aria-label="绘画工具"><button type="button" :aria-pressed="tool === 'draw' && !highlighter" @click="chooseBrush('pen')"><Pencil :size="15" aria-hidden="true" />画笔</button><button type="button" :aria-pressed="tool === 'draw' && highlighter" @click="chooseBrush('highlighter')">荧光笔</button><button type="button" :aria-pressed="tool === 'erase'" @click="chooseBrush('eraser')">橡皮擦</button></div>
      <p class="hint">橡皮擦只擦除涂鸦笔迹，不改变照片、背景或其他图层，也不修改素材原图。</p>
      <PanelRange label="画笔大小" :value="brushSize" :min="1" :max="100" unit="px" @input="value => act({ type: 'brush', size: value })" @commit="checkpoint" />
      <ColorPicker label="画笔颜色" :value="brushColor" :palette="artworkPalette" @input="value => act({ type: 'brush', color: value })" @commit="checkpoint" />
      <button type="button" class="primary wide" @click="act({ type: 'tool', tool: 'select' })"><Check :size="16" aria-hidden="true" />完成绘画，回到选择</button>
      <section v-if="selectedDrawing" class="tool-section"><h3>所选涂鸦</h3>
        <p v-if="selectedDrawing.locked" class="hint">涂鸦已锁定，请在「图层管理」中解锁后编辑。</p>
        <ColorPicker label="涂鸦颜色" :value="selectedDrawing.color" :palette="artworkPalette" :disabled="selectedDrawing.locked" @input="value => patchElement({ color: value }, false)" @commit="checkpoint" />
        <PanelRange label="涂鸦线宽" :value="selectedDrawing.strokeWidth" :disabled="selectedDrawing.locked" :min="1" :max="100" unit="px" @input="value => patchElement({ strokeWidth: value }, false)" @commit="checkpoint" />
      </section>
    </template>

    <template v-else-if="panel === 'layers'">
      <section v-if="selectedElement" class="tool-section"><h3>所选图层</h3><p class="asset-caption">{{ layerName(selectedElement) }}</p>
        <div class="button-row" role="group" aria-label="图层状态">
          <button type="button" :aria-pressed="selectedElement.locked" @click="patchElement({ locked: !selectedElement.locked })"><Lock v-if="selectedElement.locked" :size="16" aria-hidden="true" /><LockOpen v-else :size="16" aria-hidden="true" />{{ selectedElement.locked ? '解锁图层' : '锁定图层' }}</button>
          <button type="button" :disabled="selectedElement.locked" :aria-pressed="!selectedElement.visible" @click="patchElement({ visible: !selectedElement.visible })"><Eye v-if="selectedElement.visible" :size="16" aria-hidden="true" /><EyeOff v-else :size="16" aria-hidden="true" />{{ selectedElement.visible ? '隐藏图层' : '显示图层' }}</button>
        </div>
        <p v-if="selectedElement.locked" class="hint">已锁定，解锁后可调整；仍可复制为一个新图层。</p>
        <ShapeControls v-if="selectedShape" :key="selectedShape.id" :shape="selectedShape" :canvas-width="document.width" :canvas-height="document.height" :fill-color="brushColor" :palette="artworkPalette" @action="act" />
        <button v-else type="button" class="wide" :disabled="selectedElement.locked" @click="centerSelectedElement"><LocateFixed :size="16" aria-hidden="true" />居中找回 · 可撤销</button>
        <h4>叠放顺序</h4>
        <div class="button-row"><button type="button" :disabled="selectedElement.locked || selectedLayerIndex === document.elements.length - 1" @click="act({ type: 'layer', direction: 'up' })"><ArrowUp :size="15" aria-hidden="true" />上移一层</button><button type="button" :disabled="selectedElement.locked || selectedLayerIndex === 0" @click="act({ type: 'layer', direction: 'down' })"><ArrowDown :size="15" aria-hidden="true" />下移一层</button></div>
        <div class="button-row"><button type="button" :disabled="selectedElement.locked || selectedLayerIndex === document.elements.length - 1" @click="act({ type: 'layer', direction: 'front' })"><MoveUp :size="15" aria-hidden="true" />置于顶层</button><button type="button" :disabled="selectedElement.locked || selectedLayerIndex === 0" @click="act({ type: 'layer', direction: 'back' })"><MoveDown :size="15" aria-hidden="true" />置于底层</button></div>
        <h4>图层外观</h4>
        <PanelRange label="图层不透明度" :disabled="selectedElement.locked" :value="Math.round(selectedElement.opacity * 100)" :min="0" :max="100" unit="%" @input="value => patchElement({ opacity: value / 100 }, false)" @commit="checkpoint" />
        <PanelRange label="图层旋转" :disabled="selectedElement.locked" :value="selectedElement.rotation" :min="-180" :max="180" unit="°" @input="value => patchElement({ rotation: value }, false)" @commit="checkpoint" />
        <PanelRange label="图层阴影" :disabled="selectedElement.locked" :value="selectedElement.shadow" :min="0" :max="80" @input="value => patchElement({ shadow: value }, false)" @commit="checkpoint" />
        <div class="button-row"><button type="button" @click="act({ type: 'duplicate' })"><Copy :size="15" aria-hidden="true" />复制图层</button><button type="button" class="danger" :disabled="selectedElement.locked" @click="act({ type: 'remove' })"><Trash2 :size="15" aria-hidden="true" />删除图层</button></div>
      </section>
      <section v-else-if="selectedSlot" class="tool-section"><h3>照片格素材</h3><p class="hint">照片格位置由布局管理。使用照片面板调整裁剪；删除只清空照片，不删除布局。</p><div class="button-row"><button type="button" :aria-pressed="selectedSlot.locked" @click="act({ type: 'slot', patch: { locked: !selectedSlot.locked } })">{{ selectedSlot.locked ? '解锁照片格' : '锁定照片格' }}</button><button type="button" :disabled="selectedSlot.locked" :aria-pressed="!selectedSlot.visible" @click="act({ type: 'slot', patch: { visible: !selectedSlot.visible } })">{{ selectedSlot.visible ? '隐藏照片格' : '显示照片格' }}</button></div><button type="button" class="danger wide" :disabled="selectedSlot.locked || !selectedSlot.assetId" @click="act({ type: 'remove' })"><Trash2 :size="15" aria-hidden="true" />清空照片格</button></section>
      <p v-else class="empty-guidance">选择一个图层后可调整顺序、透明度、旋转、复制或删除。</p>
      <p class="hint">上方图层显示在最前面。被照片遮住的矩形等装饰，也可在这里点选并编辑颜色、大小或删除；隐藏图层不参与导出。</p>
      <div v-if="layerElements.length || document.mode === 'grid'" class="layer-list" aria-label="画布图层">
        <div v-for="element in layerElements" :key="element.id" class="layer-row" :class="{ selected: selection?.kind === 'element' && selection.id === element.id, hidden: !element.visible }">
          <button type="button" class="layer-select" :aria-pressed="selection?.kind === 'element' && selection.id === element.id" :aria-label="`选择${layerKind(element)}图层：${layerName(element)}${element.locked ? '，已锁定' : ''}${!element.visible ? '，已隐藏' : ''}`" @click="act({ type: 'select', id: element.id })">
            <img v-if="element.type === 'image' && assets[element.assetId]?.thumbnail" class="layer-thumbnail" :src="assets[element.assetId]?.thumbnail" alt="" />
            <Type v-else-if="element.type === 'text'" :size="20" aria-hidden="true" />
            <ImageIcon v-else-if="element.type === 'image'" :size="20" aria-hidden="true" />
            <Pencil v-else-if="element.type === 'drawing'" :size="20" aria-hidden="true" />
            <svg v-else-if="element.type === 'shape'" class="shape-thumbnail" :viewBox="`${-element.strokeWidth / 2 - 2} ${-element.strokeWidth / 2 - 2} ${element.width + element.strokeWidth + 4} ${element.height + element.strokeWidth + 4}`" aria-hidden="true" focusable="false">
              <path :d="shapePath(element.shape, element.width, element.height)" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" opacity=".4" />
              <path :d="shapePath(element.shape, element.width, element.height)" :fill="element.fill || 'none'" :stroke="element.stroke || 'none'" :stroke-width="element.strokeWidth" :opacity="element.opacity" />
            </svg>
            <span><strong>{{ layerName(element) }}</strong><small>{{ layerKind(element) }}{{ element.locked ? ' · 已锁定' : '' }}{{ !element.visible ? ' · 已隐藏' : '' }}</small></span>
            <Check v-if="selection?.kind === 'element' && selection.id === element.id" class="layer-check" :size="18" aria-hidden="true" />
          </button>
        </div>
        <template v-if="document.mode === 'grid'"><button v-for="(slot, index) in document.slots" :key="slot.id" type="button" class="slot-layer" :aria-pressed="selection?.kind === 'slot' && selection.id === slot.id" @click="act({ type: 'select', id: slot.id })"><ImageIcon :size="17" aria-hidden="true" /><span>照片格 {{ index + 1 }}<small>{{ slot.assetId ? assets[slot.assetId]?.name || '照片' : '空白照片格' }}{{ slot.locked ? ' · 已锁定' : '' }}{{ !slot.visible ? ' · 已隐藏' : '' }}</small></span></button></template>
      </div>
      <p v-else class="empty-guidance">画布还没有图层。先添加照片、文字、贴纸或涂鸦。</p>
    </template>

    <template v-else-if="panel === 'animation'">
      <div class="field"><span>整页动画</span><AppSelect :value="document.animation" :options="animations" label="整页动画" @change="value => patchDocument({ animation: value as AnimationKind })" /></div>
      <PanelRange label="本页播放时长" :value="document.duration" :min="1" :max="60" :step=".1" unit="秒" @input="value => patchDocument({ duration: value }, false)" @commit="checkpoint" />
      <div class="field"><span>动画帧率</span><AppSelect :value="document.fps" :options="fpsOptions" label="动画帧率" @change="value => patchDocument({ fps: Number(value) })" /></div>
      <section v-if="selectedElement" class="tool-section"><h3>所选图层动画</h3><p class="asset-caption">{{ layerName(selectedElement) }}</p><div class="field"><span>图层动画</span><AppSelect :value="selectedElement.animation" :options="animations" label="图层动画" @change="value => patchElement({ animation: value as AnimationKind })" /></div></section>
      <p v-else class="empty-guidance">选择自由照片、文字、贴纸、涂鸦或形状，可单独设置图层动画。照片格使用整页动画。</p>
      <p class="hint">预览播放可查看效果。动态 GIF / 视频导出保留动画；图片导出为单帧。</p>
    </template>

    <template v-else-if="panel === 'audio'">
      <button type="button" class="primary wide" @click="act({ type: 'uploadAudio' })"><Upload :size="16" aria-hidden="true" />上传本地音乐</button><p class="hint">使用有授权的音频。音乐随视频导出；静态图片和 GIF 不包含声音。</p>
      <div v-if="audioAssets.length" class="field"><span>选择背景音乐</span><AppSelect :value="document.audio?.assetId || ''" :options="audioOptions" label="选择背景音乐" @change="value => selectAudio(String(value))" /></div>
      <section v-if="document.audio && musicAsset" class="tool-section"><h3><Music :size="16" aria-hidden="true" />{{ musicAsset.name }}</h3><audio :key="musicAsset.id" :src="musicAsset.src" controls preload="metadata" aria-label="本地音乐试听" /><p class="hint">试听播放原音频；导出使用下方截取区间与音量。</p>
        <PanelRange label="音乐开始时间" :value="document.audio.start" :min="0" :max="Math.max(0, (document.audio.end ?? musicAsset.duration) - .01)" :step=".01" unit="秒" @input="value => patchAudio({ start: value }, false)" @commit="checkpoint" />
        <PanelRange label="音乐结束时间" :value="document.audio.end ?? musicAsset.duration" :min="Math.min(musicAsset.duration, document.audio.start + .01)" :max="musicAsset.duration" :step=".01" unit="秒" @input="value => patchAudio({ end: value }, false)" @commit="checkpoint" />
        <PanelRange label="音乐音量" :value="document.audio.volume" :min="0" :max="1" :step=".01" @input="value => patchAudio({ volume: value }, false)" @commit="checkpoint" />
        <button type="button" class="danger wide" @click="act({ type: 'clearAudio' })"><Trash2 :size="15" aria-hidden="true" />移除背景音乐</button>
      </section>
      <p v-else class="empty-guidance">上传或选择一段本地音乐，为本页配上声音。</p>
      <button v-if="document.audio && !musicAsset" type="button" class="danger wide" @click="act({ type: 'clearAudio' })">移除无法读取的音乐</button>
    </template>
  </section>
</template>

<style scoped>
.editor-panel { color: var(--ink); display: flex; flex-direction: column; gap: 18px; width: 100%; min-width: 0; box-sizing: border-box; padding: 20px 18px calc(24px + env(safe-area-inset-bottom)); font-size: 13px; overflow-wrap: anywhere; }
.editor-panel * { box-sizing: border-box; }
.editor-panel h3 { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 650; margin: 0; line-height: 1.5; }
.editor-panel h4 { font-size: 12px; margin: 4px 0 0; color: var(--muted); font-weight: 500; }
.editor-panel p { margin: 0; }
.hint, .asset-caption { color: var(--muted); font-size: 12px; line-height: 1.75; }
.empty-guidance { padding: 20px 16px; border-radius: var(--radius-card); font-size: 12px; line-height: 1.8; color: var(--muted); background: var(--control); }
.tool-section { display: flex; flex-direction: column; gap: 16px; padding: 18px 14px; margin-top: 2px; min-width: 0; border-radius: var(--radius-card); background: var(--surface); box-shadow: var(--shadow-card); }
.control-group { display: flex; flex-direction: column; gap: 16px; min-width: 0; padding: 0; margin: 0; border: 0; }
.control-group:disabled { opacity: .6; }
.editor-panel button:not(.app-select-trigger) { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 11px 13px; border: 0; border-radius: var(--radius-control); background: var(--control); color: var(--ink); font: inherit; font-size: 12px; line-height: 1.5; cursor: pointer; transition: background .18s var(--ease-out), transform .18s var(--ease-out), box-shadow .18s var(--ease-out); white-space: normal; -webkit-tap-highlight-color: transparent; }
.editor-panel button:not(.app-select-trigger):hover { background: var(--control-hover); }
.editor-panel button:not(.app-select-trigger):active { transform: scale(.975); }
.editor-panel button:not(.app-select-trigger)[aria-pressed=true] { background: var(--accent-soft); color: var(--accent); box-shadow: inset 0 0 0 2px var(--accent); }
.editor-panel button:disabled { opacity: .4; cursor: not-allowed; }
.editor-panel button:focus-visible, .editor-panel input:focus-visible, .photo-details>summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.editor-panel .primary:not(.app-select-trigger) { background: var(--accent); color: white; font-weight: 600; min-height: 48px; }
.editor-panel .primary:not(.app-select-trigger):hover { background: var(--accent); filter: brightness(1.08); }
.editor-panel .danger:not(.app-select-trigger) { color: #a64540; background: #a645400b; }
.wide { width: 100%; }
.button-row { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; min-width: 0; }
.button-row>button { width: 100%; min-width: 0; }
.field { display: grid; gap: 8px; font-size: 12px; min-width: 0; }
.field>span { color: var(--muted); }
.check-field { display: flex; align-items: center; gap: 10px; font-size: 12px; min-height: 44px; line-height: 1.5; cursor: pointer; }
.check-field input { width: 20px; height: 20px; accent-color: var(--accent); flex: none; }
.chips { display: flex; gap: 7px; flex-wrap: wrap; }
.chips button:not(.app-select-trigger) { border-radius: 999px; flex: 1 1 76px; min-width: 44px; }
.layer-list { display: grid; gap: 9px; min-width: 0; max-height: min(32dvh, 280px); overflow-y: auto; overscroll-behavior-y: contain; padding: 2px; }
.layer-row { display: flex; align-items: center; border-radius: 18px; padding: 6px; gap: 2px; min-width: 0; background: var(--surface); box-shadow: var(--shadow-card); }
.layer-row.selected { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); }
.layer-row.hidden .layer-select { opacity: .5; }
.editor-panel .layer-select:not(.app-select-trigger) { width: 100%; justify-content: flex-start; background: transparent; padding: 6px 8px; min-width: 0; text-align: left; gap: 10px; }
.layer-select>svg { flex: none; }
.layer-thumbnail { flex: none; width: 40px; height: 44px; object-fit: cover; border-radius: 9px; background: var(--control); }
.shape-thumbnail { flex: none; width: 40px; height: 44px; padding: 4px; border-radius: 9px; color: var(--ink); background: repeating-conic-gradient(#d4d9d1 0% 25%, #fff 0% 50%) 50% / 8px 8px; }
.layer-select>span { display: grid; flex: 1; gap: 3px; min-width: 0; }
.layer-select strong { font-size: 12px; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.layer-select small, .slot-layer small { font-size: 11px; color: var(--muted); }
.layer-check { flex: none; color: var(--accent); }
.editor-panel .slot-layer:not(.app-select-trigger) { justify-content: flex-start; gap: 12px; text-align: left; background: var(--surface); box-shadow: var(--shadow-card); }
.slot-layer span { display: grid; gap: 4px; min-width: 0; }
.slot-layer small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor-panel audio { display: block; width: 100%; max-width: 100%; height: 44px; }
.editor-panel :deep(.template-grid) { grid-template-columns: repeat(2,minmax(0,1fr)); }
.editor-panel :deep(.template-categories), .editor-panel :deep(.sticker-categories) { max-width: 100%; }
.photo-details { padding: 6px 0 0; }
.photo-details>summary { display: list-item; min-height: 44px; padding: 12px 8px; border-radius: var(--radius-control); font-size: 12px; line-height: 1.6; color: var(--ink); cursor: pointer; background: var(--control); }
.photo-details[open]>summary { margin-bottom: 6px; background: var(--accent-soft); color: var(--accent); }
.photo-details[open] { display: grid; gap: 16px; }
@media (max-width: 480px) { .editor-panel { padding: 16px 12px calc(20px + env(safe-area-inset-bottom)); } .tool-section { padding: 16px 12px; } }
.editor-panel.editor-panel-text { min-height: 0; padding-top: 10px; padding-bottom: 10px; }
@media (prefers-reduced-motion: reduce) { .editor-panel button:not(.app-select-trigger) { transition: none; } .editor-panel button:not(.app-select-trigger):active { transform: none; } }
</style>
