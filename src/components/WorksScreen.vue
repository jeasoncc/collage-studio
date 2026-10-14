<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Check, FolderOpen, Plus } from 'lucide-vue-next';

const props = defineProps<{
  drafts: readonly { id: string; title: string; updatedAt: number; pageCount: number; url: string }[];
  disabled: boolean;
}>();
const emit = defineEmits<{
  start: [];
  import: [];
  open: [id: string];
  delete: [ids: string[]];
}>();

const selecting = ref(false);
const selectedIds = ref(new Set<string>());
const allSelected = computed(() => props.drafts.length > 0 && props.drafts.every(draft => selectedIds.value.has(draft.id)));

watch(() => props.drafts.map(draft => draft.id), ids => {
  const remaining = new Set(ids);
  for (const id of selectedIds.value) {
    if (!remaining.has(id)) selectedIds.value.delete(id);
  }
  if (!ids.length) selecting.value = false;
});

function toggleSelection() {
  if (props.disabled) return;
  selecting.value = !selecting.value;
  if (!selecting.value) selectedIds.value.clear();
}
function activateDraft(id: string) {
  if (props.disabled) return;
  if (!selecting.value) {
    emit('open', id);
    return;
  }
  if (selectedIds.value.has(id)) selectedIds.value.delete(id);
  else selectedIds.value.add(id);
}
function toggleAll() {
  if (props.disabled || !selecting.value) return;
  if (allSelected.value) selectedIds.value.clear();
  else selectedIds.value = new Set(props.drafts.map(draft => draft.id));
}
function requestDelete() {
  if (props.disabled || !selecting.value || !selectedIds.value.size) return;
  emit('delete', [...selectedIds.value]);
}
</script>

<template>
  <div class="works-screen">
    <header class="works-heading">
      <h1 id="works-title">作品</h1>
      <div class="works-heading-actions">
        <button v-if="drafts.length" type="button" class="works-button works-select" :disabled="disabled" :aria-pressed="selecting" @click="toggleSelection">{{ selecting ? '取消' : '选择' }}</button>
        <button v-if="!selecting" type="button" class="works-button works-import" :disabled="disabled" @click="emit('import')"><FolderOpen :size="18" aria-hidden="true" />导入项目</button>
      </div>
    </header>

    <div v-if="selecting" class="works-selection-bar" aria-label="作品选择操作">
      <p class="works-selection-status" role="status">{{ selectedIds.size ? `已选 ${selectedIds.size} 份` : '选择要删除的作品' }}</p>
      <div class="works-selection-actions">
        <button type="button" class="works-button works-select" :disabled="disabled" :aria-pressed="allSelected" @click="toggleAll">{{ allSelected ? '取消全选' : '全选' }}</button>
        <button type="button" class="works-button works-delete" :disabled="disabled || !selectedIds.size" aria-haspopup="dialog" @click="requestDelete">删除选中({{ selectedIds.size }})</button>
      </div>
    </div>

    <div v-if="!drafts.length" class="works-empty">
      <FolderOpen :size="40" aria-hidden="true" />
      <h2>还没有作品</h2>
      <p>从几张喜欢的照片开始。</p>
      <button type="button" class="works-button works-start" :disabled="disabled" @click="emit('start')"><Plus :size="18" aria-hidden="true" />开始拼图</button>
    </div>
    <ul v-else class="works-grid" aria-labelledby="works-title">
      <li v-for="draft in drafts" :key="draft.id" class="works-grid-item">
        <button type="button" class="works-card" :class="{ 'is-selected': selecting && selectedIds.has(draft.id) }" :disabled="disabled" :aria-label="`${selecting ? '选择' : '打开'}作品：${draft.title}`" :aria-pressed="selecting ? selectedIds.has(draft.id) : undefined" @click="activateDraft(draft.id)">
          <span class="works-thumbnail">
            <img :src="draft.url" alt="" loading="lazy" decoding="async" />
            <span v-if="selecting" class="works-selection-marker" aria-hidden="true"><Check v-if="selectedIds.has(draft.id)" :size="17" :stroke-width="3" /></span>
          </span>
          <span class="works-card-detail"><strong>{{ draft.title }}</strong><small>{{ draft.pageCount > 1 ? `${draft.pageCount} 张 · ` : '' }}{{ new Date(draft.updatedAt).toLocaleDateString('zh-CN') }}</small></span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.works-screen { --works-danger: #a64d42; --works-danger-hover: #913f35; --works-on-accent: #fff; width: 100%; min-width: 0; color: var(--ink); }
.works-screen *, .works-screen *::before, .works-screen *::after { box-sizing: border-box; }
.works-screen button { min-width: 44px; min-height: 44px; font: inherit; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.works-screen button:disabled { cursor: not-allowed; opacity: .45; }
.works-screen button:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.works-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 8px 0 24px; }
.works-heading h1 { min-width: 0; margin: 0; font-size: clamp(26px, 3vw, 30px); font-weight: 700; letter-spacing: -.035em; line-height: 1.35; }
.works-heading-actions, .works-selection-actions { display: flex; align-items: center; gap: 8px; }
.works-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 16px; border: 0; border-radius: var(--radius-control); font-weight: 600 !important; line-height: 1.4; white-space: nowrap; }
.works-select { background: transparent; color: var(--accent); }
.works-import { background: var(--control); color: var(--ink); }
.works-selection-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; margin: -8px 0 18px; padding: 8px 0; }
.works-selection-status { min-width: 0; margin: 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
.works-selection-actions { margin-left: auto; }
.works-delete { background: var(--works-danger); color: var(--works-on-accent); }
.works-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin: 0; padding: 0; list-style: none; }
.works-grid-item { min-width: 0; }
.works-card { display: block; width: 100%; height: 100%; padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-card); background: var(--surface); box-shadow: var(--shadow-card); color: var(--ink); text-align: left; }
.works-card.is-selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
.works-thumbnail { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 1; padding: 14px; background: var(--accent-soft); }
.works-thumbnail img { display: block; width: 100%; height: 100%; object-fit: contain; border-radius: 10px; }
.works-selection-marker { position: absolute; top: 12px; right: 12px; display: grid; place-items: center; width: 26px; height: 26px; border: 2px solid var(--muted); border-radius: 50%; background: var(--surface); color: var(--works-on-accent); }
.is-selected .works-selection-marker { border-color: var(--accent); background: var(--accent); }
.works-card-detail { display: block; min-width: 0; padding: 14px 16px; }
.works-card-detail strong { display: block; overflow: hidden; font-size: 15px; font-weight: 650; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.works-card-detail small { display: block; margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.5; }
.works-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 310px; padding: 40px 16px; text-align: center; }
.works-empty > svg { margin-bottom: 16px; color: var(--accent); }
.works-empty h2 { margin: 0 0 10px; font-size: 20px; line-height: 1.4; }
.works-empty p { margin: 0 0 24px; color: var(--muted); line-height: 1.7; }
.works-start { background: var(--accent); color: var(--works-on-accent); }
@media (hover: hover) {
  .works-select:hover:not(:disabled) { background: var(--accent-soft); }
  .works-import:hover:not(:disabled) { background: var(--control-hover); }
  .works-delete:hover:not(:disabled) { background: var(--works-danger-hover); }
  .works-start:hover:not(:disabled) { background: var(--accent-hover); }
  .works-card:hover:not(:disabled) { border-color: var(--accent); }
}
@media (max-width: 700px) {
  .works-heading { gap: 8px; margin-bottom: 20px; }
  .works-heading-actions, .works-selection-actions { gap: 4px; }
  .works-button { gap: 6px; padding-inline: 12px; }
  .works-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .works-thumbnail { padding: 10px; }
  .works-card-detail { padding: 12px; }
  .works-card-detail strong { font-size: 14px; }
  .works-card-detail small { font-size: 11px; }
  .works-selection-marker { top: 9px; right: 9px; }
}
@media (max-width: 359px) {
  .works-heading-actions { gap: 0; }
  .works-heading-actions .works-button { padding-inline: 8px; }
  .works-grid { gap: 10px; }
  .works-card-detail { padding: 10px; }
}
</style>
