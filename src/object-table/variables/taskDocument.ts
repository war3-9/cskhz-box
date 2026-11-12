import { updateObjectTask, useObjectTasks } from '../tasks/store';
import { validateVariableDocument, type VariableDocument } from './document';

export function commitTaskVariables(id: string, variables: VariableDocument) {
  validateVariableDocument(variables);
  const data = useObjectTasks.getState().tasks.find(t => t.id === id)?.data;
  if (!data) throw new Error('变量所属任务已关闭');
  if (JSON.stringify(data.variables) !== JSON.stringify(variables)) updateObjectTask(id, {
    variables, pastVariables: [...data.pastVariables.slice(-79), data.variables], futureVariables: [],
  });
}
export function travelTaskVariables(id: string, redo: boolean) {
  const data = useObjectTasks.getState().tasks.find(t => t.id === id)?.data;
  if (!data) return;
  if (redo && data.futureVariables.length) updateObjectTask(id, {
    variables: data.futureVariables[0], pastVariables: [...data.pastVariables, data.variables], futureVariables: data.futureVariables.slice(1),
  });
  if (!redo && data.pastVariables.length) updateObjectTask(id, {
    variables: data.pastVariables.at(-1), pastVariables: data.pastVariables.slice(0, -1), futureVariables: [data.variables, ...data.futureVariables],
  });
}
