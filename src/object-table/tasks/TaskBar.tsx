import { useState } from 'react';
import { X, Plus, Link2 } from 'lucide-react';
import { useObjectTasks, taskDirty, activateObjectTask, closeObjectTask, openObjectTask } from './store';
import { guardObjects, saveObjects } from '../files';
import { synchronizePaletteDraft } from '../palette/bridge';
import { ObjectModal } from '../dialogs/Modal';
import { commitObjectEditor } from '../commit';

export function TaskBar({ disabled, run }: { disabled: boolean; run: (work: () => Promise<unknown>) => Promise<void> }) {
  const { tasks, activeId } = useObjectTasks(), [closing, setClosing] = useState<string | null>(null);
  const close = async (id: string) => {
    if (id === activeId) { await synchronizePaletteDraft(); commitObjectEditor(); }
    const task = useObjectTasks.getState().tasks.find(t => t.id === id);
    if (task && taskDirty(task)) setClosing(id); else closeObjectTask(id);
  };
  const saveClose = async () => {
    if (!closing) return;
    // Saving a background tab must first pass the active tab's save gate.
    if (closing !== activeId) { if (!await guardObjects()) return; activateObjectTask(closing); }
    if (await saveObjects()) { closeObjectTask(closing); setClosing(null); }
  };
  return <><div className="ot-taskbar" role="tablist" aria-label="物编任务" inert={disabled}>
    {tasks.map(task => <div key={task.id} className={`ot-task ${task.id === activeId ? 'is-active' : ''}`}>
      <button role="tab" aria-selected={task.id === activeId} onClick={() => void run(async () => { if (task.id !== activeId && await guardObjects()) activateObjectTask(task.id); })} title={task.data.path ?? task.name}>
        <i className={taskDirty(task) ? 'ot-unsaved' : 'ot-saved'} aria-label={taskDirty(task) ? '未保存' : '已保存'} />{task.name}
        {task.data.metadata?.binding && <Link2 size={12} aria-label="已关联地图" />}
      </button><button className="ot-task-close" aria-label={`关闭 ${task.name}`} onClick={() => void run(() => close(task.id))}><X size={13} /></button>
    </div>)}<button className="ot-icon-button" aria-label="新建物编任务" onClick={() => void run(async () => { if (await guardObjects()) openObjectTask(); })}><Plus size={15} /></button>
  </div>{closing && <ObjectModal title="关闭物编任务" close={() => setClosing(null)}><p>此任务有修改，是否保存后关闭？</p><footer><button className="ot-button" onClick={() => setClosing(null)}>取消</button><button className="ot-button" onClick={() => void run(async () => { if (closing === activeId) await synchronizePaletteDraft(); closeObjectTask(closing); setClosing(null); })}>不保存并关闭</button><button className="ot-button ot-primary" onClick={() => void run(saveClose)}>保存并关闭</button></footer></ObjectModal>}</>;
}
