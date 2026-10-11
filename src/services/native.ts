import { invoke, isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { open } from '@tauri-apps/plugin-fs';
import { openUrl } from '@tauri-apps/plugin-opener';

const CHUNK_SIZE = 4 * 1024 * 1024;
let mobilePlatform: Promise<boolean> | undefined;

export function isNativeApp(): boolean {
  return isTauri();
}

/** Saves the actual bytes to a user-selected destination. Cancellation is not an error. */
export async function saveNativeFile(blob: Blob, filename: string): Promise<'saved' | 'cancelled'> {
  if (!isNativeApp()) throw new Error('Native file saving is unavailable in the browser.');
  if (!filename || filename === '.' || filename === '..' || /[/\\\u0000-\u001f\u007f]/.test(filename)) {
    throw new Error('Invalid export filename.');
  }
  mobilePlatform ??= invoke<boolean>('plugin:native-save|is_mobile');
  if (await mobilePlatform) {
    const id = await invoke<string>('plugin:native-save|prepare', { filename, size: blob.size });
    try {
      for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
        const bytes = await blob.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
        await invoke('plugin:native-save|append', bytes, { headers: { 'x-export-token': id } });
      }
      return await invoke<'saved' | 'cancelled'>('plugin:native-save|finish', { id });
    } catch (error) {
      // finish drops staging after success/cancellation/native error; discard handles transfer errors.
      try {
        await invoke('plugin:native-save|discard', { id });
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Native export failed and staging cleanup also failed.');
      }
      throw error;
    }
  }

  const extension = filename.includes('.') ? filename.split('.').pop()! : '';
  const path = await save({
    defaultPath: filename,
    ...(extension ? { filters: [{ name: extension.toUpperCase(), extensions: [extension] }] } : {}),
  });
  if (path === null) return 'cancelled';
  // The official dialog plugin scopes this exact selected path; no filesystem directory is granted.
  const file = await open(path, { write: true, create: true, truncate: true });
  try {
    for (let offset = 0; offset < blob.size; offset += CHUNK_SIZE) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK_SIZE).arrayBuffer());
      let position = 0;
      while (position < bytes.byteLength) {
        const written = await file.write(bytes.subarray(position));
        if (!Number.isInteger(written) || written <= 0 || written > bytes.byteLength - position) {
          throw new Error('The destination did not make progress writing the export.');
        }
        position += written;
      }
    }
  } catch (error) {
    try {
      await file.close();
    } catch (closeError) {
      throw new AggregateError([error, closeError], 'Writing and closing the native export failed.');
    }
    throw error;
  }
  await file.close();
  return 'saved';
}

/** Mount once for the native local UI; call the returned disposer when unmounting. */
export function installNativeLinkHandler(): () => void {
  if (!isNativeApp()) return () => {};
  const handle = (event: MouseEvent) => {
    const anchor = event.composedPath().find(node => node instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
    if (!anchor || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin === window.location.origin) return;
    // Remote pages never receive this local application's IPC bridge.
    event.preventDefault();
    if (url.protocol !== 'https:') return;
    void openUrl(url.href).catch(error => {
      window.dispatchEvent(new CustomEvent('native-link-error', { detail: error instanceof Error ? error.message : String(error) }));
    });
  };
  document.addEventListener('click', handle, true);
  document.addEventListener('auxclick', handle, true);
  return () => {
    document.removeEventListener('click', handle, true);
    document.removeEventListener('auxclick', handle, true);
  };
}
