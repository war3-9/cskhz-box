import { StyledSelect } from '../../shared/components/StyledSelect';
import { useState } from 'react';
import { Modal } from '../../shared/components/Modal';
import { flushObjects, useObjectSaveStatus } from '../persistence';
import { updateObjectPreferences, useObjectPreferences } from './store';
import './settings.css';

export function ObjectSettingsDialog({ close }: { close: () => void }) {
  const realtime = useObjectPreferences(s => s.realtime), interval = useObjectPreferences(s => s.intervalSeconds);
  const closePaletteOnSave = useObjectPreferences(s => s.closePaletteOnSave), showWar3Colors = useObjectPreferences(s => s.showWar3Colors);
  const status = useObjectSaveStatus(), [error, setError] = useState(''), [tab, setTab] = useState<'general' | 'realtime'>('general');
  const update = (value: Parameters<typeof updateObjectPreferences>[0]) => { try { updateObjectPreferences(value); setError(''); } catch (error) { setError(String(error)); } };
  return <Modal title="物编表格设置" close={close} className="ot-settings">
    <div className="ot-settings-tabs" role="tablist" aria-label="物编设置分类">{(['general', 'realtime'] as const).map(id => <button key={id} type="button" role="tab" id={`ot-settings-tab-${id}`} aria-selected={tab === id} aria-controls={`ot-settings-panel-${id}`} onClick={() => setTab(id)}>{id === 'general' ? '常规设置' : '实时设置'}</button>)}</div>
    <div role="tabpanel" id="ot-settings-panel-general" aria-labelledby="ot-settings-tab-general" hidden={tab !== 'general'}>
      <section><h3>色板与表格</h3>
        <label className="ot-setting-switch"><span>色板点击保存自动关闭色板<small>点击保存并成功应用文字后，自动收起色板。</small></span><input type="checkbox" checked={closePaletteOnSave} onChange={e => update({ closePaletteOnSave: e.target.checked })} /></label>
        <label className="ot-setting-switch"><span>表格直接显示 War3 颜色<small>显示彩色文字与换行；取消勾选后显示原始代码。</small></span><input type="checkbox" checked={showWar3Colors} onChange={e => update({ showWar3Colors: e.target.checked })} /></label>
      </section>
      <section><h3>界面记忆</h3><p>按工作簿记忆六类表头列宽、冻结线及横纵滚动位置；色板窗口位置、大小和两个编辑区高度会分别记忆。</p></section>
    </div>
    <div role="tabpanel" id="ot-settings-panel-realtime" aria-labelledby="ot-settings-tab-realtime" hidden={tab !== 'realtime'}>
      <section><h3>保存与恢复</h3>
      <label className="ot-setting-switch"><span>实时保存<small>提交修改约 1 秒后保存；连续修改最多合并 5 秒，不打断输入。</small></span><input type="checkbox" aria-label="实时保存" checked={realtime} onChange={e => update({ realtime: e.target.checked })} /></label>
      <label className="ot-setting-interval">定时保存间隔<StyledSelect aria-label="定时保存间隔" value={interval} onChange={e => update({ intervalSeconds: Number(e.target.value) })}>{[5, 10, 30, 60, 120, 300, 600].map(seconds => <option key={seconds} value={seconds}>{seconds < 60 ? `${seconds} 秒` : `${seconds / 60} 分钟`}</option>)}</StyledSelect></label>
      <p>关闭实时保存后，按上述间隔保存有变化的工作区。滚动位置也会记忆，退出前会等待保存完成。</p>
      <p>自动保存用于恢复工作区；“保存工作簿”会写入 .war3objects 文件。原 Excel 不会被修改。</p>
      <div className="ot-setting-status" role="status">{status.phase === 'saving' ? '正在保存…' : status.phase === 'error' ? `保存失败：${status.error}` : status.phase === 'pending' ? '有修改，等待自动保存' : status.lastSaved ? `已保存恢复副本 ${new Date(status.lastSaved).toLocaleTimeString()}` : '工作区已就绪'}</div>
      <button className="ot-button" disabled={status.phase === 'saving'} onClick={() => { void flushObjects().catch(error => setError(String(error))); }}>立即保存恢复副本</button>
      </section>
    </div>
    {error && <p role="alert">{error}</p>}
  </Modal>;
}
