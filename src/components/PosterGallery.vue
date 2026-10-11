<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowRight, Images } from 'lucide-vue-next';
import { photoPostersForCount } from '../catalog/photoPosters';
import { createCrop } from '../defaults';
import type { EditorDocument, MediaAsset, TemplatePreset } from '../types';
import TemplatePreview from './TemplatePreview.vue';

const props = defineProps<{ document: EditorDocument; assets: Record<string, MediaAsset> }>();
const emit = defineEmits<{ select: [template: TemplatePreset] }>();
const selectedCategory = ref('全部');
const photos = computed(() => {
  const sources = props.document.mode === 'grid'
    ? props.document.slots
    : props.document.elements.filter(element => element.type === 'image');
  return sources.flatMap(source => {
    const asset = source.assetId ? props.assets[source.assetId] : undefined;
    if (!asset || (asset.kind !== 'image' && asset.kind !== 'video')) return [];
    return [{ url: asset.kind === 'video' ? asset.thumbnail : asset.src, width: asset.width, height: asset.height, crop: source.crop, filter: source.filter }];
  }).map((photo, index) => index === 0 ? { ...photo, crop: createCrop() } : photo);
});
const presets = computed(() => photoPostersForCount(photos.value.length));
const categories = computed(() => ['全部', ...new Set(presets.value.map(preset => preset.category))]);
const cards = computed(() => presets.value.filter(preset => selectedCategory.value === '全部' || preset.category === selectedCategory.value));
</script>

<template>
  <section class="poster-gallery" aria-label="当前照片的海报方案">
    <header class="poster-heading">
      <div><span class="poster-eyebrow">照片连成故事，文字点亮主角</span><strong>{{ photos.length }} 张照片，一张完整作品</strong></div>
      <p>无缝拼接 · 中文封面 · 标题与装饰都能改</p>
    </header>
    <template v-if="presets.length">
      <div class="poster-categories" role="group" aria-label="海报风格分类">
        <button v-for="category in categories" :key="category" type="button" :class="{ active: selectedCategory === category }" :aria-pressed="selectedCategory === category" @click="selectedCategory = category">{{ category }}</button>
      </div>
      <div class="poster-cards" aria-label="左右滑动，预览不同海报设计">
        <button v-for="(template, index) in cards" :key="template.id" type="button" class="poster-card" :aria-label="`预览${template.category}海报：${template.name}，保留全部 ${photos.length} 张照片；确认后才会应用`" @click="emit('select', template)">
          <div class="poster-preview" :style="{ backgroundColor: template.background.color }">
            <TemplatePreview :template="template" :photos="photos" :eager="index === 0" />
          </div>
          <div class="poster-card-heading"><span class="poster-style">{{ template.category }}封面</span><span class="poster-count"><Images :size="14" aria-hidden="true" />全部 {{ photos.length }} 张</span></div>
          <strong class="poster-name">{{ template.name }}</strong>
          <span class="poster-card-note">4:5 竖版 · 照片铺满画面</span>
          <span class="poster-action">预览此方案<ArrowRight :size="18" aria-hidden="true" /></span>
        </button>
      </div>
      <p class="poster-note">用你的照片与调色预览，首张照片做主角，其余照片一张不落。先看大图、再确认应用；应用后可调整裁切与文字，也能一步撤回。</p>
    </template>
    <p v-else class="poster-empty" role="status">添加 1–20 张照片，即可查看保留全部照片的海报方案。</p>
  </section>
</template>

<style scoped>
.poster-gallery { min-width: 0; width: 100%; color: var(--ink); }
.poster-heading { display: flex; flex-direction: column; gap: 8px; padding: 2px 0 14px; }
.poster-heading > div { display: flex; flex-direction: column; gap: 6px; }
.poster-eyebrow { color: var(--muted); font-size: 12px; line-height: 1.6; }
.poster-heading strong { font-size: 18px; font-weight: 600; line-height: 1.5; }
.poster-heading p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
.poster-categories { display: flex; gap: 7px; overflow-x: auto; padding: 0 2px 15px; overscroll-behavior-x: contain; scrollbar-width: thin; }
.poster-categories button { flex-shrink: 0; min-height: 44px; padding: 10px 17px; border: 0; border-radius: 999px; background: var(--control); color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; }
.poster-categories button.active { background: var(--accent); color: white; font-weight: 600; }
.poster-cards { display: flex; gap: 14px; overflow-x: auto; padding: 3px 3px 15px; scroll-snap-type: x proximity; overscroll-behavior-x: contain; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
.poster-card { display: flex; flex-direction: column; align-items: stretch; flex: 0 0 min(246px, 84%); min-width: 0; padding: 8px; border: 1px solid var(--line); border-radius: 14px; color: inherit; background: var(--surface); text-align: left; font: inherit; cursor: pointer; scroll-snap-align: start; transition: background .18s, transform .18s; -webkit-tap-highlight-color: transparent; }
.poster-preview { width: 100%; aspect-ratio: 4 / 5; overflow: hidden; background: var(--control); }
.poster-card-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 15px 5px 8px; }
.poster-style { color: var(--accent); font-size: 12px; font-weight: 600; }
.poster-count { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); }
.poster-name { margin: 0 5px; font-size: 16px; font-weight: 600; line-height: 1.6; }
.poster-card-note { margin: 6px 5px 14px; font-size: 12px; color: var(--muted); line-height: 1.6; }
.poster-action { display: flex; justify-content: space-between; align-items: center; gap: 10px; min-height: 44px; padding: 11px 13px; border-radius: 9px; background: var(--control); color: var(--accent); font-size: 13px; font-weight: 600; }
.poster-note, .poster-empty { margin: 12px 0 0; color: var(--muted); font-size: 12px; line-height: 1.8; }
.poster-empty { padding: 22px 16px; background: var(--control); border-radius: 14px; text-align: center; }
.poster-categories button:focus-visible, .poster-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (hover: hover) { .poster-card:hover { background: var(--control-hover); } }
.poster-card:active { transform: scale(.985); }
@media (prefers-reduced-motion: reduce) { .poster-card { transition: none; } .poster-card:active { transform: none; } }
</style>
