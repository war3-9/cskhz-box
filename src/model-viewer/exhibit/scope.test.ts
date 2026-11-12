import { describe, expect, it } from 'vitest';
import { exhibitEntries } from './scope';
const entries = Array.from({ length: 748 }, (_, index) => ({ path: `${index}.mdx`, size: 1, model: true, anonymous: false }));
describe('model map load ranges', () => {
  it('uses the actual current page instead of selected items or the first page', () => { expect(exhibitEntries(entries, 2, 100, 'page').map(entry => entry.path)).toEqual(entries.slice(200, 300).map(entry => entry.path)); });
  it('loads 200 and 500 beyond the page size and clamps 1000/all to available models', () => { expect([200, 500, 1000, 'all'].map(limit => exhibitEntries(entries, 2, 100, limit as 200 | 500 | 1000 | 'all').length)).toEqual([200, 500, 748, 748]); });
  it('excludes textures and handles a short last page and empty source', () => { expect(exhibitEntries([...entries, { path: 'test.blp', size: 1, model: false, anonymous: false }], 7, 100, 'page')).toHaveLength(48); expect(exhibitEntries([], 0, 100, 'all')).toEqual([]); });
});
