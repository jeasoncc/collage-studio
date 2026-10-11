<script setup lang="ts">
import { computed } from 'vue';
import { Check, ChevronDown, ChevronUp } from 'lucide-vue-next';
import { SelectRoot, SelectTrigger, SelectValue, SelectIcon, SelectPortal, SelectContent, SelectViewport, SelectItem, SelectItemText, SelectItemIndicator, SelectScrollUpButton, SelectScrollDownButton } from 'reka-ui';

const props = withDefaults(defineProps<{
  value: string | number;
  options: readonly { value: string | number; label: string; disabled?: boolean }[];
  label: string;
  disabled?: boolean;
  placeholder?: string;
}>(), { disabled: false, placeholder: '请选择' });
const emit = defineEmits<{ change: [value: string | number] }>();
// Reka reserves the empty string for clearing. Encode both types so "1" and 1
// remain distinct, and resolve back through the options before emitting.
const encode = (value: string | number) => `${typeof value === 'number' ? 'number' : 'string'}:${value}`;
const selected = computed(() => props.options.some(option => option.value === props.value) ? encode(props.value) : undefined);
function change(value: unknown) {
  const option = props.options.find(option => encode(option.value) === value);
  if (option && !option.disabled) emit('change', option.value);
}
</script>

<template>
  <SelectRoot :model-value="selected" :disabled="disabled" @update:model-value="change">
    <SelectTrigger class="app-select-trigger" :aria-label="label">
      <SelectValue class="app-select-value" :placeholder="placeholder" />
      <SelectIcon class="app-select-icon"><ChevronDown :size="16" aria-hidden="true" /></SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent class="app-select-popup" position="popper" :side-offset="7" :collision-padding="12">
        <SelectScrollUpButton class="app-select-scroll"><ChevronUp :size="16" aria-hidden="true" /></SelectScrollUpButton>
        <SelectViewport class="app-select-options">
          <SelectItem v-for="option in options" :key="encode(option.value)" class="app-select-option" :value="encode(option.value)" :disabled="option.disabled">
            <SelectItemText class="app-select-option-text">{{ option.label }}</SelectItemText>
            <SelectItemIndicator class="app-select-check"><Check :size="17" aria-hidden="true" /></SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
        <SelectScrollDownButton class="app-select-scroll"><ChevronDown :size="16" aria-hidden="true" /></SelectScrollDownButton>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style scoped>
.app-select-trigger { display: inline-flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-width: 0; min-height: 48px; padding: 12px 14px; border: 0; border-radius: var(--radius-control); background: var(--control); color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer; transition: background .18s var(--ease-out), transform .18s var(--ease-out); -webkit-tap-highlight-color: transparent; }
.app-select-trigger :deep(.app-select-value) { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app-select-trigger:hover { background: var(--control-hover); }
.app-select-trigger:active { transform: scale(.985); }
.app-select-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.app-select-trigger[data-state="open"] { background: var(--accent-soft); }
.app-select-trigger[data-disabled] { opacity: .45; cursor: not-allowed; }
.app-select-trigger :deep([data-placeholder]) { color: var(--muted); }
.app-select-icon { display: flex; flex: none; color: var(--muted); }
:deep(.app-select-popup) { z-index: 120; box-sizing: border-box; width: max-content; min-width: min(var(--reka-select-trigger-width), calc(100vw - 24px)); max-width: calc(100vw - 24px); max-height: min(360px, var(--reka-select-content-available-height)); overflow: hidden; padding: 5px; border-radius: 18px; background: var(--surface-raised); color: var(--ink); box-shadow: var(--shadow-float), 0 0 0 1px var(--line); transform-origin: var(--reka-select-content-transform-origin); animation: select-enter .16s var(--ease-out); }
:deep(.app-select-options) { padding: 2px; }
.app-select-option { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; min-height: 44px; box-sizing: border-box; padding: 11px 12px; border-radius: 11px; font-size: 14px; line-height: 1.5; white-space: normal; overflow-wrap: anywhere; cursor: pointer; outline: none; user-select: none; }
.app-select-option :deep(.app-select-option-text) { min-width: 0; overflow-wrap: anywhere; }
.app-select-option[data-state="checked"] { color: var(--accent); font-weight: 600; background: var(--accent-soft); }
.app-select-option[data-highlighted] { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); }
.app-select-option[data-disabled] { color: var(--muted); opacity: .45; cursor: not-allowed; }
.app-select-check { display: flex; flex: none; }
:deep(.app-select-scroll) { display: flex; align-items: center; justify-content: center; min-height: 44px; color: var(--muted); }
@keyframes select-enter { from { opacity: 0; transform: translateY(-3px) scale(.98); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .app-select-trigger { transition: none; } .app-select-trigger:active { transform: none; } :deep(.app-select-popup) { animation: none; } }
</style>
