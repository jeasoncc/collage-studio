<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { collageLookDocument, collageLooks, matchingCollageLook } from '../catalog/looks';
import type { CollageLook } from '../catalog/looks';
import { createPhotoFrame, slotRect } from '../defaults';
import type { CropState, EditorDocument, FilterState, ImageShape, MediaAsset, PhotoFrameSpec } from '../types';
import PhotoFramePreview from './PhotoFramePreview.vue';
import BackgroundPreview from './BackgroundPreview.vue';

const props = withDefaults(defineProps<{ document: EditorDocument; assets: Record<string, MediaAsset>; compact?: boolean }>(), { compact: false });
const emit = defineEmits<{ select: [look: CollageLook] }>();
const galleryId = useId();
const category = ref<'all' | CollageLook['category']>('all');
const categories: { id: 'all' | CollageLook['category']; label: string }[] = [
  { id: 'all', label: '全部风格' },
  { id: 'gallery', label: '画廊留白' },
  { id: 'paper', label: '纸质印片' },
  { id: 'film', label: '胶片相册' },
];
const plainFrame = createPhotoFrame();
const selectedId = computed(() => matchingCollageLook(props.document, props.assets)?.id);
const compositionHint = computed(() => props.document.mode === 'free'
  ? '保留照片位置、大小与旋转，只换衬底和相框。'
  : props.document.layoutId.startsWith('long-')
    ? '按原照片比例重新计算长拼高度，保留照片顺序与裁剪。'
    : '保留当前版式与裁剪，用留白和实体相框呈现照片。');

interface PreviewFrame {
  id: string;
  assetId: string | null;
  rect: { x: number; y: number; width: number; height: number };
  rotation: number;
  opacity: number;
  crop: CropState;
  filter: FilterState;
  shape: ImageShape;
  cornerRadius: number;
  photoFrame: PhotoFrameSpec;
  borderWidth: number;
  shadow: number;
  borderColor: string;
}

const cards = computed(() => collageLooks.map(look => {
  const id = `${galleryId}-${look.id}`;
  try {
    const document = collageLookDocument(props.document, look, props.assets);
    const frames: PreviewFrame[] = document.mode === 'grid' ? document.slots.map(slot => ({
      id: slot.id, assetId: slot.assetId, rect: slotRect(document, slot), rotation: 0, opacity: 1,
      crop: slot.crop, filter: slot.filter, shape: slot.shape, cornerRadius: document.cornerRadius,
      photoFrame: document.photoFrame, borderWidth: 0, borderColor: '#ffffff', shadow: 0,
    })) : [];
    for (const element of document.elements) {
      if (element.type !== 'image' || !element.visible) continue;
      const asset = props.assets[element.assetId];
      frames.push({
        id: element.id, assetId: element.assetId || null,
        rect: { x: element.x, y: element.y, width: element.width, height: element.height },
        rotation: element.rotation, opacity: element.opacity, crop: element.crop, filter: element.filter,
        shape: element.shape, cornerRadius: element.cornerRadius,
        photoFrame: asset?.kind === 'sticker' ? plainFrame : document.photoFrame,
        borderWidth: element.borderWidth, borderColor: element.borderColor, shadow: element.shadow,
      });
    }
    let unavailable = 0;
    const photos = frames.map(frame => {
      const asset = frame.assetId ? props.assets[frame.assetId] : undefined;
      const source = asset && asset.kind !== 'audio'
        ? asset.thumbnail || (asset.kind === 'video' ? '' : asset.src) : '';
      if (frame.assetId && !source) unavailable++;
      return {
        ...frame, source, sourceWidth: asset?.width, sourceHeight: asset?.height,
        transform: `translate(${frame.rect.x} ${frame.rect.y}) rotate(${frame.rotation} ${frame.rect.width / 2} ${frame.rect.height / 2})`,
      };
    });
    return {
      id, look, document, frames: photos,
      error: '', notice: unavailable ? `${unavailable} 张素材暂不可预览，请检查素材或视频缩略图。` : '',
    };
  } catch (error) {
    return {
      id, look, document: undefined, frames: [],
      error: error instanceof Error ? error.message : '无法生成此风格预览。', notice: '',
    };
  }
}));
const visibleCards = computed(() => props.compact || category.value === 'all'
  ? cards.value : cards.value.filter(card => card.look.category === category.value));
</script>

<template>
  <section class="collage-style-gallery" :class="{ 'is-compact': compact }" aria-label="照片拼贴风格">
    <header v-if="!compact" class="style-heading">
      <div>
        <h3>把照片变成值得收藏的印片</h3>
        <p>{{ compositionHint }}</p>
      </div>
      <span class="style-count">{{ collageLooks.length }} 种风格</span>
    </header>
    <div v-if="!compact" class="style-categories" role="group" aria-label="风格分类">
      <button v-for="item in categories" :key="item.id" type="button" :class="{ 'is-active': category === item.id }" :aria-pressed="category === item.id" @click="category = item.id">{{ item.label }}</button>
    </div>
    <div class="style-options">
      <button
        v-for="card in visibleCards"
        :key="card.look.id"
        type="button"
        class="style-card"
        :class="{ 'is-selected': selectedId === card.look.id }"
        :aria-pressed="selectedId === card.look.id"
        :aria-label="`应用${card.look.name}：${card.look.description}${card.notice ? `。${card.notice}` : ''}${card.error ? `。${card.error}` : ''}`"
        :disabled="!!card.error"
        @click="emit('select', card.look)"
      >
        <span class="style-preview-well">
          <svg v-if="card.document" class="style-preview" :viewBox="`0 0 ${card.document.width} ${card.document.height}`" aria-hidden="true" focusable="false">
            <defs>
              <clipPath :id="`${card.id}-canvas`"><rect :width="card.document.width" :height="card.document.height" /></clipPath>
            </defs>
            <g :clip-path="`url(#${card.id}-canvas)`">
              <BackgroundPreview :document="card.document" />
              <g v-for="frame in card.frames" :key="frame.id" :transform="frame.transform" :opacity="frame.opacity">
                <PhotoFramePreview
                  :width="frame.rect.width" :height="frame.rect.height"
                  :source="frame.source" :source-width="frame.sourceWidth" :source-height="frame.sourceHeight"
                  :crop="frame.crop" :filter="frame.filter" :photo-frame="frame.photoFrame"
                  :shape="frame.shape" :corner-radius="frame.cornerRadius"
                  :border-width="frame.borderWidth" :border-color="frame.borderColor" :shadow="frame.shadow"
                />
              </g>
            </g>
          </svg>
          <span v-else class="style-preview-error">{{ card.error }}</span>
          <span v-if="selectedId === card.look.id" class="style-selected-mark" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none"><path d="m3.5 8 3 3 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span v-if="compact && card.notice" class="style-media-warning" aria-hidden="true">素材待就绪</span>
        </span>
        <span class="style-card-copy">
          <span class="style-name">{{ card.look.name }}</span>
          <span class="style-description">{{ card.look.description }}</span>
          <span v-if="card.notice" class="style-preview-notice">{{ card.notice }}</span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.collage-style-gallery { width: 100%; min-width: 0; color: var(--ink); }
.style-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px 14px; flex-wrap: wrap; margin-bottom: 18px; }
.style-heading h3 { margin: 0 0 7px; font-size: 18px; font-weight: 600; line-height: 1.5; letter-spacing: -.02em; }
.style-heading p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
.style-count { flex-shrink: 0; padding-top: 5px; color: var(--muted); font-size: 11px; line-height: 1.5; }
.style-categories { display: flex; gap: 8px; max-width: 100%; overflow-x: auto; margin-bottom: 18px; padding: 4px 3px; scroll-padding-inline: 4px; overscroll-behavior-x: contain; }
.style-categories button { flex: none; min-width: 44px; min-height: 44px; padding: 0 15px; border: 0; border-radius: 999px; background: var(--control); color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; }
.style-categories button.is-active { background: var(--accent-soft); color: var(--accent); box-shadow: inset 0 0 0 2px var(--accent); font-weight: 600; }
.style-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.style-card { min-width: 0; min-height: 44px; display: flex; flex-direction: column; padding: 9px; overflow: hidden; border: 0; border-radius: var(--radius-card); background: var(--surface); color: inherit; text-align: left; font: inherit; cursor: pointer; box-shadow: var(--shadow-card); transition: background .18s var(--ease-out), box-shadow .18s var(--ease-out), transform .18s var(--ease-out); -webkit-tap-highlight-color: transparent; }
.style-preview-well { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: clamp(210px, 32vw, 300px); padding: 14px; box-sizing: border-box; border-radius: 16px; background: var(--control); }
.style-preview { display: block; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 2px 4px #20332914); }
.style-selected-mark { position: absolute; right: 8px; bottom: 8px; display: grid; place-items: center; width: 27px; height: 27px; border: 2px solid var(--surface); border-radius: 50%; background: var(--accent); color: white; box-shadow: var(--shadow-card); }
.style-selected-mark svg { width: 15px; height: 15px; }
.style-card-copy { display: flex; flex-direction: column; gap: 5px; min-width: 0; padding: 13px 5px 6px; }
.style-name { font-size: 14px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.style-description { color: var(--muted); font-size: 12px; line-height: 1.7; }
.style-preview-error, .style-preview-notice { color: #856240; font-size: 11px; line-height: 1.6; }
.style-preview-error { padding: 10px; }
.style-media-warning { position: absolute; left: 3px; bottom: 3px; padding: 3px 6px; border-radius: 999px; background: #fff8e9; color: #856240; font-size: 9px; }
.style-card.is-selected { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); }
.style-card:disabled { cursor: not-allowed; opacity: .5; }
.style-card:focus-visible, .style-categories button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.style-card:active:not(:disabled), .style-categories button:active { transform: scale(.98); }
@media (hover: hover) { .style-card:hover:not(:disabled) { background: var(--control-hover); } }
.is-compact .style-options { display: flex; gap: 10px; max-width: 100%; overflow-x: auto; padding: 4px 3px 8px; scroll-padding-inline: 4px; overscroll-behavior-x: contain; scroll-snap-type: x proximity; }
.is-compact .style-card { flex: 0 0 132px; padding: 6px; min-height: 108px; border-radius: 17px; scroll-snap-align: start; }
.is-compact .style-preview-well { height: 68px; padding: 3px; border-radius: 12px; }
.is-compact .style-card-copy { padding: 6px 3px 0; min-height: 24px; gap: 0; }
.is-compact .style-name { font-size: 12px; line-height: 24px; }
.is-compact .style-description, .is-compact .style-preview-notice { display: none; }
.is-compact .style-selected-mark { right: 3px; bottom: 3px; width: 21px; height: 21px; }
.is-compact .style-selected-mark svg { width: 12px; height: 12px; }
@media (max-width: 480px) { .style-heading h3 { font-size: 16px; } .style-options { gap: 10px; } .style-card { padding: 7px; } .style-preview-well { height: 210px; padding: 9px; } .style-card-copy { padding: 10px 4px 4px; } .style-name { font-size: 13px; } .style-description { font-size: 11px; } }
@media (prefers-reduced-motion: reduce) { .style-card { transition: none; } .style-card:active:not(:disabled), .style-categories button:active { transform: none; } }
</style>
