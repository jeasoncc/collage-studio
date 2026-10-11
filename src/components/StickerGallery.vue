<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { getStickers, loadStickerCatalog, stickerCategories as categories } from '../catalog/stickers';
import type { StickerPreset } from '../types';

const emit = defineEmits<{ select: [sticker: StickerPreset] }>();
const query = ref('');
const category = ref('全部');
const visibleCount = ref(72);
const loaded = ref(false);
const loading = ref(true);
const error = ref('');
const matches = computed(() => loaded.value ? getStickers(query.value, category.value) : []);
const visible = computed(() => matches.value.slice(0, visibleCount.value));
watch([query, category], () => { visibleCount.value = 72; });
async function loadCatalog() {
  loading.value = true; error.value = '';
  try { await loadStickerCatalog(); loaded.value = true; }
  catch (failure) { error.value = failure instanceof Error ? failure.message : '贴纸素材读取失败。'; }
  finally { loading.value = false; }
}
onMounted(loadCatalog);
</script>

<template>
  <section class="sticker-gallery" aria-label="贴纸素材库">
    <label class="sticker-search">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
      <input v-model="query" type="search" placeholder="搜索贴纸，如爱心、猫、生日…" aria-label="搜索贴纸" autocomplete="off" enterkeyhint="search" />
    </label>
    <div v-if="categories.length" class="sticker-categories" aria-label="贴纸分类">
      <button v-for="item in categories" :key="item" type="button" :class="{ active: category === item }" :aria-pressed="category === item" @click="category = item">{{ item }}</button>
    </div>
    <div v-if="loading" class="sticker-status" role="status"><span class="loading-dot" />正在打开贴纸盒…</div>
    <div v-else-if="error" class="sticker-status" role="alert"><p>{{ error }}</p><button type="button" class="retry" @click="loadCatalog">重新加载</button></div>
    <template v-else>
      <div class="sticker-meta"><span>{{ category === '全部' ? '挑一张，让拼贴更有趣' : category }}</span><span>{{ matches.length }} 个贴纸</span></div>
      <div v-if="matches.length" class="sticker-results">
        <div class="sticker-grid">
          <button v-for="sticker in visible" :key="sticker.id" type="button" class="sticker-card" :title="sticker.name" :aria-label="`添加贴纸：${sticker.name}`" @click="emit('select', sticker)">
            <img :src="'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sticker.svg)" :alt="sticker.name" width="64" height="64" loading="lazy" />
            <span>{{ sticker.name.split(' / ')[0] }}</span>
          </button>
        </div>
        <button v-if="visibleCount < matches.length" type="button" class="load-more" @click="visibleCount += 72">再看看更多 <span>({{ matches.length - visibleCount }})</span></button>
      </div>
      <div v-else class="sticker-status"><p>没有找到“{{ query }}”相关贴纸</p><span>试试“花”“星星”，也支持英文名称搜索。</span><button type="button" class="retry" @click="query = ''; category = '全部'">查看全部贴纸</button></div>
      <p class="sticker-license">Fluent Emoji Flat · Microsoft · MIT 授权</p>
    </template>
  </section>
</template>

<style scoped>
.sticker-gallery { color: var(--ink); width: 100%; min-width: 0; }
.sticker-search { display: flex; align-items: center; gap: 10px; min-height: 48px; box-sizing: border-box; padding: 12px 15px; border: 0; border-radius: var(--radius-control); background: var(--control); color: var(--muted); }
.sticker-search:focus-within { outline: 2px solid var(--accent); outline-offset: 3px; }
.sticker-search input { flex: 1; width: 0; min-width: 0; font: inherit; font-size: 16px; line-height: 1.5; color: var(--ink); background: none; border: 0; outline: 0; }
.sticker-categories { display: flex; gap: 8px; overflow-x: auto; max-width: 100%; padding: 13px 3px 9px; scroll-padding-inline: 4px; overscroll-behavior-x: contain; scrollbar-width: thin; }
.sticker-categories button { flex: none; white-space: nowrap; min-width: 44px; min-height: 44px; border: 0; border-radius: 999px; padding: 10px 14px; font: inherit; font-size: 13px; color: var(--muted); background: var(--control); cursor: pointer; }
.sticker-categories button.active { background: var(--accent-soft); color: var(--accent); box-shadow: inset 0 0 0 2px var(--accent); font-weight: 600; }
.sticker-meta { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--muted); padding: 10px 0 14px; }
.sticker-results { max-height: min(490px,60dvh); overflow-y: auto; overscroll-behavior: contain; padding: 4px; scroll-padding-block: 8px; }
.sticker-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(75px,1fr)); gap: 10px; }
.sticker-card { min-width: 0; min-height: 44px; padding: 13px 6px 10px; display: flex; align-items: center; flex-direction: column; gap: 9px; border: 0; border-radius: 18px; background: var(--surface); box-shadow: var(--shadow-card); cursor: pointer; color: inherit; transition: background .18s var(--ease-out), transform .18s var(--ease-out); -webkit-tap-highlight-color: transparent; }
.sticker-card:hover { background: var(--accent-soft); }
.sticker-card:active, .sticker-categories button:active, .load-more:active, .retry:active { transform: scale(.96); }
.sticker-card img { object-fit: contain; width: 58px; height: 58px; max-width: 100%; }
.sticker-card span { font-size: 12px; max-width: 100%; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-align: center; line-height: 1.5; color: var(--ink); overflow-wrap: anywhere; }
.sticker-card:focus-visible, .sticker-categories button:focus-visible, .load-more:focus-visible, .retry:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.load-more, .retry { display: block; min-height: 44px; margin: 18px auto 6px; border: 0; border-radius: 999px; padding: 12px 22px; background: var(--accent-soft); color: var(--accent); font: inherit; font-size: 12px; cursor: pointer; }
.load-more span { color: var(--muted); }
.sticker-status { padding: 42px 12px; text-align: center; color: var(--muted); font-size: 13px; line-height: 1.7; }
.sticker-status>span { font-size: 12px; }
.sticker-license { text-align: center; font-size: 10px; color: var(--muted); opacity: .8; margin: 16px 0 0; }
.loading-dot { display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; background: var(--accent); animation: blink 1s ease-in-out infinite; }
@keyframes blink { 50% { opacity: .25; } }
@media (max-width: 400px) { .sticker-grid { grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; } .sticker-card img { width: 54px; height: 54px; } }
@media (prefers-reduced-motion: reduce) { .loading-dot { animation: none; } .sticker-card { transition: none; } .sticker-card:active, .sticker-categories button:active, .load-more:active, .retry:active { transform: none; } }
</style>
