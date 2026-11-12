const acceptedImageTypes = new Set(["image/png", "image/jpeg"]);
import { importImage } from '../shared/image';
import type { Asset } from '../shared/types';

export const IMPORT_CONCURRENCY = 2;
export async function importAssetFiles(files: File[], options: {
  signal: AbortSignal;
  onProgress: (completed: number) => void;
}): Promise<Asset[]> {
  const assets: Asset[] = new Array(files.length);
  let next = 0, completed = 0;
  let failure: unknown;
  const workers = Array.from({ length: Math.min(IMPORT_CONCURRENCY, files.length) }, async () => {
    while (!failure && !options.signal.aborted) {
      const index = next++;
      if (index >= files.length) return;
      try {
        assets[index] = await importImage(files[index]);
        options.onProgress(++completed);
        // Give input, progress painting and cancellation a turn between files.
        await new Promise(resolve => setTimeout(resolve, 0));
      } catch (error) { failure = new Error(`${files[index].name}：${String(error)}`); }
    }
  });
  await Promise.all(workers);
  if (failure) throw failure;
  options.signal.throwIfAborted();
  return assets;
}

export function filterImportableImages(files: Iterable<File>): File[] {
  return Array.from(files).filter(
    (file) =>
      acceptedImageTypes.has(file.type.toLowerCase()) ||
      /\.(png|jpe?g)$/i.test(file.name),
  );
}
