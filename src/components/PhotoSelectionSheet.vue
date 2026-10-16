<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Check, ChevronLeft, ChevronRight, ImagePlus, Images, LoaderCircle } from 'lucide-vue-next';
import AppDialog from './AppDialog.vue';
import PhotoImportProgress from './PhotoImportProgress.vue';
import { MAX_COLLAGE_PHOTOS } from '../catalog/layouts';
import type { PhotoImportItem, PhotoSelectionItem } from './photoSelection';

const props = withDefaults(defineProps<{
  open: boolean;
  items: readonly PhotoSelectionItem[];
  imports?: readonly PhotoImportItem[];
  intent: 'create' | 'manage';
  ratio: string;
  processing: boolean;
  processingMessage: string;
  error?: string;
  maxPhotos?: number;
  requiredCount?: number;
  lockConfiguration?: boolean;
}>(), { imports: () => [], error: '', maxPhotos: MAX_COLLAGE_PHOTOS, requiredCount: 1, lockConfiguration: false });

const emit = defineEmits<{
  'update:open': [value: boolean];
  ratio: [value: string];
  add: [];
  remove: [ids: string[]];
  confirm: [];
  preview: [open: boolean];
}>();

const ratios = [
  { value: '1080x1080', label: '1:1', name: '方形' },
  { value: '1080x1350', label: '4:5', name: '竖版' },
  { value: '1080x1440', label: '3:4', name: '竖版' },
  { value: '1440x960', label: '3:2', name: '横版' },
  { value: '1080x1920', label: '9:16', name: '全屏' },
];
const minimum = computed(() => Math.max(props.intent === 'manage' ? 0 : 1, props.requiredCount));
const canConfirm = computed(() => !props.processing && props.items.length >= minimum.value && props.items.length <= props.maxPhotos);
const canAdd = computed(() => !props.processing && props.items.length < props.maxPhotos);
const countHint = computed(() => {
  if (props.items.length > props.maxPhotos) return `已选 ${props.items.length} 张，超出 ${props.items.length - props.maxPhotos} 张 · 请移除后继续`;
  if (props.items.length < minimum.value) return `还需添加 ${minimum.value - props.items.length} 张照片`;
  return `已选 ${props.items.length} 张 · 最多 ${props.maxPhotos} 张`;
});
const importProgress = computed(() => new Map(props.imports.flatMap(item => item.assetId && item.stage !== 'complete' ? [[item.assetId, item] as const] : [])));
const pendingImports = computed(() => props.imports.filter(item => !item.assetId));
const announcement = ref('');
const selecting = ref(false);
const selected = ref(new Set<string>());
const selectedIds = computed(() => props.items.filter(item => selected.value.has(item.id)).map(item => item.id));
const allSelected = computed(() => props.items.length > 0 && selectedIds.value.length === props.items.length);
const previewId = ref<string | null>(null);
const previewIndex = computed(() => props.items.findIndex(item => item.id === previewId.value));
const previewItem = computed(() => previewIndex.value < 0 ? null : props.items[previewIndex.value]!);
const previewOpen = computed(() => props.open && previewItem.value !== null);
const previewName = computed(() => previewItem.value?.asset.name || `照片 ${previewIndex.value + 1}`);

function closePreview(): boolean {
  const wasOpen = previewOpen.value;
  const id = previewId.value;
  previewId.value = null;
  if (wasOpen) {
    void nextTick(() => {
      if (!props.open || previewOpen.value || !listElement.value) return;
      const card = Array.from(listElement.value.children)
        .find(child => child instanceof HTMLElement && child.dataset.photoId === id);
      card?.querySelector<HTMLButtonElement>('.photo-preview')?.focus({ preventScroll: true });
    });
  }
  return wasOpen;
}

function navigatePreview(direction: -1 | 1) {
  const next = props.items[previewIndex.value + direction];
  if (next) previewId.value = next.id;
}

function openPreview(id: string) {
  if (!props.items.some(item => item.id === id)) return;
  resetSelection(); previewId.value = id;
}
defineExpose({ closePreview, openPreview, getPreviewId: () => previewId.value });
watch(previewOpen, open => emit('preview', open), { flush: 'sync' });
const listElement = ref<HTMLOListElement | null>(null);

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
  if (props.processing) return;
  if (!selecting.value) {
    previewId.value = id;
    return;
  }
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

watch(() => props.items.map(item => item.id), (ids, previousIds) => {
  const remaining = new Set(ids);
  selected.value = new Set([...selected.value].filter(id => remaining.has(id)));
  if (previewId.value !== null && !remaining.has(previewId.value)) {
    const previousIndex = previousIds.indexOf(previewId.value);
    previewId.value = ids[Math.min(Math.max(0, previousIndex), ids.length - 1)] ?? null;
  }
  if (ids.length === 0) resetSelection();
});
watch(() => props.open, () => {
  resetSelection();
  closePreview();
  announcement.value = '';
});
onBeforeUnmount(() => {
  if (previewOpen.value) emit('preview', false);
});
</script>

<template>
  <AppDialog
    :open="open"
    :title="intent === 'create' ? '新建拼图' : '整理照片'"
    :description="intent === 'create' ? '添加照片，准备好后进入画布；比例与排版都能调整。' : '增减照片，点击完成后才会应用。'"
    :locked="processing"
    @update:open="value => !processing && (closePreview() || emit('update:open', value))"
  >
    <section class="photo-selection" :class="{ 'is-selecting': selecting }" :aria-busy="processing">
      <div class="selection-scroll">
        <div v-if="intent === 'create' && !lockConfiguration" class="selection-configuration">
          <h3 class="configuration-heading">画布比例</h3>
          <div class="ratio-control" role="group" aria-label="画布比例">
            <button
              v-for="option in ratios" :key="option.value" type="button"
              :aria-label="`${option.name} ${option.label}`" :aria-pressed="ratio === option.value"
              :disabled="processing" @click="emit('ratio', option.value)"
            ><span class="ratio-icon" :style="{ aspectRatio: option.value.replace('x', ' / ') }" aria-hidden="true" /><span>{{ option.label }}</span></button>
          </div>
        </div>
        <div class="photos-heading">
          <h3>照片 <span>{{ items.length }}/{{ maxPhotos }}</span></h3>
          <button class="selection-toggle" type="button" :disabled="processing || items.length === 0" :aria-pressed="selecting" @click="toggleSelection">
            {{ selecting ? '取消选择' : '选择' }}
          </button>
          <p id="photo-selection-hint">{{ selecting ? '点选整张照片，在底部统一移除。' : '照片按选择顺序排列；点击照片预览，点击「选择」可批量移除。' }}</p>
        </div>
        <div v-if="selecting" class="selection-toolbar">
          <span role="status" aria-live="polite">已选择 {{ selectedIds.length }} 张</span>
          <button type="button" :disabled="processing" :aria-pressed="allSelected" @click="selectAll">{{ allSelected ? '取消全选' : '全选' }}</button>
        </div>
        <div v-if="items.length === 0 && pendingImports.length === 0" class="selection-empty">
          <Images :size="32" aria-hidden="true" />
          <strong>先选几张喜欢的照片</strong>
          <p>照片按选择顺序排列，可继续添加。</p>
        </div>
        <ol ref="listElement" class="photo-grid">
          <li v-for="(item, index) in items" :key="`photo:${item.id}`" class="photo-card" :class="{ 'is-selected': selected.has(item.id) }" :data-photo-id="item.id">
            <button
              class="photo-preview" type="button" :disabled="processing"
              :aria-label="selecting ? `${selected.has(item.id) ? '取消选择' : '选择'}第 ${index + 1} 张照片` : `预览第 ${index + 1} 张${item.asset.kind === 'video' ? '视频' : '照片'}：${item.asset.name || '未命名'}`"
              :aria-pressed="selecting ? selected.has(item.id) : undefined"
              :aria-describedby="selecting ? undefined : 'photo-selection-hint'"
              @click="activatePhoto(item.id)"
            >
              <img :src="item.asset.thumbnail || item.asset.src" :alt="item.asset.name || `照片 ${index + 1}`" draggable="false" />
              <span class="photo-ordinal" aria-hidden="true">{{ index + 1 }}</span>
              <span v-if="selecting" class="photo-selection-mark" aria-hidden="true">
                <Check v-if="selected.has(item.id)" :size="17" />
              </span>
            </button>
            <PhotoImportProgress v-if="importProgress.has(item.asset.id)" :item="importProgress.get(item.asset.id)!" />
          </li>
          <li v-for="item in pendingImports" :key="`import:${item.index}`" class="photo-import-card" :class="{ 'has-error': item.stage === 'error' }">
            <div class="photo-import-placeholder"><Images :size="28" aria-hidden="true" /><span :title="item.name">{{ item.name }}</span></div>
            <PhotoImportProgress :item="item" />
          </li>
          <li key="photo-add" class="photo-add">
            <button type="button" :disabled="!canAdd" @click="emit('add')">
              <ImagePlus :size="27" aria-hidden="true" />
              <span>{{ items.length >= maxPhotos ? '已达上限' : '添加照片' }}</span>
              <small v-if="items.length === 0">最多 {{ maxPhotos }} 张</small>
            </button>
          </li>
        </ol>
        <p v-if="items.length > maxPhotos" class="selection-limit" role="alert">超出 {{ items.length - maxPhotos }} 张，请先移除多余照片；全部照片仍可预览和整理。</p>
        <p v-else-if="items.length === maxPhotos" class="selection-limit">照片已满，可先移除一张再添加。</p>
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
            {{ processing ? '正在处理…' : intent === 'create' ? '进入画布' : '完成整理' }}
          </button>
        </div>
      </footer>
    </section>
    <AppDialog
      :open="previewOpen" :title="`预览 ${previewIndex + 1} / ${items.length}`"
      :description="previewName" @update:open="value => !value && closePreview()"
    >
      <section v-if="previewOpen && previewItem" class="photo-inspector" aria-label="照片预览">
        <div class="inspector-media">
          <video
            v-if="previewItem.asset.kind === 'video'" :key="`${previewItem.id}:${previewItem.asset.src}`"
            :src="previewItem.asset.src" :poster="previewItem.asset.thumbnail || undefined"
            :aria-label="previewName" controls playsinline preload="metadata"
          />
          <img v-else :key="`${previewItem.id}:${previewItem.asset.src}`" :src="previewItem.asset.src" :alt="previewName" />
        </div>
        <p class="inspector-position" role="status" aria-live="polite">{{ previewIndex + 1 }} / {{ items.length }} · {{ previewName }}</p>
        <nav class="inspector-actions" aria-label="预览导航">
          <button type="button" :disabled="previewIndex <= 0" @click="navigatePreview(-1)">
            <ChevronLeft :size="20" aria-hidden="true" /><span>上一张</span>
          </button>
          <button type="button" @click="closePreview">返回照片</button>
          <button type="button" :disabled="previewIndex >= items.length - 1" @click="navigatePreview(1)">
            <span>下一张</span><ChevronRight :size="20" aria-hidden="true" />
          </button>
        </nav>
      </section>
    </AppDialog>
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
.configuration-heading { margin: 0 0 10px; font-size: 15px; font-weight: 650; }
.ratio-control { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
.ratio-control button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 68px; padding: 10px 3px; border: 0; border-radius: var(--radius-control); color: var(--muted); background: var(--control); }
.ratio-control button[aria-pressed=true] { color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); font-weight: 600; }
.ratio-icon { height: 22px; flex: 0 0 auto; border: 1.5px solid currentColor; border-radius: 4px; }
.photos-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 8px; margin-bottom: 12px; }
.photos-heading, .selection-toolbar { position: relative; z-index: 1; background: var(--surface); }
.photos-heading h3 { margin: 0; font-size: 15px; font-weight: 650; display: flex; align-items: center; gap: 9px; }
.photos-heading h3 span { color: var(--muted); font-size: 13px; font-weight: 400; }
.photos-heading p { grid-column: 1 / -1; font-size: 13px; line-height: 1.5; color: var(--muted); margin: 2px 0 0; }
.selection-toggle, .selection-toolbar button { padding: 9px 12px; border: 0; border-radius: var(--radius-control); color: var(--accent); background: var(--accent-soft); font-weight: 600; white-space: nowrap; }
.selection-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: -2px 0 12px; color: var(--muted); font-size: 13px; }
.photo-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; list-style: none; padding: 0; margin: 0; }
.photo-card { min-width: 0; border: 0; border-radius: 14px; background: var(--control); }
.photo-import-card { min-width: 0; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); overflow: hidden; }
.photo-import-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; aspect-ratio: 1; padding: 10px; color: var(--accent); background: var(--accent-soft); }
.photo-import-placeholder span { max-width: 100%; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.photo-import-card.has-error { border-color: #ac3c4a40; }
.photo-selection .photo-preview { display: block; position: relative; width: 100%; padding: 0; border: 0; aspect-ratio: 1; border-radius: 14px; overflow: hidden; background: var(--control); cursor: pointer; }
.photo-selection .photo-preview:active:not(:disabled) { transform: none; }
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
:global(.dialog-content:has(.photo-inspector)) { width: min(94vw, 1000px); max-height: 94dvh; overflow-y: auto; }
:global(.dialog-content:has(.photo-inspector) .dialog-description) { overflow-wrap: anywhere; }
.photo-inspector { min-width: 0; color: var(--ink); }
.inspector-media { display: grid; place-items: center; min-height: 160px; height: min(60dvh, 680px); border-radius: 16px; overflow: hidden; background: #111; }
.inspector-media img, .inspector-media video { display: block; max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; }
.inspector-position { margin: 12px 0; font-size: 13px; line-height: 1.5; color: var(--muted); overflow-wrap: anywhere; }
.inspector-actions { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; }
.inspector-actions button { display: flex; align-items: center; justify-content: center; gap: 3px; min-height: 44px; padding: 8px; border: 0; border-radius: var(--radius-control); background: var(--control); color: var(--ink); font: inherit; font-size: 13px; cursor: pointer; }
.inspector-actions button:disabled { opacity: .45; cursor: not-allowed; }
.inspector-actions button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
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
  .photo-selection button { transition: none; }
  .photo-selection button:active:not(:disabled) { transform: none; }
  .selection-spinner { animation: none; }
}
</style>
