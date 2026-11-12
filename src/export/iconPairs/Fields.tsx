import { BatchField } from '../BatchHelp';
import { cleanIconPrefix, iconPairNames, type IconPairOptions } from './config';

export function IconPairFields({ options, update }: { options: IconPairOptions; update: (value: IconPairOptions) => void }) {
  const names = iconPairNames(options.prefix || 'tb', 1);
  return <>
    <BatchField label="文件头" id="batch-icon-prefix" help="输入文件头，例如 tb。正常和暗图使用相同序号；遇到已有文件会一起跳到下一个空闲序号，不覆盖旧文件。">
      <input id="batch-icon-prefix" aria-label="文件头" maxLength={80} value={options.prefix}
        placeholder="例如 tb" onChange={e => update({ ...options, prefix: e.target.value })}
        onBlur={() => update({ ...options, prefix: cleanIconPrefix(options.prefix) })} />
      <p className="batch-pair-example">亮图标：{names.normal}<br />暗图标：{names.disabled}</p>
    </BatchField>
    <BatchField label="暗图亮度（%）" id="batch-icon-brightness" help="先转为黑白，再按此比例压暗。默认 60%；100% 为原亮度的黑白图，0% 为黑色。尺寸和透明度与正常图标一致。">
      <input id="batch-icon-brightness" aria-label="暗图亮度" type="number" min={0} max={100} step={1}
        value={Number.isFinite(options.brightness) ? options.brightness : ''} onChange={e => update({ ...options, brightness: e.target.value === '' ? NaN : Number(e.target.value) })} />
    </BatchField>
  </>;
}
