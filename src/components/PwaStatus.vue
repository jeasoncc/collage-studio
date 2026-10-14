<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { AlertCircle, CheckCircle2, Download, Info, LoaderCircle, RefreshCw, WifiOff } from 'lucide-vue-next';
import AppDialog from './AppDialog.vue';
import { usePwa, type PwaStatusHandle } from '../services/pwa';
import { isNativeApp } from '../services/native';

const props = defineProps<{ allowUpdate: boolean }>();
const installHelpOpen = ref(false);
const installActionPending = ref(false);
const updateDeferred = ref(false);
const safeToUpdate = computed(() => props.allowUpdate && !installHelpOpen.value && !installActionPending.value);
const { state, promptInstall, retryPreparation, checkForUpdates, applyUpdate } = usePwa(() => safeToUpdate.value);
defineExpose<PwaStatusHandle>({ state, checkForUpdates: () => checkForUpdates(true, true) });
const native = isNativeApp();
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(navigator.userAgent);
const summary = computed(() => {
  if (native) return '本地应用 · 核心资源已内置';
  if (state.preparation === 'unavailable') return state.unavailableReason;
  if (state.preparation === 'error') return state.online ? '离线准备失败' : '离线 · 资源尚未准备完成';
  if (state.preparation === 'preparing') return state.online ? '正在准备离线资源…' : '离线 · 正在等待资源准备';
  return state.online ? '离线已就绪' : '离线 · 核心功能可用';
});
const statusIcon = computed(() => native ? CheckCircle2 : !state.online ? WifiOff : state.preparation === 'ready' ? CheckCircle2
  : state.preparation === 'preparing' ? LoaderCircle : state.preparation === 'error' ? AlertCircle : Info);
const failure = computed(() => state.preparationError || state.updateError || state.installError);

watch(() => state.waitingUpdate, waiting => { if (!waiting) updateDeferred.value = false; });

async function install() {
  if (installActionPending.value || state.installed) return;
  if (!state.nativeInstallAvailable) {
    installHelpOpen.value = true;
    return;
  }
  installActionPending.value = true;
  try {
    if (await promptInstall() === 'unavailable') installHelpOpen.value = true;
  } finally {
    installActionPending.value = false;
  }
}

function update() {
  if (safeToUpdate.value && !state.updatePending) applyUpdate();
}
</script>

<template>
  <section class="pwa-status" aria-label="安装与离线状态" :data-pwa-preparation="state.preparation" :data-pwa-online="state.online" :data-pwa-installed="state.installed">
    <div class="pwa-status-row">
      <div class="pwa-summary" role="status" aria-live="polite" aria-atomic="true" data-pwa-status>
        <component :is="statusIcon" :size="16" aria-hidden="true" />
        <span>{{ summary }}</span>
        <span v-if="state.available && state.installed" class="pwa-installed">已安装</span>
      </div>
      <div class="pwa-actions">
        <button v-if="state.available && !state.installed" type="button" class="quiet-button pwa-control" data-pwa-action="install" :disabled="state.installPending || installActionPending" @click="install"><Download :size="16" aria-hidden="true" />{{ state.installPending ? '等待浏览器…' : state.nativeInstallAvailable ? '安装应用' : '安装指引' }}</button>
        <button v-if="state.preparation === 'error' || state.updateError" type="button" class="quiet-button pwa-control" data-pwa-action="retry" :disabled="state.checking || state.updatePending || !state.online" @click="retryPreparation"><RefreshCw :size="16" aria-hidden="true" />{{ state.checking ? '正在重试…' : '重试准备' }}</button>
        <button v-if="state.waitingUpdate && updateDeferred" type="button" class="quiet-button pwa-control" data-pwa-action="show-update" :disabled="state.updatePending" @click="updateDeferred = false">查看更新</button>
      </div>
    </div>
    <div v-if="state.waitingUpdate && !updateDeferred" class="pwa-update" data-pwa-update>
      <span>新版本已准备好<span v-if="!safeToUpdate" class="pwa-update-hint">。请先保存作品、处理待添加文案并关闭弹窗，返回主页后更新。</span></span>
      <div class="pwa-actions">
        <button type="button" class="primary-button pwa-control" data-pwa-action="update" :disabled="!safeToUpdate || state.updatePending" @click="update"><RefreshCw :size="16" aria-hidden="true" />{{ state.updatePending ? '启用中…' : '更新并刷新' }}</button>
        <button type="button" class="quiet-button pwa-control" data-pwa-action="later" :disabled="state.updatePending" @click="updateDeferred = true">稍后更新</button>
      </div>
    </div>
    <p v-if="failure" class="pwa-notice pwa-error" role="status" data-pwa-error>{{ failure }}</p>
    <p v-else-if="state.updateNotice || state.installNotice" class="pwa-notice" role="status" data-pwa-notice>{{ state.updateNotice || state.installNotice }}</p>
  </section>

  <AppDialog v-model:open="installHelpOpen" title="安装拼贴时光" description="浏览器决定是否支持安装。添加图标不代表离线资源已准备完成。">
    <div class="pwa-install-help" data-pwa-install-help>
      <template v-if="isIos">
        <p>在 iPhone 或 iPad 上：</p>
        <ol><li>打开浏览器的「分享」菜单。</li><li>选择「添加到主屏幕」，再确认「添加」。</li><li>从主屏幕打开拼贴时光。</li></ol>
        <p>若当前浏览器没有这个选项，请用 Safari 打开同一地址，再通过「分享」添加。</p>
      </template>
      <template v-else-if="isAndroid">
        <p>在 Android 上，打开浏览器菜单，选择「安装应用」或「添加到主屏幕」，并按浏览器提示确认。</p>
        <p>如果没有安装入口，可尝试用 Chrome 或 Edge 打开同一地址。部分浏览器只能添加快捷方式，并不支持应用安装。</p>
      </template>
      <template v-else>
        <p>在支持安装的桌面浏览器中，点击地址栏的安装图标，或在浏览器菜单选择「安装拼贴时光」／「将此页面安装为应用」。</p>
        <p>如果没有安装入口，可用 Chrome 或 Edge 打开同一地址；不支持安装的浏览器仍可直接使用网页。</p>
      </template>
      <p class="form-note">请保持联网，直到页面显示「离线已就绪」。离线时可编辑本地照片、使用已缓存素材并导出图片。作品和照片仍保存在当前浏览器的本地存储中，安装不会迁移它们。</p>
      <p v-if="state.version" class="pwa-notice" data-pwa-version>离线服务版本：{{ state.version }}</p>
      <div class="dialog-actions"><button type="button" class="primary-button pwa-control" data-pwa-action="close-install-help" @click="installHelpOpen = false">知道了</button></div>
    </div>
  </AppDialog>
</template>

<style scoped>
.pwa-status { flex: 0 0 auto; width: 100%; min-width: 0; max-width: 1064px; box-sizing: border-box; margin: 0 auto; padding: 0 32px 4px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.pwa-status-row, .pwa-update { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; min-width: 0; }
.pwa-summary { flex: 1 1 160px; min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-height: 44px; line-height: 1.6; }
.pwa-summary svg { flex: none; }
.pwa-summary svg, .pwa-installed { color: var(--accent); }
.pwa-installed { padding-left: 6px; border-left: 1px solid var(--line); }
.pwa-actions { display: flex; align-items: center; gap: 8px; max-width: 100%; flex-wrap: wrap; }
.pwa-control { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: var(--radius-control); font-size: 12px; padding: 10px 12px; white-space: normal; }
.pwa-control:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.pwa-control:disabled { opacity: .5; cursor: not-allowed; }
.pwa-update { margin-top: 6px; padding: 12px; border-radius: var(--radius-control); background: var(--accent-soft); color: var(--accent); line-height: 1.7; }
.pwa-update>span { flex: 1 1 220px; min-width: 0; }
.pwa-update-hint { color: var(--muted); }
.pwa-notice { margin: 2px 0 8px; line-height: 1.6; overflow-wrap: anywhere; }
.pwa-install-help { line-height: 1.8; }
.pwa-install-help p { margin: 12px 0; }
.pwa-install-help ol { padding-left: 24px; }
.pwa-install-help li + li { margin-top: 8px; }
@media (max-width: 700px) { .pwa-status { padding-right: 20px; padding-left: 20px; } }
@media (max-width: 360px) { .pwa-status { padding-right: 16px; padding-left: 16px; } }
</style>
