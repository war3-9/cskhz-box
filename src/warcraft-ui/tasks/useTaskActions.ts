import { useRef, useState } from 'react';
import { useUiTasks } from './store';
import { needsSave } from './types';
import { saveTask } from './actions';
import { readDesign, useDesignLibrary } from './library';

type Pending = { id: string | null; kind: 'switch' | 'close' | 'save'; next: () => void | Promise<void> };
export function useTaskActions(onMessage: (message: string) => void) {
  const [guard, setGuard] = useState<Pending | null>(null);
  const [naming, setNaming] = useState<Pending | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const report = (error: unknown) => { const message = String(error).replace(/^Error: /, ''); setError(message); onMessage(message); };
  const perform = async (work: () => void | Promise<void>) => {
    if (locked.current || useDesignLibrary.getState().busy) return;
    locked.current = true; setBusy(true); setError('');
    try { await work(); } catch (error) { report(error); }
    finally { locked.current = false; setBusy(false); }
  };
  const transition = (next: Pending['next'], id = useUiTasks.getState().activeId, kind: Pending['kind'] = 'switch') => {
    if (locked.current || useDesignLibrary.getState().busy) return;
    const task = useUiTasks.getState().tasks.find(item => item.id === id);
    const pending = { id, kind, next: async () => { await next(); } };
    if (task && needsSave(task)) { setError(''); setGuard(pending); }
    else void perform(pending.next);
  };
  const finishSave = async (pending: Pending, value: string) => {
    if (!pending.id) return;
    const clean = await saveTask(pending.id, value);
    setNaming(null);
    onMessage(clean ? '设计已保存。' : '已保存刚才的内容；新增修改仍未保存。');
    if (!clean) return;
    await pending.next(); setGuard(null);
  };
  const save = (pending: Pending) => {
    if (locked.current || useDesignLibrary.getState().busy) return;
    const task = useUiTasks.getState().tasks.find(item => item.id === pending.id);
    if (!task) return;
    if (!task.saved) { setName(task.name); setNaming(pending); }
    else void perform(() => finishSave(pending, task.name));
  };
  return {
    guard, naming, name, setName, busy, error,
    cancel: () => { if (!busy) { setGuard(null); setNaming(null); } },
    confirmName: () => { if (naming) void perform(() => finishSave(naming, name)); },
    saveGuard: () => { if (guard) save(guard); },
    discardGuard: () => {
      if (guard?.kind === 'close') void perform(async () => {
        await guard.next(); setGuard(null); onMessage('任务已关闭，未保存的修改已放弃。');
      });
    },
    save: () => save({ id: useUiTasks.getState().activeId, kind: 'save', next: () => {} }),
    create: () => transition(() => useUiTasks.getState().create()),
    activate: (id: string) => { if (id !== useUiTasks.getState().activeId) transition(() => useUiTasks.getState().activate(id)); },
    close: (id: string) => transition(() => useUiTasks.getState().close(id), id, 'close'),
    open: (id: string, done: () => void) => {
      const task = useUiTasks.getState().tasks.find(task => task.saved?.id === id);
      if (task?.id === useUiTasks.getState().activeId) { done(); return; }
      transition(async () => { const design = await readDesign(id); useUiTasks.getState().open(design); done(); });
    },
  };
}
export type TaskActions = ReturnType<typeof useTaskActions>;
