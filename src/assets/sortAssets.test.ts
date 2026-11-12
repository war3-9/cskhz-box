import { expect, it } from 'vitest';
import type { Asset } from '../shared/types';
import { sortAssets } from './sortAssets';

const assets = ['1', '10', '2', 'A03', 'A2'].map((name, index) => ({ id: String(index), name }) as Asset);

it('sorts numbers in names naturally and keeps ties stable', () => {
  expect(sortAssets(assets, 'natural').map(asset => asset.name)).toEqual(['1', '2', '10', 'A2', 'A03']);
});

it('supports reverse names and both directions of the original order', () => {
  expect(sortAssets(assets, 'descending').map(asset => asset.name)).toEqual(['A03', 'A2', '10', '2', '1']);
  expect(sortAssets(assets, 'imported')).toEqual(assets);
  expect(sortAssets(assets, 'reverse-imported').map(asset => asset.name)).toEqual(['A2', 'A03', '2', '10', '1']);
  expect(assets.map(asset => asset.name)).toEqual(['1', '10', '2', 'A03', 'A2']);
});
