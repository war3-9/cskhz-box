import type { Entry } from '../types';
export type ExhibitLimit = 'page' | 200 | 500 | 1000 | 'all';
export function exhibitEntries(entries: Entry[], page: number, pageSize: number, limit: ExhibitLimit) {
  const models = entries.filter(entry => entry.model);
  return limit === 'page' ? models.slice(page * pageSize, (page + 1) * pageSize) : models.slice(0, limit === 'all' ? models.length : limit);
}
