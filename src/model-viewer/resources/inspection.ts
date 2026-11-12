import type { SourceAnalysis } from '../types';
import { normalizePath } from '../types';
import { resourceCandidates } from './resourceCandidates';
export async function inspectFiles(files: File[], paths: string[], models: boolean[]) {
  const analysis: SourceAnalysis = { modelTextures: [], unusedModels: [], usageSupported: false, usageNote: '仅地图支持未使用模型识别' };
  const groups = new Map<number, number>(), used = new Set<string>();
  const entries = new Set(paths.map(normalizePath));
  const worker = new Worker(new URL('./inspection.worker.ts', import.meta.url), { type: 'module' });
  let pending: ((result: { group: number; textures: string[] }) => void) | undefined;
  worker.onmessage = event => pending?.(event.data);
  worker.onerror = () => pending?.({ group: 2, textures: [] });
  try {
    for (let i = 0; i < files.length; i++) if (models[i]) {
      const bytes = await files[i].arrayBuffer();
      const result = await new Promise<{ group: number; textures: string[] }>(resolve => { pending = resolve; worker.postMessage({ id: i, bytes, path: paths[i] }, [bytes]); });
      groups.set(i, result.group);
      for (const texture of result.textures) {
        const match = resourceCandidates(texture, paths[i]).map(normalizePath).find(path => entries.has(path));
        if (match) used.add(match);
      }
    }
  } finally { worker.terminate(); }
  analysis.modelTextures = [...used]; return { groups, analysis };
}
