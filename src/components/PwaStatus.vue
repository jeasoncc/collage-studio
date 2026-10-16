<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { AlertCircle, CheckCircle2, Download, Info, LoaderCircle, RefreshCw, WifiOff, X } from 'lucide-vue-next';
import AppDialog from './AppDialog.vue';
import { usePwa, type PwaStatusHandle } from '../services/pwa';
import { isNativeApp } from '../services/native';

const props = defineProps<{ allowUpdate: boolean }>();
const installHelpOpen = ref(false);
const installActionPending = ref(false);
const updateDeferred = ref(true);
const manualChecking = ref(false);
const unexpectedError = ref('');
const dismissedFailure = ref('');
const notice = ref<{ message: string; success: boolean } | null>(null);
let noticeTimer: number | undefined;
let noticeVersion = 0;
let checkVersion = 0;
let disposed = false;
const safeToUpdate = computed(() => props.allowUpdate && !installHelpOpen.value && !installActionPending.value);
const { state, promptInstall, retryPreparation, checkForUpdates, applyUpdate } = usePwa(() => safeToUpdate.value);
defineExpose<PwaStatusHandle>({ state, checkForUpdates: manualCheck });
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
const failure = computed(() => [...new Set([state.preparationError, state.updateError, state.installError, unexpectedError.value].filter(Boolean))].join(' '));
const visibleFailure = computed(() => failure.value !== dismissedFailure.value ? failure.value : '');
const busy = computed(() => manualChecking.value || state.updatePending);
const updateReady = computed(() => state.waitingUpdate && !updateDeferred.value);
const toastMessage = computed(() => {
  if (state.updatePending) return state.updateNotice || '正在启用更新…';
  if (manualChecking.value) return '正在检查更新…';
  if (visibleFailure.value) return visibleFailure.value;
  if (updateReady.value) return '新版本已准备好';
  return notice.value?.message || '';
});
const toastIcon = computed(() => busy.value ? LoaderCircle : visibleFailure.value ? AlertCircle : notice.value?.success && !updateReady.value ? CheckCircle2 : Info);

function clearNotice() {
  window.clearTimeout(noticeTimer);
  notice.value = null;
  noticeVersion++;
}

function showNotice(message: string, success = false) {
  clearNotice();
  if (message) notice.value = { message, success };
}

watch(() => state.waitingUpdate, waiting => {
  updateDeferred.value = !waiting || !manualChecking.value;
  if (waiting) clearNotice();
}, { flush: 'sync' });
watch(() => state.updatePending, pending => { if (pending) clearNotice(); });
watch(() => state.updateNotice, message => {
  // The ready action is rendered from waitingUpdate, never as a second notice.
  if (!message || (state.waitingUpdate && !state.updatePending)) return;
  const latest = message === '当前已是最新版本。';
  if (latest && manualChecking.value) return;
  const preparing = state.preparation === 'preparing';
  showNotice(
    native ? state.unavailableReason : latest && preparing ? '更新检查已完成，离线资源仍在准备中。' : message,
    latest && !preparing,
  );
}, { flush: 'sync' });
watch(() => state.installNotice, message => { if (message) showNotice(message); }, { flush: 'sync' });
watch(failure, () => { dismissedFailure.value = ''; });
watch([notice, busy, visibleFailure, updateReady], () => {
  window.clearTimeout(noticeTimer);
  if (!notice.value?.success || busy.value || visibleFailure.value || updateReady.value) return;
  const current = notice.value;
  noticeTimer = window.setTimeout(() => {
    if (!disposed && notice.value === current && !busy.value) clearNotice();
  }, 3000);
});

async function manualCheck(): Promise<void> {
  const request = ++checkVersion;
  manualChecking.value = true;
  unexpectedError.value = '';
  dismissedFailure.value = '';
  clearNotice();
  const previousNoticeVersion = noticeVersion;
  try {
    await checkForUpdates(true, true);
  } catch (error) {
    if (!disposed && request === checkVersion) unexpectedError.value = error instanceof Error ? error.message : '检查更新失败，请稍后重试。';
  } finally {
    if (!disposed && request === checkVersion) {
      manualChecking.value = false;
      if (state.waitingUpdate) updateDeferred.value = false;
      else if (!failure.value && !state.updatePending && noticeVersion === previousNoticeVersion) {
        const preparing = state.preparation === 'preparing';
        const latest = state.available && !preparing && (!state.updateNotice || state.updateNotice === '当前已是最新版本。');
        showNotice(
          native ? state.unavailableReason : preparing ? '更新检查已完成，离线资源仍在准备中。' : state.updateNotice || (latest ? '当前已是最新版本。' : '更新检查已完成。'),
          latest,
        );
      }
    }
  }
}

function dismissToast() {
  if (busy.value) return;
  dismissedFailure.value = failure.value;
  updateDeferred.value = true;
  clearNotice();
}

function showUpdate() {
  clearNotice();
  updateDeferred.value = false;
}

onBeforeUnmount(() => {
  disposed = true;
  checkVersion++;
  window.clearTimeout(noticeTimer);
});

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
        <button v-if="state.preparation === 'error'" type="button" class="quiet-button pwa-control" data-pwa-action="retry" :disabled="state.checking || state.updatePending || !state.online" @click="retryPreparation"><RefreshCw :size="16" aria-hidden="true" />{{ state.checking ? '正在重试…' : '重试准备' }}</button>
        <button v-if="state.waitingUpdate && updateDeferred" type="button" class="quiet-button pwa-control" data-pwa-action="show-update" :disabled="state.updatePending" @click="showUpdate">查看更新</button>
      </div>
    </div>
  </section>

  <Teleport to="body">
    <aside v-if="toastMessage" class="toast pwa-toast" :class="{ error: !!visibleFailure && !busy }" aria-label="应用更新与安装" data-pwa-toast>
      <div class="pwa-toast-content" role="status" aria-live="polite" aria-atomic="true" :data-pwa-error="visibleFailure && !busy ? '' : undefined" :data-pwa-notice="!visibleFailure && !busy ? '' : undefined">
        <component :is="toastIcon" :size="20" :class="{ spinning: busy }" aria-hidden="true" />
        <div>
          <p>{{ toastMessage }}</p>
          <p v-if="updateReady && !safeToUpdate && !busy" class="pwa-update-hint">请先保存作品、处理待添加文案并关闭弹窗，返回主页后更新。</p>
        </div>
      </div>
      <div v-if="updateReady && !busy" class="pwa-actions" data-pwa-update>
        <button type="button" class="pwa-toast-button pwa-control" data-pwa-action="update" :disabled="!safeToUpdate" @click="update"><RefreshCw :size="16" aria-hidden="true" />更新并刷新</button>
        <button type="button" class="pwa-toast-button pwa-control" data-pwa-action="later" @click="updateDeferred = true">稍后</button>
      </div>
      <div v-else-if="state.updateError && visibleFailure === state.updateError && !busy" class="pwa-actions">
        <button type="button" class="pwa-toast-button pwa-control" data-pwa-action="retry-update" @click="manualCheck"><RefreshCw :size="16" aria-hidden="true" />重试检查</button>
      </div>
      <button v-if="!busy" type="button" class="pwa-toast-dismiss pwa-control" aria-label="关闭更新与安装提示" data-pwa-action="dismiss-notice" @click="dismissToast"><X :size="18" aria-hidden="true" /></button>
    </aside>
  </Teleport>

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
.pwa-status-row { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; min-width: 0; }
.pwa-summary { flex: 1 1 160px; min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-height: 44px; line-height: 1.6; }
.pwa-summary svg { flex: none; }
.pwa-summary svg, .pwa-installed { color: var(--accent); }
.pwa-installed { padding-left: 6px; border-left: 1px solid var(--line); }
.pwa-actions { display: flex; align-items: center; gap: 8px; max-width: 100%; flex-wrap: wrap; }
.pwa-control { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: var(--radius-control); font-size: 12px; padding: 10px 12px; white-space: normal; }
.pwa-control:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.pwa-control:disabled { opacity: .5; cursor: not-allowed; }
.pwa-toast { top: calc(var(--visible-top, 0px) + max(16px, env(safe-area-inset-top)) + 72px); right: max(16px, env(safe-area-inset-right)); left: auto; transform: none; z-index: 90; box-sizing: border-box; width: min(420px, calc(100vw - 32px)); max-height: calc(var(--visible-height, 100dvh) - 120px); overflow-y: auto; flex-direction: column; align-items: stretch; gap: 10px; padding-right: 56px; pointer-events: auto; }
.pwa-toast-content { display: flex; align-items: flex-start; gap: 10px; min-width: 0; overflow-wrap: anywhere; }
.pwa-toast-content > svg { flex: none; margin-top: 2px; }
.pwa-toast-content p { margin: 0; }
.pwa-toast-content p + p { margin-top: 6px; }
.pwa-update-hint { opacity: .85; font-size: 12px; }
.pwa-toast-button, .pwa-toast-dismiss { color: inherit; background: transparent; border: 1px solid #ffffff66; }
.pwa-toast-button:hover:not(:disabled), .pwa-toast-dismiss:hover { background: #ffffff1a; }
.pwa-toast-button:focus-visible, .pwa-toast-dismiss:focus-visible { outline-color: white; }
.pwa-toast-dismiss { position: absolute; top: 4px; right: 4px; padding: 8px; border: 0; }
.pwa-notice { margin: 2px 0 8px; line-height: 1.6; overflow-wrap: anywhere; }
.pwa-install-help { line-height: 1.8; }
.pwa-install-help p { margin: 12px 0; }
.pwa-install-help ol { padding-left: 24px; }
.pwa-install-help li + li { margin-top: 8px; }
@media (max-width: 700px) { .pwa-status { padding-right: 20px; padding-left: 20px; } }
@media (max-width: 360px) { .pwa-status { padding-right: 16px; padding-left: 16px; } }
</style>
