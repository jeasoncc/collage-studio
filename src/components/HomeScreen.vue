<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, ChevronRight, Grid2X2, Plus, ShieldCheck } from 'lucide-vue-next';
import { templates, chineseFestivals } from '../catalog/templates';
import { photoPostersForCount } from '../catalog/photoPosters';
import type { TemplatePreset } from '../types';
import TemplatePreview from './TemplatePreview.vue';
import PrivacyPolicy from './PrivacyPolicy.vue';

const props = defineProps<{
  photos: readonly { name: string; label: string; url: string; source: string }[];
  disabled: boolean;
  exampleLoading: boolean;
  registrationNumber: string | null;
}>();
const emit = defineEmits<{
  start: [];
  sample: [];
  browse: [query?: string];
  preview: [template: TemplatePreset, event: MouseEvent];
}>();

const privacyOpen = defineModel<boolean>('privacyOpen', { default: false });
const heroPhotos = computed(() => props.photos.slice(0, 3));
const inspiration = photoPostersForCount(3).slice(0, 4);
const holidayCards = computed(() => {
  const featured = ['spring-festival', 'mid-autumn', 'national-day'];
  return featured.flatMap(id => {
    const festival = chineseFestivals.find(item => item.id === id);
    if (!festival) return [];
    const template = templates.find(item => festival.templateIds.includes(item.id));
    return template ? [{ festival, template }] : [];
  });
});
</script>

<template>
  <div class="home-screen">
    <header class="home-heading">
      <div><span class="home-eyebrow">你的口袋拼图工作室</span><h1 id="home-title">今天，拼点喜欢的。</h1></div>
      <span class="home-device-note"><ShieldCheck :size="16" aria-hidden="true" />照片留在本机</span>
    </header>

    <section class="home-workspace" aria-labelledby="home-title">
      <div class="home-create">
        <button type="button" class="home-start" :disabled="disabled" @click="emit('start')">
          <span class="home-start-icon"><Grid2X2 :size="34" aria-hidden="true" /></span>
          <span class="home-start-copy"><strong>开始拼图</strong><small>选好照片，再挑喜欢的排版</small></span>
          <span class="home-start-plus"><Plus :size="24" aria-hidden="true" /></span>
        </button>
        <p class="home-create-note">支持 1–20 张照片 · 排版、文字和裁切都能改</p>
      </div>
      <button type="button" class="home-sample" :disabled="disabled || exampleLoading" :aria-busy="exampleLoading" @click="emit('sample')">
        <span v-if="heroPhotos.length" class="home-sample-photos" :class="`photo-count-${heroPhotos.length}`"><img v-for="photo in heroPhotos" :key="photo.name" :src="photo.url" :alt="photo.label" decoding="async" /></span>
        <span class="home-sample-copy"><span><small>用真实照片试一试</small><strong>{{ exampleLoading ? '正在打开示例…' : '山海照片，拼一张看看' }}</strong></span><span class="home-sample-arrow"><ArrowRight :size="21" aria-hidden="true" /></span></span>
      </button>
    </section>


    <div class="home-discovery">
      <section v-if="inspiration.length" class="home-section home-inspiration" aria-labelledby="home-inspiration-title">
        <header class="home-section-heading"><div><h2 id="home-inspiration-title">挑个喜欢的排版</h2><p>先看效果，再换成你的照片</p></div><button type="button" class="home-section-link" :disabled="disabled" @click="emit('browse')">全部模板<ChevronRight :size="17" aria-hidden="true" /></button></header>
        <div class="home-inspiration-grid">
          <button v-for="template in inspiration" :key="template.id" type="button" class="home-template" :disabled="disabled" :aria-label="`预览模板：${template.name}`" aria-haspopup="dialog" @click="emit('preview', template, $event)">
            <span class="home-template-art" :style="{ backgroundColor: template.background.color, aspectRatio: `${template.width} / ${template.height}` }"><TemplatePreview :template="template" /></span>
            <span class="home-template-caption"><strong>{{ template.name }}</strong><span>{{ template.category }}<ArrowRight :size="16" aria-hidden="true" /></span></span>
          </button>
        </div>
      </section>

      <section v-if="holidayCards.length" class="home-section home-festivals" aria-labelledby="home-festivals-title">
        <header class="home-section-heading"><div><h2 id="home-festivals-title">给节日留张照片</h2><p>相聚的日子，值得好好记录</p></div><button type="button" class="home-section-link" :disabled="disabled" @click="emit('browse', '节日')">全部节日<ChevronRight :size="17" aria-hidden="true" /></button></header>
        <div class="home-holiday-grid">
          <article v-for="{ festival, template } in holidayCards" :key="festival.id" class="home-holiday">
            <button type="button" class="home-holiday-preview" :disabled="disabled" :aria-label="`预览${festival.label}模板：${template.name}`" aria-haspopup="dialog" :style="{ backgroundColor: template.background.color, aspectRatio: `${template.width} / ${template.height}` }" @click="emit('preview', template, $event)"><TemplatePreview :template="template" /></button>
            <button type="button" class="home-holiday-topic" :disabled="disabled" :aria-label="`浏览${festival.label}模板`" @click="emit('browse', festival.label)"><strong>{{ festival.label }}</strong><ChevronRight :size="17" aria-hidden="true" /></button>
          </article>
        </div>
      </section>
    </div>

    <footer class="home-footer">
      <p><ShieldCheck :size="17" aria-hidden="true" /><span>照片不上传 · 作品保存在当前设备</span></p>
      <div class="home-footer-links">
        <button type="button" class="home-privacy-link" :disabled="disabled" aria-haspopup="dialog" :aria-expanded="privacyOpen" @click="privacyOpen = true">隐私政策</button>
        <a v-if="registrationNumber" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{{ registrationNumber }}</a>
      </div>
    </footer>
    <PrivacyPolicy v-model:open="privacyOpen" />
  </div>
</template>

<style scoped>
.home-screen { width: 100%; min-width: 0; color: var(--ink); }
.home-screen *, .home-screen *::before, .home-screen *::after { box-sizing: border-box; }
.home-screen button { min-width: 0; min-height: 44px; font: inherit; color: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.home-screen button:disabled { cursor: not-allowed; opacity: .45; }
.home-screen button:focus-visible, .home-screen a:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.home-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
.home-heading > div { min-width: 0; }
.home-eyebrow { display: block; margin-bottom: 7px; color: var(--muted); font-size: 13px; line-height: 1.5; }
.home-heading h1 { margin: 0; font-size: clamp(26px, 3vw, 34px); font-weight: 700; letter-spacing: -.045em; line-height: 1.35; overflow-wrap: anywhere; }
.home-device-note { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; color: var(--muted); font-size: 12px; }
.home-workspace { display: grid; grid-template-columns: 1.15fr 1fr; align-items: stretch; gap: 20px; }
.home-create { display: flex; flex-direction: column; min-width: 0; gap: 12px; }
.home-start { display: flex; align-items: center; gap: 18px; flex: 1; width: 100%; padding: 26px 24px; border: 0; border-radius: 24px; background: var(--accent); color: white !important; text-align: left; }
.home-start-icon { display: grid; place-items: center; flex-shrink: 0; width: 62px; height: 62px; border-radius: 19px; background: #ffffff26; }
.home-start-copy { flex: 1; min-width: 0; }
.home-start-copy strong { display: block; font-size: 24px; font-weight: 700; line-height: 1.35; }
.home-start-copy small { display: block; margin-top: 8px; font-size: 13px; line-height: 1.5; color: #ffffffd9; }
.home-start-plus { display: grid; place-items: center; flex-shrink: 0; width: 44px; height: 44px; border-radius: 50%; background: #ffffff26; }
.home-create-note { margin: 0; padding: 0 4px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.home-sample { display: flex; flex-direction: column; align-items: stretch; overflow: hidden; padding: 8px; border: 1px solid var(--line); border-radius: 24px; background: var(--surface); text-align: left; }
.home-sample-photos { display: grid; grid-template-columns: 1.3fr 1fr 1fr; flex: 1; min-height: 160px; gap: 6px; border-radius: 18px; overflow: hidden; }
.home-sample-photos img { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; max-height: 230px; object-fit: cover; }
.photo-count-1 { grid-template-columns: 1fr; }
.photo-count-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.home-sample-copy { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 10px 10px; }
.home-sample-copy > span:first-child { min-width: 0; }
.home-sample-copy small { display: block; color: var(--muted); font-size: 12px; line-height: 1.5; }
.home-sample-copy strong { display: block; margin-top: 4px; font-size: 17px; font-weight: 650; line-height: 1.5; overflow-wrap: anywhere; }
.home-sample-arrow { display: grid; place-items: center; flex-shrink: 0; width: 44px; height: 44px; border-radius: 14px; background: var(--accent-soft); color: var(--accent); }
.home-section { min-width: 0; margin-top: 30px; }
.home-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; margin-bottom: 14px; }
.home-section-heading > div { min-width: 0; }
.home-section-heading h2 { margin: 0; font-size: 21px; font-weight: 700; letter-spacing: -.025em; line-height: 1.4; overflow-wrap: anywhere; }
.home-section-heading p { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.home-section-link { display: inline-flex; align-items: center; justify-content: center; gap: 3px; flex-shrink: 0; padding: 8px; border: 0; border-radius: 14px; background: transparent; color: var(--accent) !important; font-size: 12px !important; }
.home-discovery { display: grid; grid-template-columns: 1.2fr 1fr; gap: 28px; }
.home-inspiration-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.home-template { display: block; overflow: hidden; padding: 8px; text-align: left; border: 1px solid var(--line); border-radius: 24px; background: var(--surface); }
.home-template-art { display: block; width: 100%; border-radius: 17px; overflow: hidden; }
.home-template-art :deep(svg), .home-holiday-preview :deep(svg) { width: 100%; height: 100%; }
.home-template-caption { display: block; padding: 12px 5px 5px; }
.home-template-caption strong { display: block; font-size: 15px; font-weight: 650; line-height: 1.5; overflow-wrap: anywhere; }
.home-template-caption > span { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.5; }
.home-template-caption > span > svg { flex-shrink: 0; color: var(--accent); }
.home-holiday-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.home-holiday { min-width: 0; padding: 8px; border: 1px solid var(--line); border-radius: 24px; background: var(--surface); }
.home-holiday-preview { display: block; width: 100%; padding: 0; border: 0; border-radius: 17px; overflow: hidden; }
.home-holiday-topic { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 4px; margin-top: 5px; padding: 8px 5px; border: 0; border-radius: 12px; background: transparent; text-align: left; }
.home-holiday-topic strong { font-size: 15px; font-weight: 650; line-height: 1.5; overflow-wrap: anywhere; }
.home-holiday-topic > svg { flex-shrink: 0; color: var(--accent); }
.home-footer { margin-top: 32px; padding: 20px 0 8px; border-top: 1px solid var(--line); text-align: center; }
.home-footer p { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.home-footer p svg { flex-shrink: 0; }
.home-footer a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; margin-top: 4px; color: var(--muted); font-size: 12px; text-decoration: none; overflow-wrap: anywhere; }
.home-footer-links { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0 16px; margin-top: 4px; }
.home-footer-links a { margin-top: 0; }
.home-privacy-link { padding: 8px 10px; border: 0; border-radius: 12px; background: transparent; color: var(--muted) !important; font-size: 12px !important; }
.home-privacy-link:hover:not(:disabled) { color: var(--accent) !important; background: var(--accent-soft); }
@media (hover: hover) {
  .home-start:hover:not(:disabled) { background: var(--accent-hover); }
  .home-sample:hover:not(:disabled), .home-template:hover:not(:disabled) { border-color: var(--accent); }
  .home-section-link:hover:not(:disabled), .home-holiday-topic:hover:not(:disabled) { background: var(--accent-soft); }
}
@media (max-width: 1000px) {
  .home-workspace { grid-template-columns: 1fr 1fr; gap: 16px; }
  .home-start { gap: 12px; padding: 22px 18px; }
  .home-start-icon { width: 50px; height: 50px; }
  .home-start-copy strong { font-size: 22px; }
  .home-discovery { grid-template-columns: 1fr 1fr; gap: 22px; }
}
@media (max-width: 700px) {
  .home-heading { margin-bottom: 18px; }
  .home-device-note { display: none; }
  .home-workspace, .home-discovery { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .home-start { min-height: 110px; padding: 20px; border-radius: 22px; }
  .home-start-icon { width: 52px; height: 52px; border-radius: 16px; }
  .home-start-copy strong { font-size: 23px; }
  .home-start-copy small { margin-top: 5px; font-size: 12px; }
  .home-create-note { font-size: 11px; }
  .home-sample { margin-top: 18px; border-radius: 22px; }
  .home-sample-photos { flex: auto; min-height: 0; height: 150px; border-radius: 16px; }
  .home-sample-copy { padding: 12px 8px 6px; }
  .home-sample-copy strong { font-size: 16px; }
  .home-section { margin-top: 26px; }
  .home-section-heading h2 { font-size: 19px; }
  .home-section-heading p { font-size: 11px; }
  .home-section-link { padding-inline: 4px; }
  .home-inspiration-grid, .home-holiday-grid { gap: 12px; }
  .home-template, .home-holiday { padding: 7px; border-radius: 21px; }
  .home-template-art, .home-holiday-preview { border-radius: 15px; }
  .home-template-caption { padding: 10px 4px 4px; }
  .home-template-caption strong, .home-holiday-topic strong { font-size: 14px; }
  .home-footer { margin-top: 26px; }
}
@media (max-width: 359px) {
  .home-heading h1 { font-size: 24px; }
  .home-start { gap: 10px; padding: 16px; }
  .home-start-icon { width: 42px; height: 48px; }
  .home-start-copy strong { font-size: 21px; }
  .home-start-copy small { font-size: 11px; }
  .home-start-plus { width: 36px; height: 36px; }
  .home-sample-photos { height: 130px; }
  .home-section-heading h2 { font-size: 18px; }
  .home-section-heading p { font-size: 10px; }
  .home-section-link { font-size: 11px !important; }
  .home-template-caption strong { font-size: 13px; }
}
@media (prefers-reduced-motion: reduce) {
  .home-screen button { transition: none; }
}
</style>
