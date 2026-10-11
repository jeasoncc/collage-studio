<script setup lang="ts">
import { Check, Image as ImageIcon, Film, Sparkles } from 'lucide-vue-next';
import type { MediaAsset } from '../types';
defineProps<{ assets: MediaAsset[]; selectedId?: string | null; label?: string }>();
const emit = defineEmits<{ select: [assetId: string] }>();
function mediaLabel(asset: MediaAsset) {
  return asset.kind === 'video' ? '视频' : asset.mime === 'image/gif' ? '动态 GIF' : asset.kind === 'sticker' ? '贴纸' : '照片';
}
</script>

<template>
  <div v-if="assets.length" class="media-grid" :aria-label="label || '本地照片与视频'">
    <button v-for="asset in assets" :key="asset.id" type="button" class="media-card" :class="{ selected: selectedId === asset.id }" :aria-pressed="selectedId === asset.id" :aria-label="`${label || '放入画布'}：${asset.name}（${mediaLabel(asset)}）`" @click="emit('select', asset.id)">
      <div class="media-thumb">
        <img v-if="asset.thumbnail || asset.kind !== 'video'" :src="asset.thumbnail || asset.src" :alt="asset.name" loading="lazy" />
        <video v-else :src="asset.src" muted playsinline preload="metadata" aria-hidden="true" />
        <span class="media-kind"><Film v-if="asset.kind === 'video'" :size="11" aria-hidden="true" /><Sparkles v-else-if="asset.mime === 'image/gif'" :size="11" aria-hidden="true" /><ImageIcon v-else :size="11" aria-hidden="true" />{{ mediaLabel(asset) }}</span>
        <span v-if="selectedId === asset.id" class="media-selected" aria-hidden="true"><Check :size="16" /></span>
      </div>
      <span class="media-name" :title="asset.name">{{ asset.name }}</span>
    </button>
  </div>
  <p v-else class="empty">还没有本地素材。上传照片、视频或动态 GIF 开始创作。</p>
</template>

<style scoped>
.media-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; min-width: 0; }
.media-card { display: grid; gap: 8px; min-width: 0; min-height: 44px; padding: 6px; border: 0; border-radius: 17px; background: var(--surface); color: var(--ink); box-shadow: var(--shadow-card); font: inherit; cursor: pointer; text-align: left; transition: background .18s var(--ease-out), transform .18s var(--ease-out); -webkit-tap-highlight-color: transparent; }
.media-card:hover { background: var(--control-hover); }
.media-card.selected { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent); }
.media-card:active { transform: scale(.97); }
.media-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.media-thumb { position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 12px; background: repeating-conic-gradient(var(--control) 0% 25%,var(--surface) 0% 50%) 0/12px 12px; }
.media-thumb img, .media-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
.media-kind { position: absolute; bottom: 5px; left: 5px; max-width: calc(100% - 10px); display: flex; align-items: center; gap: 4px; padding: 4px 6px; border-radius: 999px; background: var(--surface); color: var(--ink); font-size: 11px; white-space: nowrap; }
.media-selected { position: absolute; top: 5px; right: 5px; display: grid; place-items: center; width: 24px; height: 24px; border: 2px solid var(--surface); border-radius: 50%; background: var(--accent); color: white; }
.media-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 1.5; padding: 0 3px 3px; }
.empty { font-size: 12px; line-height: 1.8; color: var(--muted); padding: 22px 16px; background: var(--control); border-radius: var(--radius-card); }
@media (max-width: 380px) { .media-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (prefers-reduced-motion: reduce) { .media-card { transition: none; } .media-card:active { transform: none; } }
</style>
