import { getCurrentWindow } from '@tauri-apps/api/window';
import { flushWorkspace } from '../project/persistence';
import { useViewer } from '../model-viewer/workspace/store';
import { cancelScan } from '../model-viewer/resources/providers';
import { stopViewerExport, useViewerJobs } from '../model-viewer/export/jobs';
import { useBatchState } from '../export/batchState';
import { stopIconBatch } from '../export/useBatchRun';
import { useUi } from './uiStore';
import { flushWarcraft } from '../warcraft-integration/persistence';
import { drainOperations } from '../warcraft-ui/runtime/operations';
import { flushViewerPersistence } from '../model-viewer/persistence/storage';
import { useTerrainClone } from '../terrain-clone/store';
import { flushObjects } from '../object-table/persistence';
let closing = false;
async function runExitOperation(operation: () => Promise<void>) {
  if (closing) throw new Error('退出正在处理中，请稍候。');
  if (useTerrainClone.getState().busy) throw new Error('地形地图操作正在进行，请完成后再退出。');
  if ((useBatchState.getState().busy || useViewerJobs.getState().busy || useViewer.getState().busy || useViewer.getState().fileBusy) && !window.confirm('仍有任务正在运行。停止扫描/导出并等待文件操作完成后退出软件？')) throw new Error('已取消退出，工作区继续保留。');
  closing = true;
  try {
    stopIconBatch(); stopViewerExport(); await cancelScan();
    while (useBatchState.getState().busy || useViewerJobs.getState().busy || useViewer.getState().fileBusy) await new Promise(resolve => setTimeout(resolve, 100));
    await drainOperations(); await flushWarcraft();
    await flushWorkspace(); await flushViewerPersistence(); await flushObjects(); await operation();
  }
  finally { closing = false; }
}
export async function closeApplication() {
  if (closing) return;
  try { await runExitOperation(async () => { await getCurrentWindow().destroy(); }); }
  catch (error) { useUi.getState().notify(`退出失败：${String(error)}`, 'error'); }
}
