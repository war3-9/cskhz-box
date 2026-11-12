import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useUiTasks } from './store';
import { isTaskDirty } from './types';
import { useDesignLibrary } from './library';
import type { TaskActions } from './useTaskActions';
import './tasks.css';

export function TaskBar({ actions }: { actions: TaskActions }) {
  const { tasks, activeId } = useUiTasks();
  const libraryBusy = useDesignLibrary(state => state.busy);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [activeId]);
  const busy = actions.busy || libraryBusy;
  return <div className="ui-task-area">
    <div className="ui-task-tabs" role="tablist" aria-label="UI 设计任务" ref={list}>{tasks.map(task => {
      const dirty = isTaskDirty(task);
      return <div className={`ui-task-tab ${task.id === activeId ? 'active' : ''}`} key={task.id}>
        <button role="tab" aria-selected={task.id === activeId} title={task.name} disabled={busy} onClick={() => actions.activate(task.id)}>
          <span className="ui-task-name">{task.name}</span><span className={`ui-task-dot ${dirty ? 'ui-unsaved' : 'ui-saved'}`}
            role="img" aria-label={dirty ? '未保存' : '已保存'} title={dirty ? '未保存' : '已保存'}
            data-testid={task.id === activeId ? 'ui-save-status' : undefined} /></button>
        <button className="ui-task-close" title={`关闭任务：${task.name}`} aria-label={`关闭任务：${task.name}`} disabled={busy} onClick={() => actions.close(task.id)}><X size={14} /></button>
      </div>;
    })}</div>
  </div>;
}
