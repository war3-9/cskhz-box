import { StyledSelect } from '../../shared/components/StyledSelect';
import type { FillPrecision } from './precision';

export function PrecisionEditor({ mode, digits, setMode, setDigits }: { mode: FillPrecision['mode']; digits: string; setMode: (v: FillPrecision['mode']) => void; setDigits: (v: string) => void }) {
  return <div>
    <label>数值精度<StyledSelect aria-label="数值精度" value={mode} onChange={e => setMode(e.target.value as FillPrecision['mode'])}>
      <option value="full">完整精度</option><option value="integer">四舍五入取整</option><option value="decimal">保留小数位数</option>
    </StyledSelect></label>
    {mode === 'decimal' && <label>小数位数<input aria-label="小数位数" type="number" min={1} max={20} step={1} value={digits} onChange={e => setDigits(e.target.value)} /></label>}
    {mode !== 'full' && <p className="ot-dialog-hint">换算单位后四舍五入，自动去掉末尾零。属性按最终介绍读取；续拉从最后一格的数值开始。</p>}
  </div>;
}
