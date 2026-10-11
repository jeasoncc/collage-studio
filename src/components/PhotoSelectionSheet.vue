<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Sortable from 'sortablejs';
import { Check, ImagePlus, Images, LoaderCircle } from 'lucide-vue-next';
import AppDialog from './AppDialog.vue';
import { MAX_COLLAGE_PHOTOS } from '../catalog/layouts';
import type { CollageCreationMode } from '../types';
import type { PhotoSelectionItem } from './photoSelection';
import type { ComponentPublicInstance } from 'vue';

const props = withDefaults(defineProps<{
  open: boolean;
  items: readonly PhotoSelectionItem[];
  mode: CollageCreationMode;
  intent: 'create' | 'manage';
  ratio: string;
  processing: boolean;
  processingMessage: string;
  error?: string;
  maxPhotos?: number;
  requiredCount?: number;
  lockConfiguration?: boolean;
}>(), { error: '', maxPhotos: MAX_COLLAGE_PHOTOS, requiredCount: 1, lockConfiguration: false });

const emit = defineEmits<{
  'update:open': [value: boolean];
  'update:mode': [value: CollageCreationMode];
  ratio: [value: string];
  add: [];
  reorder: [ids: string[]];
  remove: [ids: string[]];
  confirm: [];
}>();

const modes: { value: CollageCreationMode; label: string }[] = [
  { value: 'grid', label: '网格拼图' },
  { value: 'long', label: '长图拼接' },
  { value: 'free', label: '自由拼图' },
];
const modeDescriptions: Record<CollageCreationMode, string> = {
  grid: '自动排好照片，进入画布后可调整布局与留白。',
  long: '按当前顺序从上到下拼接，保留每张照片的完整比例。',
  free: '先排好照片，再自由移动、旋转与叠放。',
};
const ratios = [
  { value: '1080x1080', label: '1:1', name: '方形' },
  { value: '1080x1350', label: '4:5', name: '竖版' },
  { value: '1080x1440', label: '3:4', name: '竖版' },
  { value: '1440x960', label: '3:2', name: '横版' },
  { value: '1080x1920', label: '9:16', name: '全屏' },
];
const minimum = computed(() => Math.max(1, props.requiredCount));
const canConfirm = computed(() => !props.processing && props.items.length >= minimum.value && props.items.length <= props.maxPhotos);
const canAdd = computed(() => !props.processing && props.items.length < props.maxPhotos);
const countHint = computed(() => {
  if (props.items.length > props.maxPhotos) return `最多保留 ${props.maxPhotos} 张照片`;
  if (props.items.length < minimum.value) return `还需添加 ${minimum.value - props.items.length} 张照片`;
  return `已选 ${props.items.length} 张 · 最多 ${props.maxPhotos} 张`;
});
const announcement = ref('');
const selecting = ref(false);
const selected = ref(new Set<string>());
const selectedIds = computed(() => props.items.filter(item => selected.value.has(item.id)).map(item => item.id));
const allSelected = computed(() => props.items.length > 0 && selectedIds.value.length === props.items.length);
const listElement = ref<HTMLOListElement | null>(null);
let sortable: Sortable | null = null;
let dragIds: string[] = [];
let dragCancelled = false;
let suppressTapUntil = 0;

function resetSelection() {
  selecting.value = false;
  selected.value = new Set();
}

function toggleSelection() {
  if (props.processing) return;
  if (selecting.value) resetSelection();
  else selecting.value = true;
}

function selectAll() {
  if (props.processing || !selecting.value) return;
  selected.value = allSelected.value ? new Set() : new Set(props.items.map(item => item.id));
}

function activatePhoto(id: string) {
  if (props.processing || Date.now() < suppressTapUntil || !selecting.value) return;
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

function removeSelected() {
  if (props.processing || !selecting.value || selectedIds.value.length === 0) return;
  const ids = selectedIds.value;
  resetSelection();
  announcement.value = `已移除 ${ids.length} 张照片`;
  emit('remove', ids);
}

function cancelDrag() {
  dragCancelled = true;
  suppressTapUntil = Date.now() + 450;
}

function movePhoto(id: string, direction: -1 | 1) {
  if (props.processing || selecting.value || dragIds.length > 0) return;
  const ids = props.items.map(item => item.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]!);
  announcement.value = `照片已移到第 ${to + 1} 位`;
  emit('reorder', ids);
}

function setListElement(value: Element | ComponentPublicInstance | null) {
  const element = value && '$el' in value ? value.$el : value;
  listElement.value = element instanceof HTMLOListElement ? element : null;
}

function restoreControlledOrder(element: HTMLElement) {
  // Sortable mutates the DOM. Restore Vue's current order before emitting a new
  // controlled list, so keyed patching and TransitionGroup see the same baseline.
  const cards = new Map(Array.from(element.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('photo-card'))
    .map(child => [child.dataset.photoId, child]));
  for (const item of props.items) {
    const card = cards.get(item.id);
    if (card) element.appendChild(card);
  }
  const addTile = element.querySelector(':scope > .photo-add');
  if (addTile) element.appendChild(addTile);
}

watch([listElement, () => props.open], ([element, open]) => {
  sortable?.destroy();
  sortable = null;
  dragIds = [];
  dragCancelled = false;
  if (!element || !open) return;
  const options: Sortable.Options & { supportPointer: boolean } = {
    draggable: '.photo-card',
    handle: '.photo-preview',
    dataIdAttr: 'data-photo-id',
    disabled: props.processing || selecting.value,
    animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160,
    delay: 350,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    fallbackTolerance: 4,
    // Touch events allow scrolling during the delay, then cancel scrolling once
    // the long press activates. Pointer events would cancel the drag on a pan.
    supportPointer: false,
    forceFallback: true,
    fallbackOnBody: true,
    ghostClass: 'photo-sort-ghost',
    chosenClass: 'photo-sort-chosen',
    onChoose: () => {
      dragCancelled = false;
      suppressTapUntil = Number.POSITIVE_INFINITY;
    },
    onUnchoose: () => { suppressTapUntil = Date.now() + 450; },
    onStart: () => { dragIds = props.items.map(item => item.id); },
    onMove: event => !event.related.classList.contains('photo-add'),
    onEnd: event => {
      const ids = dragIds;
      dragIds = [];
      suppressTapUntil = Date.now() + 450;
      restoreControlledOrder(element);
      const from = event.oldDraggableIndex;
      const to = event.newDraggableIndex;
      if (dragCancelled || props.processing || selecting.value || !props.open || from === undefined || to === undefined || from === to) return;
      if (ids.length !== props.items.length || ids.some((id, index) => id !== props.items[index]?.id)) return;
      if (from < 0 || to < 0 || from >= ids.length || to >= ids.length) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]!);
      announcement.value = `照片已移到第 ${to + 1} 位`;
      emit('reorder', ids);
    },
  };
  sortable = Sortable.create(element, options);
}, { flush: 'post' });

watch([() => props.processing, selecting], ([processing, isSelecting]) => {
  if (processing || isSelecting) dragCancelled = true;
  sortable?.option('disabled', processing || isSelecting);
});
watch(() => props.items.map(item => item.id), ids => {
  const remaining = new Set(ids);
  selected.value = new Set([...selected.value].filter(id => remaining.has(id)));
  if (ids.length === 0) resetSelection();
});
watch(() => props.open, () => {
  resetSelection();
  announcement.value = '';
  suppressTapUntil = 0;
  dragCancelled = true;
});
onBeforeUnmount(() => { sortable?.destroy(); sortable = null; });
</script>

<template>
  <AppDialog
    :open="open"
    :title="intent === 'create' ? '选择照片，开始拼图' : '整理照片'"
    :description="intent === 'create' ? '选好照片和顺序后再进入画布。' : '调整顺序或增减照片，点击完成后才会应用。'"
    :locked="processing"
    @update:open="value => !processing && emit('update:open', value)"
  >
    <section class="photo-selection" :class="{ 'is-selecting': selecting }" :aria-busy="processing">
      <div class="selection-scroll">
        <div v-if="intent === 'create' && !lockConfiguration" class="selection-configuration">
          <div class="mode-control" role="group" aria-label="拼图方式">
            <button
              v-for="option in modes" :key="option.value" type="button"
              :aria-pressed="mode === option.value" :disabled="processing"
              @click="emit('update:mode', option.value)"
            >{{ option.label }}</button>
          </div>
          <p class="mode-description">{{ modeDescriptions[mode] }}</p>
          <div v-if="mode !== 'long'" class="ratio-control" role="group" aria-label="画布比例">
            <button
              v-for="option in ratios" :key="option.value" type="button"
              :aria-label="`${option.name} ${option.label}`" :aria-pressed="ratio === option.value"
              :disabled="processing" @click="emit('ratio', option.value)"
            >{{ option.label }}</button>
          </div>
        </div>
        <div class="photos-heading">
          <h3>照片顺序 <span>{{ items.length }}/{{ maxPhotos }}</span></h3>
          <button class="selection-toggle" type="button" :disabled="processing || items.length === 0" :aria-pressed="selecting" @click="toggleSelection">
            {{ selecting ? '取消选择' : '选择' }}
          </button>
          <p id="photo-order-hint">{{ selecting ? '点选整张照片，在底部统一移除。' : '长按照片拖动排序；点击「选择」可批量移除。' }}</p>
        </div>
        <div v-if="selecting" class="selection-toolbar">
          <span role="status" aria-live="polite">已选择 {{ selectedIds.length }} 张</span>
          <button type="button" :disabled="processing" :aria-pressed="allSelected" @click="selectAll">{{ allSelected ? '取消全选' : '全选' }}</button>
        </div>
        <div v-if="items.length === 0" class="selection-empty">
          <Images :size="32" aria-hidden="true" />
          <strong>先选几张喜欢的照片</strong>
          <p>按选择顺序排列，稍后还能调整。</p>
        </div>
        <TransitionGroup :ref="setListElement" tag="ol" name="photo-list" class="photo-grid" @touchcancel.capture="cancelDrag">
          <li v-for="(item, index) in items" :key="`photo:${item.id}`" class="photo-card" :class="{ 'is-selected': selected.has(item.id) }" :data-photo-id="item.id">
            <button
              class="photo-preview" type="button" :disabled="processing"
              :aria-label="selecting ? `${selected.has(item.id) ? '取消选择' : '选择'}第 ${index + 1} 张照片` : `第 ${index + 1} 张照片，长按拖动或按方向键排序`"
              :aria-pressed="selecting ? selected.has(item.id) : undefined"
              :aria-describedby="selecting ? undefined : 'photo-order-hint'"
              @click="activatePhoto(item.id)" @contextmenu.prevent
              @keydown.left.prevent="movePhoto(item.id, -1)"
              @keydown.up.prevent="movePhoto(item.id, -1)"
              @keydown.right.prevent="movePhoto(item.id, 1)"
              @keydown.down.prevent="movePhoto(item.id, 1)"
            >
              <img :src="item.asset.thumbnail || item.asset.src" :alt="item.asset.name || `照片 ${index + 1}`" draggable="false" />
              <span class="photo-ordinal" aria-hidden="true">{{ index + 1 }}</span>
              <span v-if="selecting" class="photo-selection-mark" aria-hidden="true">
                <Check v-if="selected.has(item.id)" :size="17" />
              </span>
            </button>
          </li>
          <li key="photo-add" class="photo-add">
            <button type="button" :disabled="!canAdd" @click="emit('add')">
              <ImagePlus :size="27" aria-hidden="true" />
              <span>{{ items.length >= maxPhotos ? '已达上限' : '添加照片' }}</span>
              <small v-if="items.length === 0">最多 {{ maxPhotos }} 张</small>
            </button>
          </li>
        </TransitionGroup>
        <p v-if="items.length >= maxPhotos" class="selection-limit">照片已满，可先移除一张再添加。</p>
        <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
      </div>
      <footer class="selection-footer">
        <div v-if="processing" class="selection-progress" role="status" aria-live="polite">
          <LoaderCircle :size="18" class="selection-spinner" aria-hidden="true" />
          <span>{{ processingMessage || '正在准备照片，请稍候…' }}</span>
        </div>
        <p v-if="error" class="selection-error" role="alert">{{ error }}</p>
        <p v-if="!processing" class="selection-count">{{ countHint }}</p>
        <button v-if="selecting" class="selection-remove" type="button" :disabled="processing || selectedIds.length === 0" @click="removeSelected">
          移除所选（{{ selectedIds.length }}）
        </button>
        <div class="selection-actions">
          <button class="selection-cancel" type="button" :disabled="processing" @click="emit('update:open', false)">取消</button>
          <button class="selection-confirm" type="button" :disabled="!canConfirm" @click="canConfirm && emit('confirm')">
            <Check v-if="!processing" :size="18" aria-hidden="true" />
            {{ processing ? '正在处理…' : intent === 'create' ? '开始拼图' : '完成整理' }}
          </button>
        </div>
      </footer>
    </section>
  </AppDialog>
</template>

<style scoped>
/* AppDialog teleports its focus-trapped content; this marker targets only this sheet. */
:global(.dialog-content:has(.photo-selection)) {
  display: flex;
  flex-direction: column;
  width: min(94vw, 620px);
  max-height: min(90dvh, 860px);
  overflow: hidden;
  padding: 0;
  border-radius: 28px;
  background: var(--surface);
  box-shadow: var(--shadow-float);
}
:global(.dialog-content[data-state='open']:has(.photo-selection)) { animation: selection-sheet-in 180ms var(--ease-out); }
:global(.dialog-content:has(.photo-selection) .dialog-header) { flex: 0 0 auto; margin: 0; padding: 20px 20px 16px; }
:global(.dialog-content:has(.photo-selection) .dialog-title) { font-size: 20px; line-height: 1.4; }
:global(.dialog-content:has(.photo-selection) .dialog-description) { font-size: 13px; line-height: 1.6; }
:global(.dialog-content:has(.photo-selection) .dialog-header .icon-button) { width: 44px; height: 44px; border-radius: 14px; }
.photo-selection { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; overflow: hidden; color: var(--ink); }
.selection-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 20px 20px; }
.photo-selection button { min-width: 44px; min-height: 44px; font: inherit; font-size: 13px; cursor: pointer; transition: background .18s var(--ease-out), transform .18s var(--ease-out), box-shadow .18s var(--ease-out); -webkit-tap-highlight-color: transparent; }
.photo-selection button:active:not(:disabled) { transform: scale(.97); }
.photo-selection button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.photo-selection button:disabled { cursor: not-allowed; opacity: .45; }
.selection-configuration { margin-bottom: 20px; }
.mode-control { display: grid; grid-template-columns: repeat(3, 1fr); padding: 4px; gap: 4px; border-radius: 18px; background: var(--control); }
.mode-control button { border: 0; background: transparent; color: var(--muted); border-radius: 14px; padding: 10px 4px; font-weight: 500; }
.mode-control button[aria-pressed=true] { color: var(--accent); background: var(--surface-raised); box-shadow: var(--shadow-card); font-weight: 600; }
.mode-description { margin: 10px 0 12px; font-size: 13px; line-height: 1.6; color: var(--muted); }
.ratio-control { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
.ratio-control button { padding: 8px 3px; border: 0; border-radius: var(--radius-control); color: var(--muted); background: var(--control); }
.ratio-control button[aria-pressed=true] { color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); font-weight: 600; }
.photos-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 8px; margin-bottom: 12px; }
.photos-heading, .selection-toolbar { position: relative; z-index: 1; background: var(--surface); }
.photos-heading h3 { margin: 0; font-size: 15px; font-weight: 650; display: flex; align-items: center; gap: 9px; }
.photos-heading h3 span { color: var(--muted); font-size: 13px; font-weight: 400; }
.photos-heading p { grid-column: 1 / -1; font-size: 13px; line-height: 1.5; color: var(--muted); margin: 2px 0 0; }
.selection-toggle, .selection-toolbar button { padding: 9px 12px; border: 0; border-radius: var(--radius-control); color: var(--accent); background: var(--accent-soft); font-weight: 600; white-space: nowrap; }
.selection-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: -2px 0 12px; color: var(--muted); font-size: 13px; }
.photo-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; list-style: none; padding: 0; margin: 0; }
.photo-card { min-width: 0; border: 0; border-radius: 14px; background: var(--control); }
.photo-selection .photo-preview { display: block; position: relative; width: 100%; padding: 0; border: 0; aspect-ratio: 1; border-radius: 14px; overflow: hidden; background: var(--control); cursor: grab; touch-action: auto; user-select: none; -webkit-touch-callout: none; }
.photo-selection .photo-preview:active:not(:disabled) { transform: none; cursor: grabbing; }
.photo-selection.is-selecting .photo-preview { cursor: pointer; }
.photo-card.is-selected .photo-preview { box-shadow: 0 0 0 3px var(--accent); }
.photo-preview img { width: 100%; height: 100%; object-fit: cover; display: block; user-select: none; -webkit-user-drag: none; }
.photo-ordinal { position: absolute; left: 7px; bottom: 7px; display: grid; place-items: center; min-width: 24px; height: 24px; padding: 0 4px; box-sizing: border-box; border-radius: 8px; color: white; background: #17251bcc; font-size: 12px; font-weight: 600; pointer-events: none; }
.photo-selection-mark { position: absolute; top: 7px; right: 7px; display: grid; place-items: center; width: 24px; height: 24px; border: 2px solid white; border-radius: 50%; background: #17251b40; color: white; box-shadow: 0 1px 6px #17251b30; pointer-events: none; }
.is-selected .photo-selection-mark { background: var(--accent); }
.photo-add { min-width: 0; align-self: start; aspect-ratio: 1; }
.photo-add button { width: 100%; height: 100%; border: 0; border-radius: 14px; background: var(--accent-soft); color: var(--accent); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 10px 4px; font-weight: 600; }
.photo-add small { font-size: 13px; font-weight: 400; color: var(--muted); }
.selection-empty { text-align: center; display: flex; align-items: center; flex-direction: column; gap: 8px; padding: 12px 10px 22px; color: var(--accent); }
.selection-empty strong { color: var(--ink); font-size: 15px; }
.selection-empty p { margin: 0; font-size: 13px; line-height: 1.6; color: var(--muted); }
.selection-limit { margin: 12px 0 0; font-size: 13px; line-height: 1.5; color: var(--muted); }
.selection-footer { flex: 0 0 auto; padding: 14px 20px max(18px, env(safe-area-inset-bottom)); background: var(--surface-raised); box-shadow: 0 -6px 24px #20332906; }
.selection-count { margin: 0 0 10px; color: var(--muted); font-size: 13px; line-height: 1.5; }
.selection-remove { width: 100%; margin-bottom: 10px; min-height: 48px; padding: 10px 12px; border: 1px solid #a63e2d30; border-radius: var(--radius-control); background: #a63e2d0a; color: #a63e2d; font-weight: 600; }
.selection-actions { display: grid; grid-template-columns: minmax(70px, .32fr) 1fr; gap: 10px; }
.selection-actions button { min-height: 50px; padding: 12px 14px; border-radius: var(--radius-control); font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; border: 0; }
.selection-cancel { color: var(--ink); background: var(--control); }
.selection-confirm { background: var(--accent); color: white; }
.selection-progress { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 10px; color: var(--accent); font-size: 13px; line-height: 1.5; }
.selection-progress span { overflow-wrap: anywhere; }
.selection-spinner { flex-shrink: 0; animation: selection-spin 900ms linear infinite; }
.selection-error { margin: 0 0 10px; font-size: 13px; line-height: 1.5; color: #a63e2d; max-height: 90px; overflow-y: auto; overflow-wrap: anywhere; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.photo-sort-ghost { opacity: .3; }
.photo-sort-chosen { box-shadow: var(--shadow-float); }
.photo-list-move { transition: transform 160ms var(--ease-out); }
.photo-list-enter-active { transition: opacity 140ms, transform 140ms; }
.photo-list-enter-from { opacity: 0; transform: scale(.96); }
@keyframes selection-spin { to { transform: rotate(360deg); } }
@keyframes selection-sheet-in { from { opacity: 0; margin-top: 12px; } to { opacity: 1; margin-top: 0; } }
@media (max-width: 640px) {
  :global(.dialog-content:has(.photo-selection)) { top: auto; bottom: 0; left: 0; transform: none; width: 100%; max-height: 94dvh; border-radius: 28px 28px 0 0; }
  :global(.dialog-content:has(.photo-selection) .dialog-header) { padding: 18px 16px 14px; }
  .selection-scroll { padding: 0 16px 16px; }
  .selection-footer { padding-left: 16px; padding-right: 16px; }
  .photo-grid { gap: 9px; }
}
@media (max-width: 300px) { .photo-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) and (max-height: 640px) {
  :global(.dialog-content:has(.photo-selection)) { top: 0; max-height: 100dvh; height: 100dvh; border-radius: 0; padding-top: env(safe-area-inset-top); border: 0; }
}
@media (prefers-reduced-motion: reduce) {
  :global(.dialog-content:has(.photo-selection)) { animation: none; }
  .photo-selection button, .photo-list-move, .photo-list-enter-active { transition: none; }
  .photo-list-enter-from { transform: none; }
  .photo-selection button:active:not(:disabled) { transform: none; }
  .selection-spinner { animation: none; }
}
</style>
