import { expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri: () => true }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
import { openNative, sourceId } from './providers';
import { useViewer } from '../workspace/store';
it('opens a native music file through its actual folder, including a drive root', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  invoke.mockImplementation(async (command, args) => command === 'viewer_open' ? { id: args.id, path: args.path, name: args.path, kind: 'folder', entries: [{path:'主题.wav',model:false,size:100,anonymous:false}], complete:true } : []);
  useViewer.setState({ sources: [], busy: undefined, fileBusy: false, sourceRoles: {} });
  await openNative('F:/主题.wav');
  expect(invoke).toHaveBeenCalledWith('viewer_open', {path:'F:/',id:sourceId('F:/')});
  expect(useViewer.getState()).toMatchObject({kind:'music',current:{path:'主题.wav',sourceId:sourceId('F:/')}});
});
