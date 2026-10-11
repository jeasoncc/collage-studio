<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, ChevronRight, FolderOpen, Images, Plus, Rows3, ShieldCheck } from 'lucide-vue-next';
import { templates, chineseFestivals } from '../catalog/templates';
import { photoPostersForCount } from '../catalog/photoPosters';
import type { CollageCreationMode, TemplatePreset } from '../types';
import TemplatePreview from './TemplatePreview.vue';

const props = defineProps<{
  photos: readonly { name: string; label: string; url: string; source: string }[];
  drafts: readonly { id: string; title: string; updatedAt: number; pageCount: number; url: string }[];
  disabled: boolean;
  exampleLoading: boolean;
  registrationNumber: string | null;
}>();
const emit = defineEmits<{
  start: [mode: CollageCreationMode];
  sample: [];
  browse: [query?: string];
  draft: [id: string];
  preview: [template: TemplatePreset, event: MouseEvent];
  works: [];
}>();

const heroPhotos = computed(() => props.photos.slice(0, 3));
const recentDrafts = computed(() => props.drafts.slice(0, 3));
const inspiration = photoPostersForCount(3).slice(0, 3);
const holidayCards = computed(() => {
  const featured = ['spring-festival', 'mid-autumn', 'national-day'];
  return featured.flatMap(id => {
    const festival = chineseFestivals.find(item => item.id === id);
    if (!festival) return [];
    const template = templates.find(item => festival.templateIds.includes(item.id));
    return template ? [{ festival, template }] : [];
  });
});
const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });
function formatDate(timestamp: number): string {
  return dateFormat.format(timestamp);
}
</script>

<template>
  <div class="home-screen">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="home-hero-art" :class="`photo-count-${heroPhotos.length}`" role="img" :aria-label="heroPhotos.length ? `示例照片拼图：${heroPhotos.map(photo => photo.label).join('、')}` : '照片拼图创作'">
        <div class="hero-photographs" aria-hidden="true">
          <img v-for="photo in heroPhotos" :key="photo.name" :src="photo.url" alt="" decoding="async" />
        </div>
        <div class="hero-art-heading" aria-hidden="true"><span>山海之间</span><span>照片 / 拼图</span></div>
        <div class="hero-art-type" aria-hidden="true"><span>把山海，<br />留在一起。</span><small>每一帧，都值得珍藏</small></div>
      </div>
      <div class="home-hero-copy">
        <span class="home-eyebrow">从你的相册开始</span>
        <h1 id="home-title">把喜欢的瞬间<br />拼成一张。</h1>
        <p>1–20 张照片 · 排版、文字都能改</p>
        <button type="button" class="home-start" :disabled="disabled" @click="emit('start', 'grid')"><Plus :size="21" aria-hidden="true" /><span>开始拼图</span><ArrowRight :size="21" aria-hidden="true" /></button>
        <span class="home-start-hint">选择照片，接着挑选喜欢的排版</span>
      </div>
    </section>

    <div class="home-creation-modes" aria-label="其他创作方式">
      <button type="button" :disabled="disabled" @click="emit('start', 'long')"><Rows3 :size="23" aria-hidden="true" /><span><strong>长图拼接</strong><small>按顺序，完整拼接</small></span><ChevronRight :size="17" aria-hidden="true" /></button>
      <button type="button" :disabled="disabled" @click="emit('start', 'free')"><Images :size="23" aria-hidden="true" /><span><strong>自由拼贴</strong><small>移动、旋转，自由摆放</small></span><ChevronRight :size="17" aria-hidden="true" /></button>
    </div>
    <button type="button" class="home-sample" :disabled="disabled || exampleLoading" :aria-busy="exampleLoading" @click="emit('sample')"><span>{{ exampleLoading ? '正在打开示例…' : '先试试看？用山海照片做一张' }}</span><ArrowRight :size="17" aria-hidden="true" /></button>

    <section class="home-section home-recent" aria-labelledby="home-recent-title">
      <header class="home-section-heading"><h2 id="home-recent-title">最近作品</h2><button type="button" class="home-section-link" :disabled="disabled" @click="emit('works')">全部作品<ChevronRight :size="16" aria-hidden="true" /></button></header>
      <div v-if="recentDrafts.length" class="home-drafts">
        <button v-for="draft in recentDrafts" :key="draft.id" type="button" class="home-draft" :disabled="disabled" :aria-label="`继续编辑：${draft.title}`" @click="emit('draft', draft.id)">
          <span class="home-draft-thumbnail"><img v-if="draft.url" :src="draft.url" alt="" loading="lazy" decoding="async" /><FolderOpen v-else :size="26" aria-hidden="true" /></span>
          <span class="home-draft-copy"><strong>{{ draft.title }}</strong><small>{{ draft.pageCount }} 页 · {{ formatDate(draft.updatedAt) }}</small><span>继续编辑<ArrowRight :size="14" aria-hidden="true" /></span></span>
        </button>
      </div>
      <div v-else class="home-draft-empty"><FolderOpen :size="24" aria-hidden="true" /><div><strong>还没有作品</strong><span>做好的拼图会保存在这里</span></div><button type="button" :disabled="disabled" @click="emit('start', 'grid')">做第一张<ArrowRight :size="16" aria-hidden="true" /></button></div>
    </section>

    <section v-if="inspiration.length" class="home-section home-inspiration" aria-labelledby="home-inspiration-title">
      <header class="home-section-heading"><div><span class="home-eyebrow">看看照片的另一种表达</span><h2 id="home-inspiration-title">排版灵感</h2></div><button type="button" class="home-section-link" :disabled="disabled" @click="emit('browse')">全部模板<ChevronRight :size="16" aria-hidden="true" /></button></header>
      <div class="home-inspiration-grid">
        <button v-for="template in inspiration" :key="template.id" type="button" class="home-template" :disabled="disabled" :aria-label="`预览模板：${template.name}`" aria-haspopup="dialog" @click="emit('preview', template, $event)">
          <span class="home-template-art" :style="{ backgroundColor: template.background.color, aspectRatio: `${template.width} / ${template.height}` }"><TemplatePreview :template="template" /></span>
          <span class="home-template-caption"><strong>{{ template.name }}</strong><span>{{ template.category }}<ArrowRight :size="16" aria-hidden="true" /></span></span>
        </button>
      </div>
    </section>

    <section v-if="holidayCards.length" class="home-section home-festivals" aria-labelledby="home-festivals-title">
      <header class="home-section-heading"><div><span class="home-eyebrow">属于我们的节日</span><h2 id="home-festivals-title">中国节日</h2></div><button type="button" class="home-section-link" :disabled="disabled" @click="emit('browse', '节日')">全部节日<ChevronRight :size="16" aria-hidden="true" /></button></header>
      <div class="home-holiday-grid">
        <article v-for="{ festival, template } in holidayCards" :key="festival.id" class="home-holiday">
          <button type="button" class="home-holiday-preview" :disabled="disabled" :aria-label="`预览${festival.label}模板：${template.name}`" aria-haspopup="dialog" :style="{ backgroundColor: template.background.color, aspectRatio: `${template.width} / ${template.height}` }" @click="emit('preview', template, $event)"><TemplatePreview :template="template" /></button>
          <button type="button" class="home-holiday-topic" :disabled="disabled" :aria-label="`浏览${festival.label}模板`" @click="emit('browse', festival.label)"><strong>{{ festival.label }}</strong><ChevronRight :size="16" aria-hidden="true" /></button>
        </article>
      </div>
    </section>

    <footer class="home-footer"><p><ShieldCheck :size="17" aria-hidden="true" /><span>照片不上传 · 作品保存在当前设备</span></p><a v-if="registrationNumber" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{{ registrationNumber }}</a></footer>
  </div>
</template>

<style scoped>
.home-screen { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 32px; width: 100%; min-width: 0; color: var(--ink); padding-bottom: 8px; }
.home-hero, .home-creation-modes, .home-sample, .home-recent, .home-footer { grid-column: 1 / -1; }
.home-screen button { min-width: 0; min-height: 44px; font: inherit; }
.home-screen button:disabled { cursor: not-allowed; opacity: .45; }
.home-screen button:focus-visible, .home-screen a:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.home-hero { display: grid; grid-template-columns: .95fr 1.05fr; overflow: hidden; border-radius: 24px; background: var(--surface); }
.home-hero-art { position: relative; grid-column: 2; grid-row: 1; min-width: 0; min-height: 390px; overflow: hidden; isolation: isolate; background: #284b3d; color: #fffdf4; }
.hero-photographs { position: absolute; inset: 0; display: grid; grid-template-columns: 1.25fr 1fr; grid-template-rows: 1fr 1fr; gap: 0; }
.hero-photographs img { width: 100%; height: 100%; min-width: 0; min-height: 0; object-fit: cover; }
.hero-photographs img:first-child { grid-row: span 2; }
.photo-count-1 .hero-photographs { grid-template-columns: 1fr; }
.photo-count-2 .hero-photographs img:nth-child(2) { grid-row: span 2; }
.home-hero-art::after { content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(180deg, #172e3042, transparent 38%, #13292182); }
.hero-art-heading { position: absolute; z-index: 2; inset: 22px 24px auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 11px; letter-spacing: .14em; }
.hero-art-type { position: absolute; z-index: 2; inset: auto 24px 24px; }
.hero-art-type > span { display: block; font-family: 'Zhuque Fangsong', 'Noto Serif SC Variable', 'Songti SC', serif; font-size: 42px; line-height: 1.2; letter-spacing: .055em; text-shadow: 0 2px 18px #14271926; }
.hero-art-type small { display: block; margin-top: 14px; font-size: 11px; letter-spacing: .16em; }
.home-hero-copy { grid-column: 1; grid-row: 1; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; min-width: 0; padding: 36px; }
.home-eyebrow { display: block; color: var(--muted); font-size: 12px; letter-spacing: .09em; line-height: 1.6; }
.home-hero-copy h1 { margin: 14px 0 12px; font-size: clamp(29px, 3.4vw, 42px); font-weight: 600; letter-spacing: -.065em; line-height: 1.3; }
.home-hero-copy > p { margin: 0 0 25px; font-size: 13px; color: var(--muted); line-height: 1.6; }
.home-start { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 54px !important; padding: 14px 18px; border: 0; border-radius: 13px; background: var(--accent); color: #fff; font-weight: 600 !important; font-size: 17px !important; }
.home-start > span { flex: 1; text-align: left; }
.home-start:hover:not(:disabled) { background: #1e3e31; }
.home-start-hint { align-self: center; margin-top: 12px; font-size: 11px; color: var(--muted); line-height: 1.5; }
.home-creation-modes { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; margin-top: 12px; }
.home-creation-modes > button { display: flex; align-items: center; gap: 14px; padding: 19px 22px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); text-align: left; }
.home-creation-modes > button > svg:first-child { color: var(--accent); }
.home-creation-modes > button > svg:last-child { color: var(--muted); }
.home-creation-modes > button > span { flex: 1; min-width: 0; }
.home-creation-modes strong { display: block; font-size: 16px; font-weight: 600; }
.home-creation-modes small { display: block; margin-top: 5px; font-size: 12px; color: var(--muted); line-height: 1.4; }
.home-creation-modes > button:hover:not(:disabled) { background: var(--accent-soft); }
.home-sample { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 7px auto 0; padding: 9px 12px; border: 0; border-radius: 10px; background: transparent; color: var(--accent); font-size: 12px !important; }
.home-sample:hover:not(:disabled), .home-section-link:hover:not(:disabled) { background: var(--accent-soft); }
.home-section { margin-top: 24px; }
.home-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; margin-bottom: 12px; }
.home-section-heading h2 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -.04em; line-height: 1.4; }
.home-section-link { display: inline-flex; align-items: center; justify-content: center; gap: 3px; flex-shrink: 0; padding: 8px 0 8px 10px; border: 0; border-radius: 10px; background: transparent; color: var(--muted); font-size: 13px !important; }
.home-drafts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.home-draft { display: flex; align-items: center; gap: 13px; padding: 12px; text-align: left; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); overflow: hidden; }
.home-draft:hover:not(:disabled) { background: var(--accent-soft); }
.home-draft-thumbnail { flex: 0 0 72px; width: 72px; height: 80px; display: grid; place-items: center; border-radius: 6px; background: var(--control); overflow: hidden; color: var(--muted); }
.home-draft-thumbnail img { width: 100%; height: 100%; object-fit: contain; }
.home-draft-copy { flex: 1; min-width: 0; }
.home-draft-copy strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 600; }
.home-draft-copy small { display: block; margin-top: 6px; color: var(--muted); font-size: 11px; }
.home-draft-copy > span { display: flex; align-items: center; gap: 5px; margin-top: 11px; color: var(--accent); font-size: 12px; }
.home-draft-empty { display: flex; align-items: center; gap: 13px; padding: 14px 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; }
.home-draft-empty > svg { color: var(--muted); }
.home-draft-empty > div { flex: 1; min-width: 0; }
.home-draft-empty strong { display: block; font-size: 14px; font-weight: 500; }
.home-draft-empty > div > span { display: block; margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.5; }
.home-draft-empty > button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; flex-shrink: 0; padding: 10px 12px; border: 0; border-radius: 11px; color: var(--accent); background: var(--accent-soft); font-size: 13px !important; }
.home-inspiration-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.home-template { display: block; padding: 0; text-align: left; border: 0; border-radius: 12px; background: transparent; }
.home-template-art { display: block; width: 100%; height: auto; padding: 0; border-radius: 12px; overflow: hidden; }
.home-template-art :deep(svg) { width: 100%; height: 100%; }
.home-template-caption { display: block; padding: 12px 2px 2px; }
.home-template-caption strong { display: block; font-size: 15px; font-weight: 600; line-height: 1.5; }
.home-template-caption > span { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.5; }
.home-template:hover:not(:disabled) .home-template-caption { color: var(--accent); }
.home-inspiration .home-eyebrow, .home-festivals .home-eyebrow { margin-bottom: 4px; font-size: 11px; }
.home-holiday-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.home-holiday { min-width: 0; }
.home-holiday-preview { display: block; width: 100%; height: auto; padding: 0; border: 0; border-radius: 12px; overflow: hidden; }
.home-holiday-topic { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 4px; padding: 10px 2px; border: 0; border-radius: 8px; background: transparent; text-align: left; }
.home-holiday-topic strong { font-size: 15px; font-weight: 600; }
.home-holiday-topic > svg { color: var(--muted); }
.home-holiday-topic:hover:not(:disabled) { color: var(--accent); background: var(--accent-soft); }
.home-footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #202c2510; text-align: center; }
.home-footer p { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0; min-height: 30px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.home-footer a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; margin-top: 4px; color: var(--muted); font-size: 12px; text-decoration: none; }
@media (max-width: 850px) {
  .home-screen { display: block; }
  .home-festivals { padding-top: 22px; border-top: 1px solid #202c2510; }
  .home-hero-copy { padding: 28px; }
  .home-hero-art { min-height: 355px; }
  .home-drafts { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .home-draft { padding: 10px 12px; }
  .home-draft-thumbnail { flex-basis: 64px; width: 64px; height: 68px; }
  .home-draft-copy { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 8px; }
  .home-draft-copy > span { grid-column: 2; grid-row: 1 / span 2; margin-top: 0; }
}
@media (max-width: 600px) {
  .home-hero { grid-template-columns: minmax(0, 1fr); border-radius: 20px; }
  .home-hero-art { grid-column: 1; grid-row: 1; min-height: 0; aspect-ratio: 1.6; }
  .hero-art-heading { inset: 17px 19px auto; font-size: 10px; }
  .hero-art-type { inset: auto 19px 18px; }
  .hero-art-type > span { font-size: clamp(30px, 8.5vw, 38px); }
  .hero-art-type small { margin-top: 8px; font-size: 9px; }
  .home-hero-copy { grid-column: 1; grid-row: 2; padding: 20px; display: grid; grid-template-columns: minmax(0, 1fr); }
  .home-hero-copy > .home-eyebrow { display: none; }
  .home-hero-copy h1 { margin: 0 0 8px; font-size: 26px; letter-spacing: -.05em; }
  .home-hero-copy h1 br { display: none; }
  .home-hero-copy > p { margin-bottom: 16px; font-size: 12px; }
  .home-start-hint { margin-top: 9px; text-align: center; font-size: 10px; }
  .home-creation-modes { gap: 9px; margin-top: 10px; }
  .home-creation-modes > button { gap: 9px; padding: 15px 12px; border-radius: 14px; }
  .home-creation-modes > button > svg:first-child { width: 21px; height: 21px; }
  .home-creation-modes > button > svg:last-child { display: none; }
  .home-creation-modes strong { font-size: 15px; }
  .home-creation-modes small { margin-top: 4px; font-size: 10px; }
  .home-sample { margin-top: 4px; }
  .home-section { margin-top: 20px; }
  .home-section-heading { margin-bottom: 8px; gap: 8px; }
  .home-section-heading h2 { font-size: 18px; }
  .home-section-link { font-size: 12px !important; }
  .home-draft-empty { gap: 9px; padding: 12px; }
  .home-draft-empty > svg { width: 21px; height: 21px; }
  .home-draft-empty > div > span { font-size: 11px; }
  .home-draft-empty > button { padding-inline: 9px; font-size: 12px !important; }
  .home-draft-empty > button > svg { display: none; }
  .home-inspiration-grid { grid-template-columns: repeat(3, minmax(132px, 1fr)); gap: 12px; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity; padding: 4px 4px 8px; margin: -4px -4px -8px; scrollbar-width: thin; }
  .home-template { scroll-snap-align: start; }
  .home-template-art { border-radius: 9px; }
  .home-template-caption { padding-top: 9px; }
  .home-template-caption strong { font-size: 14px; }
  .home-template-caption > span { font-size: 11px; }
  .home-festivals { padding-top: 18px; }
  .home-holiday-grid { gap: 10px; }
  .home-holiday-preview { border-radius: 8px; }
  .home-holiday-topic { padding-inline: 1px; }
  .home-holiday-topic strong { font-size: 15px; }
  .home-holiday-topic > svg { width: 14px; height: 14px; }
  .home-footer { margin-top: 22px; padding-top: 12px; }
  .home-footer p { font-size: 11px; }
}
@media (max-width: 359px) {
  .home-hero-copy { padding: 17px; }
  .home-hero-copy h1 { font-size: 23px; }
  .home-creation-modes > button { padding: 14px 10px; gap: 7px; }
  .home-creation-modes strong { font-size: 14px; }
  .home-creation-modes small { font-size: 9px; }
  .home-draft-copy > span { font-size: 11px; }
  .home-holiday-grid { gap: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .home-screen button { transition: none; }
  .home-screen button:active:not(:disabled) { transform: none; }
}
</style>
