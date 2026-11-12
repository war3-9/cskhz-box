import { create } from 'zustand';
import { exportBatch, type BatchJob } from './batchExport';
import { batchSummary, type BatchControl, type BatchStats } from './aiBatch';
interface RunState { busy: boolean; done: number; message: string; retryError: string; phase: string; stopped: boolean }
const useRun = create<RunState>(() => ({ busy: false, done: 0, message: '', retryError: '', phase: '', stopped: false }));
let control: BatchControl = { stopped: false };
let decision: ((retry: boolean) => void) | undefined;
const setMessage = (message: string) => useRun.setState({ message });
const retry = () => { useRun.setState({ retryError: '' }); decision?.(true); decision = undefined; };
export const stopIconBatch = () => { control.stopped = true; useRun.setState({ stopped: true, phase: '正在停止', retryError: '' }); decision?.(false); decision = undefined; };
async function run(job: BatchJob) {
  if (useRun.getState().busy) return;
  useRun.setState({ busy: true, done: 0, message: '', phase: '', stopped: false });
  control = { stopped: false, phase: phase => useRun.setState({ phase }), retry: error => {
    useRun.setState({ retryError: error });
    return new Promise<boolean>(resolve => { decision = resolve; });
  } };
  try {
    const result = await exportBatch(job, done => useRun.setState({ done }), undefined, control) as BatchStats;
    setMessage(batchSummary(result, !job.iconPairs?.enabled && job.namingMode === 'ai'));
  } catch (error) { setMessage(`导出失败：${String(error)}`); }
  finally { useRun.setState({ busy: false, retryError: '' }); decision = undefined; }
}
export function useBatchRun() { return { ...useRun(), setMessage, retry, stop: stopIconBatch, run }; }
