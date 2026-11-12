import { readResource, resolveResource } from '../resources/providers';
import type { ResourceRef } from '../types';
import { modelTexturePaths, rewriteTextureNames, textureNames } from './textureNames';

export async function prepareRawModel(ref: ResourceRef, output: string, rename: boolean, dependencies: boolean) {
  const original = new Uint8Array(await readResource(ref));
  const work: { ref: ResourceRef; output: string }[] = [], missing: string[] = [];
  const resolvedNames: { path: string; output: string }[] = [];
  if (dependencies || rename) {
    let paths: string[];
    try { paths = modelTexturePaths(original, ref.path); }
    catch (error) { if (rename) throw error; paths = []; }
    const names = rename ? textureNames(paths, output) : paths.map(path => ({ path, output: path }));
    for (const item of names) {
      try {
        const resolved = await resolveResource(ref.sourceId, item.path, ref.path);
        work.push({ ref: resolved.ref, output: item.output }); resolvedNames.push(item);
      } catch (error) {
        if (!String(error).includes('缺少贴图')) throw error;
        if (!missing.includes(item.path)) missing.push(item.path);
      }
    }
  }
  return { bytes: rename ? rewriteTextureNames(original, ref.path, resolvedNames) : original, work, missing };
}
