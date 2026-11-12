import { X, RotateCcw, Square } from 'lucide-react';
import { retryViewerExport, stopViewerExport, useViewerJobs } from './jobs';
export function ExportProgress() {
  const state = useViewerJobs();
  if (!state.message) return null;
  const total = state.modelsTotal || state.total, done = state.modelsTotal ? state.modelsDone : state.done;
  return <div className="viewer-progress" role="status" data-model-total={state.modelsTotal} data-model-done={state.modelsDone}><span title={state.message}>{state.message}</span>{state.busy && <><progress aria-label={state.modelsTotal ? '模型导出进度' : '资源导出进度'} max={total} value={done} /><span>{done} / {total} 个{state.modelsTotal ? '模型' : '资源'}</span>{state.modelsTotal > 0 && <span>贴图 {state.textures}</span>}<button title="停止导出" disabled={state.stopped} onClick={stopViewerExport}><Square size={14} /></button></>}
    {!!state.failed.length && <details className="failed"><summary>失败 {state.failed.length}</summary>{state.failed.map((f, i) => <div key={i}>{f.work.output}：{f.error}</div>)}</details>}
    {!!state.missing.length && <details><summary>缺少贴图 {state.missing.length}</summary><p>以下依赖未找到。请挂载包含这些贴图的魔兽资源或补充文件夹后重新导出。</p>{state.missing.map(path => <div key={path}>{path}</div>)}</details>}
    {!state.busy && <>{!!state.failed.length && <button title="重试失败项" onClick={retryViewerExport}><RotateCcw size={15} /></button>}<button title="关闭导出结果" onClick={() => useViewerJobs.setState({ message: '' })}><X size={15} /></button></>}</div>;
}
