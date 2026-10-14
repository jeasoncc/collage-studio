<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui';
import { ArrowRight, Images, Sparkles, X } from 'lucide-vue-next';
import { templates, templateCategories, chineseFestivals } from '../catalog/templates';
import { layouts } from '../catalog/layouts';
import type { CropState, FilterState, TemplatePreset } from '../types';
import TemplatePreview from './TemplatePreview.vue';

const props = defineProps<{
  category?: string;
  query?: string;
  limit?: number;
  disabled?: boolean;
  photos?: readonly { url: string; width: number; height: number; crop?: CropState; filter?: FilterState }[];
  currentRatio?: number;
}>();
const emit = defineEmits<{ select: [template: TemplatePreset]; preview: [open: boolean]; 'update:query': [query: string] }>();
const localCategory = ref('全部');
const selectedFestival = ref('');
const preview = ref<TemplatePreset | null>(null);
const capacityDescriptionId = useId();
const editorMode = computed(() => props.photos !== undefined);
const currentPhotoCount = computed(() => props.photos?.length ?? 0);
const selectedCount = ref<string | null>(null);
const activeCount = computed({
  get: () => selectedCount.value ?? (editorMode.value ? 'compatible' : 'all'),
  set: (value: string) => { selectedCount.value = value; },
});
const selectedRatio = ref('all');
const currentRatio = computed(() => props.currentRatio && Number.isFinite(props.currentRatio) && props.currentRatio > 0 ? props.currentRatio : undefined);
const availableCounts = [...new Set(templates.map(photoCount))].filter(count => count > 0).sort((a, b) => a - b);
let opener: HTMLElement | undefined;
const activeCategory = computed(() => props.category ?? localCategory.value);
const activeQuery = computed(() => (props.query ?? '').trim().toLowerCase());
const festival = computed(() => chineseFestivals.find(item => item.id === selectedFestival.value));
const showFestivals = computed(() => activeCategory.value === '全部' || activeCategory.value === '节日');
const filtered = computed(() => templates.filter(template =>
  (!activeCategory.value || activeCategory.value === '全部' || template.category === activeCategory.value)
  && (!festival.value || festival.value.templateIds.includes(template.id))
  && `${template.name} ${template.category} ${template.description}`.toLowerCase().includes(activeQuery.value)
  && (activeCount.value === 'all' || (activeCount.value === 'compatible' ? canUseTemplate(template) : photoCount(template) === Number(activeCount.value)))
  && (selectedRatio.value === 'all' || (selectedRatio.value === 'current'
    ? currentRatio.value !== undefined && Math.abs(template.width / template.height - currentRatio.value) < .001
    : ratioKind(template.width / template.height) === selectedRatio.value)),
));
const hasFilters = computed(() => !!activeQuery.value || !!selectedFestival.value || activeCategory.value !== '全部' || activeCount.value !== 'all' || selectedRatio.value !== 'all');
watch(() => props.query, query => {
  // A home keyword must not inherit an earlier local category or holiday.
  // Clearing a keyword keeps an intentionally chosen holiday chip.
  if (!query?.trim() && selectedFestival.value) return;
  localCategory.value = '全部';
  selectedFestival.value = '';
});
function clearQuery() {
  emit('update:query', '');
}
function selectCategory(value: string) {
  localCategory.value = value;
  selectedFestival.value = '';
}
function selectFestival(id: string) {
  clearQuery();
  selectedFestival.value = id;
  localCategory.value = '节日';
}
function resetFilters() {
  localCategory.value = '全部';
  selectedFestival.value = '';
  selectedCount.value = 'all';
  selectedRatio.value = 'all';
  clearQuery();
}
function photoCount(template: TemplatePreset): number {
  return template.mode === 'grid' ? layouts.find(layout => layout.id === template.layoutId)?.slots.length ?? 0 : template.photoFrames?.length ?? 0;
}
function canUseTemplate(template: TemplatePreset): boolean {
  const capacity = photoCount(template);
  return capacity > 0 && (!editorMode.value || capacity >= currentPhotoCount.value);
}
function capacityNote(template: TemplatePreset): string {
  const capacity = photoCount(template);
  const count = currentPhotoCount.value;
  if (!capacity) return '此模板没有可用的照片位置。';
  if (capacity < count) return `只有 ${capacity} 个位置，无法容纳当前 ${count} 张照片；预览仅展示前 ${capacity} 张。`;
  if (capacity > count) return `可容纳当前 ${count} 张照片，另有 ${capacity - count} 个空位可继续添加照片。`;
  return `刚好容纳当前 ${count} 张照片。`;
}
function ratioKind(ratio: number): string {
  return ratio === 1 ? 'square' : ratio > 1 ? 'landscape' : 'portrait';
}
function ratioLabel(ratio: number): string {
  return ratioKind(ratio) === 'square' ? '方形' : ratioKind(ratio) === 'landscape' ? '横版' : '竖版';
}
function isAnimated(template: TemplatePreset): boolean {
  return template.animation !== 'none' || template.elements.some(element => element.visible && element.animation !== 'none');
}
function format(template: TemplatePreset): string {
  return ratioLabel(template.width / template.height);
}
const cards = computed(() => props.limit === undefined ? filtered.value : filtered.value.slice(0, Math.max(0, props.limit)));
function openPreview(template: TemplatePreset, event?: MouseEvent) {
  if (props.disabled) return;
  opener = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  preview.value = template;
  emit('preview', true);
}
function closePreview() {
  if (!preview.value) return;
  preview.value = null;
  emit('preview', false);
}
function restoreFocus(event: Event) {
  event.preventDefault();
  if (opener?.isConnected) opener.focus({ preventScroll: true });
  opener = undefined;
}
function useTemplate() {
  if (!preview.value || props.disabled || !canUseTemplate(preview.value)) return;
  const template = preview.value;
  // Only this explicit action reaches the parent's selection/import workflow.
  // Browsing and cancelling never touch project state or the undo history.
  opener = undefined;
  closePreview();
  emit('select', template);
}
defineExpose({ openPreview, closePreview, getPreview: () => preview.value, resetFilters });
</script>

<template>
  <section class="template-gallery" aria-label="原创拼贴模板">
    <div class="template-controls">
    <div v-if="category === undefined" class="template-categories" aria-label="模板分类">
      <button v-for="item in templateCategories" :key="item" type="button" :class="{ active: activeCategory === item }" :aria-pressed="activeCategory === item" @click="selectCategory(item)">{{ item === '节日' ? '中国节日' : item }}</button>
    </div>
    <details class="template-filter">
      <summary>筛选</summary>
      <div class="template-fit-filters">
        <label>
          <span>照片数量</span>
          <select v-model="activeCount" aria-label="按照片数量筛选模板">
            <option value="all">不限照片数量</option>
            <option v-if="editorMode" value="compatible">可容纳当前 {{ currentPhotoCount }} 张</option>
            <option v-for="count in availableCounts" :key="count" :value="String(count)">{{ count }} 个照片位置</option>
          </select>
        </label>
        <label>
          <span>画布比例</span>
          <select v-model="selectedRatio" aria-label="按画布比例筛选模板">
            <option value="all">不限比例</option>
            <option v-if="currentRatio !== undefined" value="current">与当前画布相同（{{ ratioLabel(currentRatio) }}）</option>
            <option value="portrait">竖版</option>
            <option value="square">方形</option>
            <option value="landscape">横版</option>
          </select>
        </label>
      </div>
      <div v-if="showFestivals" class="festival-filter">
        <span class="festival-label">中国节日</span>
        <div class="festival-chips" aria-label="按中国节日筛选">
          <button type="button" :class="{ active: !selectedFestival }" :aria-pressed="!selectedFestival" @click="selectFestival('')">不限节日</button>
          <button v-for="item in chineseFestivals" :key="item.id" type="button" :class="{ active: selectedFestival === item.id }" :aria-pressed="selectedFestival === item.id" @click="selectFestival(item.id)">{{ item.label }}</button>
        </div>
      </div>
    </details>
    </div>
    <p v-if="editorMode" class="template-photo-context">使用你的 {{ currentPhotoCount }} 张照片预览。{{ activeCount === 'compatible' ? '已隐藏照片位置不足的模板。' : '照片位置不足的模板仅可预览，不能使用。' }}{{ currentRatio !== undefined ? ` 当前画布为${ratioLabel(currentRatio)}，使用模板将采用模板的尺寸。` : '' }}</p>
    <div class="template-results">
      <span>{{ activeQuery ? `“${activeQuery}” · ` : '' }}{{ filtered.length }} 款{{ festival ? ` · ${festival.label}` : '' }}模板</span>
      <button v-if="hasFilters" type="button" @click="resetFilters">清除筛选</button>
    </div>
    <div v-if="cards.length" class="template-grid">
      <button v-for="template in cards" :key="template.id" type="button" class="template-card" :class="{ incompatible: editorMode && !canUseTemplate(template) }" :disabled="disabled" :aria-label="`预览模板：${template.name}，${photoCount(template)} 个照片位置${editorMode ? `。${capacityNote(template)}` : ''}`" aria-haspopup="dialog" @click="openPreview(template, $event)">
        <div class="template-preview" :style="{ backgroundColor: template.background.color }">
          <TemplatePreview :template="template" :photos="photos" />
          <span v-if="isAnimated(template)" class="animated-badge"><Sparkles :size="12" aria-hidden="true" />动态</span>
          <span class="photo-count"><Images :size="13" aria-hidden="true" />{{ photoCount(template) }} 张</span>
        </div>
        <div class="template-info">
          <strong>{{ template.name }}</strong>
          <span class="template-card-meta"><span>{{ template.category }} · {{ format(template) }}</span><ArrowRight :size="16" aria-hidden="true" /></span>
          <span v-if="editorMode" class="template-capacity" :class="{ 'capacity-warning': !canUseTemplate(template) }">{{ capacityNote(template) }}</span>
        </div>
      </button>
    </div>
    <div v-else class="template-empty" role="status">
      <Images :size="28" aria-hidden="true" />
      <strong>还没有找到合适的模板</strong>
      <span v-if="editorMode && activeCount === 'compatible'">当前筛选下，没有可容纳 {{ currentPhotoCount }} 张照片的模板。<br />试试调整分类或比例，或清除筛选查看全部模板。</span>
      <span v-else>当前条件下没有合适的模板。<br />调整分类或筛选，或查看全部模板。</span>
      <button type="button" @click="resetFilters">清除筛选，查看全部模板</button>
    </div>
  </section>

  <DialogRoot :open="!!preview" @update:open="open => !open && closePreview()">
    <DialogPortal>
      <DialogOverlay class="template-sheet-overlay" />
      <DialogContent class="template-sheet" @close-auto-focus="restoreFocus">
        <template v-if="preview">
          <header class="template-sheet-header">
            <div><span class="sheet-eyebrow">{{ preview.category }} / {{ format(preview) }}</span><DialogTitle class="template-sheet-title">{{ preview.name }}</DialogTitle></div>
            <DialogClose class="template-sheet-close" aria-label="关闭模板预览"><X :size="22" /></DialogClose>
          </header>
          <div class="template-sheet-body">
            <div class="template-detail-canvas"><TemplatePreview :key="preview.id" :template="preview" :photos="photos" eager /></div>
            <DialogDescription class="template-sheet-description">{{ preview.description }}</DialogDescription>
            <div class="template-detail-facts"><span><Images :size="16" aria-hidden="true" />{{ photoCount(preview) }} 个照片位置</span><span>{{ preview.width }} × {{ preview.height }}</span><span v-if="isAnimated(preview)"><Sparkles :size="16" aria-hidden="true" />支持动态导出</span></div>
            <p v-if="editorMode" :id="capacityDescriptionId" class="template-edit-note" :class="{ 'capacity-warning': !canUseTemplate(preview) }">{{ capacityNote(preview) }} 使用模板将替换当前版式、文字与装饰，保留照片；确认后仍可撤销。</p>
            <p v-else class="template-edit-note">预览照片仅作灵感展示；使用后可替换成你的照片，自由编辑文字与装饰。</p>
          </div>
          <footer class="template-sheet-footer">
            <DialogClose class="template-cancel">再看看</DialogClose>
            <button type="button" class="template-use" :disabled="disabled || !canUseTemplate(preview)" :aria-describedby="editorMode ? capacityDescriptionId : undefined" @click="useTemplate">{{ canUseTemplate(preview) ? '使用模板' : '照片位置不足' }}<ArrowRight v-if="canUseTemplate(preview)" :size="18" aria-hidden="true" /></button>
          </footer>
        </template>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.template-gallery { width: 100%; min-width: 0; color: var(--ink); }
.template-gallery *, .template-gallery *::before, .template-gallery *::after { box-sizing: border-box; }
.template-controls { min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 24px; background: var(--surface); }
.template-categories { display: flex; gap: 8px; min-width: 0; padding: 6px; margin: -6px; overflow-x: auto; }
.template-categories button { flex: 0 0 auto; min-width: 44px; min-height: 44px; border: 0; background: var(--control); color: var(--muted); padding: 10px 16px; font: inherit; font-size: 13px; border-radius: 14px; cursor: pointer; white-space: nowrap; }
.template-categories button.active { background: var(--accent-soft); color: var(--accent); font-weight: 650; }
.template-filter { min-width: 0; margin-top: 12px; padding: 0 12px; background: var(--control); border-radius: 14px; }
.template-filter summary { min-height: 44px; padding: 12px 0; color: var(--ink); font-size: 13px; font-weight: 650; cursor: pointer; }
.template-filter summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 10px; }
.festival-filter { min-width: 0; }
.festival-label { display: block; margin-bottom: 7px; color: var(--muted); font-size: 12px; }
.festival-chips { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; padding: 0 0 12px; }
.festival-chips button { min-width: 44px; min-height: 44px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; color: var(--muted); background: var(--surface); font: inherit; font-size: 12px; cursor: pointer; overflow-wrap: anywhere; }
.festival-chips button.active { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); font-weight: 650; }
.template-fit-filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding-bottom: 12px; }
.template-fit-filters label { display: flex; flex-direction: column; gap: 7px; min-width: 0; color: var(--muted); font-size: 12px; }
.template-fit-filters select { width: 100%; min-width: 0; max-width: 100%; min-height: 46px; border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; background: var(--surface); color: var(--ink); font: inherit; font-size: 13px; text-overflow: ellipsis; }
.template-fit-filters select:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.template-photo-context { margin: 12px 4px 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.template-capacity { line-height: 1.6; }
.template-info > .capacity-warning, .template-edit-note.capacity-warning { color: #a5482f; }
.template-card.incompatible .photo-count { background: #fff0e9; color: #a5482f; }
.template-results { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 12px; margin: 10px 0 12px; color: var(--muted); font-size: 12px; }
.template-results > span { min-width: 0; overflow-wrap: anywhere; }
.template-results button { flex-shrink: 0; min-height: 44px; padding: 10px 12px; border: 0; border-radius: 14px; background: var(--accent-soft); color: var(--accent); font: inherit; font-size: 12px; cursor: pointer; }
.template-gallery button:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); align-items: start; gap: 18px; }
.template-card { min-width: 0; min-height: 44px; border: 1px solid var(--line); border-radius: 24px; padding: 8px; background: var(--surface); cursor: pointer; color: inherit; text-align: left; font: inherit; -webkit-tap-highlight-color: transparent; }
.template-preview { position: relative; aspect-ratio: 4 / 5; display: flex; align-items: center; justify-content: center; border-radius: 17px; overflow: hidden; }
.template-preview :deep(.template-scene) { width: 100%; height: 100%; }
.animated-badge, .photo-count { position: absolute; display: flex; align-items: center; gap: 5px; padding: 6px 9px; border-radius: 10px; background: #fffffff0; color: var(--ink); font-size: 11px; font-weight: 650; box-shadow: 0 2px 8px #24243a0d; }
.animated-badge { left: 8px; top: 8px; color: var(--accent); }
.photo-count { right: 8px; bottom: 8px; }
.template-info { display: flex; flex-direction: column; gap: 6px; padding: 12px 5px 6px; }
.template-info strong { font-size: 16px; font-weight: 650; line-height: 1.5; overflow-wrap: anywhere; }
.template-info > span { font-size: 12px; color: var(--muted); }
.template-card-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; line-height: 1.5; }
.template-card-meta > span { min-width: 0; overflow-wrap: anywhere; }
.template-card-meta > svg { flex-shrink: 0; color: var(--accent); }
.template-empty { display: flex; align-items: center; flex-direction: column; gap: 12px; text-align: center; margin-top: 12px; padding: 40px 18px; border: 1px solid var(--line); border-radius: 24px; background: var(--surface); color: var(--muted); font-size: 13px; line-height: 1.7; }
.template-empty strong { font-size: 17px; color: var(--ink); font-weight: 650; }
.template-empty button { min-height: 48px; margin-top: 4px; padding: 12px 18px; border: 0; border-radius: 14px; background: var(--accent-soft); color: var(--accent); font: inherit; font-weight: 650; cursor: pointer; }
.template-sheet-overlay { position: fixed; inset: 0; z-index: 110; background: #24243a77; backdrop-filter: blur(5px); animation: template-overlay-in .2s ease-out; }
.template-sheet { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 111; display: flex; flex-direction: column; width: min(680px, calc(100vw - 40px)); max-height: calc(100dvh - 48px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); overflow: hidden; background: var(--surface-raised); border-radius: 28px; box-shadow: 0 28px 90px #24243a40; color: var(--ink); animation: template-sheet-in .28s var(--ease-out); }
.template-sheet-header { flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 22px 24px 16px; }
.template-sheet-header > div { min-width: 0; }
.sheet-eyebrow { display: block; color: var(--muted); font-size: 11px; letter-spacing: .1em; margin-bottom: 6px; }
.template-sheet-title { margin: 0; font-size: 23px; line-height: 1.35; font-weight: 600; letter-spacing: -.5px; overflow-wrap: anywhere; }
.template-sheet-close { width: 44px; height: 44px; display: grid; place-items: center; flex-shrink: 0; padding: 0; border: 0; border-radius: 50%; color: var(--ink); background: var(--control); }
.template-sheet-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 24px 20px; }
.template-detail-canvas { box-sizing: border-box; width: 100%; height: min(54dvh, 600px); padding: 12px; border-radius: 19px; background: var(--control); }
.template-sheet-description { font-size: 14px; line-height: 1.7; margin: 18px 0 13px; }
.template-detail-facts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; color: var(--accent); font-size: 12px; }
.template-detail-facts > span { display: flex; align-items: center; gap: 6px; }
.template-edit-note { font-size: 12px; line-height: 1.7; color: var(--muted); margin: 15px 0 0; }
.template-sheet-footer { position: relative; display: flex; gap: 12px; align-items: center; flex-shrink: 0; padding: 14px 24px max(20px, env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: var(--surface-raised); }
.template-cancel, .template-use { display: flex; align-items: center; justify-content: center; min-height: 52px; font: inherit; font-size: 14px; font-weight: 600; border: 0; border-radius: 17px; padding: 12px 20px; }
.template-cancel { background: var(--control); color: var(--muted); }
.template-use { flex: 1; gap: 18px; background: var(--accent); color: white; }
.template-card:disabled, .template-use:disabled { cursor: not-allowed; opacity: .45; }
.template-sheet :is(button):focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
@keyframes template-overlay-in { from { opacity: 0; } }
@keyframes template-sheet-in { from { opacity: 0; margin-top: 20px; } }
@media (max-width: 540px) {
  .template-controls { padding: 12px; border-radius: 21px; }
  .template-categories { gap: 6px; }
  .template-categories button { padding: 10px 12px; font-size: 12px; border-radius: 12px; }
  .template-fit-filters { gap: 10px; }
  .template-fit-filters select { padding-inline: 8px; font-size: 12px; }
  .template-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .template-card { padding: 7px; border-radius: 21px; }
  .template-preview { border-radius: 15px; }
  .template-info { padding: 10px 4px 4px; }
  .template-info strong { font-size: 14px; }
  .template-info > span { font-size: 11px; }
  .animated-badge, .photo-count { padding: 5px 7px; gap: 4px; font-size: 10px; }
  .template-sheet { top: auto; bottom: 0; left: 0; transform: none; width: 100%; max-height: calc(100dvh - 12px - env(safe-area-inset-top)); border-radius: 28px 28px 0 0; }
  .template-sheet-header { padding: 18px max(16px, env(safe-area-inset-right)) 14px max(16px, env(safe-area-inset-left)); }
  .template-sheet-title { font-size: 21px; }
  .template-sheet-body { padding: 0 max(16px, env(safe-area-inset-right)) 18px max(16px, env(safe-area-inset-left)); }
  .template-detail-canvas { height: min(52dvh, 560px); padding: 8px; }
  .template-sheet-footer { gap: 10px; padding-left: max(16px, env(safe-area-inset-left)); padding-right: max(16px, env(safe-area-inset-right)); }
  .template-cancel, .template-use { padding-left: 16px; padding-right: 16px; }
  .template-use { gap: 10px; }
}
@media (hover: hover) { .template-card:hover:not(:disabled) { border-color: var(--accent); } .template-categories button:hover:not(.active), .festival-chips button:hover:not(.active) { color: var(--accent); } .template-use:hover:not(:disabled) { background: var(--accent-hover); } }
@media (prefers-reduced-motion: reduce) { .template-sheet, .template-sheet-overlay { animation: none; } }
</style>
