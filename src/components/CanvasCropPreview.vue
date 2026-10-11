<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ width: number; height: number; ratio: number }>();
const window = computed(() => {
  const width = Math.min(props.width, props.height * props.ratio);
  const height = width / props.ratio;
  return { x: (props.width - width) / 2, y: (props.height - height) / 2, width, height };
});
const shade = computed(() => {
  const { x, y, width, height } = window.value;
  return `M0 0H${props.width}V${props.height}H0Z M${x} ${y}V${y + height}H${x + width}V${y}Z`;
});
</script>

<template>
  <svg class="canvas-crop-preview" :viewBox="`0 0 ${width} ${height}`" role="img" aria-label="微信居中裁切模拟，不影响导出">
    <path :d="shade" fill="#10251d" fill-rule="evenodd" opacity=".52" />
    <rect data-crop-window :x="window.x" :y="window.y" :width="window.width" :height="window.height" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="8 5" vector-effect="non-scaling-stroke" />
  </svg>
</template>

<style scoped>
.canvas-crop-preview { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
</style>
