import { normalizePath, resourceKey, type Source, type ResourceRef } from '../types';

export function migrateAnonymousPath(path: string) {
  return path.replace(/^file(\d+)\.(mdx|mdl)$/i, (_, index: string, extension: string) => `file_${Number(index).toString().padStart(6, '0')}.${extension.toLowerCase()}`);
}
function migrateKey(key: string) {
  const split = key.lastIndexOf('|');
  return split < 0 || !/\.(w3x|w3m|mpq)$/i.test(key.slice(0, split)) ? key : key.slice(0, split + 1) + migrateAnonymousPath(key.slice(split + 1));
}
export function migrateAnonymousKeys(data: { selected?: string[]; favorites?: string[]; categories?: Record<string, string>; exportNames?: Record<string, string> }) {
  return {
    ...(data.selected ? { selected: [...new Set(data.selected.map(migrateKey))] } : {}),
    ...(data.favorites ? { favorites: [...new Set(data.favorites.map(migrateKey))] } : {}),
    ...(data.categories ? { categories: Object.fromEntries(Object.entries(data.categories).map(([key, value]) => [migrateKey(key), value])) } : {}),
    ...(data.exportNames ? { exportNames: Object.fromEntries(Object.entries(data.exportNames).map(([key, value]) => [migrateKey(key), value])) } : {}),
  };
}

export function migrateRecoveredNames(source: Source, data: { selected: string[]; favorites: string[]; categories: Record<string, string>; exportNames: Record<string, string>; current?: ResourceRef }) {
  if (source.kind !== 'archive') return {};
  const paths = new Map<string, string>();
  for (const entry of source.entries) if (entry.legacyPath) {
    paths.set(normalizePath(entry.legacyPath), entry.path);
    paths.set(normalizePath(migrateAnonymousPath(entry.legacyPath)), entry.path);
  }
  if (!paths.size) return {};
  const prefix = `${normalizePath(source.path)}|`;
  const migrate = (key: string) => {
    const path = key.startsWith(prefix) ? paths.get(normalizePath(key.slice(prefix.length))) : undefined;
    return path ? resourceKey(source, path) : key;
  };
  const records = (values: Record<string, string>) => Object.fromEntries(Object.entries(values)
    .sort(([a], [b]) => Number(a === migrate(a)) - Number(b === migrate(b))).map(([key, value]) => [migrate(key), value]));
  const currentPath = data.current?.sourceId === source.id ? paths.get(normalizePath(data.current.path)) : undefined;
  return {
    selected: [...new Set(data.selected.map(migrate))], favorites: [...new Set(data.favorites.map(migrate))],
    categories: records(data.categories), exportNames: records(data.exportNames),
    ...(currentPath && data.current ? { current: { ...data.current, path: currentPath } } : {}),
  };
}
