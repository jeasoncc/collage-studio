import { onBeforeUnmount, onMounted, reactive, readonly, watch } from 'vue';
import { isNativeApp } from './native';

declare const __COLLAGE_PWA_ENABLED__: boolean;
const SCOPE = '/';
const CHECK_INTERVAL = 60 * 60 * 1000;
const CHECK_COOLDOWN = 5 * 60 * 1000;
const ACTIVATION_TIMEOUT = 30 * 1000;

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string };
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<InstallChoice>;
}

export type PwaPreparation = 'unavailable' | 'preparing' | 'ready' | 'error';
export type PwaInstallResult = 'accepted' | 'dismissed' | 'unavailable' | 'failed';
export interface PwaState {
  available: boolean;
  preparation: PwaPreparation;
  offlineReady: boolean;
  version: string;
  online: boolean;
  installed: boolean;
  nativeInstallAvailable: boolean;
  installPending: boolean;
  installNotice: string;
  installError: string;
  waitingUpdate: boolean;
  updatePending: boolean;
  checking: boolean;
  preparationError: string;
  updateError: string;
  updateNotice: string;
  unavailableReason: string;
}

export interface PwaStatusHandle {
  readonly state: Readonly<PwaState>;
  checkForUpdates(): Promise<void>;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One mounted app owns one lifecycle; no cache, draft or photo storage is modified here. */
export function usePwa(canUpdate: () => boolean) {
  const native = isNativeApp();
  const targetPage = !native && __COLLAGE_PWA_ENABLED__ && import.meta.env.PROD && import.meta.env.BASE_URL === SCOPE && ['collage.szlh.top', 'localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const available = targetPage && window.isSecureContext && 'serviceWorker' in navigator;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const minimalUi = window.matchMedia('(display-mode: minimal-ui)');
  let installedEventSeen = false;
  const state = reactive<PwaState>({
    available,
    preparation: available ? 'preparing' : 'unavailable',
    offlineReady: native,
    version: '',
    online: navigator.onLine,
    installed: native || standalone.matches || minimalUi.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    nativeInstallAvailable: false,
    installPending: false,
    installNotice: '',
    installError: '',
    waitingUpdate: false,
    updatePending: false,
    checking: false,
    preparationError: '',
    updateError: '',
    updateNotice: '',
    unavailableReason: native ? '本地应用 · 核心资源已内置，无需离线安装。' : !targetPage ? '此环境不启用离线安装。' : '当前浏览器或连接不支持离线安装。',
  });
  const urlBase = native ? window.location.href : window.location.origin;
  const scriptUrl = new URL(`${import.meta.env.BASE_URL}service-worker.js`, urlBase).href;
  const scopeUrl = new URL(SCOPE, urlBase).href;
  const container = available ? navigator.serviceWorker : undefined;
  const workerListeners = new Map<ServiceWorker, () => void>();
  let registration: ServiceWorkerRegistration | undefined;
  let registrationTask: Promise<void> | undefined;
  let updateTask: Promise<void> | undefined;
  let installPrompt: InstallPromptEvent | undefined;
  let requestedWorker: ServiceWorker | undefined;
  let activatingWorker: ServiceWorker | undefined;
  let previousController = container?.controller;
  let activationTimer: number | undefined;
  let checkTimer: number | undefined;
  let statusWorker: ServiceWorker | undefined;
  let statusChannel: MessageChannel | undefined;
  let statusTimer: number | undefined;
  let lastStatusCheck = 0;
  let lastCheck = 0;
  let disposed = false;
  let cancelInstallationWait: (() => void) | undefined;

  const matchingWorker = (worker: ServiceWorker | null | undefined): worker is ServiceWorker => !!worker && worker.scriptURL === scriptUrl;

  function finishActivation() {
    window.clearTimeout(activationTimer);
    requestedWorker = undefined;
    activatingWorker = undefined;
    state.updatePending = false;
  }

  function closeStatusRequest() {
    window.clearTimeout(statusTimer);
    statusChannel?.port1.close();
    statusChannel?.port2.close();
    statusChannel = undefined;
  }

  function statusFailed(message: string) {
    state.offlineReady = false;
    state.preparation = 'error';
    state.preparationError = message;
  }

  function requestStatus(worker: ServiceWorker | null | undefined, force = false, prepare = false) {
    if (!registration || registration.scope !== scopeUrl || !matchingWorker(worker) || worker.state !== 'activated') return;
    if (statusWorker === worker && ((statusChannel && !prepare) || (!force && Date.now() - lastStatusCheck < CHECK_COOLDOWN))) return;
    closeStatusRequest();
    statusWorker = worker;
    lastStatusCheck = Date.now();
    if (!state.offlineReady) {
      state.preparation = 'preparing';
      state.preparationError = '';
    }
    const channel = new MessageChannel();
    statusChannel = channel;
    statusTimer = window.setTimeout(() => {
      if (disposed || statusChannel !== channel) return;
      closeStatusRequest();
      statusFailed('无法确认离线资源是否准备完成，请稍后重试。');
    }, prepare ? 120 * 1000 : 15 * 1000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      if (disposed || statusChannel !== channel) return;
      closeStatusRequest();
      const response = event.data as { version?: unknown; offlineReady?: unknown; error?: unknown } | null;
      if (!response || typeof response.version !== 'string' || typeof response.offlineReady !== 'boolean') {
        statusFailed('离线服务返回了无法识别的资源状态，请稍后重试。');
        return;
      }
      state.version = response.version;
      if (!response.offlineReady) {
        statusFailed(typeof response.error === 'string' ? response.error : '离线资源不完整，请保持联网并重试。当前不能保证离线可用。');
        return;
      }
      state.offlineReady = true;
      state.preparation = 'ready';
      state.preparationError = '';
    };
    try {
      worker.postMessage({ type: prepare ? 'PWA_PREPARE' : 'PWA_STATUS' }, [channel.port2]);
    } catch (error) {
      closeStatusRequest();
      statusFailed(`无法确认离线资源状态：${errorDetail(error)}`);
    }
  }

  function preparationFailed(message: string) {
    const active = registration?.active;
    if (state.offlineReady || (matchingWorker(active) && active.state === 'activated')) state.updateError = message;
    if (!state.offlineReady) {
      state.preparation = 'error';
      state.preparationError = message;
    }
  }

  function observeWorker(worker: ServiceWorker | null | undefined) {
    if (!matchingWorker(worker) || workerListeners.has(worker)) return;
    let previousState = worker.state;
    const changed = () => {
      if (disposed) return;
      if (worker.state === 'redundant' && previousState !== 'activated' && previousState !== 'redundant') {
        preparationFailed('离线资源安装未完成，浏览器已停止该版本。请检查网络和可用存储空间后重试。');
        if (worker === activatingWorker) finishActivation();
      } else if (worker.state === 'activated') {
        state.updateError = '';
      }
      previousState = worker.state;
      syncRegistration();
      if (worker.state === 'activated' || worker.state === 'redundant') {
        workerListeners.get(worker)?.();
        workerListeners.delete(worker);
      }
    };
    worker.addEventListener('statechange', changed);
    workerListeners.set(worker, () => worker.removeEventListener('statechange', changed));
  }

  function syncRegistration(forceStatus = false) {
    if (!registration || disposed) return;
    const controller = container?.controller;
    requestStatus(matchingWorker(controller) && controller.state === 'activated' ? controller : registration.active, forceStatus);
    state.waitingUpdate = matchingWorker(registration.waiting) && registration.waiting.state === 'installed';
    observeWorker(registration.installing);
    observeWorker(registration.waiting);
    if (registration.active?.state === 'activating') observeWorker(registration.active);
  }

  function onUpdateFound() {
    if (!state.offlineReady) {
      state.preparation = 'preparing';
      state.preparationError = '';
    }
    state.updateError = '';
    syncRegistration();
  }

  async function registerWorker(): Promise<void> {
    if (!container || disposed) return;
    if (registrationTask) return registrationTask;
    if (!state.offlineReady) {
      state.preparation = 'preparing';
      state.preparationError = '';
    }
    state.checking = true;
    lastCheck = Date.now();
    registrationTask = (async () => {
      try {
        const existing = await container.getRegistration(scopeUrl);
        if (disposed) return;
        if (existing?.scope === scopeUrl) {
          registration = existing;
          registration.addEventListener('updatefound', onUpdateFound);
          syncRegistration();
        }
        // register() also checks the existing registration for a new worker on each mount.
        const next = await container.register(scriptUrl, { scope: SCOPE, updateViaCache: 'none' });
        if (disposed) return;
        if (next.scope !== scopeUrl) throw new Error('服务工作线程范围不是独立域名根目录，已拒绝使用。');
        if (registration !== next) {
          registration?.removeEventListener('updatefound', onUpdateFound);
          registration = next;
          registration.addEventListener('updatefound', onUpdateFound);
        }
        syncRegistration();
        if (!next.active && !next.installing && !next.waiting) {
          preparationFailed('离线资源未能安装。请联网后重试。');
        }
      } catch (error) {
        if (!disposed) preparationFailed(`离线服务注册失败：${errorDetail(error)}`);
      } finally {
        if (!disposed) state.checking = false;
        registrationTask = undefined;
      }
    })();
    return registrationTask;
  }

  function waitForInstallation(worker: ServiceWorker): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      worker.removeEventListener('statechange', changed);
      cancelInstallationWait = undefined;
      if (error) reject(error); else resolve();
    };
    const changed = () => {
      if (worker.state === 'redundant') finish(new Error('新版本资源安装失败，请检查网络与可用空间。'));
      else if (worker.state === 'installed' || worker.state === 'activating' || worker.state === 'activated') finish();
    };
    const timer = window.setTimeout(() => finish(new Error('新版本资源尚未准备完成，请稍后重新检查。')), 120_000);
    cancelInstallationWait = () => finish(new DOMException('更新检查已取消。', 'AbortError'));
    worker.addEventListener('statechange', changed);
    changed();
    return promise;
  }

  async function checkForUpdates(force = false, announce = false): Promise<void> {
    if (announce) { state.updateError = ''; state.updateNotice = ''; }
    if (!container || disposed) {
      if (announce && !disposed) state.updateNotice = '当前环境不支持在线检查更新。';
      return;
    }
    if (!state.online) {
      if (announce) state.updateError = '离线时无法检查更新，现有作品仍可正常编辑。';
      return;
    }
    if (registrationTask) await registrationTask;
    if (disposed) return;
    if (updateTask) return updateTask;
    if (!force && Date.now() - lastCheck < CHECK_COOLDOWN) return;
    if (!registration || (!registration.active && !registration.installing && !registration.waiting)) await registerWorker();
    if (!registration || disposed) return;
    syncRegistration(true);
    if (state.waitingUpdate || state.updatePending) {
      if (announce) state.updateNotice = '新版本已准备好，点「更新并刷新」即可启用。';
      return;
    }
    if (!state.offlineReady) {
      state.preparation = 'preparing';
      state.preparationError = '';
    }
    state.updateError = '';
    state.checking = true;
    lastCheck = Date.now();
    updateTask = (async () => {
      try {
        if (!registration!.installing) await registration!.update();
        if (disposed) return;
        const installing = registration!.installing;
        if (installing) await waitForInstallation(installing);
        if (disposed) return;
        syncRegistration(true);
        if (!state.offlineReady && !registration?.active && !registration?.installing && !registration?.waiting) {
          preparationFailed('离线资源未能安装。请检查网络和可用存储空间后重试。');
        } else if (announce && !state.updateError) {
          state.updateNotice = state.waitingUpdate ? '新版本已准备好，点「更新并刷新」即可启用。' : '当前已是最新版本。';
        }
      } catch (error) {
        if (!disposed) preparationFailed(`检查或准备更新失败：${errorDetail(error)}`);
      } finally {
        if (!disposed) state.checking = false;
        updateTask = undefined;
      }
    })();
    return updateTask;
  }

  async function retryPreparation(): Promise<void> {
    if (!state.online) {
      preparationFailed('当前没有网络连接，请联网后重试。');
      return;
    }
    if (registration) await checkForUpdates(true);
    else await registerWorker();
    if (!state.offlineReady) {
      const controller = container?.controller;
      requestStatus(matchingWorker(controller) ? controller : registration?.active, true, true);
    }
  }

  function applyUpdate(): boolean {
    syncRegistration();
    const worker = registration?.waiting;
    if (disposed || !canUpdate() || state.updatePending || !matchingWorker(worker) || worker.state !== 'installed') return false;
    requestedWorker = worker;
    activatingWorker = worker;
    state.updatePending = true;
    state.updateError = '';
    state.updateNotice = '';
    activationTimer = window.setTimeout(() => {
      if (disposed) return;
      finishActivation();
      syncRegistration();
      state.updateError = '更新激活未及时完成，本页没有刷新。请稍后重试。';
    }, ACTIVATION_TIMEOUT);
    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
      return true;
    } catch (error) {
      finishActivation();
      state.updateError = `无法启用更新：${errorDetail(error)}`;
      return false;
    }
  }

  function onControllerChange() {
    const controller = container?.controller;
    if (!matchingWorker(controller)) {
      finishActivation();
      previousController = controller;
      return;
    }
    const ownActivation = !!activatingWorker && registration?.active === activatingWorker
      && (activatingWorker.state === 'activating' || activatingWorker.state === 'activated');
    const shouldReload = ownActivation && requestedWorker === activatingWorker && canUpdate();
    syncRegistration();
    if (ownActivation) {
      finishActivation();
      if (shouldReload) window.location.reload();
      else state.updateNotice = '新版本已启用，本页不会自动刷新；下次打开时使用新版本。';
    } else if (previousController && previousController !== controller) {
      finishActivation();
      state.updateNotice = '其他窗口已启用新版本，本页不会自动刷新。';
    }
    previousController = controller;
  }

  watch(canUpdate, safe => {
    if (!safe && requestedWorker) {
      requestedWorker = undefined;
      state.updateNotice = '本页刷新已取消，当前编辑或操作不会被中断。';
    }
  }, { flush: 'sync' });

  function onInstallPrompt(event: Event) {
    if (!available || state.installed) return;
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    state.nativeInstallAvailable = true;
    state.installNotice = '';
    state.installError = '';
  }

  function syncInstalled() {
    state.installed = installedEventSeen || standalone.matches || minimalUi.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (state.installed) {
      installPrompt = undefined;
      state.nativeInstallAvailable = false;
      state.installNotice = '';
      state.installError = '';
    }
  }

  function onAppInstalled() {
    installedEventSeen = true;
    syncInstalled();
  }

  async function promptInstall(): Promise<PwaInstallResult> {
    const prompt = installPrompt;
    if (!prompt || state.installPending || state.installed || disposed) return 'unavailable';
    installPrompt = undefined;
    state.nativeInstallAvailable = false;
    state.installPending = true;
    state.installNotice = '';
    state.installError = '';
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (!disposed && !state.installed) state.installNotice = choice.outcome === 'accepted'
        ? '安装请求已提交，是否安装完成由浏览器确认。'
        : '已取消安装，仍可在浏览器中使用。';
      return choice.outcome;
    } catch (error) {
      if (!disposed) state.installError = `浏览器安装请求失败：${errorDetail(error)}`;
      return 'failed';
    } finally {
      if (!disposed) state.installPending = false;
    }
  }

  function onOnlineChange() {
    state.online = navigator.onLine;
    syncRegistration();
    if (state.online && document.visibilityState === 'visible') void checkForUpdates();
  }

  function onForeground() {
    syncInstalled();
    if (document.visibilityState === 'visible') syncRegistration();
    if (document.visibilityState === 'visible') void checkForUpdates();
  }

  onMounted(() => {
    if (native) return;
    window.addEventListener('online', onOnlineChange);
    window.addEventListener('offline', onOnlineChange);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('focus', onForeground);
    document.addEventListener('visibilitychange', onForeground);
    standalone.addEventListener('change', syncInstalled);
    minimalUi.addEventListener('change', syncInstalled);
    container?.addEventListener('controllerchange', onControllerChange);
    if (available) {
      void registerWorker();
      checkTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible') void checkForUpdates();
      }, CHECK_INTERVAL);
    }
  });

  onBeforeUnmount(() => {
    disposed = true;
    cancelInstallationWait?.();
    finishActivation();
    closeStatusRequest();
    window.clearInterval(checkTimer);
    registration?.removeEventListener('updatefound', onUpdateFound);
    for (const remove of workerListeners.values()) remove();
    workerListeners.clear();
    window.removeEventListener('online', onOnlineChange);
    window.removeEventListener('offline', onOnlineChange);
    window.removeEventListener('beforeinstallprompt', onInstallPrompt);
    window.removeEventListener('appinstalled', onAppInstalled);
    window.removeEventListener('focus', onForeground);
    document.removeEventListener('visibilitychange', onForeground);
    standalone.removeEventListener('change', syncInstalled);
    minimalUi.removeEventListener('change', syncInstalled);
    container?.removeEventListener('controllerchange', onControllerChange);
    installPrompt = undefined;
  });

  return { state: readonly(state), promptInstall, retryPreparation, checkForUpdates, applyUpdate };
}
