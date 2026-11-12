import { useLayoutEffect, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ImagePlus, Pencil, Trash2 } from 'lucide-react';
import type { Asset } from '../../shared/types';
import { AssetPreview } from './AssetPreview';
import { AssetDimensions } from './AssetDimensions';
import { IconButton } from '../../shared/components/IconButton';
import { requireCanvas } from '../../canvas/requireCanvas';
import { useEditor } from '../../layers/store';
import { useLibrary } from '../store';

export function AssetGrid({ assets, scroll, isBackground, edit }: {
  assets: Asset[];
  scroll: RefObject<HTMLDivElement | null>;
  isBackground: boolean;
  edit: (asset: Asset) => void;
}) {
  const rows = useVirtualizer({
    count: Math.ceil(assets.length / 2), getScrollElement: () => scroll.current,
    estimateSize: () => 194, overscan: 2, gap: 12,
  });
  useLayoutEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [scroll]);
  return <div className="asset-virtual-grid" style={{ height: rows.getTotalSize() }}>
    {rows.getVirtualItems().map(row => <div key={row.key} data-index={row.index}
      ref={rows.measureElement} className="asset-grid asset-virtual-row" style={{ transform: `translateY(${row.start}px)` }}>
      {assets.slice(row.index * 2, row.index * 2 + 2).map(asset => <article className="asset-card" key={asset.id}>
        <AssetPreview asset={asset} />
        <div className="asset-meta">
          <span title={asset.name}>{asset.name}</span>
          {asset.kind !== 'font' && <IconButton label={isBackground ? `添加${asset.name}底图` : `将${asset.name}设为底图`}
            onClick={() => { if (requireCanvas()) useEditor.getState().setBase(asset); }}><ImagePlus size={14} /></IconButton>}
        </div>
        <AssetDimensions asset={asset} />
        {asset.source === 'user' && <div className="asset-actions">
          <IconButton label={`重命名${asset.name}`} onClick={() => edit(asset)}><Pencil size={13} /></IconButton>
          <IconButton label={`删除素材${asset.name}`} onClick={() => useLibrary.getState().removeAsset(asset.id)}><Trash2 size={13} /></IconButton>
        </div>}
      </article>)}
    </div>)}
  </div>;
}
