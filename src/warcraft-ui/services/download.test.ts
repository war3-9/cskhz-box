import { BlobReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js';
import { afterEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ download: vi.fn(), invoke: vi.fn(), desktop: false }));
vi.mock('../../shared/download', () => ({ download: mocks.download }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => mocks.desktop, invoke: mocks.invoke }));
import { saveTriggers } from './triggers';
import { saveText } from './save';
afterEach(() => { mocks.download.mockReset(); mocks.invoke.mockReset(); mocks.desktop = false; });
test('browser downloads both trigger files in one ZIP without a local server', async () => {
  const source = { wtg: new Uint8Array([87, 84, 71, 33, 128]), wct: new Uint8Array([0, 255, 1]) };
  const filename = await saveTriggers(source);
  expect(filename).toBe('魔兽UI-T触发.zip'); expect(mocks.invoke).not.toHaveBeenCalled();
  const reader = new ZipReader(new BlobReader(mocks.download.mock.calls[0][0]), { useWebWorkers: false });
  const entries = (await reader.getEntries()).filter(entry => !entry.directory); expect(entries.map(entry => entry.filename)).toEqual(['war3map.wtg', 'war3map.wct']);
  expect(await entries[0].getData!(new Uint8ArrayWriter())).toEqual(source.wtg);
  expect(await entries[1].getData!(new Uint8ArrayWriter())).toEqual(source.wct); await reader.close();
});
test('browser text downloads preserve Unicode and desktop delegates to native saving', async () => {
  await saveText('jass', '中文\nendfunction');
  expect(await mocks.download.mock.calls[0][0].text()).toBe('中文\nendfunction');
  mocks.desktop = true; mocks.invoke.mockResolvedValue('output');
  expect(await saveText('project', '{}')).toBe('output');
  expect(mocks.invoke).toHaveBeenCalledWith('save_lab_text', { kind: 'project', text: '{}' });
  await saveTriggers({ wtg: new Uint8Array([1]), wct: new Uint8Array([2]) });
  expect(mocks.invoke).toHaveBeenLastCalledWith('save_lab_triggers', { wtg: [1], wct: [2] });
});
