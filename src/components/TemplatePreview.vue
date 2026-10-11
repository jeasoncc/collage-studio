<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { layouts } from '../catalog/layouts';
import { photosForTemplate } from '../catalog/templatePhotos';
import { slotRect } from '../defaults';
import type { CropState, FilterState, ImageShape, PhotoFrameSpec, SceneElement, TemplatePreset, TextElement } from '../types';
import BackgroundPreview from './BackgroundPreview.vue';
import PhotoFramePreview from './PhotoFramePreview.vue';
import { curvedTextPath, shapePath } from './canvasGeometry';

interface PreviewPhoto { url: string; width: number; height: number; crop?: CropState; filter?: FilterState }
const props = withDefaults(defineProps<{ template: TemplatePreset; eager?: boolean; photos?: readonly PreviewPhoto[]; photoFrame?: PhotoFrameSpec }>(), { eager: false });
const id = useId();
const canvas = ref<SVGSVGElement>();
const visible = ref(props.eager);
let observer: IntersectionObserver | undefined;
onMounted(() => {
  if (visible.value) return;
  if (!('IntersectionObserver' in window)) { visible.value = true; return; }
  observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    visible.value = true;
    observer?.disconnect();
  }, { rootMargin: '160px' });
  if (canvas.value) observer.observe(canvas.value);
});
onBeforeUnmount(() => observer?.disconnect());

interface Frame {
  x: number; y: number; width: number; height: number; rotation: number;
  shape: ImageShape; borderWidth: number; borderColor: string; cornerRadius: number;
}
type SceneItem = { kind: 'photo'; key: string; frame: Frame; photo?: PreviewPhoto } | { kind: 'element'; key: string; element: SceneElement };
const scene = computed<SceneItem[]>(() => {
  const template = props.template;
  const frames: Frame[] = template.mode === 'grid'
    ? (layouts.find(layout => layout.id === template.layoutId)?.slots ?? []).map(slot => ({
      ...slotRect(template, slot), rotation: 0, shape: 'rect', borderWidth: 0, borderColor: '#ffffff', cornerRadius: template.cornerRadius,
    }))
    : (template.photoFrames ?? []).map(frame => ({
      x: frame.x * template.width, y: frame.y * template.height, width: frame.width * template.width, height: frame.height * template.height,
      rotation: frame.rotation ?? 0, shape: frame.shape ?? 'rect', borderWidth: frame.borderWidth ?? 0, borderColor: frame.borderColor ?? '#ffffff', cornerRadius: template.cornerRadius,
    }));
  const photos = props.photos ?? photosForTemplate(template, frames.length);
  const pictures: SceneItem[] = frames.map((frame, index) => ({ kind: 'photo', key: `photo-${index}`, frame, photo: photos[index] }));
  const decorations: SceneItem[] = template.elements.filter(element => element.visible).map(element => ({ kind: 'element', key: element.id, element }));
  if (template.mode === 'grid' || template.photoLayering === 'overlay') return [...pictures, ...decorations];
  const isBacking = (item: SceneItem) => item.kind === 'element' && item.element.type === 'shape' && item.element.animation === 'none';
  return [...decorations.filter(isBacking), ...pictures, ...decorations.filter(item => !isBacking(item))];
});
function transform(item: SceneItem): string {
  const box = item.kind === 'photo' ? item.frame : item.element;
  return `translate(${box.x} ${box.y}) rotate(${box.rotation} ${box.width / 2} ${box.height / 2})`;
}
function textX(element: TextElement): number {
  const padding = element.backgroundColor && element.backgroundColor !== 'transparent' ? element.fontSize * .28 : 0;
  return element.align === 'center' ? element.width / 2 : element.align === 'right' ? element.width - padding : padding;
}
function textY(element: TextElement): number {
  const lineHeight = element.fontSize * element.lineHeight;
  const height = Math.max(element.height, element.text.split('\n').length * lineHeight);
  return (height - element.text.split('\n').length * lineHeight) / 2 + (lineHeight - element.fontSize) / 2 + element.fontSize * .8;
}
</script>

<template>
  <svg ref="canvas" :viewBox="`0 0 ${template.width} ${template.height}`" class="template-scene" aria-hidden="true">
    <template v-if="visible">
      <defs>
        <template v-for="item in scene" :key="item.key">
          <filter v-if="item.kind === 'element' && item.element.shadow" :id="`${id}-${item.key}-shadow`" x="-40%" y="-40%" width="180%" height="190%" color-interpolation-filters="sRGB">
            <feDropShadow dx="0" :dy="item.element.shadow * .3" :stdDeviation="item.element.shadow / 2" flood-color="#20202d" flood-opacity=".3" />
          </filter>
          <path v-if="item.kind === 'element' && item.element.type === 'text' && item.element.curve" :id="`${id}-${item.key}-curve`" :d="curvedTextPath(item.element.width, item.element.height, item.element.curve)" />
        </template>
      </defs>
      <g :class="template.animation !== 'none' ? `motion-${template.animation}` : undefined" class="scene-motion">
        <BackgroundPreview :document="template" />
        <g v-for="item in scene" :key="item.key" :transform="transform(item)" :opacity="item.kind === 'element' ? item.element.opacity : 1">
          <PhotoFramePreview v-if="item.kind === 'photo'" :width="item.frame.width" :height="item.frame.height" :source="item.photo?.url" :source-width="item.photo?.width" :source-height="item.photo?.height" :crop="item.photo?.crop" :filter="item.photo?.filter" :shape="item.frame.shape" :corner-radius="item.frame.cornerRadius" :photo-frame="photoFrame" :border-width="item.frame.borderWidth" :border-color="item.frame.borderColor" />
          <g v-else :class="item.element.animation !== 'none' ? `motion-${item.element.animation}` : undefined" class="element-motion" :filter="item.element.shadow ? `url(#${id}-${item.key}-shadow)` : undefined">
            <path v-if="item.element.type === 'shape'" :d="shapePath(item.element.shape, item.element.width, item.element.height)" :fill="item.element.fill" :stroke="item.element.stroke || 'none'" :stroke-width="item.element.strokeWidth" />
            <template v-else-if="item.element.type === 'text'">
              <rect v-if="item.element.backgroundColor && item.element.backgroundColor !== 'transparent'" :width="item.element.width" :height="item.element.height" :rx="Math.min(item.element.fontSize * .22, 12)" :fill="item.element.backgroundColor" />
              <text :x="textX(item.element)" :y="textY(item.element)" :fill="item.element.color" :stroke="item.element.stroke || 'none'" :stroke-width="item.element.strokeWidth" :font-family="item.element.fontFamily" :font-size="item.element.fontSize" :font-weight="item.element.fontStyle.includes('bold') ? 'bold' : 'normal'" :font-style="item.element.fontStyle.includes('italic') ? 'italic' : 'normal'" :text-anchor="item.element.align === 'center' ? 'middle' : item.element.align === 'right' ? 'end' : 'start'">
                <textPath v-if="item.element.curve" :href="`#${id}-${item.key}-curve`">{{ item.element.text }}</textPath>
                <template v-else><tspan v-for="(line, index) in item.element.text.split('\n')" :key="index" :x="textX(item.element)" :dy="index === 0 ? 0 : item.element.fontSize * item.element.lineHeight">{{ line }}</tspan></template>
              </text>
            </template>
            <polyline v-else-if="item.element.type === 'drawing'" :points="item.element.points.join(' ')" :stroke="item.element.color" :stroke-width="item.element.strokeWidth" :opacity="item.element.tool === 'highlighter' ? .4 : 1" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </g>
        </g>
      </g>
    </template>
    <text v-else :x="template.width / 2" :y="template.height / 2" text-anchor="middle" :font-size="Math.min(template.width, template.height) / 24" fill="#7d857d">加载摄影预览…</text>
  </svg>
</template>

<style scoped>
.template-scene { display: block; width: 100%; height: 100%; overflow: hidden; }
.scene-motion { transform-box: view-box; transform-origin: center; }
.element-motion { transform-box: fill-box; transform-origin: center; }
.motion-float { animation: photo-float 2.4s ease-in-out infinite; }
.motion-pulse { animation: photo-pulse 2.4s ease-in-out infinite; }
.motion-wiggle { animation: photo-wiggle 1.6s ease-in-out infinite; }
.motion-pop { animation: photo-pop 4.8s ease-in-out infinite; }
.motion-fade { animation: photo-fade 2.4s ease-in-out infinite; }
@keyframes photo-float { 25% { transform: translateY(12px); } 75% { transform: translateY(-12px); } }
@keyframes photo-pulse { 25% { transform: scale(1.045); } 75% { transform: scale(.955); } }
@keyframes photo-wiggle { 25% { transform: rotate(5deg); } 75% { transform: rotate(-5deg); } }
@keyframes photo-pop { 0%,100% { transform: scale(.9); } 50% { transform: scale(1.03); } }
@keyframes photo-fade { 0%,100% { opacity: .725; } 25% { opacity: 1; } 75% { opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .scene-motion, .element-motion { animation: none; } }
</style>
