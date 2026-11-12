import { expect, test, vi } from 'vitest';
import { initializeWarcraft, flushWarcraft } from './persistence';
import { useUiTasks, taskFrom } from '../warcraft-ui/tasks/store';
import { useLayoutStore, exampleNodes } from '../warcraft-ui/state/layout';
import { serializeSession } from '../warcraft-ui/tasks/schema';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));

test('auto recovery reads and writes zero tasks without reviving discarded content', async () => {
  vi.useFakeTimers();
  let stored = serializeSession([], null);
  const setItem = vi.fn((key: string, text: string) => { expect(key).toBe('box-warcraft-document-v1'); stored = text; });
  vi.stubGlobal('localStorage', { getItem: () => stored, setItem });
  try {
    const old = taskFrom({ nodes: exampleNodes, arrayName: 'old', background: null });
    useUiTasks.getState().restore([old], old.id);
    await initializeWarcraft();
    expect(useUiTasks.getState().tasks).toEqual([]); expect(useUiTasks.getState().activeId).toBeNull();
    expect(useLayoutStore.getState().nodes).toEqual([]);
    useUiTasks.getState().create(); useLayoutStore.getState().add({ ...exampleNodes[0], id: crypto.randomUUID() });
    await flushWarcraft(); expect(JSON.parse(stored).session.tasks).toHaveLength(1);
    useUiTasks.getState().close(useUiTasks.getState().activeId!); await flushWarcraft();
    expect(JSON.parse(stored).session).toMatchObject({ tasks: [], activeId: null });
    expect(JSON.parse(stored).nodes).toEqual([]); expect(setItem).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
});
