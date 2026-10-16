<script setup lang="ts">
import { computed, ref } from 'vue';
import { layoutsForCount, MAX_COLLAGE_PHOTOS } from '../catalog/layouts';
import { slotRect } from '../defaults';
import type { CropState, EditorDocument, FilterState, ImageShape, LayoutPreset, MediaAsset } from '../types';
import PhotoFramePreview from './PhotoFramePreview.vue';
import BackgroundPreview from './BackgroundPreview.vue';

const props = withDefaults(defineProps<{
  count: number;
  selectedId?: string;
  previewImages?: readonly string[];
  previewPhotos?: readonly { source: string; width: number; height: number; crop: CropState; filter: FilterState; shape?: ImageShape }[];
  document?: EditorDocument;
  assets?: Record<string, MediaAsset>;
  aspectRatio?: number;
  compact?: boolean;
  embedded?: boolean;
  recommendedId?: string;
}>(), {
  previewImages: () => [],
  previewPhotos: () => [],
  aspectRatio: 1,
  compact: false,
  embedded: false,
});
const emit = defineEmits<{ select: [layout: LayoutPreset] }>();
type Category = NonNullable<LayoutPreset['category']>;
const categoryLabels: Record<Category, string> = { balanced: '均衡', feature: '主角', editorial: '画册', contact: '接触页' };
const selectedCategory = ref<Category | 'all'>('all');
const available = computed(() => {
  const layouts = layoutsForCount(props.count);
  const recommendedIndex = layouts.findIndex(layout => layout.id === props.recommendedId);
  if (recommendedIndex > 0) layouts.unshift(...layouts.splice(recommendedIndex, 1));
  return layouts;
});
const categories = computed(() => (Object.keys(categoryLabels) as Category[]).filter(category => available.value.some(layout => layout.category === category)));
const activeCategory = computed(() => categories.value.includes(selectedCategory.value as Category) ? selectedCategory.value : 'all');
const presentation = computed(() => props.document ?? {
  width: props.aspectRatio * 1000,
  height: 1000,
  padding: Math.min(props.aspectRatio, 1) * 40,
  gap: Math.min(props.aspectRatio, 1) * 12,
});
const backdrop = computed(() => props.document ?? { width: presentation.value.width, height: presentation.value.height, background: { color: '#fffefa', pattern: 'none' as const, patternColor: '#e6e6e1', assetId: null } });
const previewAspect = computed(() => presentation.value.width / presentation.value.height);
const sourceShapes = computed(() => props.document?.mode === 'grid' ? props.document.slots.filter(slot => slot.assetId).map(slot => slot.shape) : []);
const options = computed(() => available.value
  .filter(layout => props.compact || activeCategory.value === 'all' || layout.category === activeCategory.value)
  .map(layout => ({
    layout,
    photoFrame: props.document?.photoFrame,
    frames: layout.slots.map((slot, index) => ({
      ...slotRect(presentation.value, slot),
      photo: props.previewPhotos[index],
      source: props.previewPhotos[index]?.source || props.previewImages[index],
      shape: props.previewPhotos[index]?.shape ?? sourceShapes.value[index] ?? 'rect',
    })),
  })));
</script>

<template>
  <section class="layout-gallery" :class="{ 'is-compact': compact, 'is-embedded': embedded }" aria-label="拼贴布局">
    <div v-if="!compact && !embedded" class="layout-heading">
      <strong>{{ count }} 张照片的构图</strong>
      <span>用当前照片预览 · 换构图，不换照片顺序</span>
    </div>
    <div v-if="!compact && categories.length" class="layout-categories" role="group" aria-label="构图分类">
      <button type="button" :class="{ active: activeCategory === 'all' }" :aria-pressed="activeCategory === 'all'" @click="selectedCategory = 'all'">全部</button>
      <button v-for="category in categories" :key="category" type="button" :class="{ active: activeCategory === category }" :aria-pressed="activeCategory === category" @click="selectedCategory = category">{{ categoryLabels[category] }}</button>
    </div>
    <div v-if="options.length" class="layout-options">
      <button v-for="card in options" :key="card.layout.id" type="button" class="layout-card" :class="{ selected: selectedId === card.layout.id }" :aria-pressed="selectedId === card.layout.id" :aria-label="`应用布局：${card.layout.name}${recommendedId === card.layout.id ? '，按照片比例推荐' : ''}，${card.layout.description}`" @click="emit('select', card.layout)">
        <div class="layout-preview-well">
          <svg class="layout-preview" :viewBox="`0 0 ${presentation.width} ${presentation.height}`" :style="compact ? { width: `${Math.min(116, 76 * previewAspect)}px`, height: `${Math.min(76, 116 / previewAspect)}px` } : { aspectRatio: previewAspect }" aria-hidden="true" focusable="false">
            <BackgroundPreview :document="backdrop" :asset="document?.background.assetId ? assets?.[document.background.assetId] : undefined" />
            <g v-for="(frame, index) in card.frames" :key="index" :transform="`translate(${frame.x} ${frame.y})`">
              <PhotoFramePreview
                :width="frame.width"
                :height="frame.height"
                :source="frame.source"
                :source-width="frame.photo?.width"
                :source-height="frame.photo?.height"
                :crop="frame.photo?.crop"
                :filter="frame.photo?.filter"
                :shape="frame.shape"
                :corner-radius="document?.cornerRadius ?? 0"
                :photo-frame="card.photoFrame"
              />
              <text v-if="!frame.source" :x="frame.width / 2" :y="frame.height / 2" text-anchor="middle" dominant-baseline="middle" :font-size="Math.min(frame.width, frame.height) * .16" fill="#7a897b">{{ index + 1 }}</text>
            </g>
          </svg>
          <span v-if="recommendedId === card.layout.id" class="recommended-mark">推荐</span>
        </div>
        <span class="layout-caption">
          <span class="layout-name">{{ card.layout.name }}</span>
          <span v-if="selectedId === card.layout.id" class="selected-mark">已选</span>
        </span>
        <span v-if="!compact" class="layout-description">{{ card.layout.description }}</span>
      </button>
    </div>
    <p v-else class="layout-empty">支持 1–{{ MAX_COLLAGE_PHOTOS }} 张照片；当前数量暂无可用布局，请先整理照片。</p>
  </section>
</template>

<style scoped>
.layout-gallery { width: 100%; min-width: 0; color: var(--ink); }
.layout-heading { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.layout-heading strong { font-size: 16px; font-weight: 600; }
.layout-heading>span { color: var(--muted); font-size: 12px; line-height: 1.6; }
.layout-categories { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 18px; }
.layout-categories button { min-width: 44px; min-height: 44px; padding: 10px 15px; border: 0; border-radius: 999px; color: var(--muted); background: var(--control); font: inherit; font-size: 13px; cursor: pointer; }
.layout-categories button.active { background: var(--accent-soft); color: var(--accent); box-shadow: inset 0 0 0 2px var(--accent); font-weight: 600; }
.layout-categories button:focus-visible, .layout-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.layout-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.layout-card { display: flex; flex-direction: column; align-items: stretch; gap: 10px; min-width: 0; min-height: 44px; padding: 9px; border: 0; border-radius: var(--radius-card); background: var(--surface); color: inherit; cursor: pointer; text-align: left; box-shadow: var(--shadow-card); transition: transform .18s var(--ease-out), background .18s var(--ease-out), box-shadow .18s var(--ease-out); -webkit-tap-highlight-color: transparent; }
.layout-card:hover { background: var(--control-hover); }
.layout-card:active, .layout-categories button:active { transform: scale(.98); }
.layout-card.selected { box-shadow: inset 0 0 0 2px var(--accent); background: var(--accent-soft); }
.layout-preview-well { position: relative; display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 180px; padding: 14px; box-sizing: border-box; border-radius: 16px; background: var(--control); }
.layout-preview { display: block; width: 100%; max-height: 300px; overflow: hidden; filter: drop-shadow(0 3px 6px #20332914); }
.layout-caption { display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%; min-height: 24px; padding-inline: 4px; box-sizing: border-box; }
.layout-name { min-width: 0; font-size: 13px; line-height: 1.5; font-weight: 600; overflow-wrap: anywhere; }
.selected-mark { flex-shrink: 0; padding: 5px 8px; border-radius: 999px; background: var(--accent); color: white; font-size: 10px; line-height: 1; }
.recommended-mark { position: absolute; top: 5px; left: 5px; padding: 3px 6px; border-radius: 6px; background: var(--surface); color: var(--accent); box-shadow: var(--shadow-card); font-size: 10px; font-weight: 600; line-height: 14px; }
.is-embedded .layout-categories { margin-bottom: 10px; }
.layout-description { color: var(--muted); font-size: 12px; line-height: 1.7; padding: 0 4px 5px; }
.layout-empty { padding: 24px 12px; color: var(--muted); text-align: center; font-size: 13px; }
.is-compact .layout-options { display: flex; gap: 10px; max-width: 100%; overflow-x: auto; padding: 4px 3px 6px; scroll-padding-inline: 4px; overscroll-behavior-x: contain; scroll-snap-type: x proximity; }
.is-compact .layout-card { box-sizing: border-box; flex: 0 0 132px; gap: 5px; padding: 6px; min-height: 118px; border-radius: 17px; scroll-snap-align: start; }
.is-compact .layout-preview-well { height: 76px; min-height: 0; width: 100%; padding: 0; overflow: hidden; border-radius: 12px; }
.is-compact .layout-preview { flex: none; max-height: none; filter: none; }
.is-compact .layout-name { font-size: 12px; font-weight: 500; }
.is-compact .selected-mark { padding: 4px 6px; font-size: 10px; }
.is-compact .layout-empty { margin: 0; padding: 22px 12px; font-size: 13px; }
@media (max-width: 480px) { .layout-options { gap: 10px; } .layout-card { padding: 7px; } .layout-preview-well { min-height: 150px; padding: 9px; } .layout-description { font-size: 11px; } }
@media (prefers-reduced-motion: reduce) { .layout-card { transition: none; } .layout-card:active, .layout-categories button:active { transform: none; } }
</style>
