import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), notify: vi.fn() }));
vi.mock('idb-keyval', () => ({ get: mocks.get, set: mocks.set }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
vi.mock('../app/uiStore', () => ({ useUi: { getState: () => ({ notify: mocks.notify }) } }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers(); vi.stubGlobal('window', new EventTarget()); mocks.get.mockResolvedValue(null); mocks.set.mockResolvedValue(undefined); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('物编独立恢复与退出写入', () => {
  it('色板保存的颜色代码可自动保存并恢复', async () => {
    const { initializeObjects, useObjectSaveStatus } = await import('./persistence');
    const { useObjectTable } = await import('./store');
    const { openPalette, updatePaletteDraft, commitPaletteDraft, useBrowserPalette } = await import('./palette/bridge');
    const { restoreObjectWorkspace } = await import('./tasks/store');
    await initializeObjects();
    await openPalette('item', 0, 2);
    const raw = '|cffffff00无色神光|r';
    updatePaletteDraft({ target: useBrowserPalette.getState().target!, value: raw });
    commitPaletteDraft();
    await vi.advanceTimersByTimeAsync(1001);
    const text = mocks.set.mock.calls.at(-1)![1];
    const saved = JSON.parse(text);
    expect(saved.version).toBe(2);
    expect(saved.tasks[0].project.version).toBe(3);
    expect(saved.tasks[0].project.sheets.item.rows[0].cells['item:D']).toBe(raw);
    expect(useObjectSaveStatus.getState().phase).toBe('idle');
    useObjectTable.getState().write('item', 0, 2, [['临时文字']]);
    restoreObjectWorkspace(text);
    expect(useObjectTable.getState().sheets.item.rows[0].cells['item:D']).toBe(raw);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it('后台恢复写入不提交或关闭正在编辑的弹窗', async () => {
    const { initializeObjects, flushObjects } = await import('./persistence'); const { useObjectTable } = await import('./store'); await initializeObjects();
    const commit = vi.fn(); window.addEventListener('object-table-commit', commit);
    useObjectTable.getState().resizeColumn('item', 'item:B', 200);
    await vi.advanceTimersByTimeAsync(1001); expect(mocks.set).toHaveBeenCalledTimes(1); expect(commit).not.toHaveBeenCalled();
    await flushObjects(); expect(commit).toHaveBeenCalledTimes(1);
  });
  it('立即 flush 包含当前编辑，保存公式而非计算结果', async () => {
    const { initializeObjects, flushObjects } = await import('./persistence'); const { useObjectTable } = await import('./store');
    await initializeObjects();
    window.addEventListener('object-table-commit', () => useObjectTable.getState().write('item', 0, 2, [['=2+3']]));
    await flushObjects();
    const recovery = JSON.parse(mocks.set.mock.calls.at(-1)![1]);
    const task = recovery.tasks.find((t: { id: string }) => t.id === recovery.activeId);
    expect(task.project.sheets.item.rows[0].cells['item:D']).toBe('=2+3'); expect(task.dirty).toBe(true);
    expect(task.project.sheets.item.past).toBeUndefined();
  });
  it('写入失败保留待保存状态，重试后才成功', async () => {
    const { initializeObjects, flushObjects } = await import('./persistence'); const { useObjectTable } = await import('./store'); await initializeObjects();
    useObjectTable.getState().write('unit', 0, 2, [['单位']]); mocks.set.mockRejectedValueOnce(new Error('磁盘已满'));
    await expect(flushObjects()).rejects.toThrow('磁盘已满'); await expect(flushObjects()).resolves.toBeUndefined();
    expect(mocks.set).toHaveBeenCalledTimes(2);
  });
  it('恢复损坏时阻止覆盖，可重试读取', async () => {
    const { initializeObjects, flushObjects } = await import('./persistence'); mocks.get.mockResolvedValueOnce('{broken');
    await expect(initializeObjects()).rejects.toThrow(); await flushObjects(); expect(mocks.set).not.toHaveBeenCalled();
    await expect(initializeObjects()).resolves.toBeUndefined(); expect(mocks.get).toHaveBeenCalledTimes(2);
  });
});
