<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui';
import { ArrowRight, Images, Search, Sparkles, X } from 'lucide-vue-next';
import { templates, templateCategories, chineseFestivals } from '../catalog/templates';
import { layouts } from '../catalog/layouts';
import type { TemplatePreset } from '../types';
import TemplatePreview from './TemplatePreview.vue';

const props = defineProps<{ category?: string; query?: string; limit?: number; disabled?: boolean }>();
const emit = defineEmits<{ select: [template: TemplatePreset]; preview: [open: boolean]; 'update:query': [query: string] }>();
const localCategory = ref('全部');
const localQuery = ref('');
const selectedFestival = ref('');
const preview = ref<TemplatePreset | null>(null);
let opener: HTMLElement | undefined;
const activeCategory = computed(() => props.category ?? localCategory.value);
const activeQuery = computed(() => (props.query ?? localQuery.value).trim().toLowerCase());
const festival = computed(() => chineseFestivals.find(item => item.id === selectedFestival.value));
const showFestivals = computed(() => activeCategory.value === '全部' || activeCategory.value === '节日');
const filtered = computed(() => templates.filter(template =>
  (!activeCategory.value || activeCategory.value === '全部' || template.category === activeCategory.value)
  && (!festival.value || festival.value.templateIds.includes(template.id))
  && `${template.name} ${template.category} ${template.description}`.toLowerCase().includes(activeQuery.value),
));
const hasFilters = computed(() => !!activeQuery.value || !!selectedFestival.value || activeCategory.value !== '全部');
watch(() => props.query, query => {
  // A home keyword must not inherit an earlier local category or holiday.
  // Clearing search keeps an intentionally chosen holiday chip.
  if (!query?.trim() && selectedFestival.value) return;
  localCategory.value = '全部';
  selectedFestival.value = '';
});
function setQuery(value: string) {
  localQuery.value = value;
  emit('update:query', value);
}
function selectCategory(value: string) {
  localCategory.value = value;
  selectedFestival.value = '';
}
function selectFestival(id: string) {
  setQuery('');
  selectedFestival.value = id;
  localCategory.value = '节日';
}
function resetFilters() {
  localCategory.value = '全部';
  selectedFestival.value = '';
  setQuery('');
}
function photoCount(template: TemplatePreset): number {
  return template.mode === 'grid' ? layouts.find(layout => layout.id === template.layoutId)?.slots.length ?? 0 : template.photoFrames?.length ?? 0;
}
function isAnimated(template: TemplatePreset): boolean {
  return template.animation !== 'none' || template.elements.some(element => element.visible && element.animation !== 'none');
}
function format(template: TemplatePreset): string {
  return template.width === template.height ? '方形' : template.width > template.height ? '横版' : '竖版';
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
  if (!preview.value || props.disabled) return;
  const template = preview.value;
  // Only this explicit action reaches the parent's selection/import workflow.
  // Browsing and cancelling never touch project state or the undo history.
  opener = undefined;
  closePreview();
  emit('select', template);
}
defineExpose({ openPreview, closePreview, resetFilters });
</script>

<template>
  <section class="template-gallery" aria-label="原创拼贴模板">
    <label v-if="query === undefined" class="template-search">
      <Search :size="19" aria-hidden="true" />
      <input v-model="localQuery" type="search" placeholder="搜索春节、中秋、旅行…" aria-label="搜索模板" />
    </label>
    <div v-if="category === undefined" class="template-categories" aria-label="模板分类">
      <button v-for="item in templateCategories" :key="item" type="button" :class="{ active: activeCategory === item }" :aria-pressed="activeCategory === item" @click="selectCategory(item)">{{ item === '节日' ? '中国节日' : item }}</button>
    </div>
    <div v-if="showFestivals" class="festival-filter">
      <p>中国节日<span>把相聚与思念，留在照片里</span></p>
      <div class="festival-chips" aria-label="按中国节日筛选">
        <button type="button" :class="{ active: !selectedFestival }" :aria-pressed="!selectedFestival" @click="selectFestival('')">不限节日</button>
        <button v-for="item in chineseFestivals" :key="item.id" type="button" :class="{ active: selectedFestival === item.id }" :aria-pressed="selectedFestival === item.id" @click="selectFestival(item.id)">{{ item.label }}</button>
      </div>
    </div>
    <div class="template-results">
      <span>{{ activeQuery ? `“${activeQuery}” · ` : '' }}{{ filtered.length }} 款{{ festival ? ` · ${festival.label}` : '' }}模板</span>
      <button v-if="hasFilters" type="button" @click="resetFilters">清除筛选</button>
    </div>
    <div v-if="cards.length" class="template-grid">
      <button v-for="template in cards" :key="template.id" type="button" class="template-card" :disabled="disabled" :aria-label="`预览模板：${template.name}，${photoCount(template)} 张照片`" aria-haspopup="dialog" @click="openPreview(template, $event)">
        <div class="template-preview" :style="{ backgroundColor: template.background.color }">
          <TemplatePreview :template="template" />
          <span v-if="isAnimated(template)" class="animated-badge"><Sparkles :size="12" aria-hidden="true" />动态</span>
          <span class="photo-count"><Images :size="12" aria-hidden="true" />{{ photoCount(template) }}</span>
        </div>
        <div class="template-info"><strong>{{ template.name }}</strong><span>{{ template.category }}<span aria-hidden="true"> · </span>{{ format(template) }}</span></div>
      </button>
    </div>
    <div v-else class="template-empty" role="status">
      <Search :size="28" aria-hidden="true" />
      <strong>还没有找到合适的模板</strong>
      <span>试试“春节”“中秋”或“旅行”，<br />也可以清除筛选，看看全部灵感。</span>
      <button type="button" @click="resetFilters">查看全部模板</button>
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
            <div class="template-detail-canvas"><TemplatePreview :key="preview.id" :template="preview" eager /></div>
            <DialogDescription class="template-sheet-description">{{ preview.description }}</DialogDescription>
            <div class="template-detail-facts"><span><Images :size="16" aria-hidden="true" />{{ photoCount(preview) }} 张照片</span><span>{{ preview.width }} × {{ preview.height }}</span><span v-if="isAnimated(preview)"><Sparkles :size="16" aria-hidden="true" />支持动态导出</span></div>
            <p class="template-edit-note">预览照片仅作灵感展示；使用后可替换成你的照片，自由编辑文字与装饰。</p>
          </div>
          <footer class="template-sheet-footer">
            <DialogClose class="template-cancel">再看看</DialogClose>
            <button type="button" class="template-use" :disabled="disabled || photoCount(preview) === 0" @click="useTemplate">使用模板<ArrowRight :size="18" aria-hidden="true" /></button>
          </footer>
        </template>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.template-gallery { width: 100%; min-width: 0; color: var(--ink); }
.template-search { display: flex; gap: 10px; align-items: center; min-height: 48px; box-sizing: border-box; border-radius: 17px; padding: 12px 16px; background: var(--control); color: var(--muted); margin-bottom: 6px; }
.template-search:focus-within { outline: 2px solid var(--accent); outline-offset: 3px; }
.template-search input { flex: 1; min-width: 0; width: 0; background: none; border: 0; outline: 0; color: var(--ink); font: inherit; font-size: 14px; }
.template-categories { display: flex; gap: 8px; overflow-x: auto; padding: 8px 2px 14px; overscroll-behavior-x: contain; scrollbar-width: none; }
.template-categories::-webkit-scrollbar, .festival-chips::-webkit-scrollbar { display: none; }
.template-categories button { flex-shrink: 0; position: relative; white-space: nowrap; min-height: 44px; border: 0; background: transparent; color: var(--muted); padding: 10px 16px; font: inherit; font-size: 14px; border-radius: 999px; cursor: pointer; }
.template-categories button.active { background: var(--accent); color: white; font-weight: 600; }
.festival-filter { min-width: 0; margin: 0 0 12px; padding: 14px 14px 6px; background: var(--control); border-radius: 20px; }
.festival-filter p { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; margin: 0 0 8px; font-size: 14px; font-weight: 600; }
.festival-filter p span { color: var(--muted); font-size: 12px; font-weight: 400; }
.festival-chips { display: flex; gap: 7px; min-width: 0; overflow-x: auto; padding: 2px 0 8px; overscroll-behavior-x: contain; scrollbar-width: none; }
.festival-chips button { flex-shrink: 0; min-height: 44px; padding: 9px 14px; border: 1px solid var(--line); border-radius: 999px; color: var(--ink); background: var(--surface-raised); font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer; }
.festival-chips button.active { color: var(--accent); border-color: var(--accent); font-weight: 600; }
.template-results { display: flex; min-height: 44px; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; color: var(--muted); font-size: 12px; }
.template-results > span { min-width: 0; overflow-wrap: anywhere; }
.template-results button { flex-shrink: 0; min-height: 44px; padding: 8px 4px 8px 12px; border: 0; background: transparent; color: var(--accent); font: inherit; font-size: 13px; cursor: pointer; }
.template-gallery button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr)); align-items: start; gap: 22px 16px; }
.template-card { min-width: 0; min-height: 44px; border: 0; border-radius: 0; padding: 0; background: transparent; cursor: pointer; color: inherit; text-align: left; transition: transform .22s var(--ease-out); -webkit-tap-highlight-color: transparent; }
.template-card:active:not(:disabled) { transform: scale(.975); }
.template-card:focus-visible { outline: 3px solid var(--accent); outline-offset: 5px; border-radius: 20px; }
.template-preview { position: relative; aspect-ratio: 4 / 5; display: flex; align-items: center; justify-content: center; border-radius: 19px; overflow: hidden; box-shadow: 0 4px 16px #2033290b; }
.template-preview :deep(.template-scene) { width: 100%; height: 100%; }
.animated-badge, .photo-count { position: absolute; display: flex; align-items: center; gap: 5px; padding: 6px 9px; border-radius: 999px; background: #fbfaf4e8; color: #304c3d; font-size: 11px; font-weight: 600; box-shadow: 0 2px 8px #2033290a; }
.animated-badge { left: 9px; top: 9px; }
.photo-count { right: 9px; bottom: 9px; }
.template-info { display: flex; flex-direction: column; gap: 4px; padding: 11px 3px 0; }
.template-info strong { font-size: 14px; font-weight: 600; line-height: 1.5; }
.template-info > span { font-size: 12px; color: var(--muted); }
.template-empty { display: flex; align-items: center; flex-direction: column; gap: 12px; text-align: center; padding: 48px 16px; color: var(--muted); font-size: 13px; line-height: 1.7; }
.template-empty strong { font-size: 16px; color: var(--ink); font-weight: 600; }
.template-empty button { min-height: 48px; margin-top: 4px; padding: 12px 20px; border: 0; border-radius: 15px; background: var(--control); color: var(--accent); font: inherit; font-weight: 600; cursor: pointer; }
.template-sheet-overlay { position: fixed; inset: 0; z-index: 110; background: #14231b77; backdrop-filter: blur(5px); animation: template-overlay-in .2s ease-out; }
.template-sheet { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 111; display: flex; flex-direction: column; width: min(680px, calc(100vw - 40px)); max-height: calc(100dvh - 48px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); overflow: hidden; background: var(--surface-raised); border-radius: 28px; box-shadow: 0 28px 90px #14231b40; color: var(--ink); animation: template-sheet-in .28s var(--ease-out); }
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
.template-sheet-footer { position: relative; display: flex; gap: 12px; align-items: center; flex-shrink: 0; padding: 14px 24px max(20px, env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: var(--surface-raised); box-shadow: 0 -8px 20px #20332905; }
.template-cancel, .template-use { display: flex; align-items: center; justify-content: center; min-height: 52px; font: inherit; font-size: 14px; font-weight: 600; border: 0; border-radius: 17px; padding: 12px 20px; }
.template-cancel { background: var(--control); color: var(--muted); }
.template-use { flex: 1; gap: 18px; background: var(--accent); color: white; }
.template-card:disabled, .template-use:disabled { cursor: not-allowed; opacity: .45; }
.template-sheet :is(button):focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
@keyframes template-overlay-in { from { opacity: 0; } }
@keyframes template-sheet-in { from { opacity: 0; margin-top: 20px; } }
@media (max-width: 540px) {
  .template-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 12px; }
  .template-preview { border-radius: 16px; }
  .template-info strong { font-size: 13px; }
  .template-info > span { font-size: 11px; }
  .template-sheet { top: auto; bottom: 0; left: 0; transform: none; width: 100%; max-height: calc(100dvh - 12px - env(safe-area-inset-top)); border-radius: 28px 28px 0 0; }
  .template-sheet-header { padding: 18px max(16px, env(safe-area-inset-right)) 14px max(16px, env(safe-area-inset-left)); }
  .template-sheet-title { font-size: 21px; }
  .template-sheet-body { padding: 0 max(16px, env(safe-area-inset-right)) 18px max(16px, env(safe-area-inset-left)); }
  .template-detail-canvas { height: min(52dvh, 560px); padding: 8px; }
  .template-sheet-footer { gap: 10px; padding-left: max(16px, env(safe-area-inset-left)); padding-right: max(16px, env(safe-area-inset-right)); }
  .template-cancel, .template-use { padding-left: 16px; padding-right: 16px; }
  .template-use { gap: 10px; }
}
@media (hover: hover) { .template-card:hover .template-preview { box-shadow: 0 6px 22px #20332918; } .template-use:hover:not(:disabled) { filter: brightness(1.06); } }
@media (prefers-reduced-motion: reduce) { .template-card, .template-categories button, .template-sheet button { transition: none; } .template-card:active:not(:disabled), .template-sheet button:active:not(:disabled) { transform: none; } .template-sheet, .template-sheet-overlay { animation: none; } }
</style>
