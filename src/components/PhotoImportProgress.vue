<script setup lang="ts">
import { computed } from 'vue';
import type { PhotoImportItem } from './photoSelection';

const props = defineProps<{ item: PhotoImportItem }>();
const percent = computed(() => props.item.stage === 'complete' ? 100 : Math.min(99, Math.max(0, Math.floor(props.item.progress * 100))));
const stageLabels: Record<PhotoImportItem['stage'], string> = {
  queued: '等待导入', reading: '读取中', processing: '处理中', complete: '导入完成', error: '导入失败',
};
</script>

<template>
  <div class="photo-import-progress" :class="{ 'has-error': item.stage === 'error' }" data-file-progress :data-file-index="item.index" :data-file-name="item.name" :data-file-state="item.stage" :data-file-percent="percent">
    <div class="import-progress-label"><span>{{ stageLabels[item.stage] }}</span><strong>{{ percent }}%</strong></div>
    <progress :value="percent" max="100" :aria-label="`第 ${item.index + 1} 个文件 ${item.name} 的导入进度`" :aria-valuetext="`${percent}% · ${item.message}`" />
    <p v-if="item.stage === 'error'" class="import-progress-error">{{ item.message }}</p>
  </div>
</template>

<style scoped>
.photo-import-progress { min-width: 0; padding: 10px; color: var(--accent); }
.import-progress-label { display: flex; align-items: center; justify-content: space-between; gap: 4px; font-size: 11px; line-height: 1.5; }
.import-progress-label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.import-progress-label strong { flex: 0 0 auto; font-size: 12px; font-variant-numeric: tabular-nums; }
progress { display: block; width: 100%; height: 5px; margin-top: 7px; appearance: none; border: 0; border-radius: 99px; background: var(--control-hover); accent-color: var(--accent); overflow: hidden; }
progress::-webkit-progress-bar { border-radius: 99px; background: var(--control-hover); }
progress::-webkit-progress-value { border-radius: 99px; background: var(--accent); }
progress::-moz-progress-bar { border-radius: 99px; background: var(--accent); }
.has-error { color: #ac3c4a; }
.has-error progress::-webkit-progress-value { background: #ac3c4a; }
.has-error progress::-moz-progress-bar { background: #ac3c4a; }
.import-progress-error { margin: 7px 0 0; font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
</style>
