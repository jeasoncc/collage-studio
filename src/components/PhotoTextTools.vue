<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import type { CSSProperties } from 'vue';
import { AlignCenter, AlignLeft, AlignRight, Bold, Check, Copy, Italic, Lock, Plus, Trash2 } from 'lucide-vue-next';
import type { CollageSlot, EditorDocument, ImageElement, MediaAsset, Selection, TextElement } from '../types';
import type { PanelAction } from '../panel';
import { photoTextFontCategories, photoTextFonts, photoTextPairs, photoTextStyles } from '../catalog/photoText';
import type { PhotoTextFont, PhotoTextFontCategory, PhotoTextStyle, TextPlacement } from '../catalog/photoText';
import { filterCss } from '../catalog/photoStyles';
import { chooseTextPhoto, photoTextSize, textPhotos } from '../catalog/textPlacement';
import AppSelect from './AppSelect.vue';
import ColorPicker from './ColorPicker.vue';
import PanelRange from './PanelRange.vue';
import PhotoFramePreview from './PhotoFramePreview.vue';

const props = defineProps<{ document: EditorDocument; assets: Record<string, MediaAsset>; selection: Selection; pending: boolean }>();
const emit = defineEmits<{ action: [action: PanelAction] }>();
const act = (action: PanelAction) => emit('action', action);
const draft = defineModel<string>('draft', { required: true });
const draftInput = ref<HTMLTextAreaElement>();
const submittedDraft = ref<{ text: string; revision: number; existingIds: Set<string> }>();
const adding = computed(() => props.pending || !!submittedDraft.value);
let draftRevision = 0;
watch(draft, () => { draftRevision++; }, { flush: 'sync' });
const scroller = ref<HTMLElement>();
const chosenStyle = ref({ ...photoTextStyles[0]! });
const tabId = useId();
const tabs = [{ value: 'content', label: '内容' }, { value: 'font', label: '字体' }, { value: 'background', label: '底色' }, { value: 'layout', label: '排版' }] as const;
const activeTab = ref<(typeof tabs)[number]['value']>('content');
const textLayers = computed(() => props.document.elements.filter((element): element is TextElement => element.type === 'text').slice().reverse());
const selectedText = computed(() => props.selection?.kind === 'element' ? textLayers.value.find(text => text.id === props.selection?.id) : undefined);
const appearance = computed(() => selectedText.value ?? chosenStyle.value);
const locked = computed(() => selectedText.value?.locked ?? false);
const font = computed(() => photoTextFonts.find(font => font.value === appearance.value.fontFamily));
const fontCategory = ref<PhotoTextFontCategory>('chinese');
const filteredFonts = computed(() => photoTextFonts.filter(face => fontCategory.value === 'chinese' ? face.kind === '中文' : face.category === fontCategory.value));
const fontPreviewState = ref<Record<string, 'loading' | 'ready' | 'failed'>>({});
async function prepareFontPreview(face: PhotoTextFont) {
  if (fontPreviewState.value[face.value]) return;
  fontPreviewState.value[face.value] = 'loading';
  try {
    const faces = await document.fonts.load(`16px "${face.value}"`, face.sample);
    fontPreviewState.value[face.value] = faces.length || face.value === 'monospace' ? 'ready' : 'failed';
  } catch {
    fontPreviewState.value[face.value] = 'failed';
  }
}
watch([activeTab, filteredFonts], ([tab, faces]) => {
  if (tab === 'font') for (const face of faces) void prepareFontPreview(face);
});
const layerOptions = computed(() => [{ value: '', label: '新建文字' }, ...textLayers.value.map(text => ({ value: text.id, label: layerLabel(text) }))]);
const textBuffer = ref('');
let compositionId: string | undefined;
let compositionInvalidated = false;
let checkpointAfterComposition = false;
watch(() => [selectedText.value?.id, selectedText.value?.text] as const, ([id, text], previous) => {
  if (id !== previous?.[0]) {
    compositionId = undefined;
    checkpointAfterComposition = false;
  } else if (compositionId && text !== previous?.[1]) compositionInvalidated = true;
  if (textBuffer.value !== (text ?? '')) textBuffer.value = text ?? '';
}, { immediate: true, flush: 'sync' });
watch(() => [selectedText.value?.id, props.pending] as const, ([id, pending], previous) => {
  const submitted = submittedDraft.value;
  if (submitted && id && !submitted.existingIds.has(id) && selectedText.value?.text === submitted.text) {
    if (draftRevision === submitted.revision && draft.value === submitted.text) draft.value = '';
    submittedDraft.value = undefined;
  } else if (!pending && previous?.[1]) submittedDraft.value = undefined;
});
watch(() => selectedText.value?.id, async () => { activeTab.value = 'content'; await nextTick(); if (scroller.value) scroller.value.scrollTop = 0; });
watch(activeTab, async () => {
  compositionId = undefined;
  checkpointAfterComposition = false;
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = 0;
});

type PhotoTarget = { id: string; kind: 'slot' | 'element'; photo: CollageSlot | ImageElement; asset: MediaAsset; width: number; height: number; area: number };
const photos = computed(() => {
  const candidates: Array<CollageSlot | ImageElement> = [...(props.document.mode === 'grid' ? props.document.slots : []), ...props.document.elements.filter((element): element is ImageElement => element.type === 'image')];
  const byId = new Map(candidates.map(photo => [photo.id, photo]));
  return textPhotos(props.document, props.assets).map(frame => {
    const photo = byId.get(frame.id)!;
    return { id: photo.id, kind: 'type' in photo ? 'element' : 'slot', photo, asset: props.assets[photo.assetId!]!, width: frame.width, height: frame.height, area: frame.content.width * frame.content.height } as PhotoTarget;
  });
});
const mainPhoto = computed(() => photos.value.reduce<PhotoTarget | undefined>((largest, photo) => !largest || photo.area > largest.area ? photo : largest, undefined));
const selectedPhoto = computed(() => photos.value.find(photo => props.selection?.kind === photo.kind && props.selection.id === photo.id));
const targetPhoto = computed(() => selectedText.value ? photos.value.find(photo => photo.id === chooseTextPhoto(props.document, props.assets, props.selection, selectedText.value).id) ?? mainPhoto.value : selectedPhoto.value ?? mainPhoto.value);
const previewAsset = computed(() => targetPhoto.value?.asset ?? Object.values(props.assets).find(asset => asset.kind === 'image' || asset.kind === 'video'));
const draftPhoto = computed(() => chooseTextPhoto(props.document, props.assets, props.selection));
const fontSize = computed(() => selectedText.value?.fontSize ?? photoTextSize(draftPhoto.value, chosenStyle.value, draft.value || chosenStyle.value.sample));
const placementLabels: { value: TextPlacement; label: string }[] = [{ value: 'top', label: '上部' }, { value: 'center', label: '中央' }, { value: 'bottom', label: '下部' }];
const alignments = [{ value: 'left', label: '左对齐', icon: AlignLeft }, { value: 'center', label: '居中', icon: AlignCenter }, { value: 'right', label: '右对齐', icon: AlignRight }] as const;
function source(asset: MediaAsset) { return asset.kind === 'video' ? asset.thumbnail : asset.thumbnail || asset.src; }
function publishText(event: Event) {
  if (compositionId || (event as InputEvent).isComposing || !selectedText.value) return;
  textBuffer.value = (event.target as HTMLTextAreaElement).value;
  if (textBuffer.value !== selectedText.value.text) patchText({ text: textBuffer.value }, false);
}
function startComposition() {
  compositionId = selectedText.value?.id;
  compositionInvalidated = false;
  checkpointAfterComposition = false;
}
function finishComposition(event: CompositionEvent) {
  const id = compositionId;
  const invalidated = compositionInvalidated || id !== selectedText.value?.id;
  compositionId = undefined;
  if (invalidated) {
    textBuffer.value = selectedText.value?.text ?? '';
    (event.target as HTMLTextAreaElement).value = textBuffer.value;
  } else {
    publishText(event);
    if (checkpointAfterComposition) checkpoint();
  }
  checkpointAfterComposition = false;
}
function commitText() {
  if (compositionId) checkpointAfterComposition = true;
  else checkpoint();
}
function patchText(patch: Partial<TextElement>, commit = true) { if (selectedText.value && !locked.value) act({ type: 'element', patch, commit }); }
function patchAppearance(patch: Partial<PhotoTextStyle>, commit = true) { if (selectedText.value) patchText(patch, commit); else chosenStyle.value = { ...chosenStyle.value, ...patch }; }
function checkpoint() { if (selectedText.value && !locked.value) act({ type: 'checkpoint' }); }
function setSize(size: number) { if (selectedText.value) patchText({ fontSize: size }, false); else chosenStyle.value.sizeRatio = size / draftPhoto.value.content.width; }
function selectStyle(style: PhotoTextStyle) { if (selectedText.value) { if (!locked.value && !props.pending) act({ type: 'textStyle', style }); } else chosenStyle.value = { ...style }; }
function isStyleSelected(style: PhotoTextStyle) { const current = appearance.value; return current.fontFamily === style.fontFamily && current.fontStyle === style.fontStyle && current.color === style.color && current.backgroundColor === style.backgroundColor && current.align === style.align && current.lineHeight === style.lineHeight && current.stroke === style.stroke; }
function previewTextStyle(style: PhotoTextStyle): CSSProperties {
  const size = Math.max(11, Math.min(23, style.sizeRatio * 225));
  return { fontFamily: style.fontFamily, fontWeight: style.fontStyle.includes('bold') ? '700' : '400', fontStyle: style.fontStyle.includes('italic') ? 'italic' : 'normal', fontSize: `${size}px`, color: style.color, backgroundColor: style.backgroundColor, textAlign: style.align, lineHeight: style.lineHeight, textShadow: style.shadowRatio ? '0 1px 3px #14221dc9' : 'none', WebkitTextStroke: style.strokeRatio ? `${Math.max(.6, size * style.strokeRatio)}px ${style.stroke}` : '0 transparent', paintOrder: 'stroke fill' };
}
function addText() {
  if (adding.value || !draft.value.trim()) return;
  submittedDraft.value = { text: draft.value, revision: draftRevision, existingIds: new Set(textLayers.value.map(text => text.id)) };
  act({ type: 'addText', text: draft.value, style: { ...chosenStyle.value } });
}
async function newText() { act({ type: 'selection', selection: null }); activeTab.value = 'content'; await nextTick(); draftInput.value?.focus(); }
function toggleFontStyle(flag: 'bold' | 'italic') {
  if (locked.value) return;
  const style = appearance.value.fontStyle, bold = flag === 'bold' ? !style.includes('bold') : style.includes('bold'), italic = flag === 'italic' ? !style.includes('italic') : style.includes('italic');
  patchAppearance({ fontStyle: bold && italic ? 'bold italic' : bold ? 'bold' : italic ? 'italic' : 'normal' });
}
function layerLabel(text: TextElement) { return `${text.text.trim().replace(/\s+/g, ' ').slice(0, 28) || '空白文字'}${text.locked ? ' · 已锁定' : ''}${!text.visible ? ' · 已隐藏' : ''}`; }
function moveTab(event: KeyboardEvent, index: number) {
  const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!offset && event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length;
  activeTab.value = tabs[next]!.value;
  (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
}
</script>

<template>
  <section class="photo-text-tools" aria-label="照片上的文字工具">
    <div class="text-tabs" role="tablist" aria-label="文字编辑选项">
      <button v-for="(tab, index) in tabs" :id="`${tabId}-${tab.value}`" :key="tab.value" type="button" role="tab" :data-text-tab="tab.value" :aria-selected="activeTab === tab.value" :aria-controls="`${tabId}-panel`" :tabindex="activeTab === tab.value ? 0 : -1" @click="activeTab = tab.value" @keydown="event => moveTab(event, index)">{{ tab.label }}</button>
    </div>
    <div :id="`${tabId}-panel`" ref="scroller" class="text-tab-content" role="tabpanel" :aria-labelledby="`${tabId}-${activeTab}`" tabindex="0">
      <div v-if="textLayers.length" class="text-toolbar">
        <AppSelect :value="selectedText?.id ?? ''" :options="layerOptions" label="选择文字图层" :disabled="pending" @change="id => act({ type: 'selection', selection: id ? { kind: 'element', id: String(id) } : null })" />
        <button type="button" class="text-new" :disabled="pending" aria-label="新建照片文字" @click="newText"><Plus :size="17" aria-hidden="true" />新建</button>
      </div>
      <p v-if="pending && selectedText" class="text-hint" role="status">正在准备字体…</p>
      <p v-if="locked" class="text-notice"><Lock :size="15" aria-hidden="true" />已锁定，请在图层管理中解锁。</p>
      <p v-else-if="selectedText && !selectedText.visible" class="text-notice">这段文字已隐藏，可在图层管理中显示。</p>
      <template v-if="activeTab === 'content'">
        <label class="text-field"><span>{{ selectedText ? '你的文案' : '写在照片上' }}<small>支持多行</small></span>
          <textarea v-if="selectedText" :key="selectedText.id" v-model="textBuffer" :disabled="locked" rows="2" maxlength="2000" aria-label="所选文字内容" @input="publishText" @compositionstart="startComposition" @compositionend="finishComposition" @change="commitText" />
          <textarea v-else ref="draftInput" v-model="draft" rows="2" maxlength="2000" :placeholder="chosenStyle.sample" aria-label="新文字内容" />
        </label>
        <div v-if="selectedText" class="text-layer-actions"><button type="button" :disabled="locked || pending" aria-label="复制所选文字" @click="act({ type: 'duplicate' })"><Copy :size="16" aria-hidden="true" />复制一层</button><button type="button" class="text-danger" :disabled="locked || pending" aria-label="删除所选文字" @click="act({ type: 'remove' })"><Trash2 :size="16" aria-hidden="true" />删除</button></div>
        <div v-if="!selectedText && photos.length" class="text-photo-targets"><h3>放在哪张照片</h3><div class="text-photo-strip" role="group" aria-label="新文字的照片目标"><button v-for="(photo, index) in photos" :key="photo.id" type="button" :aria-label="`文字目标照片 ${index + 1}：${photo.asset.name}`" :aria-pressed="targetPhoto?.id === photo.id" @click="act({ type: 'selection', selection: { kind: photo.kind, id: photo.id } })"><svg :viewBox="`0 0 ${photo.width} ${photo.height}`" aria-hidden="true"><PhotoFramePreview :width="photo.width" :height="photo.height" :source="source(photo.asset)" :source-width="photo.asset.width" :source-height="photo.asset.height" :crop="photo.photo.crop" :filter="photo.photo.filter" :photo-frame="document.photoFrame" :shape="photo.photo.shape" :corner-radius="'type' in photo.photo ? photo.photo.cornerRadius : document.cornerRadius" /></svg><span>{{ index + 1 }}</span></button></div></div>
        <section class="text-presets" aria-label="照片文字风格"><div class="text-section-heading"><h3>成套字样</h3><span>也可单独改字体和底色</span></div><div class="text-style-grid"><button v-for="style in photoTextStyles" :key="style.id" type="button" class="text-style-card" :data-text-style="style.id" :aria-label="`${selectedText ? '应用' : '选择'}文字风格：${style.name}`" :aria-pressed="isStyleSelected(style)" :disabled="locked || (!!selectedText && pending)" @click="selectStyle(style)"><span class="text-style-preview" aria-hidden="true"><img v-if="previewAsset && source(previewAsset)" :src="source(previewAsset)" alt="" :style="{ filter: targetPhoto ? filterCss(targetPhoto.photo.filter) : undefined }" /><span class="text-style-sample" :style="previewTextStyle(style)">{{ style.sample }}</span><Check v-if="isStyleSelected(style)" class="style-check" :size="15" /></span><span class="text-style-name">{{ style.name }}</span></button></div></section>
      </template>
      <fieldset v-else-if="activeTab === 'font'" class="text-control-stack" :disabled="locked || (!!selectedText && pending)">
        <legend class="text-sr-only">字体与文字颜色</legend>
        <div class="text-section-heading"><h3>选择字体</h3><span>{{ font?.label ?? appearance.fontFamily }}</span></div>
        <div class="text-font-filters" role="group" aria-label="字体分类"><button v-for="category in photoTextFontCategories" :key="category.value" type="button" :aria-pressed="fontCategory === category.value" @click="fontCategory = category.value">{{ category.label }}</button></div>
        <div class="text-font-grid" role="group" aria-label="文字字体"><button v-for="face in filteredFonts" :key="face.value" type="button" class="text-font-card" :data-font="face.value" :aria-label="`文字字体 ${face.label}：${face.description}`" :aria-pressed="appearance.fontFamily === face.value" :disabled="fontPreviewState[face.value] === 'failed'" @click="patchAppearance({ fontFamily: face.value })"><span v-if="fontPreviewState[face.value] === 'ready'" :style="{ fontFamily: face.value }">{{ face.sample }}</span><span v-else class="text-font-placeholder" role="status">{{ fontPreviewState[face.value] === 'failed' ? '字体未能载入' : '正在载入字样…' }}</span><small>{{ face.label }}<i>{{ face.kind }}</i></small><p class="text-font-description">{{ face.description }}</p><Check v-if="appearance.fontFamily === face.value" :size="14" aria-hidden="true" /></button></div>
        <p class="text-hint">六款真实中文字库随应用内置，离线准备完成后也可使用。英文款仅适合英文；数字款使用设备的等宽字体。</p>
        <div class="text-weight" role="group" aria-label="字重与倾斜"><button type="button" :aria-pressed="appearance.fontStyle.includes('bold')" @click="toggleFontStyle('bold')"><Bold :size="16" aria-hidden="true" />加粗</button><button type="button" :aria-pressed="appearance.fontStyle.includes('italic')" @click="toggleFontStyle('italic')"><Italic :size="16" aria-hidden="true" />斜体</button></div>
        <PanelRange label="字号" :value="fontSize" :min="8" :max="240" unit="px" :disabled="locked" @input="setSize" @commit="checkpoint" />
        <ColorPicker label="文字颜色" :value="appearance.color" :disabled="locked" @input="color => patchAppearance({ color }, false)" @commit="checkpoint" />
      </fieldset>
      <fieldset v-else-if="activeTab === 'background'" class="text-control-stack" :disabled="locked || (!!selectedText && pending)">
        <legend class="text-sr-only">文字底色</legend>
        <ColorPicker label="文字底色" :value="appearance.backgroundColor" inline alpha allow-transparent :disabled="locked" @input="backgroundColor => patchAppearance({ backgroundColor }, false)" @commit="checkpoint" />
        <p class="text-hint">选择颜色，再用不透明度调节遮挡；选「无」移除底色。照片背景不会改变。</p>
      </fieldset>
      <fieldset v-else class="text-control-stack" :disabled="locked || (!!selectedText && pending)">
        <legend class="text-sr-only">文字排版</legend>
        <template v-if="selectedText"><h3>在照片里的位置</h3><div class="text-position" role="group" aria-label="文字在照片上的位置"><button v-for="position in placementLabels" :key="position.value" type="button" :aria-label="`文字放在画面${position.label}`" @click="act({ type: 'textPosition', position: position.value })">{{ position.label }}</button></div><p class="text-hint">也可以在画布上直接拖动、缩放和旋转。</p></template>
        <div class="text-alignment" role="group" aria-label="文字对齐方式"><button v-for="alignment in alignments" :key="alignment.value" type="button" :aria-label="alignment.label" :aria-pressed="appearance.align === alignment.value" @click="patchAppearance({ align: alignment.value })"><component :is="alignment.icon" :size="19" aria-hidden="true" /><span>{{ alignment.label }}</span></button></div>
        <PanelRange label="行高" :value="appearance.lineHeight" :min=".7" :max="3" :step=".05" unit="倍" :disabled="locked" @input="lineHeight => patchAppearance({ lineHeight }, false)" @commit="checkpoint" />
        <details v-if="selectedText" class="text-advanced"><summary>描边与弧形</summary><div class="text-control-stack"><PanelRange label="文字描边宽度" :value="selectedText.strokeWidth" :min="0" :max="20" :step=".5" unit="px" :disabled="locked" @input="strokeWidth => patchText({ strokeWidth, stroke: selectedText?.stroke || '#ffffff' }, false)" @commit="checkpoint" /><ColorPicker label="文字描边颜色" :value="selectedText.stroke" :disabled="locked" @input="stroke => patchText({ stroke }, false)" @commit="checkpoint" /><PanelRange label="弧形文字角度" :value="selectedText.curve" :min="-300" :max="300" unit="°" :disabled="locked" @input="curve => patchText({ curve }, false)" @commit="checkpoint" /><button type="button" @click="patchText({ curve: 0 })">恢复直线文字</button><p class="text-hint">多行文案建议使用直线文字。</p></div></details>
        <details class="text-advanced text-pair-details"><summary>标题与正文 · 字体搭配</summary><div class="text-control-stack"><button v-for="pair in photoTextPairs" :key="pair.name" type="button" class="text-font-pair" :disabled="pending" :aria-label="`添加字体搭配：${pair.name}`" @click="!pending && act({ type: 'textPair', pair })"><span :style="{ fontFamily: pair.heading }">{{ pair.title }}</span><small :style="{ fontFamily: pair.body }">{{ pair.name }}</small></button><p class="text-hint">一次添加两层文字，整组一步撤销。</p></div></details>
      </fieldset>
    </div>
    <div v-if="!selectedText" class="text-add-footer"><button type="button" class="text-add-button" :disabled="adding || !draft.trim()" :aria-busy="adding" aria-label="添加文字到照片" @click="addText"><Plus :size="17" aria-hidden="true" /><span role="status">{{ adding ? '正在准备字体…' : `添加到${targetPhoto ? '照片' : '画布'}上` }}</span></button></div>
  </section>
</template>

<style scoped>
.photo-text-tools{display:flex;flex-direction:column;gap:12px;min-width:0;min-height:0;height:var(--text-tools-height,calc(100dvh - 170px));color:var(--ink);font-size:13px;line-height:1.5}
.photo-text-tools h3,.photo-text-tools p{margin:0}
.photo-text-tools h3{font-size:13px;font-weight:600}
.photo-text-tools button{min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 12px;border:0;border-radius:var(--radius-control);background:var(--control);color:var(--ink);font:inherit;cursor:pointer;transition:transform .18s var(--ease-out),background .18s var(--ease-out),box-shadow .18s var(--ease-out)}
.photo-text-tools button:active:not(:disabled){transform:scale(.96)}
.photo-text-tools button:disabled{opacity:.4;cursor:not-allowed}
.photo-text-tools :is(button,textarea,summary,[role=tabpanel]):focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.text-toolbar{display:flex;align-items:center;gap:8px;flex-shrink:0;min-height:44px}
.text-toolbar :deep(.app-select-trigger){flex:1;width:auto;min-width:0}
.photo-text-tools .text-new{flex-shrink:0;background:var(--accent-soft);color:var(--accent)}
.text-tabs{flex-shrink:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;padding:4px;background:var(--control);border-radius:16px}
.text-tabs button{min-width:0;padding:8px 2px;border-radius:12px;color:var(--muted);background:transparent;font-size:13px}
.text-tabs button[aria-selected='true']{color:var(--accent);background:var(--surface-raised);font-weight:600;box-shadow:0 2px 7px #2033290d}
.text-tab-content{min-width:0;min-height:0;flex:1;display:flex;flex-direction:column;gap:18px;overflow-y:auto;overscroll-behavior:contain;padding:4px 4px 16px;scroll-padding-block:8px;scrollbar-width:thin}
.text-field{display:grid;gap:9px}
.text-field>span{display:flex;align-items:center;justify-content:space-between;font-weight:500}
.text-field small{color:var(--muted);font-size:11px;font-weight:400}
.text-field textarea{width:100%;min-width:0;min-height:108px;padding:14px;border:0;border-radius:16px;background:var(--control);color:var(--ink);font:inherit;font-size:16px;line-height:1.7;resize:vertical}
.text-layer-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.text-layer-actions button{min-width:0}
.photo-text-tools .text-danger{color:#a45749}
.text-notice{display:flex;gap:8px;align-items:center;padding:12px;background:#f2eada;border-radius:14px;font-size:12px}
.text-control-stack{display:flex;flex-direction:column;gap:16px;min-width:0;margin:0;padding:0;border:0}
.text-hint{font-size:11px;line-height:1.7;color:var(--muted)}
.text-section-heading{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}
.text-section-heading>span{font-size:11px;color:var(--muted);overflow-wrap:anywhere}
.text-presets,.text-photo-targets{display:grid;gap:12px}
.text-photo-strip{display:flex;gap:9px;overflow-x:auto;max-width:100%;padding:3px;min-height:74px;overscroll-behavior-x:contain;scroll-padding-inline:4px}
.photo-text-tools .text-photo-strip button{position:relative;flex:0 0 66px;height:66px;padding:3px;border-radius:13px;background:var(--control);overflow:hidden}
.text-photo-strip button[aria-pressed='true']{box-shadow:0 0 0 2px var(--accent)}
.text-photo-strip svg{display:block;width:100%;height:100%;border-radius:10px}
.text-photo-strip span{position:absolute;right:5px;bottom:5px;width:18px;height:18px;border-radius:50%;background:#202c25bf;color:#fff;font-size:10px;display:grid;place-items:center}
.text-style-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.photo-text-tools .text-style-card{display:grid;gap:0;padding:0;min-width:0;border-radius:16px;text-align:left;overflow:hidden;background:var(--control)}
.text-style-card[aria-pressed='true']{box-shadow:0 0 0 2px var(--accent)}
.text-style-preview{position:relative;display:flex;align-items:flex-end;min-height:90px;aspect-ratio:1.5;overflow:hidden;background:#d8e1d8;padding:10px}
.text-style-preview>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
.text-style-sample{position:relative;display:block;width:100%;padding:4px 5px;border-radius:3px;overflow-wrap:anywhere}
.style-check{position:absolute;top:8px;right:8px;padding:2px;background:var(--accent);color:white;border-radius:50%;width:20px;height:20px}
.text-style-name{padding:10px 12px;font-size:12px;font-weight:500}
.text-font-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.text-font-filters{display:flex;flex-wrap:wrap;gap:6px}
.photo-text-tools .text-font-filters button{min-height:44px;min-width:44px;padding:9px 11px;font-size:12px}
.text-font-filters button[aria-pressed='true']{background:var(--accent-soft);color:var(--accent);box-shadow:inset 0 0 0 1.5px var(--accent)}
.text-font-card>span.text-font-placeholder{font-size:12px;color:var(--muted);white-space:normal}
.text-font-description{font-size:11px;line-height:1.6;color:var(--muted);font-weight:400}
.photo-text-tools .text-font-card{position:relative;display:grid;justify-content:stretch;text-align:left;gap:10px;padding:14px 12px;min-width:0;min-height:90px;border-radius:16px}
.text-font-card>span{font-size:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4}
.text-font-card small{display:flex;justify-content:space-between;align-items:center;gap:4px;font-size:10px;color:var(--muted)}
.text-font-card i{font-style:normal;font-size:9px;opacity:.8}
.text-font-card>svg{position:absolute;right:8px;top:8px;color:var(--accent)}
.text-font-card[aria-pressed='true']{background:var(--accent-soft);box-shadow:inset 0 0 0 1.5px var(--accent)}
.text-weight,.text-position,.text-alignment{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;background:var(--control);padding:4px;border-radius:16px}
.text-position,.text-alignment{grid-template-columns:repeat(3,minmax(0,1fr))}
.text-weight button,.text-position button,.text-alignment button{padding:8px 4px;background:transparent;font-size:12px}
.text-alignment button{flex-direction:column;gap:3px;min-height:58px}
.text-alignment button span{font-size:12px}
.text-weight button[aria-pressed='true'],.text-alignment button[aria-pressed='true']{background:var(--surface);color:var(--accent);box-shadow:0 2px 6px #2033290b}
.text-advanced{min-width:0;border-top:1px solid var(--line)}
.text-advanced summary{min-height:48px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-size:12px;color:var(--muted);list-style:none}
.text-advanced summary::-webkit-details-marker{display:none}
.text-advanced summary::after{content:'+';font-size:18px}
.text-advanced[open] summary::after{content:'−'}
.text-advanced[open]>.text-control-stack{padding-top:8px}
.photo-text-tools .text-font-pair{display:grid;justify-content:stretch;gap:6px;text-align:left;padding:14px;width:100%}
.text-font-pair>span{font-size:22px;line-height:1.4}
.text-font-pair small{font-size:11px;color:var(--muted)}
.text-add-footer{flex-shrink:0;padding:8px 0 env(safe-area-inset-bottom);background:var(--surface)}
.photo-text-tools .text-add-button{width:100%;background:var(--accent);color:white;font-weight:600;box-shadow:0 3px 10px #284b3d18}
.text-sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
@media(hover:hover){.photo-text-tools button:hover:not(:disabled){background:var(--control-hover)}.photo-text-tools .text-add-button:hover:not(:disabled){background:#203c31}}
@media(max-width:700px) and (orientation:portrait){.photo-text-tools{gap:8px}.text-tab-content{gap:14px;padding-bottom:10px}.text-toolbar{min-height:44px}.text-field textarea{min-height:92px}.text-style-grid{gap:8px}.text-font-card>span{font-size:20px}.text-font-card i{font-size:8px}}
@media(max-width:900px) and (orientation:landscape) and (max-height:600px){.photo-text-tools{height:var(--text-tools-height,calc(100dvh - 118px))}}
@media(prefers-reduced-motion:reduce){.photo-text-tools button{transition:none}}
</style>
