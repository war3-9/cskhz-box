import type { ObjectProject } from '../model';
export function startExcelImport(blob: Blob, progress: (message: string, fraction: number) => void) {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  let rejectTask: (reason: Error) => void;
  const promise = new Promise<ObjectProject>((resolve, reject) => {
    rejectTask = reject;
    worker.onmessage = event => {
      if (event.data.project) { resolve(event.data.project); worker.terminate(); }
      else if (event.data.error) { reject(new Error(event.data.error)); worker.terminate(); }
      else progress(event.data.message, event.data.fraction);
    };
    worker.onerror = event => { reject(new Error(event.message)); worker.terminate(); };
    worker.postMessage(blob);
  });
  return { promise, cancel: () => { worker.terminate(); rejectTask(new Error('已取消 Excel 导入')); } };
}
