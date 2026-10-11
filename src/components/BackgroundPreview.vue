<script setup lang="ts">
import { computed, useId } from 'vue';
import { createCrop } from '../defaults';
import type { EditorDocument, MediaAsset } from '../types';
import { imageGeometry } from './canvasGeometry';

const props = defineProps<{ document: Pick<EditorDocument, 'width' | 'height' | 'background'>; asset?: MediaAsset }>();
const id = useId();
const spacing = computed(() => Math.max(20, Math.min(props.document.width, props.document.height) / 28));
const pattern = computed(() => props.document.background.pattern);
const source = computed(() => props.asset && props.asset.kind !== 'audio' ? props.asset.thumbnail || (props.asset.kind === 'video' ? '' : props.asset.src) : '');
const geometry = computed(() => props.asset && source.value ? imageGeometry(props.document.width, props.document.height, props.asset.width, props.asset.height, createCrop()) : undefined);
</script>

<template>
  <g>
    <defs>
      <clipPath :id="`${id}-canvas`"><rect :width="document.width" :height="document.height" /></clipPath>
      <pattern v-if="pattern !== 'none'" :id="`${id}-pattern`" :width="pattern === 'checker' ? spacing * 2 : spacing" :height="pattern === 'checker' ? spacing * 2 : spacing" patternUnits="userSpaceOnUse" :patternTransform="pattern === 'stripes' ? `translate(${-document.height % spacing} 0)` : undefined">
        <circle v-if="pattern === 'paper' || pattern === 'dots'" :cx="spacing / 2" :cy="spacing / 2" :r="pattern === 'paper' ? .75 : 2" :fill="document.background.patternColor" :opacity="pattern === 'paper' ? .5 : .7" />
        <path v-else-if="pattern === 'checker'" :d="`M 0 0 h ${spacing} v ${spacing} H 0 Z M ${spacing} ${spacing} h ${spacing} v ${spacing} h ${-spacing} Z`" :fill="document.background.patternColor" opacity=".35" />
        <path v-else-if="pattern === 'stripes'" :d="`M ${-spacing} 0 l ${spacing} ${spacing} M 0 0 l ${spacing} ${spacing} M ${spacing} 0 l ${spacing} ${spacing}`" :stroke="document.background.patternColor" stroke-width="5" opacity=".4" />
        <path v-else :d="pattern === 'grid' ? `M 0 0 V ${spacing} M 0 0 H ${spacing}` : `M 0 0 V ${spacing}`" :stroke="document.background.patternColor" stroke-width="1" opacity=".4" />
      </pattern>
    </defs>
    <rect :width="document.width" :height="document.height" :fill="document.background.color" />
    <g v-if="geometry" :clip-path="`url(#${id}-canvas)`">
      <image :href="source" :x="-geometry.offsetX" :y="-geometry.offsetY" :width="geometry.width" :height="geometry.height" preserveAspectRatio="none" :transform="`translate(${geometry.x} ${geometry.y})`" />
    </g>
    <rect v-if="pattern !== 'none'" :width="document.width" :height="document.height" :fill="`url(#${id}-pattern)`" />
  </g>
</template>
