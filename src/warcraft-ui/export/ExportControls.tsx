import { useState } from 'react';
import { Code2, Copy, Download } from 'lucide-react';
import { useLayoutStore } from '../state/layout';
import { exportJass } from './jass';
import { saveText } from '../services/save';
import { TriggerExport } from './TriggerExport';
import { ArrayNameField } from './ArrayNameField';
import { useArrayNameEdit } from './arrayNameEdit';

export function ExportControls({ onMessage }: { onMessage: (message: string) => void }) {
  const nodes = useLayoutStore(state => state.nodes);
  const arrayName = useLayoutStore(state => state.arrayName);
  const valid = useArrayNameEdit(state => state.valid);
  const [exporting, setExporting] = useState(false);
  const saveJass = async () => {
    setExporting(true);
    try { onMessage(`JASS 代码已导出：${await saveText('jass', await exportJass(nodes, arrayName))}`); }
    catch (error) { onMessage(`JASS 导出失败：${String(error)}`); }
    finally { setExporting(false); }
  };
  return <section className="script-exports" aria-label="地图脚本">
    <h2><Code2 size={18} />地图脚本</h2>
    <ArrayNameField onMessage={onMessage} />
    <div className="script-actions">
      <button className="command" title="复制 JASS 代码" aria-label="复制 JASS 代码" disabled={!valid} onClick={async () => {
        try { await navigator.clipboard.writeText(await exportJass(nodes, arrayName)); onMessage('已复制 JASS'); }
        catch { onMessage('复制失败，请导出文件'); }
      }}><Copy size={16} /></button>
      <button className="command" title="导出 JASS 代码" aria-label="导出 JASS 代码" disabled={exporting || !valid} onClick={saveJass}>
        <Download size={16} />导出 JASS</button>
    </div>
    <TriggerExport onMessage={onMessage} />
  </section>;
}
