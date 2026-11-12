import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { createStore, get, set } from 'idb-keyval';

const referencePattern = /^library-image:\/\/([a-f0-9]{64})$/;
const references = new Map<string, string>();
const urls = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let database: ReturnType<typeof createStore> | undefined;
const store = () => database ??= createStore('box-icon-images', 'images');

export function storedImageReference(url: string): string {
  return references.get(url) ?? url;
}

export function restoredImageUrl(reference: string): string {
  const match = referencePattern.exec(reference);
  if (!match) return reference;
  const url = urls.get(reference) ?? (isTauri() ? convertFileSrc(match[1], 'box-image') : undefined);
  if (!url) throw new Error('素材图片尚未恢复，请重新打开工作区。');
  urls.set(reference, url);
  references.set(url, reference);
  return url;
}

export async function prepareImageReference(reference: string): Promise<void> {
  const match = referencePattern.exec(reference);
  if (!match || urls.has(reference)) return;
  if (isTauri()) { restoredImageUrl(reference); return; }
  const blob = await get<Blob>(match[1], store());
  if (!(blob instanceof Blob)) throw new Error('本地素材图片缺失。');
  const url = URL.createObjectURL(blob);
  urls.set(reference, url);
  references.set(url, reference);
}

// Originals live outside workspace JSON. Native imports send binary IPC, avoiding
// base64 strings and arrays of millions of JSON numbers.
export async function storeImage(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const reference = `library-image://${hash}`;
  if (urls.has(reference)) return urls.get(reference)!;
  let operation = pending.get(reference);
  if (!operation) {
    operation = (async () => {
      let url: string;
      if (isTauri()) {
        await invoke('icon_image_store', bytes, { headers: { 'x-box-image-hash': hash } });
        url = convertFileSrc(hash, 'box-image');
      } else {
        await set(hash, blob, store());
        url = URL.createObjectURL(blob);
      }
      urls.set(reference, url);
      references.set(url, reference);
      return url;
    })();
    pending.set(reference, operation);
  }
  try { return await operation; }
  finally { if (pending.get(reference) === operation) pending.delete(reference); }
}

export function isStoredImageUrl(url: string): boolean {
  return references.has(url);
}
