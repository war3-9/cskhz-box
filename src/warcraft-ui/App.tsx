import { useState } from 'react';
import { LayoutCanvas } from './canvas/LayoutCanvas';
import { Inspector } from './inspector/Inspector';
import { Toolbar } from './toolbar/Toolbar';
import { useUiTasks } from './tasks/store';
import { useTaskActions } from './tasks/useTaskActions';
import { TaskBar } from './tasks/TaskBar';
import { TaskSaveButton } from './tasks/TaskSaveButton';
import { TaskEmpty } from './tasks/TaskEmpty';
import { TaskDialogs } from './tasks/TaskDialogs';
import { SavedList } from './tasks/SavedList';
import './styles.css';

export function WarcraftWorkspace({ embedded = false, initialMessage = '' }: { embedded?: boolean; initialMessage?: string }) {
  const activeId = useUiTasks(state => state.activeId);
  const [message, setMessage] = useState(initialMessage);
  const [savedList, setSavedList] = useState(false);
  const actions = useTaskActions(setMessage);
  return <div className="warcraft-ui"><main className="app-shell">
    {!embedded && <header className="topbar"><h1>War3 UI Lab</h1></header>}
    <div className="workspace">
      <Toolbar key={`toolbar-${activeId}`} onError={setMessage} onNewBlank={actions.create} onSavedList={() => setSavedList(true)} busy={actions.busy} hasTask={activeId !== null} />
      {activeId !== null ? <><LayoutCanvas key={`canvas-${activeId}`} header={<TaskBar actions={actions} />} saveControl={<TaskSaveButton actions={actions} />}
        footer={<><div className="notice" role="status" title={message}>{message}</div></>} />
        <aside className="properties"><Inspector key={activeId} onMessage={setMessage} /></aside></> : <TaskEmpty actions={actions} />}
    </div>
    {savedList && <SavedList close={() => setSavedList(false)} open={actions.open} />}
    <TaskDialogs actions={actions} />
  </main></div>;
}
export const App = WarcraftWorkspace;
