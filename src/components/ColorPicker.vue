<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { Check, ChevronDown, Slash } from 'lucide-vue-next';
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui';
import { ChromePicker, tinycolor } from 'vue-color';
import 'vue-color/style.css';
import PanelRange from './PanelRange.vue';

const props = withDefaults(defineProps<{ value: string; label: string; alpha?: boolean; allowTransparent?: boolean; disabled?: boolean; inline?: boolean; palette?: readonly string[] }>(), { alpha: false, allowTransparent: false, disabled: false, inline: false });
const emit = defineEmits<{ input: [value: string]; commit: [] }>();
const open = ref(false);
const hex = ref('');
const invalid = ref(false);
const draft = ref(props.value);
const pickerColor = shallowRef(tinycolor('#ffffff'));
const pickerHost = ref<HTMLElement | null>(null);
let lastEmitted: string | undefined;
let gesture: 'pointer' | 'keyboard' | null = null;
let gestureChanged = false;
let commitTimer: ReturnType<typeof setTimeout> | undefined;
let suppressionTimer: ReturnType<typeof setTimeout> | undefined;
let captureTarget: Element | null = null;
let pointerId: number | undefined;
let pointerType = 'mouse';
let lastPoint = { x: 0, y: 0 };
let suppressPicker = false;
let mounted = true;
const colors = [
  { name: '暖白', value: '#fff8e9' }, { name: '纯白', value: '#ffffff' },
  { name: '墨黑', value: '#202c25' }, { name: '森林', value: '#284b3d' },
  { name: '鼠尾草', value: '#b7c6ad' }, { name: '杏色', value: '#e9c8a8' },
  { name: '陶粉', value: '#cd8b7d' }, { name: '雾蓝', value: '#97b4bd' },
  { name: '淡紫', value: '#c2b2ce' }, { name: '柠黄', value: '#ecd58c' },
  { name: '朱红', value: '#d94332' }, { name: '暖金', value: '#d8b15c' },
  { name: '橙金', value: '#ee9b32' }, { name: '珊瑚', value: '#f2796a' },
];
const artworkColors = computed(() => {
  const unique = new Set<string>();
  for (const value of props.palette ?? []) {
    const parsed = tinycolor(value);
    if (parsed.isValid() && parsed.getAlpha() > 0) unique.add(parsed.toHexString());
  }
  return [...unique];
});
function parse(value: string) {
  if (!value || value === 'transparent') return { rgb: '#ffffff', alpha: 0 };
  const parsed = tinycolor(value);
  if (!parsed.isValid()) return { rgb: '#ffffff', alpha: 255 };
  return { rgb: parsed.toHexString(), alpha: Math.round(parsed.getAlpha() * 255) };
}
const color = computed(() => parse(draft.value));
const transparent = computed(() => !draft.value || draft.value === 'transparent');
const opacity = computed(() => Math.round(color.value.alpha / 255 * 100));
const colorName = computed(() => transparent.value ? '透明' : colors.find(swatch => swatch.value === color.value.rgb)?.name ?? '选颜色');

function sync(value: string) {
  draft.value = value;
  hex.value = value && value !== 'transparent' ? value.replace(/^#/, '') : 'ffffff';
  invalid.value = false;
  pickerColor.value = tinycolor(parse(value).rgb);
  void nextTick(localizePicker);
}
watch(() => props.value, value => {
  // Our own echo must not replace the library's precise HSV/hue state mid-drag.
  if (value === lastEmitted && value === draft.value) return;
  cancelGesture();
  sync(value);
}, { immediate: true });
watch(() => props.disabled, disabled => {
  if (!disabled) return;
  stopLibraryDrag();
  completeGesture();
  open.value = false;
});
watch(open, isOpen => {
  if (!isOpen) {
    stopLibraryDrag();
    scheduleCommit();
  }
});
watch(pickerHost, () => { void nextTick(localizePicker); });

function input(value: string, commit = false) {
  if (props.disabled || value === draft.value) return;
  draft.value = value;
  lastEmitted = value;
  hex.value = value === 'transparent' ? 'ffffff' : value.replace(/^#/, '');
  invalid.value = false;
  emit('input', value);
  if (commit) emit('commit');
}
function encoded(rgb: string, alpha: number) {
  return alpha === 255 ? rgb : `${rgb}${alpha.toString(16).padStart(2, '0')}`;
}
function choose(rgb: string) {
  completeGesture();
  input(encoded(rgb, props.alpha && !transparent.value ? color.value.alpha : 255), true);
  pickerColor.value = tinycolor(rgb);
  void nextTick(localizePicker);
}
function clearColor() {
  completeGesture();
  input('transparent', true);
  pickerColor.value = tinycolor('#ffffff');
}
function updateOpacity(percent: number) {
  if (!Number.isFinite(percent)) return;
  input(encoded(color.value.rgb, Math.round(Math.min(100, Math.max(0, percent)) * 255 / 100)));
}
function applyHex() {
  if (props.disabled) return;
  const raw = hex.value.trim().replace(/^#/, '');
  const parsed = tinycolor(`#${raw}`);
  if (!(props.alpha ? /^[\da-f]{6}([\da-f]{2})?$/i : /^[\da-f]{6}$/i).test(raw) || !parsed.isValid()) {
    invalid.value = true;
    return;
  }
  completeGesture();
  input(encoded(parsed.toHexString(), props.alpha ? raw.length === 8 ? Math.round(parsed.getAlpha() * 255) : transparent.value ? 255 : color.value.alpha : 255), true);
  pickerColor.value = tinycolor(parsed.toHexString());
  invalid.value = false;
  void nextTick(localizePicker);
}

function updatePicker(value: Parameters<typeof tinycolor>[0]) {
  if (!mounted || suppressPicker || props.disabled) return;
  const parsed = tinycolor(value);
  const channels = parsed.toRgb();
  if (!parsed.isValid() || ![channels.r, channels.g, channels.b, parsed.getAlpha()].every(Number.isFinite)) return;
  pickerColor.value = parsed.setAlpha(1);
  const next = encoded(parsed.toHexString(), props.alpha && !transparent.value ? color.value.alpha : 255);
  if (next !== draft.value) {
    gestureChanged = true;
    input(next);
  }
  void nextTick(localizePicker);
  // The library can publish its last throttled sample after pointerup.
  if (commitTimer !== undefined || gesture === null) scheduleCommit();
}
function isPickerControl(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('.vc-saturation-slider, .vc-hue-slider');
}
function beginPointer(event: PointerEvent) {
  if (props.disabled || !isPickerControl(event.target) || !event.isPrimary || event.button !== 0) return;
  completeGesture();
  gesture = 'pointer';
  pointerId = event.pointerId;
  pointerType = event.pointerType;
  lastPoint = { x: event.clientX, y: event.clientY };
  captureTarget = event.target instanceof Element ? event.target.closest('.vc-saturation-slider, .vc-hue-slider') : null;
  captureTarget?.setPointerCapture(event.pointerId);
  window.addEventListener('pointermove', trackPoint);
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', cancelPointer);
  window.addEventListener('blur', interruptGesture);
}
function trackPoint(event: PointerEvent) {
  if (event.pointerId === pointerId) lastPoint = { x: event.clientX, y: event.clientY };
}
function releasePointer() {
  window.removeEventListener('pointermove', trackPoint);
  window.removeEventListener('pointerup', endPointer);
  window.removeEventListener('pointercancel', cancelPointer);
  window.removeEventListener('blur', interruptGesture);
  const target = captureTarget;
  const id = pointerId;
  captureTarget = null;
  pointerId = undefined;
  if (target && id !== undefined && target.hasPointerCapture(id)) target.releasePointerCapture(id);
}
function endPointer(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  trackPoint(event);
  releasePointer();
  scheduleCommit();
}
function cancelPointer(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  stopLibraryDrag();
  releasePointer();
  scheduleCommit();
}
function lostCapture(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  interruptGesture();
}
function stopLibraryDrag() {
  if (gesture !== 'pointer') return;
  // ChromePicker 3.3.3 listens for mouseup/touchend, not pointer cancellation.
  const pageX = lastPoint.x + window.scrollX;
  const pageY = lastPoint.y + window.scrollY;
  if (pointerType !== 'touch') {
    const end = new MouseEvent('mouseup', { clientX: lastPoint.x, clientY: lastPoint.y });
    Object.defineProperties(end, { pageX: { value: pageX }, pageY: { value: pageY } });
    window.dispatchEvent(end);
  } else if (typeof TouchEvent !== 'undefined') {
    const end = new TouchEvent('touchend');
    Object.defineProperty(end, 'changedTouches', { value: [{ pageX, pageY }] });
    window.dispatchEvent(end);
  }
}
function interruptGesture() {
  stopLibraryDrag();
  releasePointer();
  scheduleCommit();
}
function beginKeyboard(event: KeyboardEvent) {
  if (props.disabled || !isPickerControl(event.target)) return;
  // The bundled sliders preventDefault for every key, including Tab/Escape.
  if (event.key === 'Tab') {
    event.stopPropagation();
    if (gesture === 'keyboard') scheduleCommit();
    return;
  }
  if (event.key === 'Escape' && !props.inline) {
    event.preventDefault();
    event.stopPropagation();
    open.value = false;
    return;
  }
  if (!event.key.startsWith('Arrow')) return;
  if (gesture === 'keyboard' && commitTimer === undefined) return;
  completeGesture();
  gesture = 'keyboard';
}
function endKeyboard(event: KeyboardEvent) {
  if (gesture === 'keyboard' && event.key.startsWith('Arrow')) scheduleCommit();
}
function leavePicker(event: FocusEvent) {
  if (gesture === 'keyboard' && !(event.relatedTarget instanceof Node && pickerHost.value?.contains(event.relatedTarget))) scheduleCommit();
}
function scheduleCommit() {
  if (commitTimer !== undefined) clearTimeout(commitTimer);
  // Wait past the library's 20 ms trailing throttle before recording history.
  commitTimer = setTimeout(completeGesture, 30);
}
function completeGesture() {
  if (commitTimer !== undefined) clearTimeout(commitTimer);
  commitTimer = undefined;
  releasePointer();
  gesture = null;
  const changed = gestureChanged;
  gestureChanged = false;
  if (changed) emit('commit');
}
function cancelGesture() {
  const wasEditing = gesture !== null || commitTimer !== undefined || suppressionTimer !== undefined;
  suppressPicker = true;
  stopLibraryDrag();
  if (commitTimer !== undefined) clearTimeout(commitTimer);
  commitTimer = undefined;
  releasePointer();
  gesture = null;
  gestureChanged = false;
  if (suppressionTimer !== undefined) clearTimeout(suppressionTimer);
  // A cancelled library throttle must not overwrite an external undo/update.
  if (wasEditing) suppressionTimer = setTimeout(() => { suppressPicker = false; suppressionTimer = undefined; }, 30);
  else suppressPicker = false;
  lastEmitted = undefined;
}
function localizePicker() {
  const host = pickerHost.value;
  if (!host) return;
  host.querySelector('.vc-chrome-picker')?.setAttribute('aria-label', `${props.label}选颜色`);
  host.querySelector('.vc-saturation-slider')?.setAttribute('aria-label', '饱和度与明度');
  const saturation = host.querySelector('.vc-saturation-slider [role="slider"]');
  const hsv = pickerColor.value.toHsv();
  saturation?.setAttribute('aria-label', '饱和度与明度，左右调整饱和度，上下调整明度');
  saturation?.setAttribute('aria-valuemax', '100');
  saturation?.setAttribute('aria-valuenow', String(Math.round(hsv.s * 100)));
  saturation?.setAttribute('aria-valuetext', `饱和度 ${Math.round(hsv.s * 100)}%，明度 ${Math.round(hsv.v * 100)}%`);
  host.querySelector('.vc-hue-slider [role="slider"]')?.setAttribute('aria-label', '色相，左右方向键调整');
  host.querySelector('.active-color')?.setAttribute('aria-label', '当前颜色');
}
onBeforeUnmount(() => {
  stopLibraryDrag();
  completeGesture();
  mounted = false;
  if (suppressionTimer !== undefined) clearTimeout(suppressionTimer);
});
</script>

<template>
  <PopoverRoot v-model:open="open">
    <div class="color-picker" :class="{ 'is-inline': inline }">
      <div class="color-picker-heading">
        <span>{{ label }}</span>
        <span v-if="inline" class="color-caption">{{ transparent ? '无底色' : alpha ? `${opacity}% 不透明` : colorName }}</span>
        <PopoverTrigger v-else as-child>
          <button type="button" class="color-trigger" :disabled="disabled" :aria-label="`设置${label}`">
            <span class="color-preview"><i :style="{ background: draft || 'transparent' }" /></span>
            <span>{{ colorName }}</span><ChevronDown :size="14" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </div>
      <component :is="inline ? 'div' : PopoverPortal">
        <component :is="inline ? 'div' : PopoverContent" class="color-palette" :class="{ 'inline-palette': inline }" v-bind="inline ? { role: 'group' } : { sideOffset: 8, collisionPadding: 12, align: 'end' }" :aria-label="`${label}色板`">
          <div ref="pickerHost" class="visual-color-picker" :inert="disabled" :aria-disabled="disabled" @pointerdown.capture="beginPointer" @lostpointercapture="lostCapture" @keydown.capture="beginKeyboard" @keyup="endKeyboard" @focusout="leavePicker">
            <p class="picker-help">选颜色<span>上下调明度，左右调饱和度</span></p>
            <ChromePicker :model-value="color.rgb" :tiny-color="pickerColor" :disable-fields="true" :disable-alpha="true" @update:tiny-color="updatePicker" />
            <span class="hue-caption" aria-hidden="true">色相</span>
          </div>
          <div v-if="artworkColors.length" class="artwork-palette">
            <p class="picker-help">当前作品颜色</p>
            <div class="color-swatches" role="group" :aria-label="`${label}当前作品颜色`">
              <button v-for="(value, index) in artworkColors" :key="value" type="button" class="color-swatch" :disabled="disabled" :data-color="value" :aria-label="`${label}作品色 ${index + 1} ${value}`" :aria-pressed="!transparent && color.rgb === value" @click="choose(value)">
                <i :style="{ background: value }"><Check v-if="!transparent && color.rgb === value" :size="16" aria-hidden="true" /></i><span>作品色 {{ index + 1 }}</span>
              </button>
            </div>
          </div>
          <div class="color-swatches" role="group" :aria-label="`${label}常用颜色`">
            <button v-if="allowTransparent" type="button" class="color-swatch clear-color" :disabled="disabled" :aria-label="`${label}无底色`" :aria-pressed="transparent" @click="clearColor"><Slash :size="18" aria-hidden="true" /><span>无</span></button>
            <button v-for="swatch in colors" :key="swatch.value" type="button" class="color-swatch" :disabled="disabled" :data-color="swatch.value" :aria-label="`${label} ${swatch.name} ${swatch.value}`" :aria-pressed="!transparent && color.rgb === swatch.value" @click="choose(swatch.value)">
              <i :style="{ background: swatch.value }"><Check v-if="!transparent && color.rgb === swatch.value" :size="16" aria-hidden="true" /></i><span>{{ swatch.name }}</span>
            </button>
          </div>
          <details class="color-advanced">
            <summary>输入色值（高级）</summary>
            <label class="color-hex"><span>十六进制</span><span class="hex-input"><span aria-hidden="true">#</span><input v-model="hex" type="text" :maxlength="alpha ? 9 : 7" spellcheck="false" autocapitalize="off" autocomplete="off" :disabled="disabled" :aria-label="`${label}颜色值`" :aria-invalid="invalid" @input="invalid = false" @blur="applyHex" @keydown.enter.prevent="applyHex" /></span></label>
            <p v-if="invalid" class="color-error" role="alert">请输入 6 位{{ alpha ? '或 8 位（含透明度）' : '' }}十六进制颜色。</p>
          </details>
          <PanelRange v-if="alpha" :label="`${label}不透明度`" :value="opacity" :min="0" :max="100" unit="%" :disabled="disabled" @input="updateOpacity" @commit="emit('commit')" />
        </component>
      </component>
    </div>
  </PopoverRoot>
</template>

<style scoped>
.color-picker{min-width:0;width:100%}
.color-picker-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;font-size:13px;font-weight:500}
.color-caption{font-size:11px;font-weight:400;color:var(--muted)}
.color-trigger{display:flex;align-items:center;gap:8px;min-height:44px;padding:6px 10px;border:0;border-radius:var(--radius-control);background:var(--control);font-size:11px;font-variant-numeric:tabular-nums}
.color-preview{position:relative;width:24px;height:24px;overflow:hidden;border-radius:8px;background:repeating-conic-gradient(#d4d9d1 0% 25%,#fff 0% 50%) 50%/8px 8px}
.color-preview i{position:absolute;inset:0}
:deep(.color-palette){z-index:150;box-sizing:border-box;width:min(304px,calc(100vw - 24px));max-height:min(620px,70dvh,var(--reka-popover-content-available-height,70dvh));overflow-y:auto;overscroll-behavior:contain;padding:16px;display:grid;gap:12px;border-radius:20px;background:var(--surface);box-shadow:var(--shadow-float);outline:none;animation:color-arrive .18s var(--ease-out)}
:deep(.inline-palette){width:100%;max-height:none;padding:0;overflow:visible;box-shadow:none;background:transparent;animation:none}
.visual-color-picker{min-width:0;position:relative}
.visual-color-picker[aria-disabled='true']{opacity:.4;pointer-events:none}
.picker-help{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px;margin:0 0 8px;font-size:12px;font-weight:500}
.picker-help span{font-size:10px;font-weight:400;color:var(--muted)}
.hue-caption{display:block;margin-top:2px;font-size:11px;color:var(--muted)}
.visual-color-picker :deep(.vc-chrome-picker){width:100%;box-sizing:border-box;border-radius:12px;box-shadow:none;font-family:inherit;--vc-body-bg:transparent}
.visual-color-picker :deep(.vc-chrome-picker .saturation){padding-bottom:62%;min-height:144px;border-radius:12px;overflow:hidden}
.visual-color-picker :deep(.vc-chrome-picker .body){padding:10px 0 0}
.visual-color-picker :deep(.vc-chrome-picker .color-wrap){display:none}
.visual-color-picker :deep(.vc-chrome-picker .hue-wrap){height:44px;margin:0}
.visual-color-picker :deep(.vc-hue-slider .gradient){border-radius:12px}
.visual-color-picker :deep(.vc-hue-slider .picker-wrap){top:50%;transform:translateY(-50%)}
.visual-color-picker :deep(.vc-hue-slider .picker){width:22px;height:30px;box-sizing:border-box;margin:0;border:3px solid #fff;border-radius:12px;transform:translateX(-11px);background:transparent;box-shadow:0 1px 4px #0008}
.visual-color-picker :deep(.vc-saturation-slider .picker){width:20px;height:20px;box-sizing:border-box;border:2px solid #fff;transform:translate(-10px,-10px);box-shadow:0 0 0 1px #0006}
.visual-color-picker :deep([role='slider']:focus-visible){outline:3px solid var(--accent);outline-offset:3px}
.color-advanced{min-width:0}
.color-advanced summary{display:flex;align-items:center;gap:6px;min-height:44px;cursor:pointer;font-size:12px;color:var(--muted);list-style:none}
.color-advanced summary::-webkit-details-marker{display:none}
.color-advanced summary::before{content:'›';font-size:20px;transition:transform .15s}
.color-advanced[open] summary::before{transform:rotate(90deg)}
.color-advanced summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:8px}
.artwork-palette{display:grid;gap:6px}
.color-swatches{display:grid;grid-template-columns:repeat(auto-fit,minmax(44px,1fr));gap:6px}
.color-swatch{min-width:44px;min-height:60px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:5px 2px;border:0;border-radius:12px;background:transparent;font-size:10px;color:var(--muted)}
.color-swatch i{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;box-shadow:inset 0 0 0 1px #202c2512}
.color-swatch i svg{padding:2px;border-radius:50%;background:#202c25aa;color:#fff}
.color-swatch[aria-pressed='true']{background:var(--accent-soft);color:var(--accent)}
.color-swatch[aria-pressed='true'] i{outline:2px solid var(--accent);outline-offset:3px}
.clear-color svg{height:30px;width:30px;padding:6px;border-radius:50%;background:repeating-conic-gradient(#d4d9d1 0% 25%,#fff 0% 50%) 50%/8px 8px}
.color-hex{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:var(--muted)}
.hex-input{display:flex;align-items:center;gap:4px;min-height:44px;padding:0 10px;background:var(--control);border-radius:12px}
.hex-input input{width:94px;min-height:44px;padding:0;border:0;outline-offset:0;background:transparent;font:inherit;font-size:16px;color:var(--ink);font-variant-numeric:tabular-nums}
.hex-input input[aria-invalid='true']{color:#a24f42}
.color-error{margin:0;font-size:12px;color:#a24f42}
:deep(.color-palette .range-control){padding:0;background:transparent}
.color-picker button:disabled,:deep(.color-palette button:disabled){opacity:.4}
:deep(.color-palette button:focus-visible),.color-trigger:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media(hover:hover){.color-swatch:hover,.color-trigger:hover{background:var(--control-hover)}}
@keyframes color-arrive{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@media(prefers-reduced-motion:reduce){:deep(.color-palette){animation:none}}
</style>
