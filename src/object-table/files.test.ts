import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ native: true, confirm: vi.fn(), open: vi.fn(), save: vi.fn(), invoke: vi.fn(), sync: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => api.native, invoke: api.invoke }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: api.confirm, open: api.open, save: api.save }));
vi.mock('./palette/bridge', () => ({ synchronizePaletteDraft: api.sync }));
vi.mock('./persistence', () => ({ flushObjects: vi.fn() }));
import { confirmObjectAction, exportObjects, guardObjects } from './files';
import { useObjectTable } from './store';
import { initialSheets, initialViews, dataOnly } from './model';

beforeEach(() => {
  vi.clearAllMocks(); api.native = true;
  vi.stubGlobal('window', new EventTarget());
  useObjectTable.getState().restore({ format: 'war3-objects', version: 1, active: 'item', sheets: dataOnly(initialSheets()), views: initialViews() });
});
afterEach(() => vi.unstubAllGlobals());
describe('物编桌面文件确认', () => {
  it('使用受权限控制的异步原生确认，不调用 WebView 的 window.confirm', async () => {
    api.confirm.mockResolvedValue(false);
    expect(await confirmObjectAction('继续？')).toBe(false);
    expect(api.confirm).toHaveBeenCalledWith('继续？', expect.objectContaining({ cancelLabel: '取消' }));
  });
  it('取消未保存提示后保留数据，不弹保存文件框', async () => {
    useObjectTable.getState().write('item', 0, 2, [['未保存物品']]);
    api.confirm.mockResolvedValue(false);
    expect(await guardObjects()).toBe(false);
    expect(api.save).not.toHaveBeenCalled();
    expect(useObjectTable.getState().sheets.item.rows[0].cells['item:D']).toBe('未保存物品');
  });
  it('确认尚未返回时不得继续保存', async () => {
    useObjectTable.getState().write('item', 0, 2, [['草稿']]);
    let respond!: (value: boolean) => void;
    api.confirm.mockImplementation(() => new Promise<boolean>(resolve => { respond = resolve; }));
    const pending = guardObjects(); await vi.waitFor(() => expect(api.confirm).toHaveBeenCalled());
    expect(api.save).not.toHaveBeenCalled(); respond(false); expect(await pending).toBe(false);
  });
  it('取消覆盖时不得调用第二次写入', async () => {
    api.open.mockResolvedValue('F:/exports'); api.invoke.mockResolvedValue(['Xm_item.lua']); api.confirm.mockResolvedValue(false);
    expect(await exportObjects(['item'])).toBeNull();
    expect(api.invoke).toHaveBeenCalledTimes(1);
    expect(api.invoke).toHaveBeenCalledWith('object_export', expect.objectContaining({ overwrite: false }));
  });
  it('确认覆盖后才调用覆盖写入', async () => {
    api.open.mockResolvedValue('F:/exports'); api.invoke.mockResolvedValueOnce(['Xm_item.lua']).mockResolvedValueOnce([]); api.confirm.mockResolvedValue(true);
    expect(await exportObjects(['item'])).toHaveLength(1);
    expect(api.invoke).toHaveBeenLastCalledWith('object_export', expect.objectContaining({ overwrite: true }));
  });
});
