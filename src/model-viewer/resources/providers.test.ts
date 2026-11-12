import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke, isTauri: () => true }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open }));
import { openNative, restoreSources, chooseSource, resolveResource, sourceId } from './providers';
import { useViewer } from '../workspace/store';
import type { Source } from '../types';
const source = (path: string): Source => ({ id: sourceId(path), name: path, path, kind: 'folder', complete: true, entries: [{ path: 'model.mdx', size: 4, model: true, anonymous: false }] });
beforeEach(() => { mocks.invoke.mockReset(); mocks.open.mockReset(); useViewer.setState({ sources: [], activeSource: '', busy: undefined, fileBusy: false, sessionPaths: [], sourceRoles: {}, status: '', category: '' }); });
it('manual open interrupts startup restoration and prevents a later saved source cancelling the new scan', async () => {
  let finish!: (source: Source) => void;
  mocks.invoke.mockImplementation((command: string, args: { path?: string }) => command === 'viewer_open' ? args.path === 'F:/old1' ? new Promise<Source>(resolve => { finish = resolve; }) : Promise.resolve(source(args.path!)) : Promise.resolve());
  useViewer.setState({ sessionPaths: ['F:/old1', 'F:/old2'] });
  const restoring = restoreSources(); await openNative('F:/new'); finish(source('F:/old1')); await restoring;
  expect(useViewer.getState().sources.map(s => s.path)).toEqual(['F:/new']);
  expect(useViewer.getState().activeSource).toBe(sourceId('F:/new'));
  expect(mocks.invoke.mock.calls.filter(([command]) => command === 'viewer_open').map(([, args]) => args.path)).toEqual(['F:/old1', 'F:/new']);
});
it('cancelled folder picker preserves the mounted source and its filter state', async () => {
  useViewer.getState().add(source('F:/existing')); useViewer.getState().patch({ category: '*', status: 'existing' }); mocks.open.mockResolvedValue(null);
  await chooseSource('folder'); expect(useViewer.getState()).toMatchObject({ activeSource: sourceId('F:/existing'), category: '*', status: 'existing' });
  expect(mocks.invoke).not.toHaveBeenCalled();
});
it('automatically mounts registered Warcraft archives read-only when opening a model source', async () => {
  const game = { ...source('F:/Warcraft III/war3.mpq'), kind: 'archive' as const, entries: [], complete: false };
  mocks.invoke.mockImplementation((command: string, args: { path?: string }) => command === 'viewer_open' ? Promise.resolve(source(args.path!)) : command === 'viewer_game_resources' ? Promise.resolve([game]) : Promise.resolve());
  await openNative('F:/models');
  expect(useViewer.getState().sources.map(item => item.path)).toEqual(['F:/Warcraft III/war3.mpq', 'F:/models']);
  expect(useViewer.getState().sourceRoles[game.path]).toBe('game');
  expect(useViewer.getState().activeSource).toBe(sourceId('F:/models'));
  expect(mocks.invoke).toHaveBeenCalledWith('viewer_game_resources', { path: '' });
});
it('resolves model-local texture references relative to the model directory', async () => {
  const folder: Source = { ...source('F:/models'), entries: [
    { path: 'Units/Human/Hero.mdx', size: 4, model: true, anonymous: false },
    { path: 'Units/Human/Hair.blp', size: 4, model: false, anonymous: false },
  ] };
  useViewer.setState({ sources: [folder], activeSource: folder.id });
  mocks.invoke.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
  const result = await resolveResource(folder.id, 'Hair.blp', 'Units/Human/Hero.mdx');
  expect(result.ref).toEqual({ sourceId: folder.id, path: 'Units/Human/Hair.blp' });
  expect(mocks.invoke).toHaveBeenCalledWith('viewer_read', { id: folder.id, path: 'Units/Human/Hair.blp' });
});

it('resolves flattened custom import paths only beside their model', async () => {
  const folder: Source = { ...source('F:/models'), entries: [
    { path: 'Units/A/model.mdx', size: 4, model: true, anonymous: false },
    { path: 'Units/A/legionary.blp', size: 4, model: false, anonymous: false },
    { path: 'Units/B/legionary.blp', size: 4, model: false, anonymous: false },
  ] };
  useViewer.setState({ sources: [folder], activeSource: folder.id });
  mocks.invoke.mockResolvedValue(new Uint8Array([1]).buffer);
  const result = await resolveResource(folder.id, 'Units\\Rostrodle\\Legionary\\Legionary.blp', 'Units/A/model.mdx');
  expect(result.ref.path).toBe('Units/A/legionary.blp');
  await expect(resolveResource(folder.id, 'Units\\Rostrodle\\Legionary\\Legionary.blp', 'Units/C/model.mdx')).rejects.toThrow('缺少贴图');
});

it('preserves unsupported MHEB key errors instead of silently substituting another source', async () => {
  const primary = { ...source('F:/primary'), entries: [{ path: 'hair.blp', size: 264, model: false, anonymous: false }] };
  const supplement = { ...primary, id: 'supplement', path: 'F:/supplement' };
  useViewer.setState({ sources: [primary, supplement], sourceRoles: { [supplement.path]: 'supplement' } });
  mocks.invoke.mockImplementation((_command: string, args: { id: string }) => args.id === primary.id ? Promise.reject('MHEB 的加密密钥尚不兼容') : Promise.resolve(new ArrayBuffer(4)));
  await expect(resolveResource(primary.id, 'hair.blp')).rejects.toBe('MHEB 的加密密钥尚不兼容');
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});

it('preserves JRP1 authentication errors when another source has the same texture', async () => {
  const primary = source('F:/protected'), fallback = source('F:/game');
  primary.entries.push({ path: 'hair.blp', size: 32, model: false, anonymous: false });
  fallback.entries.push({ path: 'hair.blp', size: 4, model: false, anonymous: false });
  useViewer.setState({ sources: [primary, fallback], activeSource: primary.id, sourceRoles: { [fallback.path]: 'game' } });
  mocks.invoke.mockImplementation((_command: string, args: { id: string }) => args.id === primary.id ? Promise.reject('JRP1 资源认证失败') : Promise.resolve(new ArrayBuffer(4)));
  await expect(resolveResource(primary.id, 'hair.blp')).rejects.toBe('JRP1 资源认证失败');
});
