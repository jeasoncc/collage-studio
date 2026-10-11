<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { NumberFieldDecrement, NumberFieldIncrement, NumberFieldInput, NumberFieldRoot } from 'reka-ui';

const props = withDefaults(defineProps<{ label: string; value: number; min: number; max: number; step?: number; unit?: string; disabled?: boolean }>(), { step: 1, unit: '', disabled: false });
const emit = defineEmits<{ input: [value: number]; commit: [] }>();
const id = useId();
const lower = computed(() => Math.min(props.min, props.max));
const upper = computed(() => Math.max(props.min, props.max));
const increment = computed(() => Number.isFinite(props.step) && props.step !== 0 ? Math.abs(props.step) : 1);
// Some mobile numeric keyboards have no minus key; negative ranges need text entry.
const inputMode = computed(() => lower.value < 0 ? 'text' : Number.isInteger(increment.value) && Number.isInteger(props.value) ? 'numeric' : 'decimal');
const formatOptions: Intl.NumberFormatOptions = { useGrouping: false, maximumFractionDigits: 20 };
const acceptedValue = ref(props.value);
const fieldValue = ref<number | undefined>(props.value);
const stepKeys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
let dirty = false;
let pointerId: number | undefined;
const composing = ref(false);

watch(() => props.value, value => {
  acceptedValue.value = value;
  fieldValue.value = value;
}, { flush: 'sync' });

function update(value: number | undefined) {
  if (props.disabled) return;
  if (value === undefined || !Number.isFinite(value)) {
    // Reka represents an empty/unfinished number as undefined. Restore the last
    // accepted value locally, without ever putting that empty state in the project.
    fieldValue.value = undefined;
    void nextTick(() => {
      if (fieldValue.value === undefined) fieldValue.value = acceptedValue.value;
    });
    return;
  }
  const bounded = Math.max(lower.value, Math.min(upper.value, value));
  fieldValue.value = bounded;
  if (bounded === acceptedValue.value) return;
  acceptedValue.value = bounded;
  dirty = true;
  emit('input', bounded);
}

function finish() {
  if (!dirty) return;
  dirty = false;
  emit('commit');
}

function finishInput() {
  // Reka applies the draft on blur/Enter before this tick. Waiting also lets a
  // touch button's window pointerup handler apply its final tap before committing.
  void nextTick(() => { if (pointerId === undefined) finish(); });
}

function startPress(event: PointerEvent) {
  if (props.disabled || event.button !== 0) return;
  pointerId = event.pointerId;
}

function endPress(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  void nextTick(() => {
    if (event.pointerId !== pointerId) return;
    pointerId = undefined;
    finish();
  });
}

function interrupt() {
  pointerId = undefined;
  finish();
}

function keydown(event: KeyboardEvent) {
  if (composing.value || event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    finishInput();
  }
}

function keyup(event: KeyboardEvent) {
  if (stepKeys.has(event.key)) finishInput();
}

function activateStep(event: MouseEvent, key: 'ArrowUp' | 'ArrowDown') {
  // Reka's held buttons handle pointer events, not keyboard/assistive clicks.
  // Route those clicks through its input stepping logic without focusing the input.
  if (event.detail !== 0 || props.disabled) return;
  const button = event.currentTarget as HTMLButtonElement;
  if (button.disabled) return;
  const input = button.parentElement?.querySelector('input');
  input?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  finishInput();
}

onMounted(() => {
  window.addEventListener('pointerup', endPress);
  window.addEventListener('pointercancel', endPress);
  window.addEventListener('blur', interrupt);
});
onBeforeUnmount(() => {
  window.removeEventListener('pointerup', endPress);
  window.removeEventListener('pointercancel', endPress);
  window.removeEventListener('blur', interrupt);
  interrupt();
});
</script>

<template>
  <NumberFieldRoot
    :id="id"
    class="number-control"
    :model-value="fieldValue"
    :min="lower"
    :max="upper"
    :step="increment"
    :disabled="disabled"
    :step-snapping="false"
    :focus-on-change="false"
    :disable-wheel-change="true"
    :allow-invalid="true"
    :format-options="formatOptions"
    locale="en-US"
    @update:model-value="update"
  >
    <label :for="id" class="number-label">{{ label }}</label>
    <div class="number-editor">
      <NumberFieldDecrement class="step-button" tabindex="0" :aria-label="`减少${label}`" @pointerdown.capture="startPress" @click="activateStep($event, 'ArrowDown')">
        <span aria-hidden="true">−</span>
      </NumberFieldDecrement>
      <div class="number-value">
        <NumberFieldInput
          class="number-input"
          :inputmode="inputMode"
          :aria-label="`${label}数值${unit ? `（${unit}）` : ''}`"
          @blur="finishInput"
          @keydown="keydown"
          @keyup="keyup"
          @compositionstart="composing = true"
          @compositionend="composing = false"
        />
      </div>
      <NumberFieldIncrement class="step-button" tabindex="0" :aria-label="`增加${label}`" @pointerdown.capture="startPress" @click="activateStep($event, 'ArrowUp')">
        <span aria-hidden="true">+</span>
      </NumberFieldIncrement>
    </div>
    <span v-if="unit" class="number-unit" aria-hidden="true">{{ unit }}</span>
  </NumberFieldRoot>
</template>

<style scoped>
.number-control { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 8px; min-width: 0; max-width: 100%; color: var(--ink); font-size: 14px; }
.number-label { flex: 1 1 56px; min-width: 0; line-height: 1.5; overflow-wrap: anywhere; }
.number-editor { flex: 0 1 184px; display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; gap: 4px; width: 184px; min-width: 0; max-width: 100%; }
.number-value { display: flex; align-items: center; min-width: 0; border-radius: var(--radius-control); background: var(--control); }
.number-value:focus-within { background: var(--accent-soft); }
.number-input { width: 100%; min-width: 0; min-height: 44px; box-sizing: border-box; padding: 8px 4px; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--ink); font: inherit; font-size: 16px; text-align: center; font-variant-numeric: tabular-nums; }
.number-input:hover:not(:disabled) { background: var(--control-hover); }
.step-button { display: inline-grid; place-items: center; width: 44px; min-width: 44px; height: 44px; padding: 0; border: 0; border-radius: var(--radius-control); background: var(--control); color: var(--accent); font: inherit; font-size: 23px; line-height: 1; touch-action: pan-y; user-select: none; }
.step-button:hover:not(:disabled), .step-button[data-pressed='true'] { background: var(--accent-soft); }
.number-unit { flex: 0 0 auto; margin-left: auto; color: var(--muted); font-size: 12px; line-height: 1.5; }
.number-input:disabled { cursor: not-allowed; opacity: .45; }
.step-button:disabled { cursor: not-allowed; }
.number-input:focus-visible, .step-button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
</style>
