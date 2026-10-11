<script setup lang="ts">
import { computed, useId } from 'vue';
import type { CropState, FilterState, ImageShape, PhotoFrameSpec } from '../types';
import { createCrop, createFilter, createPhotoFrame } from '../defaults';
import { imageGeometry, shapePath } from './canvasGeometry';
import { filmPerforationPath, photoFrameGeometry } from './photoFrameGeometry';
import { filterCss } from '../catalog/photoStyles';

const props = withDefaults(defineProps<{
  width: number;
  height: number;
  source?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  crop?: CropState;
  filter?: FilterState;
  photoFrame?: PhotoFrameSpec;
  shape?: ImageShape;
  cornerRadius?: number;
  shadow?: number;
  borderWidth?: number;
  borderColor?: string;
}>(), { source: '', crop: createCrop, filter: createFilter, photoFrame: createPhotoFrame, shape: 'rect', cornerRadius: 0, shadow: 0, borderWidth: 0, borderColor: '#ffffff' });
const id = useId();
const content = computed(() => {
  const frame = photoFrameGeometry(props.width, props.height, props.photoFrame, props.sourceWidth, props.sourceHeight);
  frame.shadow = Math.max(frame.shadow, props.shadow);
  return frame;
});
const geometry = computed(() => props.sourceWidth && props.sourceHeight ? imageGeometry(content.value.width, content.value.height, props.sourceWidth, props.sourceHeight, props.crop) : undefined);
const contentPath = computed(() => shapePath(props.shape, content.value.width, content.value.height, Math.max(0, props.cornerRadius - content.value.inset)));
const outerPath = computed(() => shapePath(props.photoFrame.kind === 'none' ? props.shape : 'rect', content.value.outerWidth, content.value.outerHeight, props.cornerRadius));
const perforations = computed(() => props.photoFrame.kind === 'film' ? filmPerforationPath(content.value.outerWidth, content.value.outerHeight, content.value.inset) : '');
const tone = computed(() => filterCss(props.filter));
</script>

<template>
  <g>
    <defs>
      <clipPath :id="`${id}-photo`" clipPathUnits="userSpaceOnUse"><path :d="contentPath" /></clipPath>
      <filter v-if="content.shadow" :id="`${id}-shadow`" x="-30%" y="-30%" width="160%" height="180%" color-interpolation-filters="sRGB">
        <feDropShadow dx="0" :dy="content.shadow * .32" :stdDeviation="content.shadow / 2" flood-color="#17211c" flood-opacity=".22" />
      </filter>
    </defs>
    <g :transform="`translate(${content.outerX} ${content.outerY})`">
      <path v-if="photoFrame.kind !== 'none' || content.shadow" :d="outerPath" :fill="photoFrame.color" :filter="content.shadow ? `url(#${id}-shadow)` : undefined" />
      <path v-if="perforations" :d="perforations" fill="#d4b47b" opacity=".85" />
    </g>
    <g :transform="`translate(${content.x} ${content.y})`">
      <path v-if="!source" :d="contentPath" fill="#dce4de" />
      <g v-if="source" :clip-path="`url(#${id}-photo)`">
        <image v-if="geometry" :href="source" :style="{ filter: tone }" :x="-geometry.offsetX" :y="-geometry.offsetY" :width="geometry.width" :height="geometry.height" preserveAspectRatio="none" :transform="`translate(${geometry.x} ${geometry.y}) rotate(${geometry.rotation}) scale(${geometry.scaleX} ${geometry.scaleY})`" />
        <image v-else :href="source" :style="{ filter: tone }" :width="content.width" :height="content.height" preserveAspectRatio="xMidYMid slice" />
      </g>
      <path v-if="borderWidth" :d="contentPath" fill="none" :stroke="borderColor" :stroke-width="borderWidth" />
    </g>
  </g>
</template>
