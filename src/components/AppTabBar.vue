<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ active: 'home' | 'templates' | 'drafts' }>();
const emit = defineEmits<{ select: [tab: 'home' | 'templates' | 'drafts'] }>();
const tabs = [{ id: 'home', label: '拼图' }, { id: 'templates', label: '模板' }, { id: 'drafts', label: '作品' }] as const;
const activeIndex = computed(() => tabs.findIndex(tab => tab.id === props.active));
</script>

<template>
  <nav class="app-tabbar" aria-label="手机主导航" :style="{ '--tab-index': activeIndex }">
    <span class="tabbar-indicator" aria-hidden="true" />
    <button v-for="tab in tabs" :key="tab.id" type="button" class="tabbar-item" :class="{ 'is-active': active === tab.id }" :aria-current="active === tab.id ? 'page' : undefined" :data-tab="tab.id" @click="emit('select', tab.id)">
      <span class="tabbar-icon">
        <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <g v-if="tab.id === 'home'" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round">
            <rect class="icon-fill tile-one" x="3" y="3" width="9" height="9" rx="2.5" />
            <rect class="icon-fill tile-two" x="16" y="3" width="9" height="9" rx="2.5" />
            <rect class="icon-fill tile-three" x="3" y="16" width="9" height="9" rx="2.5" />
            <rect class="icon-fill tile-four" x="16" y="16" width="9" height="9" rx="2.5" />
          </g>
          <g v-else-if="tab.id === 'templates'" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">
            <path class="icon-back-sheet" d="M6 20 3.4 7.9a2.4 2.4 0 0 1 1.8-2.8l13.5-2.8a2.4 2.4 0 0 1 2.8 1.8" />
            <rect class="icon-fill icon-front-sheet" x="7" y="7" width="18" height="18" rx="3.2" />
            <path class="icon-photo-line" d="m10 21 4-5 3 3 2-3 3 5M11 11h.01" />
          </g>
          <g v-else stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">
            <path class="icon-back-sheet" d="M7 5h14M9 2h10" />
            <rect class="icon-fill icon-front-sheet" x="3" y="8" width="22" height="17" rx="3.5" />
            <path class="icon-photo-line" d="m7 21 4-4 3 3 4-6 3 7M8 12h.01" />
          </g>
        </svg>
      </span>
      <span class="tabbar-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.app-tabbar { display: none; }
@media (max-width: 700px) {
  .app-tabbar { position: fixed; z-index: 30; left: 50%; bottom: calc(12px + env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: calc(100% - 28px); max-width: 430px; padding: 6px; border: 1px solid #ffffffc9; border-radius: 28px; background: #f7f8f4e8; box-shadow: 0 12px 36px #1b352a1c, 0 2px 6px #1b352a08, inset 0 1px 0 #fff; backdrop-filter: blur(22px) saturate(1.25); -webkit-backdrop-filter: blur(22px) saturate(1.25); transform: translateX(-50%); isolation: isolate; }
  .tabbar-indicator { position: absolute; z-index: -1; left: 6px; top: 6px; width: calc((100% - 12px) / 3); height: calc(100% - 12px); border-radius: 22px; background: var(--surface); box-shadow: 0 3px 12px #1b352a0d, inset 0 0 0 1px #ffffffd9; transform: translateX(calc(var(--tab-index) * 100%)); transition: transform .38s var(--ease-spring); will-change: transform; }
  .tabbar-item { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-width: 44px; min-height: 62px; padding: 7px 4px 6px; border: 0; border-radius: 22px; background: transparent; color: var(--muted); cursor: pointer; transition: color .24s ease, transform .15s var(--ease-out); }
  .tabbar-item.is-active { color: var(--accent); }
  .tabbar-item:active { transform: scale(.91); }
  .tabbar-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
  .tabbar-icon { width: 29px; height: 29px; transform: translateY(1px) scale(.94); transition: transform .38s var(--ease-spring); }
  .tabbar-icon svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .is-active .tabbar-icon { transform: translateY(-1px) scale(1); }
  .icon-fill { fill: currentColor; fill-opacity: 0; transition: fill-opacity .24s ease, transform .38s var(--ease-spring); transform-box: fill-box; transform-origin: center; }
  .is-active .icon-fill { fill-opacity: 1; }
  .is-active .tile-one { transform: rotate(-7deg) translate(-.4px, -.4px); }
  .is-active .tile-four { transform: rotate(7deg) translate(.4px, .4px); }
  .icon-back-sheet { opacity: .65; transition: transform .38s var(--ease-spring), opacity .24s ease; }
  .is-active .icon-back-sheet { opacity: .8; transform: translateY(-1px); }
  .icon-photo-line { transition: stroke .24s ease; }
  .is-active .icon-photo-line { stroke: var(--surface); }
  .tabbar-label { font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: .4px; }
}
@media (prefers-reduced-motion: reduce) {
  .tabbar-indicator, .tabbar-item, .tabbar-icon, .icon-fill, .icon-back-sheet, .icon-photo-line, .tabbar-label { transition: none; }
  .tabbar-item:active { transform: none; }
}
@media (forced-colors: active) {
  .app-tabbar { border-color: CanvasText; background: Canvas; }
  .tabbar-item { color: CanvasText; }
  .tabbar-item.is-active { color: Highlight; outline: 2px solid Highlight; outline-offset: -3px; }
  .tabbar-indicator { display: none; }
}
</style>
