import { StyledSelect } from '../../shared/components/StyledSelect';
import { useState } from 'react';
import type { ObjectColumn } from '../schema';
import { ObjectModal } from '../dialogs/Modal';
import { defaultFillRule, fillOperations, seriesValues, validateFillRule, type FillOperation, type FillRule } from './series';
import { arithmeticOperations, type ArithmeticOperation } from './arithmetic';
import { customTarget, readCustomNumber } from './custom';
import { CustomTargetEditor, type TextRange } from './CustomTargetEditor';
import { descriptionNumbers, multiTarget, readMultiNumbers, type MultiFillTarget, type NumberToken } from './multi';
import { MultiTargetEditor } from './MultiTargetEditor';
import type { UnitSettings } from '../numbers/model';
import { PrecisionEditor } from './PrecisionEditor';
import type { FillPrecision } from './precision';

export function FillRuleDialog({ column, seed, sourceLabel, units, unitError, validateRawcode = true, save, close }: { column: ObjectColumn; seed: string; sourceLabel?: string; units?: UnitSettings; unitError?: string; validateRawcode?: boolean; save: (rule: FillRule) => void; close: () => void }) {
  const initial = column.fill ?? defaultFillRule;
  const [operation, setOperation] = useState(initial.operation), [operand, setOperand] = useState(String(initial.operand));
  const [operator, setOperator] = useState<ArithmeticOperation>(initial.custom?.operator ?? 'add');
  const [precisionMode, setPrecisionMode] = useState<FillPrecision['mode']>(initial.multi?.precision?.mode ?? 'full');
  const [digits, setDigits] = useState(String(initial.multi?.precision?.mode === 'decimal' ? initial.multi.precision.digits : 2));
  const [range, setRange] = useState<TextRange | null>(() => {
    if (!initial.custom) return null;
    try { readCustomNumber(seed, initial.custom); return { start: initial.custom.prefix.length, end: seed.length - initial.custom.suffix.length }; } catch { return null; }
  });
  const [targets, setTargets] = useState<MultiFillTarget['targets']>(() => {
    if (!initial.multi || !units) return [];
    try { readMultiNumbers(seed, initial.multi, units); return structuredClone(initial.multi.targets); } catch { return []; }
  });
  let tokens: NumberToken[] = [], tokenError = '';
  if (units) try { tokens = descriptionNumbers(seed, units); } catch (e) { tokenError = String(e).replace(/^Error: /, ''); }
  const arithmetic = operation !== 'auto' && operation !== 'copy' && operation !== 'multi', rule: FillRule = { operation, operand: arithmetic ? Number(operand) : 1 };
  let error = '', preview = '';
  try {
    if (arithmetic && !operand.trim()) throw new Error('请输入运算数值');
    if (operation === 'custom') rule.custom = customTarget(seed, range?.start ?? 0, range?.end ?? 0, operator);
    if (operation === 'multi') {
      if (unitError || tokenError || !units) throw Error(unitError || tokenError || '此工作表缺少单位配置');
      if (precisionMode === 'decimal' && (!/^\d+$/.test(digits) || Number(digits) < 1 || Number(digits) > 20)) throw Error('小数位数必须是 1～20 的整数');
      rule.multi = multiTarget(seed, targets, units, precisionMode === 'decimal' ? { mode: 'decimal', digits: Number(digits) } : { mode: precisionMode });
    }
    validateFillRule(rule);
  } catch (e) { error = String(e).replace(/^Error: /, ''); }
  let previewError = '';
  if (!error && seed) {
    try { preview = [seed, ...seriesValues([seed], 3, { ...column, fill: rule }, validateRawcode, units)].join(operation === 'multi' ? '\n↓\n' : ' → '); }
    catch (e) { previewError = String(e).replace(/^Error: /, ''); }
  }
  const blocked = !!error || operation === 'multi' && !!previewError;
  return <ObjectModal title="列填充算法" close={close} className="ot-fill-dialog"><form onSubmit={e => { e.preventDefault(); if (!blocked) save(rule); }}>
    <p><strong>{column.letter} 列 · {column.title}</strong> <code>{column.field}</code>{sourceLabel && <small className="ot-fill-source-label">读取选中单元格 {sourceLabel}</small>}</p>
    <label>填充算法<StyledSelect aria-label="填充算法" value={operation} onChange={e => setOperation(e.target.value as FillOperation)}>{fillOperations.map(([op, title]) => <option value={op} key={op}>{title}</option>)}</StyledSelect></label>
    {operation === 'custom' && <><CustomTargetEditor seed={seed} range={range} change={setRange} /><label>自定义运算<StyledSelect aria-label="自定义运算" value={operator} onChange={e => setOperator(e.target.value as ArithmeticOperation)}>{arithmeticOperations.map(([op, title]) => <option key={op} value={op}>{title}</option>)}</StyledSelect></label></>}
    {operation === 'multi' && <><MultiTargetEditor seed={seed} tokens={tokens} targets={targets} change={setTargets} unitCount={units?.units.length ?? 0} /><p className="ot-dialog-hint">勾选数字并分别填倍率。首行不变，往下每行乘一次，单位自动换算。</p></>}
    {operation === 'multi' && <PrecisionEditor mode={precisionMode} digits={digits} setMode={setPrecisionMode} setDigits={setDigits} />}
    {arithmetic && <label>运算数值<input aria-label="运算数值" type="number" step="any" value={operand} onChange={e => setOperand(e.target.value)} /></label>}
    {operation !== 'multi' && <p className="ot-dialog-hint">{operation === 'custom' ? '只计算选中的数字，每往下一行算一次。文字格式变了，请重新选数字。' : '从首格开始往下计算。自动模式可根据前两格找规律；编号保留补零，公式按行调整。'}</p>}
    <p className="ot-dialog-hint">保存后，拖动选区右下角或右键“向下填充”。已有数据不会自动改写。</p>
    {error ? <p role="alert">{error}</p> : previewError ? <p role="status">当前首格无法预览：{previewError}</p> : <p role="status">{preview ? `填充预览：${preview}` : '在本列首格输入起始值后可预览序列。'}</p>}
    <footer><button type="button" className="ot-button" onClick={close}>取消</button><button type="submit" className="ot-button ot-primary" disabled={blocked}>保存算法</button></footer>
  </form></ObjectModal>;
}
