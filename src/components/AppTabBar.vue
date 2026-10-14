<script setup lang="ts">
import { FolderOpen, House, LayoutTemplate } from 'lucide-vue-next';

const props = defineProps<{ active: 'home' | 'templates' | 'drafts' }>();
const emit = defineEmits<{ select: [tab: 'home' | 'templates' | 'drafts'] }>();
const tabs = [
  { id: 'home', label: '首页', icon: House },
  { id: 'templates', label: '模板', icon: LayoutTemplate },
  { id: 'drafts', label: '作品', icon: FolderOpen },
] as const;
</script>

<template>
  <nav class="app-tabbar" aria-label="手机主导航">
    <button v-for="tab in tabs" :key="tab.id" type="button" class="tabbar-item" :class="{ 'is-active': props.active === tab.id }" :aria-current="props.active === tab.id ? 'page' : undefined" :data-tab="tab.id" @click="emit('select', tab.id)">
      <span class="tabbar-icon"><component :is="tab.icon" :size="23" :stroke-width="1.9" aria-hidden="true" /></span>
      <span class="tabbar-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.app-tabbar { display: none; }
@media (max-width: 700px) {
  .app-tabbar { box-sizing: border-box; position: fixed; z-index: 30; left: 50%; bottom: calc(10px + env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; width: calc(100% - 24px); max-width: 460px; padding: 7px; border: 1px solid var(--line); border-radius: 24px; background: var(--surface); box-shadow: 0 8px 32px #24243a14; transform: translateX(-50%); }
  .tabbar-item { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; min-width: 44px; min-height: 60px; padding: 6px; border: 0; border-radius: 18px; background: transparent; color: var(--muted); font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .tabbar-item.is-active { background: var(--accent-soft); color: var(--accent); }
  .tabbar-item:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; }
  .tabbar-icon { display: grid; place-items: center; width: 28px; height: 28px; }
  .tabbar-label { font-size: 12px; line-height: 17px; font-weight: 650; }
}
@media (hover: hover) {
  .tabbar-item:hover:not(.is-active) { background: var(--control); color: var(--ink); }
}
@media (forced-colors: active) {
  .app-tabbar { border-color: CanvasText; background: Canvas; }
  .tabbar-item { color: CanvasText; }
  .tabbar-item.is-active { color: Highlight; outline: 2px solid Highlight; outline-offset: -3px; }
}
</style>
