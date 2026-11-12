import { Save } from 'lucide-react';
import { useDesignLibrary } from './library';
import type { TaskActions } from './useTaskActions';

export function TaskSaveButton({ actions }: { actions: TaskActions }) {
  const libraryBusy = useDesignLibrary(state => state.busy);
  const busy = actions.busy || libraryBusy;
  return <button className="primary ui-task-save" disabled={busy} onClick={actions.save}>
    <Save size={17} />{busy ? '处理中…' : '保存'}
  </button>;
}
