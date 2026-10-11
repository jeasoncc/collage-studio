import { configDefaults, defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pwaBase = '/';
const nativeBuild = process.env.COLLAGE_NATIVE === '1';
const pwaEnabled = !nativeBuild && !!process.env.COLLAGE_PWA_BUILD_ID;
const pwaBuildId = process.env.COLLAGE_PWA_BUILD_ID || new Date().toISOString();
let pwaOutputDirectory = resolve('dist');

export default defineConfig({
  // vite-plugin-pwa forwards Vite's define values to its separate worker build.
  define: { __COLLAGE_NATIVE__: JSON.stringify(nativeBuild), __COLLAGE_PWA_BUILD_ID__: JSON.stringify(pwaBuildId), __COLLAGE_PWA_ENABLED__: JSON.stringify(pwaEnabled) },
  test: { exclude: [...configDefaults.exclude, 'third_party/codecs/.work/**'] },
  plugins: [
    vue(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      injectRegister: false,
      registerType: 'prompt',
      scope: pwaBase,
      // The existing server already serves .json correctly; no shared Nginx change is needed.
      manifestFilename: 'manifest.json',
      devOptions: { enabled: false },
      integration: {
        configureOptions(config, options) {
          // Explicit release builds enable the dedicated-domain root PWA, never dev builds.
          options.disable = config.command !== 'build' || !pwaEnabled || config.base !== pwaBase;
          pwaOutputDirectory = resolve(config.root, config.build.outDir);
        },
      },
      manifest: {
        id: pwaBase,
        name: '拼贴时光',
        short_name: '拼贴',
        description: '在设备本地创作、恢复和导出照片拼贴，支持离线使用。',
        lang: 'zh-CN',
        start_url: pwaBase,
        scope: pwaBase,
        display: 'standalone',
        background_color: '#f5f5ef',
        theme_color: '#284b3d',
        icons: [
          { src: `${pwaBase}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${pwaBase}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${pwaBase}icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      includeAssets: ['icons/*.png', 'third-party-notices.txt'],
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,json,webmanifest,woff,woff2,ttf,otf,eot,png,jpg,jpeg,webp,avif,gif,svg,txt}'],
        globIgnores: ['**/*.wasm', '**/*.{onnx,safetensors,bin,pt,pth}', '**/*.map'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        manifestTransforms: [async entries => ({
          manifest: await Promise.all(entries.map(async entry => {
            const relativeUrl = entry.url.startsWith(pwaBase) ? entry.url.slice(pwaBase.length) : entry.url;
            const bytes = await readFile(resolve(pwaOutputDirectory, decodeURI(relativeUrl)));
            return { ...entry, integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}` };
          })),
          warnings: [],
        })],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: process.env.TAURI_DEV_HOST || '0.0.0.0',
    port: 5178,
    strictPort: true,
    hmr: process.env.TAURI_DEV_HOST ? { protocol: 'ws', host: process.env.TAURI_DEV_HOST, port: 5220 } : undefined,
    watch: { ignored: ['**/src-tauri/**', '**/third_party/codecs/.work/**', '**/third_party/codecs/relink/**'] },
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  build: { target: 'es2022', outDir: nativeBuild ? 'dist-native' : 'dist' },
  worker: { format: 'es' },
});
