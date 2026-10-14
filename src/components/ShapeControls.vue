<script setup lang="ts">
import { LocateFixed, LockOpen, Trash2 } from 'lucide-vue-next';
import type { ShapeElement } from '../types';
import type { PanelAction } from '../panel';
import ColorPicker from './ColorPicker.vue';
import PanelRange from './PanelRange.vue';

const props = defineProps<{ shape: ShapeElement; canvasWidth: number; canvasHeight: number; fillColor: string; palette?: readonly string[] }>();
const emit = defineEmits<{ action: [action: PanelAction] }>();
function patch(patch: Partial<ShapeElement>, commit = true) {
  if (!props.shape.locked) emit('action', { type: 'element', patch, commit });
}
const checkpoint = () => emit('action', { type: 'checkpoint' });
function toggleFill(event: Event) {
  patch({ fill: (event.target as HTMLInputElement).checked ? 'transparent' : props.fillColor });
}
</script>

<template>
  <section class="shape-controls" aria-label="编辑所选形状">
    <h3>编辑形状</h3>
    <template v-if="shape.locked">
      <p class="hint">形状已锁定。请先解锁，再改颜色、调整大小或删除。</p>
      <button type="button" @click="emit('action', { type: 'element', patch: { locked: false } })"><LockOpen :size="16" aria-hidden="true" />解锁形状</button>
    </template>
    <ColorPicker label="形状填充颜色" :value="shape.fill" :palette="palette" :disabled="shape.locked" alpha allow-transparent @input="value => patch({ fill: value }, false)" @commit="checkpoint" />
    <label class="check-field"><input type="checkbox" :checked="shape.fill === 'transparent'" :disabled="shape.locked" @change="toggleFill" />空心形状</label>
    <ColorPicker label="形状描边颜色" :value="shape.stroke || 'transparent'" :palette="palette" :disabled="shape.locked" alpha allow-transparent @input="value => patch({ stroke: value }, false)" @commit="checkpoint" />
    <PanelRange label="形状描边宽度" :value="shape.strokeWidth" :disabled="shape.locked" :min="0" :max="Math.max(100, shape.strokeWidth)" unit="px" @input="value => patch({ strokeWidth: value }, false)" @commit="checkpoint" />
    <p class="hint">描边需选择非透明颜色，并将宽度调至大于 0。</p>
    <PanelRange label="形状宽度" :value="shape.width" :disabled="shape.locked" :min="1" :max="Math.max(canvasWidth * 2, shape.width)" unit="px" @input="value => patch({ width: value }, false)" @commit="checkpoint" />
    <PanelRange label="形状高度" :value="shape.height" :disabled="shape.locked" :min="1" :max="Math.max(canvasHeight * 2, shape.height)" unit="px" @input="value => patch({ height: value }, false)" @commit="checkpoint" />
    <PanelRange label="形状不透明度" :value="Math.round(shape.opacity * 100)" :disabled="shape.locked" :min="0" :max="100" unit="%" @input="value => patch({ opacity: value / 100 }, false)" @commit="checkpoint" />
    <button type="button" :disabled="shape.locked" @click="patch({ x: (canvasWidth - shape.width) / 2, y: (canvasHeight - shape.height) / 2 })"><LocateFixed :size="16" aria-hidden="true" />居中找回 · 可撤销</button>
    <button type="button" class="danger" :disabled="shape.locked" @click="emit('action', { type: 'remove' })"><Trash2 :size="16" aria-hidden="true" />删除形状 · 可撤销</button>
  </section>
</template>

<style scoped>
.shape-controls { display: grid; gap: 16px; min-width: 0; }
h3 { margin: 0; font-size: 14px; font-weight: 650; line-height: 1.5; }
.hint { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.75; }
.check-field { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 12px; line-height: 1.5; cursor: pointer; }
.check-field input { width: 20px; height: 20px; flex: none; accent-color: var(--accent); }
button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 11px 13px; border: 0; border-radius: var(--radius-control); background: var(--control); color: var(--ink); font: inherit; font-size: 12px; line-height: 1.5; cursor: pointer; }
button:hover { background: var(--control-hover); }
button.danger { color: #a64540; background: #a645400b; }
button:disabled { opacity: .4; cursor: not-allowed; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
