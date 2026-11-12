import { taskProject, type ObjectTask } from '../tasks/store';
import { createNativeCompiler } from './compilationCache';

const compilers = new Map<string, ReturnType<typeof createNativeCompiler>>();
export function compileTask(task: ObjectTask) {
  let compile = compilers.get(task.id);
  if (!compile) {
    if (compilers.size >= 100) compilers.delete(compilers.keys().next().value!);
    compile = createNativeCompiler(); compilers.set(task.id, compile);
  }
  return compile(taskProject(task));
}
export const releaseTaskCompiler = (id: string) => compilers.delete(id);
