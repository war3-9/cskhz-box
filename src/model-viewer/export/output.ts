import { invoke, isTauri } from '@tauri-apps/api/core';
export function safePath(path: string) {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).map(part => {
    let value = part.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '');
    if (!value || value === '.' || value === '..') value = '_';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(value)) value = `_${value}`;
    return value;
  }).join('/');
}
export async function writeOutput(directory: string, relative: string, bytes: Uint8Array) {
  const path = safePath(relative);
  if (isTauri()) return invoke<string>('viewer_write', { directory, relative: path, bytes: [...bytes] });
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)]));
  const link = document.createElement('a'); link.href = url; link.download = path.replace(/\//g, '_'); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return path;
}
