import { Download } from 'lucide-react';
import type { BatchFormat } from './batchConfig';
import type { useBatchRun } from './useBatchRun';

interface Props {
  outputSize?: { width: number; height: number };
  count: number;
  format: BatchFormat;
  paired: boolean;
  error: string;
  preparing: boolean;
  run: ReturnType<typeof useBatchRun>;
  close: () => void;
}
export function BatchFooter({ outputSize, count, format, paired, error, preparing, run, close }: Props) {
  const { busy, done, message, retryError, phase } = run;
  return <footer className="batch-footer">
    <div className="batch-summary">
      <span>{outputSize ? `${outputSize.width} × ${outputSize.height} px` : '无任务'}</span>
      <span>{paired ? `${count} 个图标，共导出 ${count * 2} 个 BLP 文件` : `${count} 张 · ${format.toUpperCase()}`}</span>
    </div>
    <div role="status" className="batch-status">
      {busy ? `${phase || '准备导出'} · 已导出 ${done} / ${count}${paired ? ' 对图标' : ''}` : preparing ? '正在创建光暗图标目录…' : error || message}
    </div>
    {retryError && <div className="batch-retry" role="alert"><span>{retryError}</span><button type="button" onClick={run.retry}>重试当前张</button></div>}
    {busy && <progress value={done} max={count} />}
    <div className="dialog-actions">
      {busy && <button type="button" disabled={run.stopped} onClick={run.stop}>停止</button>}
      <button type="button" disabled={busy} onClick={close}>关闭</button>
      <button className="primary" disabled={busy || preparing || !!error}><Download size={16} />{busy ? '导出中…' : '开始导出'}</button>
    </div>
  </footer>;
}
