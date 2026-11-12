import type { MultiFillTarget, NumberToken } from './multi';
import './multi.css';

export function MultiTargetEditor({ seed, tokens, targets, change, unitCount }: { seed: string; tokens: NumberToken[]; targets: MultiFillTarget['targets']; change: (v: MultiFillTarget['targets']) => void; unitCount: number }) {
  const update = (index: number, multiplier?: string) => change([...targets.filter(t => t.index !== index), ...(multiplier === undefined ? [] : [{ index, multiplier }])].sort((a, b) => a.index - b.index));
  return <div className="ot-multi-target">
    <label>当前单元格原文<textarea aria-label="多数字算法原文" readOnly value={seed} rows={3} /></label>
    <div className="ot-multi-actions"><button type="button" className="ot-button" onClick={() => change(tokens.map((_, index) => ({ index, multiplier: targets.find(t => t.index === index)?.multiplier ?? '1' })))}>全选数字</button><button type="button" className="ot-button" onClick={() => change([])}>清空选择</button><span>已选 {targets.length} / {tokens.length} · 本表 {unitCount} 个单位</span></div>
    <div className="ot-multi-list" aria-label="数字与独立倍率">{tokens.map((token, index) => {
      const selected = targets.find(t => t.index === index);
      return <div key={index} className={'ot-multi-number' + (selected ? ' selected' : '')}>
        <label><input type="checkbox" aria-label={'选择第' + (index + 1) + '段数字 ' + token.text} checked={!!selected} onChange={e => update(index, e.target.checked ? '1' : undefined)} /><span><small>第 {index + 1} 段</small> <strong>{token.text}</strong></span></label>
        <p title={seed.slice(Math.max(0, token.start - 24), token.end + 24)}>{seed.slice(Math.max(0, token.start - 14), token.start)}<mark>{token.text}</mark>{seed.slice(token.end, token.end + 14)}</p>
        <label>倍率<input aria-label={'第' + (index + 1) + '段数字倍率'} inputMode="decimal" disabled={!selected} value={selected?.multiplier ?? '1'} onChange={e => update(index, e.target.value)} /></label>
      </div>;
    })}</div>
    {!tokens.length && <p>原文没有可选择的数字。</p>}
  </div>;
}
