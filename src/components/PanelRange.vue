<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui';
import AppNumber from './AppNumber.vue';

const props = withDefaults(defineProps<{ label: string; value: number; min: number; max: number; step?: number; unit?: string; disabled?: boolean }>(), { step: 1, unit: '', disabled: false });
const emit = defineEmits<{ input: [value: number]; commit: [] }>();
const lower = computed(() => Math.min(props.min, props.max));
const upper = computed(() => Math.max(props.min, props.max));
const increment = computed(() => Number.isFinite(props.step) && props.step !== 0 ? Math.abs(props.step) : 1);
const sliderDisabled = computed(() => props.disabled || upper.value === lower.value);
// Reka computes thumb percentages from the span even when disabled. Give a
// fixed-value slider a harmless display span, while keeping its real ARIA bounds.
const sliderMax = computed(() => upper.value > lower.value ? upper.value : lower.value + 1);
const currentValue = ref(props.value);
const sliderKey = ref(0);
const sliderValue = computed(() => [Math.max(lower.value, Math.min(upper.value, currentValue.value))]);
const stepKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
let dirty = false;
let pointerId: number | undefined;
let keyboardKey: string | undefined;

watch(() => props.value, value => { currentValue.value = value; }, { flush: 'sync' });

function update(values: number[] | undefined) {
  const value = values?.[0];
  if (sliderDisabled.value || value === undefined || !Number.isFinite(value)) return;
  const bounded = Math.max(lower.value, Math.min(upper.value, value));
  if (bounded === currentValue.value) return;
  currentValue.value = bounded;
  dirty = true;
  emit('input', bounded);
}

function finish() {
  if (!dirty) return;
  dirty = false;
  emit('commit');
}

function startPointer(event: PointerEvent) {
  if (sliderDisabled.value || event.button !== 0) {
    event.stopPropagation();
    return;
  }
  pointerId = event.pointerId;
}

function endPointer(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  void nextTick(() => {
    if (event.pointerId !== pointerId) return;
    pointerId = undefined;
    finish();
  });
}

function cancelPointer(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  endPointer(event);
  // A cancelled Reka drag has no slide-end event to clear its cached geometry.
  sliderKey.value += 1;
}

function startKey(event: KeyboardEvent) {
  if (!sliderDisabled.value && stepKeys.has(event.key)) keyboardKey = event.key;
}

function endKey(event: KeyboardEvent) {
  if (event.key !== keyboardKey) return;
  keyboardKey = undefined;
  void nextTick(finish);
}

function rekaCommit() {
  // Reka commits each repeated keydown before emitting its new model value.
  // Group a held key just like a drag, and let update run before any fallback.
  void nextTick(() => {
    if (pointerId === undefined && keyboardKey === undefined) finish();
  });
}

function interrupt() {
  if (pointerId !== undefined) sliderKey.value += 1;
  pointerId = undefined;
  keyboardKey = undefined;
  finish();
}

onMounted(() => { window.addEventListener('blur', interrupt); });
onBeforeUnmount(() => {
  window.removeEventListener('blur', interrupt);
  interrupt();
});
</script>

<template>
  <div class="range-control" :class="{ disabled }">
    <AppNumber :label="label" :value="value" :min="min" :max="max" :step="step" :unit="unit" :disabled="disabled" @input="emit('input', $event)" @commit="emit('commit')" />
    <SliderRoot
      :key="sliderKey"
      class="range-slider"
      :model-value="sliderValue"
      :min="lower"
      :max="sliderMax"
      :step="increment"
      :disabled="sliderDisabled"
      dir="ltr"
      @update:model-value="update"
      @value-commit="rekaCommit"
      @pointerdown.capture="startPointer"
      @pointerup="endPointer"
      @pointercancel="cancelPointer"
      @lostpointercapture="endPointer"
      @keydown.capture="startKey"
      @keyup="endKey"
      @focusout="interrupt"
    >
      <SliderTrack class="range-track">
        <SliderRange class="range-fill" />
      </SliderTrack>
      <SliderThumb class="range-thumb" :aria-label="label" :aria-valuemin="lower" :aria-valuemax="upper" :aria-valuetext="`${currentValue}${unit}`">
        <span class="range-handle" aria-hidden="true" />
      </SliderThumb>
    </SliderRoot>
  </div>
</template>

<style scoped>
.range-control { min-width: 0; max-width: 100%; display: grid; gap: 2px; }
.range-slider { position: relative; display: flex; align-items: center; width: 100%; min-width: 0; height: 44px; cursor: pointer; touch-action: pan-y; user-select: none; }
.range-track { position: relative; flex: 1; height: 6px; margin-inline: 22px; overflow: hidden; border-radius: 99px; background: var(--control-hover); }
.range-fill { position: absolute; height: 100%; border-radius: inherit; background: var(--accent); }
.range-thumb { top: 0; display: inline-grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: transparent; touch-action: pan-y; cursor: grab; }
.range-handle { display: block; width: 24px; height: 24px; box-sizing: border-box; border: 5px solid var(--surface); border-radius: 50%; background: var(--accent); box-shadow: 0 2px 8px #20332924; transition: box-shadow .18s var(--ease-out), transform .18s var(--ease-out); pointer-events: none; }
.range-thumb:active:not([data-disabled]) { cursor: grabbing; }
.range-thumb:active:not([data-disabled]) .range-handle { transform: scale(1.12); box-shadow: 0 0 0 6px #284b3d12, 0 2px 8px #20332924; }
.range-thumb:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; }
.range-slider[data-disabled] { cursor: not-allowed; }
.range-thumb[data-disabled] { cursor: not-allowed; }
.range-control.disabled { opacity: .45; }
@media (forced-colors: active) {
  .range-track { background: GrayText; }
  .range-fill, .range-handle { background: Highlight; }
  .range-handle { border-color: Canvas; }
}
</style>
