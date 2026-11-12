import { expect, it } from 'vitest';
import { PreviewCache } from './previewCache';
it('retains offscreen previews, reuses recent entries and evicts old unprotected GPU resources', () => {
  const destroyed: number[] = [], cache = new PreviewCache<number>(2, 100, value => destroyed.push(value));
  cache.set('a', 1, 40); cache.set('b', 2, 40);
  expect(cache.get('a')).toBe(1);
  cache.set('c', 3, 40); cache.trim(new Set(['c']));
  expect(cache.get('b')).toBeUndefined(); expect(cache.get('a')).toBe(1); expect(destroyed).toEqual([2]);
  cache.set('large', 4, 90); cache.trim(new Set(['large']));
  expect(destroyed).toEqual([2, 3, 1]); expect(cache.get('large')).toBe(4);
  cache.clear(); expect(destroyed).toEqual([2, 3, 1, 4]);
});
it('keeps visible resources protected and disposes replaced generations exactly once', () => {
  const destroyed: number[] = [], cache = new PreviewCache<number>(1, 50, value => destroyed.push(value));
  cache.set('a', 1, 40); cache.set('b', 2, 40); cache.trim(new Set(['a', 'b']));
  expect(destroyed).toEqual([]); cache.set('a', 3, 40); cache.trim(new Set(['a']));
  expect(destroyed).toEqual([1, 2]); expect(cache.get('a')).toBe(3);
});
