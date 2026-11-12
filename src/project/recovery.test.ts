import { expect, test, vi } from 'vitest';
import { emptyDocument } from '../layers/store';
import { recoverWorkspace } from './recovery';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
vi.mock('./workspaceImages', () => ({ workspaceImages: async (value: unknown) => value }));
const builtin = { assets: [], categories: [] };
const document = () => ({ ...emptyDocument(), canvasCreated: true });
const workspace = () => ({ version: 1, document: document(), library: builtin });
test('isolates a malformed inactive task and chooses a healthy active task', async () => {
  const result = await recoverWorkspace(JSON.stringify({ ...workspace(), session: { activeId: 'bad', tasks: [{ id: 'ok', dirty: true, document: document() }, { id: 'bad', dirty: true, document: { broken: true } }] } }), builtin);
  expect(result.entries).toHaveLength(1);
  expect(result.activeId).toBe('ok');
  expect(result.entries[0].dirty).toBe(true);
  expect(result.issues.some(i => i.includes('任务 2'))).toBe(true);
});
test('migrates legacy workspaces, preserves empty sessions and repairs duplicate ids', async () => {
  expect((await recoverWorkspace(JSON.stringify(workspace()), builtin)).entries).toHaveLength(1);
  expect((await recoverWorkspace(JSON.stringify({ ...workspace(), session: { activeId: null, tasks: [] } }), builtin)).entries).toEqual([]);
  const result = await recoverWorkspace(JSON.stringify({ ...workspace(), session: { activeId: 'same', tasks: [true, false].map(dirty => ({ id: 'same', dirty, document: document() })) } }), builtin);
  expect(new Set(result.entries.map(t => t.id)).size).toBe(2);
  expect(result.entries.map(t => t.dirty)).toEqual([true, false]);
});
test('retains removed builtin references and rejects unsupported or broken envelopes', async () => {
  const value = workspace();
  value.document.layers.push({ id: 'layer', name: '保留图片', kind: 'asset', imagePath: 'builtin://removed/image', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, visible: true, locked: false });
  const result = await recoverWorkspace(JSON.stringify(value), builtin);
  expect(result.entries[0].document.layers[0].imagePath).toBe('builtin://removed/image');
  expect(result.issues.some(i => i.includes('removed'))).toBe(true);
  await expect(recoverWorkspace('{broken', builtin)).rejects.toThrow();
  await expect(recoverWorkspace(JSON.stringify({ ...value, version: 99 }), builtin)).rejects.toThrow('版本');
});
