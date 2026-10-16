<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowRight, Images } from 'lucide-vue-next';
import { photoPostersForCount } from '../catalog/photoPosters';
import type { CollageSlot, EditorDocument, ImageElement, MediaAsset, TemplatePreset } from '../types';
import TemplatePreview from './TemplatePreview.vue';

const props = withDefaults(defineProps<{ document: EditorDocument; assets: Record<string, MediaAsset>; compact?: boolean; embedded?: boolean }>(), { compact: false, embedded: false });
const emit = defineEmits<{ select: [template: TemplatePreset] }>();
const selectedCategory = ref('全部');
const photos = computed(() => {
  const sources: Array<CollageSlot | ImageElement> = [
    ...(props.document.mode === 'grid' ? props.document.slots : []),
    ...props.document.elements.filter(element => element.type === 'image'),
  ];
  return sources.flatMap(source => {
    const asset = source.assetId ? props.assets[source.assetId] : undefined;
    if (!asset || (asset.kind !== 'image' && asset.kind !== 'video')) return [];
    return [{ url: asset.thumbnail || (asset.kind === 'video' ? '' : asset.src), width: asset.width, height: asset.height, crop: source.crop, filter: source.filter, visible: source.visible, opacity: 'opacity' in source ? source.opacity : 1 }];
  });
});
const presets = computed(() => photoPostersForCount(photos.value.length));
const categories = computed(() => ['全部', ...new Set(presets.value.map(preset => preset.category))]);
const activeCategory = computed(() => categories.value.includes(selectedCategory.value) ? selectedCategory.value : '全部');
const cards = computed(() => presets.value.filter(preset => props.compact || activeCategory.value === '全部' || preset.category === activeCategory.value));
</script>

<template>
  <section class="poster-gallery" :class="{ 'is-compact': compact, 'is-embedded': embedded }" aria-label="当前照片的海报方案">
    <header v-if="!compact && !embedded" class="poster-heading">
      <div><span class="poster-eyebrow">照片海报</span><strong>给 {{ photos.length }} 张照片换个封面</strong></div>
      <p>每张照片都保留。先看大图，喜欢再应用。</p>
    </header>
    <template v-if="presets.length">
      <div v-if="!compact" class="poster-categories" role="group" aria-label="海报风格分类">
        <button v-for="category in categories" :key="category" type="button" :class="{ active: activeCategory === category }" :aria-pressed="activeCategory === category" @click="selectedCategory = category">{{ category }}</button>
      </div>
      <div class="poster-cards" aria-label="选择海报设计">
        <button v-for="(template, index) in cards" :key="template.id" type="button" class="poster-card" aria-haspopup="dialog" :aria-label="`预览${template.category}海报：${template.name}，保留全部 ${photos.length} 张照片；确认后才会应用`" @click="emit('select', template)">
          <div class="poster-preview" :style="{ backgroundColor: template.background.color }">
            <TemplatePreview :template="template" :photos="photos" :eager="index === 0" />
          </div>
          <template v-if="compact">
            <strong class="poster-name">{{ template.name }}</strong>
            <span class="poster-compact-note">查看大图 · {{ photos.length }} 张</span>
          </template>
          <template v-else>
            <div class="poster-card-heading"><span class="poster-style">{{ template.category }}</span><span class="poster-count"><Images :size="13" aria-hidden="true" />{{ photos.length }} 张</span></div>
            <strong class="poster-name">{{ template.name }}</strong>
            <span class="poster-card-note">4:5 竖版 · 标题与装饰都能改</span>
            <span class="poster-action">查看大图<ArrowRight :size="18" aria-hidden="true" /></span>
          </template>
        </button>
      </div>
      <p v-if="!compact" class="poster-note">预览使用你的照片、裁切与调色；首张照片做主角。确认应用后仍可修改文字、调整裁切，也能撤销回到原来的作品。</p>
    </template>
    <p v-else class="poster-empty" role="status">添加 1–20 张照片，即可查看保留全部照片的海报方案。</p>
  </section>
</template>

<style scoped>
.poster-gallery { min-width: 0; width: 100%; color: var(--ink); }
.poster-gallery *, .poster-gallery *::before, .poster-gallery *::after { box-sizing: border-box; }
.poster-heading { display: flex; flex-direction: column; gap: 8px; padding: 0 0 18px; }
.poster-heading > div { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.poster-eyebrow { align-self: flex-start; padding: 5px 9px; border-radius: 9px; background: var(--accent-soft); color: var(--accent); font-size: 11px; font-weight: 650; line-height: 1.5; }
.poster-heading strong { font-size: 21px; font-weight: 700; line-height: 1.4; letter-spacing: -.025em; overflow-wrap: anywhere; }
.poster-heading p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.poster-categories { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; padding: 0 0 18px; }
.poster-categories button { min-width: 44px; min-height: 44px; padding: 10px 15px; border: 0; border-radius: 14px; background: var(--control); color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; overflow-wrap: anywhere; }
.poster-categories button.active { background: var(--accent-soft); color: var(--accent); font-weight: 650; }
.poster-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(210px, 100%), 1fr)); align-items: start; gap: 16px; min-width: 0; }
.poster-card { display: flex; flex-direction: column; align-items: stretch; min-width: 0; min-height: 44px; padding: 8px; border: 1px solid var(--line); border-radius: 24px; color: inherit; background: var(--surface); text-align: left; font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.poster-preview { width: 100%; aspect-ratio: 4 / 5; overflow: hidden; border-radius: 17px; background: var(--control); }
.poster-card-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 7px; margin: 13px 5px 7px; }
.poster-style { color: var(--accent); font-size: 12px; font-weight: 650; line-height: 1.5; overflow-wrap: anywhere; }
.poster-count { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); line-height: 1.5; }
.poster-count svg { flex-shrink: 0; }
.poster-name { margin: 0 5px; font-size: 16px; font-weight: 650; line-height: 1.5; overflow-wrap: anywhere; }
.poster-card-note { margin: 6px 5px 12px; font-size: 11px; color: var(--muted); line-height: 1.6; }
.poster-action { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 44px; margin-top: auto; padding: 10px 12px; border-radius: 14px; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 650; line-height: 1.5; }
.poster-action svg { flex-shrink: 0; }
.poster-note, .poster-empty { margin: 18px 0 0; color: var(--muted); font-size: 12px; line-height: 1.8; }
.poster-empty { padding: 24px 18px; border: 1px solid var(--line); border-radius: 24px; background: var(--surface); text-align: center; }
.poster-categories button:focus-visible, .poster-card:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.is-embedded .poster-categories { padding-bottom: 10px; }
.is-compact .poster-cards { display: flex; align-items: stretch; gap: 10px; max-width: 100%; overflow-x: auto; padding: 4px 3px 6px; scroll-padding-inline: 4px; overscroll-behavior-x: contain; scroll-snap-type: x proximity; }
.is-compact .poster-card { flex: 0 0 144px; gap: 2px; min-height: 118px; padding: 4px; border-radius: 17px; scroll-snap-align: start; }
.is-compact .poster-preview { flex: none; width: 100%; height: 72px; aspect-ratio: auto; border-radius: 12px; }
.is-compact .poster-name { margin: 0 3px; font-size: 12px; line-height: 18px; text-align: center; }
.poster-compact-note { color: var(--muted); font-size: 10px; line-height: 14px; text-align: center; }
.is-compact .poster-empty { margin: 0; padding: 18px 12px; border-radius: 17px; }
@media (max-width: 540px) {
  .poster-heading strong { font-size: 19px; }
  .poster-categories { gap: 6px; }
  .poster-categories button { padding: 10px 12px; font-size: 12px; border-radius: 12px; }
  .poster-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .poster-card { padding: 7px; border-radius: 21px; }
  .poster-preview { border-radius: 15px; }
  .poster-card-heading { margin: 10px 3px 6px; gap: 5px; }
  .poster-style { font-size: 11px; }
  .poster-count { font-size: 10px; }
  .poster-name { margin-inline: 3px; font-size: 14px; }
  .poster-card-note { margin-inline: 3px; font-size: 10px; }
  .poster-action { padding-inline: 9px; font-size: 11px; border-radius: 12px; }
}
@media (hover: hover) { .poster-card:hover { border-color: var(--accent); } .poster-categories button:hover:not(.active) { color: var(--accent); } }
</style>
