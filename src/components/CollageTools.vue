<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, Crop, Plus, Sparkles } from 'lucide-vue-next';
import { recommendLayout } from '../catalog/layouts';
import { slotRect } from '../defaults';
import type { BackgroundSpec, CollageSlot, EditorDocument, FilterState, ImageElement, MediaAsset, Selection } from '../types';
import type { PanelAction, PanelName } from '../panel';
import LayoutGallery from './LayoutGallery.vue';
import CollageStyleGallery from './CollageStyleGallery.vue';
import PhotoSpacingControls from './PhotoSpacingControls.vue';
import PosterGallery from './PosterGallery.vue';
import PhotoFramePreview from './PhotoFramePreview.vue';
import { filterPresets } from '../catalog/photoStyles';
import ColorPicker from './ColorPicker.vue';

const props = defineProps<{ panel: PanelName; document: EditorDocument; assets: Record<string, MediaAsset>; selection: Selection }>();
const emit = defineEmits<{ action: [action: PanelAction]; managePhotos: []; crop: [target: Exclude<Selection, null>]; browse: [panel: 'layouts' | 'looks'] }>();
const lookTab = ref<'style' | 'tone'>('style');
const lookTabs = [{ id: 'style', label: '风格' }, { id: 'tone', label: '滤镜' }] as const;
const layoutTab = ref<'composition' | 'poster'>('composition');
const filterKeys: readonly (keyof FilterState)[] = ['brightness', 'contrast', 'saturation', 'blur', 'grayscale', 'sepia'];
const ratios = [
  { label: '1:1', name: '正方形', width: 1080, height: 1080 },
  { label: '4:5', name: '人像', width: 1080, height: 1350 },
  { label: '3:4', name: '竖版', width: 1080, height: 1440 },
  { label: '3:2', name: '横版', width: 1440, height: 960 },
  { label: '9:16', name: '全屏', width: 1080, height: 1920 },
];
const longImage = computed(() => props.document.mode === 'grid' && props.document.layoutId.startsWith('long-'));
const selectedFrame = computed(() => frames.value.find(frame => frame.target.kind === props.selection?.kind && frame.id === props.selection.id));

function photoFrame(photo: CollageSlot | ImageElement, kind: 'slot' | 'element', width: number, height: number, radius: number) {
  const asset = photo.assetId ? props.assets[photo.assetId] : undefined;
  const source = asset && asset.kind !== 'audio' ? asset.thumbnail || (asset.kind !== 'video' ? asset.src : '') : '';
  return {
    id: photo.id,
    target: { kind, id: photo.id } as Exclude<Selection, null>,
    asset,
    source,
    width,
    height,
    crop: photo.crop,
    filter: photo.filter,
    shape: photo.shape,
    cornerRadius: radius,
    borderWidth: 'type' in photo ? photo.borderWidth : 0,
    borderColor: 'type' in photo ? photo.borderColor : '#ffffff',
    shadow: 'type' in photo ? photo.shadow : 0,
    locked: 'locked' in photo && photo.locked,
  };
}
const frames = computed(() => {
  const doc = props.document;
  const slots = doc.mode === 'grid' ? doc.slots.map(slot => {
    const rect = slotRect(doc, slot);
    return photoFrame(slot, 'slot', rect.width, rect.height, doc.cornerRadius);
  }) : [];
  const images = doc.elements.flatMap(element => {
    if (element.type !== 'image') return [];
    const asset = props.assets[element.assetId];
    if (asset?.kind === 'sticker' || asset?.kind === 'audio') return [];
    return [photoFrame(element, 'element', element.width, element.height, element.cornerRadius)];
  });
  return [...slots, ...images];
});
const placedPhotos = computed(() => frames.value.filter(frame => frame.asset && frame.asset.kind !== 'sticker' && frame.asset.kind !== 'audio'));
const previewImages = computed(() => placedPhotos.value.map(frame => frame.source));
const previewPhotos = computed(() => placedPhotos.value.map(frame => ({
  source: frame.source, width: frame.asset!.width, height: frame.asset!.height, crop: frame.crop, filter: frame.filter, shape: frame.shape,
})));
const recommendation = computed(() => recommendLayout(placedPhotos.value.map(frame => frame.asset!), props.document));
const tonePhoto = computed(() => placedPhotos.value[0]);
const selectedTone = computed(() => filterPresets.find(preset => placedPhotos.value.length > 0 && placedPhotos.value.every(frame => filterKeys.every(key => frame.filter[key] === preset.filter[key])))?.label);

function patchBackground(patch: Partial<BackgroundSpec>, commit = true) {
  emit('action', { type: 'document', patch: { background: { ...props.document.background, ...patch } }, commit });
}
function choosePhoto(frame: typeof frames.value[number]) {
  if (frame.locked) return;
  emit('action', { type: 'selection', selection: frame.target });
  if (!frame.asset) emit('action', { type: 'replace' });
}
</script>

<template>
  <section class="collage-tools" :aria-label="panel === 'background' ? '画布设置' : '拼图工具'">
    <template v-if="panel === 'photos'">
      <div class="tool-row photo-toolbar">
        <span class="tool-note">{{ placedPhotos.length }} 张照片 · 点选照片，长按画布微调</span>
        <button type="button" class="tool-button manager-button" @click="emit('managePhotos')"><Plus :size="17" aria-hidden="true" />整理与添加照片</button>
      </div>
      <div class="photo-strip horizontal-strip" aria-label="已放入拼图的照片">
        <button
          v-for="(frame, index) in frames" :key="frame.id" type="button" class="photo-card"
          :class="{ selected: selection?.kind === frame.target.kind && selection.id === frame.id, empty: !frame.asset }"
          :disabled="frame.locked"
          :aria-pressed="selection?.kind === frame.target.kind && selection.id === frame.id"
          :aria-label="frame.asset ? `${index + 1}：${frame.asset.name}${frame.locked ? '，已锁定' : '，选择照片'}` : `空白照片格 ${index + 1}，添加照片`"
          @click="choosePhoto(frame)"
        >
          <span class="photo-well">
            <svg v-if="frame.source && frame.asset" :viewBox="`0 0 ${frame.width} ${frame.height}`" :style="{ width: `${Math.min(86, 76 * frame.width / frame.height)}px`, height: `${Math.min(76, 86 * frame.height / frame.width)}px` }" aria-hidden="true" focusable="false">
              <PhotoFramePreview :width="frame.width" :height="frame.height" :source="frame.source" :source-width="frame.asset.width" :source-height="frame.asset.height" :crop="frame.crop" :filter="frame.filter" :shape="frame.shape" :corner-radius="frame.cornerRadius" :photo-frame="document.photoFrame" :border-width="frame.borderWidth" :border-color="frame.borderColor" :shadow="frame.shadow" />
            </svg>
            <Plus v-else-if="!frame.asset" :size="24" aria-hidden="true" />
            <span v-else class="tool-note">视频</span>
            <span class="photo-number">{{ index + 1 }}</span>
          </span>
          <span class="photo-caption">{{ frame.locked ? '已锁定' : frame.asset ? selection?.id === frame.id ? '已选中' : '选择' : '添加照片' }}</span>
        </button>
        <button type="button" class="photo-card add-card" @click="emit('managePhotos')"><span class="photo-well"><Plus :size="24" aria-hidden="true" /></span><span class="photo-caption">添加照片</span></button>
      </div>
      <button v-if="selectedFrame?.asset && !selectedFrame.locked" type="button" class="tool-button photo-refine-button" @click="emit('crop', selectedFrame.target)"><Crop :size="16" aria-hidden="true" /><span>全屏精修所选照片</span></button>
    </template>

    <template v-else-if="panel === 'layouts'">
      <div class="layout-tabs" aria-label="布局类型">
        <button type="button" :aria-pressed="layoutTab === 'composition'" @click="layoutTab = 'composition'">构图</button>
        <button type="button" :aria-pressed="layoutTab === 'poster'" @click="layoutTab = 'poster'">照片海报</button>
      </div>
      <template v-if="layoutTab === 'composition'">
        <div class="tool-row layout-toolbar">
          <button type="button" class="tool-button recommend-button" :disabled="!recommendation" @click="recommendation && emit('action', { type: 'layout', layout: recommendation })"><Sparkles :size="16" aria-hidden="true" /><span>推荐布局</span></button>
          <button type="button" class="tool-button" aria-haspopup="dialog" @click="emit('browse', 'layouts')">全部版式</button>
        </div>
        <LayoutGallery compact :document="document" :assets="assets" :count="placedPhotos.length" :selected-id="document.mode === 'grid' ? document.layoutId : undefined" :preview-images="previewImages" :preview-photos="previewPhotos" :aspect-ratio="document.width / document.height" @select="layout => emit('action', { type: 'layout', layout })" />
      </template>
      <PosterGallery v-else :document="document" :assets="assets" @select="template => emit('action', { type: 'poster', template })" />
    </template>

    <template v-else-if="panel === 'looks'">
      <div class="look-tabs" aria-label="风格工具">
        <button v-for="tab in lookTabs" :key="tab.id" type="button" :aria-pressed="lookTab === tab.id" @click="lookTab = tab.id">{{ tab.label }}</button>
        <button type="button" class="browse-looks" aria-haspopup="dialog" @click="emit('browse', 'looks')">全部风格</button>
      </div>
      <template v-if="lookTab === 'style'">
        <CollageStyleGallery compact :document="document" :assets="assets" @select="look => emit('action', { type: 'look', look })" />
      </template>
      <template v-else-if="lookTab === 'tone'">
        <div class="tone-strip horizontal-strip" aria-label="应用到全部照片的滤镜">
          <button v-for="preset in filterPresets" :key="preset.label" type="button" class="tone-card" :class="{ selected: selectedTone === preset.label }" :aria-pressed="selectedTone === preset.label" :aria-label="`全部照片：${preset.label}`" :disabled="!tonePhoto" @click="emit('action', { type: 'tone', filter: { ...preset.filter } })">
            <span class="tone-well">
              <svg v-if="tonePhoto?.source && tonePhoto.asset" :viewBox="`0 0 ${tonePhoto.width} ${tonePhoto.height}`" :style="{ width: `${Math.min(86, 76 * tonePhoto.width / tonePhoto.height)}px`, height: `${Math.min(76, 86 * tonePhoto.height / tonePhoto.width)}px` }" aria-hidden="true" focusable="false">
                <PhotoFramePreview :width="tonePhoto.width" :height="tonePhoto.height" :source="tonePhoto.source" :source-width="tonePhoto.asset.width" :source-height="tonePhoto.asset.height" :crop="tonePhoto.crop" :filter="preset.filter" :shape="tonePhoto.shape" :corner-radius="tonePhoto.cornerRadius" :photo-frame="document.photoFrame" :border-width="tonePhoto.borderWidth" :border-color="tonePhoto.borderColor" :shadow="tonePhoto.shadow" />
              </svg>
            </span>
            <span class="photo-caption">{{ preset.label }}<Check v-if="selectedTone === preset.label" :size="14" aria-hidden="true" /></span>
          </button>
        </div>
      </template>
    </template>

    <template v-else-if="panel === 'spacing'">
      <PhotoSpacingControls :document="document" :assets="assets" @action="action => emit('action', action)" />
    </template>

    <template v-else-if="panel === 'background'">
      <div class="ratio-strip horizontal-strip" aria-label="画布比例">
        <button v-for="ratio in ratios" :key="ratio.label" type="button" class="ratio-button" :aria-label="`${ratio.name}画布 ${ratio.label}`" :aria-pressed="!longImage && Math.abs(document.width / document.height - ratio.width / ratio.height) < .001" :disabled="longImage" @click="emit('action', { type: 'document', patch: { width: ratio.width, height: ratio.height } })"><strong>{{ ratio.label }}</strong><span>{{ ratio.name }}</span></button>
      </div>
      <ColorPicker label="画布底色" :value="document.background.color" allow-transparent @input="value => patchBackground({ color: value }, false)" @commit="emit('action', { type: 'checkpoint' })" />
      <p v-if="longImage" class="inline-note">高度按照片比例自动计算，修改宽度时会一起调整。</p>
    </template>
  </section>
</template>

<style scoped>
.collage-tools { width: 100%; min-width: 0; min-height: 190px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; color: var(--ink); font-size: 13px; padding: 2px 2px 6px; }
.collage-tools button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: background .18s var(--ease-out), transform .18s var(--ease-out), box-shadow .18s var(--ease-out); }
.collage-tools button:active:not(:disabled) { transform: scale(.97); }
.collage-tools button:disabled { opacity: .45; cursor: not-allowed; }
.collage-tools button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.tool-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; flex-shrink: 0; }
.layout-toolbar { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }
.tool-note, .inline-note { color: var(--muted); font-size: 12px; line-height: 18px; }
.inline-note { margin: 0; flex-shrink: 0; }
.tool-button { min-width: 0; min-height: 44px; display: inline-flex; flex-direction: row; align-items: center; justify-content: center; gap: 7px; line-height: 1.5; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--control); color: var(--ink); white-space: normal; }
.tool-button svg, .layout-tabs svg { display: block; flex: 0 0 auto; }
.recommend-button { margin-left: 0; }
.layout-tabs { display: flex; gap: 3px; padding: 3px; border: 1px solid var(--line); border-radius: 14px; background: var(--control); flex-shrink: 0; }
.layout-tabs button { display: inline-flex; flex-direction: row; align-items: center; justify-content: center; gap: 6px; flex: 1; min-width: 0; min-height: 44px; padding: 8px 6px; border: 0; border-radius: 10px; background: transparent; white-space: normal; }
.layout-tabs button[aria-pressed="true"] { color: var(--accent); background: var(--surface); font-weight: 600; box-shadow: 0 1px 4px #2033290c; }
.photo-refine-button { width: 100%; }
.tool-button:hover { background: var(--control-hover); }
.manager-button { flex-shrink: 0; background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.horizontal-strip { display: flex; align-items: stretch; gap: 10px; overflow-x: auto; max-width: 100%; min-height: 0; flex-shrink: 0; padding: 3px 2px 7px; scroll-padding-inline: 4px; overscroll-behavior-x: contain; scroll-snap-type: x proximity; }
.photo-card, .tone-card { flex: 0 0 100px; display: flex; flex-direction: column; gap: 5px; min-height: 112px; padding: 6px; border: 0; border-radius: 17px; background: var(--surface); color: inherit; box-shadow: var(--shadow-card); scroll-snap-align: start; }
.photo-card:hover, .tone-card:hover { background: var(--control-hover); }
.photo-well, .tone-well { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 76px; flex-shrink: 0; border-radius: 12px; overflow: hidden; background: var(--control); }
.photo-well svg, .tone-well svg { display: block; flex: none; }
.photo-number { position: absolute; left: 4px; top: 4px; display: grid; place-items: center; min-width: 23px; height: 23px; padding: 0 4px; box-sizing: border-box; border-radius: 50%; background: var(--accent); color: white; font-size: 11px; font-weight: 600; }
.photo-caption { display: flex; align-items: center; justify-content: center; gap: 5px; min-height: 24px; line-height: 24px; font-size: 12px; }
.photo-card.selected, .tone-card.selected { box-shadow: inset 0 0 0 2px var(--accent); background: var(--accent-soft); color: var(--accent); }
.photo-card.empty, .add-card { background: var(--control); color: var(--muted); box-shadow: none; }
.look-tabs button { min-height: 44px; padding: 0 11px; border: 0; border-radius: 12px; background: transparent; color: inherit; }
.look-tabs button[aria-pressed="true"] { background: var(--surface-raised); color: var(--accent); box-shadow: var(--shadow-card); font-weight: 600; }
.look-tabs { display: flex; gap: 4px; min-height: 44px; padding: 3px; border-radius: 16px; background: var(--control); flex-shrink: 0; }
.look-tabs button { flex: 1; }
.look-tabs .browse-looks { background: var(--accent-soft); color: var(--accent); white-space: nowrap; }
.ratio-strip { flex-shrink: 0; padding-block: 3px; }
.ratio-button { flex: 1 0 64px; min-width: 44px; min-height: 58px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; padding: 8px; border: 0; border-radius: var(--radius-control); background: var(--control); color: inherit; }
.ratio-button strong { font-size: 13px; font-weight: 600; }
.ratio-button span { font-size: 11px; color: var(--muted); }
.ratio-button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); box-shadow: inset 0 0 0 2px var(--accent); }
@media (max-width: 480px) { .photo-toolbar { flex-direction: column; align-items: stretch; gap: 8px; } .photo-toolbar .manager-button { width: 100%; } }
@media (max-width: 360px) { .layout-tabs button { gap: 4px; padding-inline: 4px; font-size: 12px; } .layout-tabs svg { width: 14px; height: 14px; } }
@media (prefers-reduced-motion: reduce) { .collage-tools button { transition: none; } .collage-tools button:active { transform: none; } }
</style>
