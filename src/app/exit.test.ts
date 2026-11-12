import { beforeEach, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ notify: vi.fn(), flushWorkspace: vi.fn(), flushWarcraft: vi.fn(), flushViewer: vi.fn(), destroy: vi.fn(), terrain: { busy: false } }));
vi.mock('./uiStore', () => ({ useUi: { getState: () => ({ notify: calls.notify }) } }));
vi.mock('../object-table/persistence', () => ({ flushObjects: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ destroy: calls.destroy }) }));
vi.mock('../project/persistence', () => ({ flushWorkspace: calls.flushWorkspace }));
vi.mock('../warcraft-integration/persistence', () => ({ flushWarcraft: calls.flushWarcraft }));
vi.mock('../model-viewer/persistence/storage', () => ({ flushViewerPersistence: calls.flushViewer }));
vi.mock('../model-viewer/workspace/store', () => ({ useViewer: { getState: () => ({ busy: false, fileBusy: false }) } }));
vi.mock('../model-viewer/resources/providers', () => ({ cancelScan: vi.fn() }));
vi.mock('../model-viewer/export/jobs', () => ({ stopViewerExport: vi.fn(), useViewerJobs: { getState: () => ({ busy: false }) } }));
vi.mock('../export/batchState', () => ({ useBatchState: { getState: () => ({ busy: false }) } }));
vi.mock('../export/useBatchRun', () => ({ stopIconBatch: vi.fn() }));
vi.mock('../warcraft-ui/runtime/operations', () => ({ drainOperations: vi.fn() }));
vi.mock('../terrain-clone/store', () => ({ useTerrainClone: { getState: () => calls.terrain } }));
import { closeApplication } from './exit';
beforeEach(() => { vi.resetAllMocks(); calls.terrain = { busy: false }; });
it('finishes all workspace writes before ending the session and closing', async () => {
  const order: string[] = []; calls.flushWarcraft.mockImplementation(async () => { order.push('warcraft'); });
  calls.flushWorkspace.mockImplementation(async () => { order.push('icons'); }); calls.flushViewer.mockImplementation(async () => { order.push('viewer'); });
  calls.destroy.mockImplementation(async () => { order.push('close'); });
  await closeApplication(); expect(order).toEqual(['warcraft', 'icons', 'viewer', 'close']);
});
it('keeps the window open if saving fails and permits a subsequent retry', async () => {
  calls.flushWorkspace.mockRejectedValueOnce(new Error('磁盘写入失败'));
  await closeApplication(); expect(calls.destroy).not.toHaveBeenCalled();
  expect(calls.notify).toHaveBeenCalledWith(expect.stringContaining('磁盘写入失败'), 'error');
  await closeApplication(); expect(calls.destroy).toHaveBeenCalledTimes(1);
});
it('waits for busy terrain operations before closing', async () => {
  calls.terrain.busy = true; await closeApplication(); expect(calls.destroy).not.toHaveBeenCalled();
  expect(calls.notify).toHaveBeenCalledWith(expect.stringContaining('地图操作正在进行'), 'error');
});
it('does not start another close while workspace writes are pending', async () => {
  let finish!: () => void;
  calls.flushWorkspace.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const pending = closeApplication(); await vi.waitFor(() => expect(calls.flushWorkspace).toHaveBeenCalledOnce());
  await closeApplication(); expect(calls.destroy).not.toHaveBeenCalled();
  finish(); await pending; expect(calls.destroy).toHaveBeenCalledOnce(); expect(calls.flushWorkspace).toHaveBeenCalledOnce();
});

