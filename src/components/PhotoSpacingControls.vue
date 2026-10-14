<script setup lang="ts">
import { computed } from 'vue';
import { RectangleHorizontal, Scan, SquareRoundCorner } from 'lucide-vue-next';
import type { EditorDocument, MediaAsset, PhotoFrameSpec } from '../types';
import type { PanelAction } from '../panel';
import PanelRange from './PanelRange.vue';
import ColorPicker from './ColorPicker.vue';
import { slotRect } from '../defaults';

const props = defineProps<{ document: EditorDocument; assets: Record<string, MediaAsset> }>();
const emit = defineEmits<{ action: [action: PanelAction] }>();
const shortSide = computed(() => Math.min(props.document.width, props.document.height));
const freeCells = computed(() => props.document.elements.flatMap(element => element.type === 'image' && !element.locked && props.assets[element.assetId]?.kind !== 'sticker' ? [{ width: element.width + props.document.gap, height: element.height + props.document.gap }] : []));
const maxGap = computed(() => {
  const doc = props.document;
  if (doc.layoutId.startsWith('long-')) return Math.round(shortSide.value / 6);
  const cells = doc.mode === 'grid' ? doc.slots.map(slot => slotRect({ ...doc, gap: 0 }, slot)) : freeCells.value;
  return Math.max(0, Math.floor(Math.min(shortSide.value / 6, ...cells.map(cell => Math.min(cell.width, cell.height) - 2))));
});
const maxPadding = computed(() => {
  const doc = props.document;
  if (doc.mode !== 'free' || !freeCells.value.length) return Math.floor(shortSide.value / 3);
  // Do not collapse a photo when the fixed pixel gap exceeds its shrinking cell.
  const width = Math.min(...freeCells.value.map(cell => cell.width));
  const height = Math.min(...freeCells.value.map(cell => cell.height));
  return Math.max(0, Math.floor(Math.min(shortSide.value / 3,
    (doc.width - (doc.width - doc.padding * 2) * (doc.gap + 2) / width) / 2,
    (doc.height - (doc.height - doc.padding * 2) * (doc.gap + 2) / height) / 2)));
});
const rounded = computed(() => Math.round(Math.min(64, shortSide.value * .035)));
const maxRadius = computed(() => Math.round(Math.min(240, shortSide.value / 4)));
const hasLocked = computed(() => props.document.mode === 'free' && props.document.elements.some(element => element.locked));
const frameEnabled = computed(() => props.document.photoFrame.kind !== 'none');
const inset = computed(() => frameEnabled.value ? props.document.photoFrame.insetRatio * 100 : 0);
function patch(patch: Partial<EditorDocument>, commit = false) { emit('action', { type: 'document', patch, commit }); }
function checkpoint() { emit('action', { type: 'checkpoint' }); }
function frame(change: Partial<PhotoFrameSpec>, commit = false) { patch({ photoFrame: { ...props.document.photoFrame, ...change } }, commit); }
function setInset(value: number) {
  frame({ insetRatio: value / 100, ...(props.document.photoFrame.kind === 'none' && value > 0 ? { kind: 'paper' as const } : {}) });
}
</script>

<template>
  <section class="photo-spacing-controls" aria-label="留白、间距与圆角">
    <div class="spacing-section">
      <div class="spacing-label"><Scan :size="17" aria-hidden="true" /><strong>照片与画布</strong></div>
      <PanelRange label="照片间距" :value="document.gap" :min="0" :max="maxGap" unit="px" @input="value => patch({ gap: value })" @commit="checkpoint" />
      <PanelRange label="画布留白" :value="document.padding" :min="0" :max="maxPadding" unit="px" @input="value => patch({ padding: value })" @commit="checkpoint" />
      <p class="spacing-help">间距改变照片之间的空隙；留白改变整幅画面的外缘。{{ document.mode === 'free' ? '调整时保留照片中心与主次关系。' : document.layoutId.startsWith('long-') ? '高度随照片比例和间距调整。' : '' }}</p>
    </div>
    <div class="spacing-section">
      <div class="spacing-label"><RectangleHorizontal :size="17" aria-hidden="true" /><strong>相框内衬</strong><div class="frame-shortcuts" aria-label="相框内衬样式"><button type="button" :aria-pressed="!frameEnabled" @click="frame({ kind: 'none', insetRatio: 0, footerRatio: 0, shadowRatio: 0 }, true)">无内衬</button><button type="button" :aria-pressed="frameEnabled" @click="frame({ kind: 'paper', insetRatio: document.photoFrame.insetRatio || .03, footerRatio: 0 }, true)">相纸</button></div></div>
      <PanelRange label="内衬厚度" :value="inset" :min="0" :max="12" :step=".5" unit="%" @input="setInset" @commit="checkpoint" />
      <ColorPicker v-if="frameEnabled" label="内衬颜色" :value="document.photoFrame.color" @input="value => frame({ color: value })" @commit="checkpoint" />
      <p class="spacing-help">内衬是相纸内部的留白，不是照片间距。相纸按原照片比例装裱，可完整显示合照。</p>
    </div>
    <div class="spacing-section">
      <div class="spacing-label"><SquareRoundCorner :size="17" aria-hidden="true" /><strong>照片圆角</strong><div class="frame-shortcuts" aria-label="圆角快捷选择"><button type="button" :aria-pressed="document.cornerRadius === 0" @click="patch({ cornerRadius: 0 }, true)">直角</button><button type="button" :aria-pressed="document.cornerRadius > 0" @click="patch({ cornerRadius: rounded }, true)">圆角</button></div></div>
      <PanelRange label="圆角大小" :value="document.cornerRadius" :min="0" :max="maxRadius" unit="px" @input="value => patch({ cornerRadius: value })" @commit="checkpoint" />
      <p class="spacing-help">应用到全部照片；仍可在照片微调中单独设置。{{ hasLocked ? '已锁定对象保持不变。' : '' }}</p>
    </div>
  </section>
</template>

<style scoped>
.photo-spacing-controls { display: grid; gap: 14px; min-width: 0; padding: 3px 0 12px; }
.spacing-section { display: grid; gap: 3px; padding-bottom: 13px; border-bottom: 1px solid var(--line); }
.spacing-section:last-child { padding-bottom: 0; border-bottom: 0; }
.spacing-label { display: flex; align-items: center; gap: 7px; min-height: 44px; color: var(--ink); font-size: 13px; }
.spacing-label > svg { display: block; color: var(--accent); }
.spacing-label strong { font-weight: 600; white-space: nowrap; }
.frame-shortcuts { display: flex; gap: 2px; margin-left: auto; padding: 2px; border: 1px solid var(--line); border-radius: 12px; background: var(--control); }
.frame-shortcuts button { min-width: 52px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 0 9px; border: 0; border-radius: 9px; background: transparent; font-size: 12px; }
.frame-shortcuts button[aria-pressed="true"] { color: var(--accent); background: var(--surface); font-weight: 600; box-shadow: 0 1px 4px #2033290c; }
.spacing-help { margin: 4px 0 0; color: var(--muted); font-size: 11px; line-height: 1.7; }
</style>
