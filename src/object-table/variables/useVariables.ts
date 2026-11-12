import { useState } from 'react';
import { variableTypes, type DraftVariable } from './model';
import { useObjectTasks } from '../tasks/store';
import { commitTaskVariables, travelTaskVariables } from './taskDocument';
import { validateVariableDocument } from './document';

export function useVariables(taskId: string) {
  const data = useObjectTasks(state => state.tasks.find(task => task.id === taskId)?.data);
  const [rows, setRows] = useState<DraftVariable[]>(data?.variables?.rows ?? []);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(rows) !== JSON.stringify(data?.variables?.rows ?? []);
  const save = async () => {
    try {
      const document = { rows, baseline: data?.variables?.baseline ?? [], source: data?.variables?.source };
      validateVariableDocument(document); commitTaskVariables(taskId, document); setError(''); return true;
    } catch (failure) { setError(String(failure)); return false; }
  };
  const travel = (redo: boolean) => {
    travelTaskVariables(taskId, redo);
    setRows(useObjectTasks.getState().tasks.find(task => task.id === taskId)?.data.variables?.rows ?? []);
  };
  return { rows, setRows, base: data?.variables?.baseline ?? [], types: variableTypes, dirty, error, save,
    undo: () => travel(false), redo: () => travel(true), canUndo: !!data?.pastVariables.length && !dirty, canRedo: !!data?.futureVariables.length && !dirty };
}
