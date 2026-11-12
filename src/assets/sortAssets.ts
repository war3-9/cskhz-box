import type { Asset } from '../shared/types';

export type AssetSort = 'natural' | 'descending' | 'imported' | 'reverse-imported';
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function sortAssets(assets: Asset[], mode: AssetSort): Asset[] {
  if (mode === 'imported') return [...assets];
  const indexed = assets.map((asset, index) => ({ asset, index }));
  if (mode === 'reverse-imported') return indexed.sort((a, b) => b.index - a.index).map(({ asset }) => asset);
  return indexed.sort((a, b) => {
    const order = collator.compare(a.asset.name, b.asset.name);
    return (mode === 'descending' ? -order : order) || a.index - b.index;
  }).map(({ asset }) => asset);
}
