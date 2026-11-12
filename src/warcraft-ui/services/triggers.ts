import { invoke, isTauri } from '@tauri-apps/api/core';
import { BlobWriter, Uint8ArrayReader, ZipWriter } from '@zip.js/zip.js';
import { download } from '../../shared/download';
import { trackOperation } from '../runtime/operations';

export function saveTriggers(files: { wtg: Uint8Array; wct: Uint8Array }): Promise<string> {
  return trackOperation(async () => {
    if (isTauri()) return invoke<string>('save_lab_triggers', { wtg: Array.from(files.wtg), wct: Array.from(files.wct) });
    const zip = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false });
    await zip.add('war3map.wtg', new Uint8ArrayReader(files.wtg));
    await zip.add('war3map.wct', new Uint8ArrayReader(files.wct));
    const filename = '魔兽UI-T触发.zip';
    download(await zip.close(), filename);
    return filename;
  });
}
