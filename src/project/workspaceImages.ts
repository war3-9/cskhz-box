import { prepareImageReference, restoredImageUrl, storedImageReference, storeImage } from '../assets/imageRepository';
import { importImage } from '../shared/image';

const imageFields = new Set(['imagePath', 'thumbnailPath', 'thumbnail']);

// Inline pixels are local data, not a network request. Desktop connect-src
// deliberately excludes data: URLs, so fetch(data:) cannot migrate old workspaces.
function inlineImageBlob(path: string): Blob {
  const separator = path.indexOf(',');
  const type = path.slice(5, path.indexOf(';'));
  const decoded = atob(path.slice(separator + 1));
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
  return new Blob([bytes], { type });
}

// Traverse image fields only; text/user names must never be interpreted as URLs.
// Files are committed before the small workspace manifest references them.
export async function workspaceImages(value: unknown, restore = false, onError?: (error: unknown) => void): Promise<unknown> {
  const converted = new Map<string, Promise<string>>();
  const image = (path: string): Promise<string> => {
    let operation = converted.get(path);
    if (!operation) {
      operation = (async () => {
        if (/^data:image\/(png|jpeg);base64,/.test(path)) {
          path = await storeImage(inlineImageBlob(path));
        }
        if (restore) { await prepareImageReference(path); return restoredImageUrl(path); }
        return storedImageReference(path);
      })().catch(error => { if (!onError) throw error; onError(error); return path; });
      converted.set(path, operation);
    }
    return operation;
  };
  let visited = 0;
  const visit = async (node: unknown): Promise<unknown> => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) {
      const output: unknown[] = [];
      for (const item of node) output.push(await visit(item));
      return output;
    }
    const record = node as Record<string, unknown>;
    // Migrate old full-size thumbnail copies before exposing the library UI.
    let migrated: { imagePath: string; thumbnailPath: string } | undefined;
    if (restore && record.source === 'user' && record.kind !== 'font' &&
        typeof record.imagePath === 'string' && record.thumbnailPath === record.imagePath &&
        /^data:image\/(png|jpeg);base64,/.test(record.imagePath)) {
      try {
        const blob = inlineImageBlob(record.imagePath);
        const asset = await importImage(new File([blob], 'legacy.png', { type: blob.type }));
        migrated = asset;
        converted.set(record.imagePath, Promise.resolve(asset.imagePath));
      } catch (error) { if (!onError) throw error; onError(error); }
    }
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      output[key] = migrated && (key === 'imagePath' || key === 'thumbnailPath') ? migrated[key]
        : imageFields.has(key) && typeof entry === 'string' ? await image(entry) : await visit(entry);
    }
    if (++visited % 32 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    return output;
  };
  return visit(value);
}
