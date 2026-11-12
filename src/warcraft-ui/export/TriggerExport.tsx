import { useState } from 'react';
import { ListTree } from 'lucide-react';
import { saveTriggers } from '../services/triggers';
import { exportT } from './wtg';
import { useLayoutStore } from '../state/layout';
import { TriggerResult, type TriggerResultState } from './TriggerResult';
import { useArrayNameEdit } from './arrayNameEdit';
import { useTSettings } from './tSettings';
import { StyledSelect } from '../../shared/components/StyledSelect';

export function TriggerExport({ onMessage }: { onMessage: (message: string) => void }) {
  const nodes = useLayoutStore((state) => state.nodes);
  const arrayName = useLayoutStore(state => state.arrayName);
  const valid = useArrayNameEdit(state => state.valid);
  const [busy, setBusy] = useState(false);
  const mode = useTSettings(state => state.mode);
  const setMode = useTSettings(state => state.setMode);
  const [result, setResult] = useState<TriggerResultState | null>(null);
  const save = async () => {
    setBusy(true);
    setResult({ status: 'saving', detail: '正在生成并保存触发文件…' });
    try {
      const files = await exportT(nodes, arrayName, mode);
      const path = await saveTriggers(files);
      onMessage(`T 触发已导出：${path}`);
      setResult({ status: 'success', detail: path });
    } catch (error) { onMessage(`T 触发导出失败：${String(error)}`); setResult({ status: 'error', detail: String(error) }); }
    finally { setBusy(false); }
  };
  return <><StyledSelect aria-label="T 生成方式" value={mode} disabled={busy} title="循环生成使用 KK 局部变量双层循环" onChange={event => setMode(event.target.value as typeof mode)}>
      <option value="individual">逐条生成</option><option value="loop">循环生成</option>
    </StyledSelect><button className="command" disabled={busy || !valid} onClick={save}><ListTree size={16} />导出 T 触发</button>
    {result && <TriggerResult result={result} onClose={() => setResult(null)} />}</>;
}
