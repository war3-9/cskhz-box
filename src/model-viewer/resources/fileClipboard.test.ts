import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), desktop: true }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke, isTauri: () => mocks.desktop }));
import { copyModelFiles } from './fileClipboard';
import { useViewer } from '../workspace/store';
import { resourceKey, type Source } from '../types';

const source: Source = { id: 'folder', name: 'models', path: 'F:/models', kind: 'folder', complete: true, entries: [
  { path: 'a.mdx', size: 4, model: true, anonymous: false }, { path: 'skin.blp', size: 4, model: false, anonymous: false },
] };
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() });
  mocks.desktop = true; mocks.invoke.mockReset();
  useViewer.setState({ sources: [source], activeSource: source.id, exportNames: {}, sourceRoles: {}, fileBusy: false, busy: undefined, error: '', status: '' });
});
afterEach(() => vi.unstubAllGlobals());
it('copies selected models with current export names and mounted supplement/game sources', async () => {
  const supplement = { ...source, id: 'supplement', path: 'F:/textures' }, game = { ...source, id: 'game', path: 'F:/war3.mpq' };
  useViewer.setState({ sources: [source, supplement, game], exportNames: { [resourceKey(source, 'a.mdx')]: 'Models/custom.mdx' }, sourceRoles: { [supplement.path]: 'supplement', [game.path]: 'game' } });
  mocks.invoke.mockResolvedValue({ models: 1, textures: 2, files: 3, directory: 'F:/private/stage' });
  await copyModelFiles(source, ['a.mdx', 'skin.blp']);
  expect(mocks.invoke).toHaveBeenCalledWith('viewer_copy_model_files', { sourceIds: ['folder', 'supplement', 'game'], items: [{ sourceId: 'folder', path: 'a.mdx', output: 'Models/custom.mdx', renameTextures: true }] });
  expect(useViewer.getState().status).toContain('Ctrl+V'); expect(useViewer.getState().fileBusy).toBe(false);
});
it('reports native package failure and unlocks without claiming copied files', async () => {
  mocks.invoke.mockRejectedValue(new Error('缺少贴图'));
  await copyModelFiles(source, ['a.mdx']);
  expect(useViewer.getState()).toMatchObject({ fileBusy: false, status: '文件复制未完成' });
  expect(useViewer.getState().error).toContain('缺少贴图');
});
it('keeps browser mode from pretending a file clipboard operation succeeded', async () => {
  mocks.desktop = false; await copyModelFiles(source, ['a.mdx']);
  expect(mocks.invoke).not.toHaveBeenCalled(); expect(useViewer.getState().error).toContain('Windows');
});
it('does not interrupt an existing file operation or copy non-model resources', async () => {
  useViewer.setState({ fileBusy: true }); await copyModelFiles(source, ['a.mdx']); expect(mocks.invoke).not.toHaveBeenCalled();
  useViewer.setState({ fileBusy: false }); await copyModelFiles(source, ['skin.blp']); expect(mocks.invoke).not.toHaveBeenCalled();
});
