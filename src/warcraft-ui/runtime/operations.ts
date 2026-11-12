const pending = new Set<Promise<unknown>>();
export function trackOperation<T>(operation: () => Promise<T>): Promise<T> {
  const task = operation(); pending.add(task);
  void task.then(() => pending.delete(task), () => pending.delete(task));
  return task;
}
export async function drainOperations() {
  while (pending.size) await Promise.allSettled([...pending]);
}
