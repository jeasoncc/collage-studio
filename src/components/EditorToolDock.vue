<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useEventListener } from '@vueuse/core';
import { ChevronDown, Maximize2 } from 'lucide-vue-next';

const props = withDefaults(defineProps<{ open: boolean; title: string; text?: boolean; disabled?: boolean; keyboardOpen?: boolean; focusKey?: string }>(), { text: false, disabled: false, keyboardOpen: false });
const emit = defineEmits<{ close: [] }>();
const dock = ref<HTMLElement>();
const body = ref<HTMLElement>();
const availableHeight = ref(window.innerHeight);
const mobile = ref(window.innerWidth <= 700);
const requestedHeight = ref<number>();
let observer: ResizeObserver | undefined;
let drag: { pointerId: number; y: number; height: number; handle: HTMLElement } | undefined;
const minimum = computed(() => props.text ? 216 : 150);
const maximum = computed(() => Math.max(minimum.value, Math.min(availableHeight.value * .6, availableHeight.value - (props.text ? 180 : 220) - 72)));
const defaultHeight = computed(() => Math.max(minimum.value, Math.min(props.text ? 260 : 240, availableHeight.value * .32, maximum.value)));
const height = computed(() => Math.max(minimum.value, Math.min(requestedHeight.value ?? defaultHeight.value, maximum.value)));
const expanded = computed(() => height.value >= maximum.value - 1);
const dockStyle = computed(() => mobile.value && !props.keyboardOpen ? { '--dock-height': `${height.value}px` } : undefined);

function measure() {
  availableHeight.value = dock.value?.parentElement?.clientHeight || window.visualViewport?.height || window.innerHeight;
  mobile.value = window.innerWidth <= 700;
}
function setHeight(value: number) { requestedHeight.value = Math.max(minimum.value, Math.min(value, maximum.value)); }
function startResize(event: PointerEvent) {
  if (props.disabled || event.button !== 0) return;
  event.preventDefault();
  const handle = event.currentTarget as HTMLElement;
  drag = { pointerId: event.pointerId, y: event.clientY, height: height.value, handle };
  handle.setPointerCapture(event.pointerId);
}
function resize(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.preventDefault();
  setHeight(drag.height + drag.y - event.clientY);
}
function finishResize() {
  if (drag?.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
  drag = undefined;
}
function resizeWithKeys(event: KeyboardEvent) {
  if (props.disabled) return;
  if (event.key === 'ArrowUp') setHeight(height.value + 24);
  else if (event.key === 'ArrowDown') setHeight(height.value - 24);
  else if (event.key === 'Home') setHeight(minimum.value);
  else if (event.key === 'End') setHeight(maximum.value);
  else return;
  event.preventDefault();
}
watch([() => props.open, () => props.focusKey], async ([open, focusKey]) => {
  if (!open) { finishResize(); return; }
  await nextTick(); measure();
  if (focusKey && mobile.value) setHeight(maximum.value);
}, { immediate: true });
watch(() => props.title, async () => { await nextTick(); body.value?.scrollTo({ top: 0 }); });
watch(() => props.disabled, disabled => { if (disabled) finishResize(); });
useEventListener(window, 'resize', measure);
useEventListener(window.visualViewport, 'resize', measure);
onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  if (dock.value?.parentElement) observer.observe(dock.value.parentElement);
});
onBeforeUnmount(() => { finishResize(); observer?.disconnect(); });
</script>

<template>
  <aside v-show="open" ref="dock" class="tool-dock" :class="{ 'text-dock': text, 'keyboard-dock': keyboardOpen }" :style="dockStyle" :aria-label="title">
    <div class="dock-resize-handle" role="separator" aria-label="调整工具面板高度" aria-orientation="horizontal" :aria-valuemin="minimum" :aria-valuemax="Math.round(maximum)" :aria-valuenow="Math.round(height)" :aria-disabled="disabled" :tabindex="disabled ? -1 : 0" @pointerdown="startResize" @pointermove="resize" @pointerup="finishResize" @pointercancel="finishResize" @lostpointercapture="finishResize" @keydown="resizeWithKeys"><span /></div>
    <header class="dock-heading"><h2>{{ title }}</h2><div class="dock-heading-actions"><button class="icon-button dock-expand" :aria-label="expanded ? '恢复面板默认高度' : '展开工具面板'" :aria-pressed="expanded" :disabled="disabled" @click="requestedHeight = expanded ? undefined : maximum"><Maximize2 :size="18" /></button><button class="icon-button" aria-label="收起工具面板" :disabled="disabled" @click="emit('close')"><ChevronDown :size="20" /></button></div></header>
    <div ref="body" class="dock-body"><slot /></div>
  </aside>
</template>

<style scoped>
.tool-dock { display: flex; flex-direction: column; overflow: hidden; }
.dock-heading-actions { display: flex; flex: none; }
.dock-body { flex: 1; min-height: 0; min-width: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; }
.text-dock .dock-body { display: flex; flex-direction: column; overflow: hidden; }
.dock-body :deep(.photo-text-tools) { --text-tools-height: 100%; flex: 1; height: 100%; }
.dock-resize-handle, .dock-expand { display: none; }
@media (max-width: 700px) {
  .tool-dock { height: var(--dock-height, 220px); max-height: none; padding-bottom: 8px; }
  .dock-resize-handle { flex: 0 0 20px; display: grid; place-items: center; touch-action: none; cursor: ns-resize; }
  .dock-resize-handle span { width: 36px; height: 4px; border-radius: 99px; background: var(--line); }
  .dock-resize-handle:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .dock-expand { display: inline-flex; }
  .keyboard-dock { height: auto; max-height: none; }
  .keyboard-dock :is(.dock-resize-handle, .dock-expand) { display: none; }
}
@media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
  .tool-dock:not(.keyboard-dock) { height: auto; max-height: none; }
  .dock-resize-handle, .dock-expand { display: none; }
}
</style>
