<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useEventListener } from '@vueuse/core';
import { ChevronDown, Maximize2 } from 'lucide-vue-next';

const props = withDefaults(defineProps<{ open: boolean; title: string; expanded?: boolean; text?: boolean; disabled?: boolean; keyboardOpen?: boolean }>(), { expanded: false, text: false, disabled: false, keyboardOpen: false });
const emit = defineEmits<{ close: []; 'update:expanded': [expanded: boolean] }>();
const dock = ref<HTMLElement>();
const body = ref<HTMLElement>();
const availableHeight = ref(window.innerHeight);
const mobile = ref(window.innerWidth <= 700);
let observer: ResizeObserver | undefined;
let drag: { pointerId: number; y: number; height: number; nextHeight: number; handle: HTMLElement } | undefined;
let resizeFrame: number | undefined;
const maximum = computed(() => Math.max(252, Math.min(availableHeight.value * .6, availableHeight.value - 224)));
const compactHeight = computed(() => Math.min(264, maximum.value));
const height = computed(() => props.expanded ? maximum.value : compactHeight.value);
const shortSidebar = computed(() => !mobile.value && availableHeight.value <= 600);
const galleryExpanded = computed(() => !(mobile.value || shortSidebar.value) || props.expanded);
const dockStyle = computed(() => mobile.value && !props.keyboardOpen ? { '--dock-height': `${height.value}px` } : undefined);

function measure() {
  const nextHeight = dock.value?.parentElement?.clientHeight || window.visualViewport?.height || window.innerHeight;
  const nextMobile = window.innerWidth <= 700 && !(window.innerWidth > window.innerHeight && window.innerHeight <= 600);
  if (nextHeight !== availableHeight.value || nextMobile !== mobile.value) finishResize();
  availableHeight.value = nextHeight;
  mobile.value = nextMobile;
}
function startResize(event: PointerEvent) {
  if (drag || !props.open || !mobile.value || props.disabled || props.keyboardOpen || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
  event.preventDefault();
  const handle = event.currentTarget as HTMLElement;
  drag = { pointerId: event.pointerId, y: event.clientY, height: height.value, nextHeight: height.value, handle };
  handle.setPointerCapture(event.pointerId);
}
function resize(event: PointerEvent) {
  const current = drag;
  if (!current || current.pointerId !== event.pointerId) return;
  event.preventDefault();
  const nextHeight = Math.max(compactHeight.value, Math.min(maximum.value, current.height + current.y - event.clientY));
  if (nextHeight === current.nextHeight) return;
  current.nextHeight = nextHeight;
  if (resizeFrame !== undefined) return;
  // Keep pointer updates out of the slot's render path and write at most once per frame.
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = undefined;
    if (drag) dock.value?.style.setProperty('--dock-height', `${drag.nextHeight}px`);
  });
}
function finishResize(event?: PointerEvent, commit = false) {
  const current = drag;
  if (!current || (event && event.pointerId !== current.pointerId)) return;
  drag = undefined;
  if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
  resizeFrame = undefined;
  if (mobile.value && !props.keyboardOpen) dock.value?.style.setProperty('--dock-height', `${height.value}px`);
  else dock.value?.style.removeProperty('--dock-height');
  if (commit && event?.pointerId === current.pointerId && Math.abs(current.y - event.clientY) >= 24) {
    emit('update:expanded', current.y > event.clientY);
  }
  if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
}
function resizeViewport() {
  finishResize();
  measure();
}
watch(() => props.open, async open => {
  if (!open) { finishResize(); return; }
  await nextTick(); measure();
}, { immediate: true });
watch(() => props.title, async () => { finishResize(); await nextTick(); body.value?.scrollTo({ top: 0 }); });
watch(() => props.expanded, () => finishResize());
watch([() => props.disabled, () => props.keyboardOpen], ([disabled, keyboardOpen]) => { if (disabled || keyboardOpen) finishResize(); });
useEventListener(window, 'resize', resizeViewport);
useEventListener(window.visualViewport, 'resize', resizeViewport);
onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  if (dock.value?.parentElement) observer.observe(dock.value.parentElement);
});
onBeforeUnmount(() => { finishResize(); observer?.disconnect(); });
</script>

<template>
  <aside v-show="open" ref="dock" class="tool-dock" :class="{ 'text-dock': text, 'keyboard-dock': keyboardOpen, 'expanded-dock': galleryExpanded }" :style="dockStyle" :aria-label="title">
    <div class="dock-grabber" aria-hidden="true"><span /></div>
    <header class="dock-heading" @pointerdown="startResize" @pointermove="resize" @pointerup="finishResize($event, true)" @pointercancel="finishResize($event)" @lostpointercapture="finishResize($event)"><h2>{{ title }}</h2><div class="dock-heading-actions"><button class="icon-button dock-expand" :aria-label="expanded ? '恢复紧凑面板' : '展开工具面板'" :aria-pressed="expanded" :disabled="disabled" @click="emit('update:expanded', !expanded)"><Maximize2 :size="18" /></button><button class="dock-close text-button" :disabled="disabled" @click="emit('close')"><span>回到画布</span><ChevronDown :size="18" /></button></div></header>
    <div ref="body" class="dock-body"><slot :expanded="galleryExpanded" :collapsible="shortSidebar" /></div>
  </aside>
</template>

<style scoped>
.tool-dock { display: flex; flex-direction: column; overflow: hidden; }
.dock-heading-actions { display: flex; flex: none; }
.dock-body { flex: 1; min-height: 0; min-width: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; }
.text-dock .dock-body { display: flex; flex-direction: column; overflow: hidden; }
.dock-body :deep(.photo-text-tools) { --text-tools-height: 100%; flex: 1; height: 100%; }
.dock-close { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 44px; padding: 8px; color: var(--accent); font-size: 12px; white-space: nowrap; }
.dock-grabber, .dock-expand { display: none; }
@media (max-width: 700px) {
  .tool-dock { height: var(--dock-height, 264px); max-height: none; padding-bottom: 8px; }
  .dock-grabber { flex: 0 0 8px; display: grid; place-items: center; }
  .dock-grabber span { width: 36px; height: 4px; border-radius: 99px; background: var(--line); }
  .dock-heading { touch-action: none; }
  .dock-expand { display: inline-flex; }
  .keyboard-dock { height: auto; max-height: none; }
  .keyboard-dock :is(.dock-grabber, .dock-expand) { display: none; }
}
@media (max-width: 900px) and (orientation: landscape) and (max-height: 600px) {
  .tool-dock:not(.keyboard-dock) { height: auto; max-height: none; }
  .dock-grabber, .dock-expand { display: none; }
}
</style>
