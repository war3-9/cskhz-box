import { loadModel } from './models';
import { resolveResource } from './providers';
import { normalizePath, type Source } from '../types';

export interface DeletePlan { paths: string[]; warnings: string[] }
export async function modelDeletePlan(source: Source, path: string): Promise<DeletePlan> {
  const loaded = await loadModel({ sourceId: source.id, path }, false);
  const paths = new Set([path]), warnings: string[] = [];
  for (const image of new Set(loaded.model.Textures.map(texture => texture.Image).filter(Boolean))) {
    try {
      const resolved = await resolveResource(source.id, image, path);
      if (resolved.ref.sourceId !== source.id) { warnings.push(`外部贴图保留：${image}`); continue; }
      const entry = source.entries.find(item => normalizePath(item.path) === normalizePath(resolved.ref.path));
      if (!entry) throw new Error('未能确认此贴图在来源内的资源标识');
      paths.add(entry.path);
    } catch (error) { warnings.push(`未加入删除：${image}（${String(error)}）`); }
  }
  return { paths: [...paths], warnings };
}
