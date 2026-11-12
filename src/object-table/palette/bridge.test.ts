import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaletteDraft, PaletteTarget } from './model';

const host = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: any }) => unknown>(),
  child: null as PaletteDraft | null, autoReply: true, requests: [] as string[],
  invoke: vi.fn(), emit: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: host.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, callback: (event: { payload: any }) => unknown) => { host.listeners.set(name, callback); return () => host.listeners.delete(name); },
  emitTo: host.emit,
}));
const fire = (name: string, payload: unknown) => host.listeners.get(name)?.({ payload });
const reply = (request: string) => fire('object-palette-snapshot-result', { request, draft: structuredClone(host.child) });
let bridge: typeof import('./bridge'), table: typeof import('../store')['useObjectTable'];
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); host.listeners.clear(); host.child = null; host.autoReply = true; host.requests = [];
  host.invoke.mockReset().mockImplementation(async (command: string, args?: { target: PaletteTarget }) => {
    if (command === 'object_palette_open') host.child = { target: args!.target, value: args!.target.raw };
  });
  host.emit.mockReset().mockImplementation(async (_window: string, name: string, payload: any) => {
    if (name === 'object-palette-snapshot') { host.requests.push(payload); if (host.autoReply) reply(payload); }
    if (name === 'object-palette-applied' && host.child) host.child.target = payload;
  });
  table = (await import('../store')).useObjectTable;
  table.getState().write('item', 0, 2, [['甲'], ['乙']]);
  bridge = await import('./bridge'); await bridge.openPalette('item', 0, 2);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
function edit(value: string) { host.child!.value = value; fire('object-palette-draft', structuredClone(host.child)); }
const opened = () => host.invoke.mock.calls.filter(([name]) => name === 'object_palette_open');

describe('原生色板重开与草稿同步', () => {
  it('同时保存/切换共用一次快照，不互相覆盖请求或重复提交', async () => {
    edit('未保存文案'); host.autoReply = false;
    const first = bridge.synchronizePaletteDraft(), second = bridge.synchronizePaletteDraft();
    expect(first).toBe(second);
    await vi.waitFor(() => expect(host.requests).toHaveLength(1));
    reply(host.requests[0]); await Promise.all([first, second]);
    expect(table.getState().sheets.item.rows[0].cells['item:D']).toBe('未保存文案');
    table.getState().undo(); expect(table.getState().sheets.item.rows[0].cells['item:D']).toBe('甲');
  });
  it('连续打开不同单元格有序完成，最后指向最后一个格子', async () => {
    await Promise.all([bridge.openPalette('item', 0, 2), bridge.openPalette('item', 1, 2)]);
    expect(host.child!.value).toBe('乙'); expect(opened()).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('原行删除时恢复显示旧草稿和错误，明确放弃后可以打开其他格子', async () => {
    edit('必须保留'); table.getState().removeRows(0, 0);
    await expect(bridge.openPalette('item', 0, 2)).rejects.toThrow('已删除');
    expect(host.invoke).toHaveBeenCalledWith('object_palette_reveal');
    expect(host.emit).toHaveBeenCalledWith('object-palette', 'object-palette-error', expect.stringContaining('已删除'));
    expect(host.child!.value).toBe('必须保留'); expect(opened()).toHaveLength(1);
    fire('object-palette-discard', host.child!.target.token);
    await bridge.openPalette('item', 0, 2); expect(host.child!.value).toBe('乙');
  });
  it('原格被修改时保留双方文字，不用新格覆盖冲突草稿', async () => {
    edit('色板文案'); table.getState().write('item', 0, 2, [['表格新文案']]);
    await expect(bridge.openPalette('item', 1, 2)).rejects.toThrow('已在表格中修改');
    expect(table.getState().sheets.item.rows[0].cells['item:D']).toBe('表格新文案');
    expect(host.child!.value).toBe('色板文案'); expect(opened()).toHaveLength(1);
  });
  it('正常关闭后不再等待隐藏窗口，旧关闭/输入事件不能清掉新草稿', async () => {
    const old = structuredClone(host.child!); fire('object-palette-closed', old.target.token);
    host.autoReply = false; await bridge.openPalette('item', 1, 2);
    expect(host.requests).toHaveLength(0);
    edit('乙的新文案'); fire('object-palette-closed', old.target.token); fire('object-palette-draft', old);
    host.autoReply = true; await bridge.synchronizePaletteDraft();
    expect(table.getState().sheets.item.rows[1].cells['item:D']).toBe('乙的新文案');
  });
  it('旧目标的迟到保存请求不能修改表格或替换当前草稿', async () => {
    const old = structuredClone(host.child!); await bridge.openPalette('item', 1, 2);
    await fire('object-palette-apply', { request: 'old-save', draft: { ...old, value: '迟到写入' } });
    expect(table.getState().sheets.item.rows[0].cells['item:D']).toBe('甲');
    expect(host.emit).toHaveBeenCalledWith('object-palette', 'object-palette-result', expect.objectContaining({ error: expect.stringContaining('目标已切换') }));
  });
  it('快照超时后显示原色板，后续响应恢复即可重试', async () => {
    edit('超时也保留'); host.autoReply = false;
    const result = expect(bridge.synchronizePaletteDraft()).rejects.toThrow('色板未响应');
    await vi.advanceTimersByTimeAsync(5000); await result;
    expect(host.invoke).toHaveBeenCalledWith('object_palette_reveal'); expect(host.child!.value).toBe('超时也保留');
    host.autoReply = true; await bridge.synchronizePaletteDraft();
    expect(table.getState().sheets.item.rows[0].cells['item:D']).toBe('超时也保留');
  });
  it('等待草稿期间更换工作簿，不会把旧点击打开到新任务', async () => {
    host.autoReply = false;
    const request = bridge.openPalette('item', 1, 2);
    const result = expect(request).rejects.toThrow('工作簿已切换');
    await vi.waitFor(() => expect(host.requests).toHaveLength(1));
    table.setState({ bookId: 'another-book' }); reply(host.requests[0]); await result;
    expect(opened()).toHaveLength(1);
  });
});
