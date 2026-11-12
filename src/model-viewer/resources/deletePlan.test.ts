import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ load: vi.fn(), resolve: vi.fn() }));
vi.mock('./models', () => ({ loadModel: mocks.load }));
vi.mock('./providers', () => ({ resolveResource: mocks.resolve }));
import { modelDeletePlan } from './deletePlan';
import type { Source } from '../types';
const source: Source = { id: 'source', kind: 'folder', path: 'F:/fixture', name: 'fixture', complete: true, entries: [
  { path: 'Models/unit.mdx', size: 4, model: true, anonymous: false },
  { path: 'Textures/skin.blp', size: 4, model: false, anonymous: false },
] };
beforeEach(() => vi.resetAllMocks());
it('deletes the model and deduplicated same-source textures, preserving external and unresolved textures', async () => {
  mocks.load.mockResolvedValue({ model: { Textures: ['', 'skin.blp', 'skin.blp', 'game.blp', 'missing.blp', 'unconfirmed.blp'].map(Image => ({ Image })) } });
  mocks.resolve.mockImplementation(async (_id, path) => {
    if (path === 'missing.blp') throw new Error('missing');
    return { ref: { sourceId: path === 'game.blp' ? 'game' : source.id, path: path === 'skin.blp' ? 'textures\\SKIN.blp' : path } };
  });
  const plan = await modelDeletePlan(source, 'Models/unit.mdx');
  expect(plan.paths).toEqual(['Models/unit.mdx', 'Textures/skin.blp']);
  expect(mocks.resolve).toHaveBeenCalledTimes(4);
  expect(mocks.resolve).toHaveBeenCalledWith(source.id, 'skin.blp', 'Models/unit.mdx');
  expect(plan.warnings).toHaveLength(3);
  expect(plan.warnings.join(' ')).toContain('外部贴图保留');
});
it('blocks whole deletion when parsing fails instead of silently deleting only the model', async () => {
  mocks.load.mockRejectedValue(new Error('invalid model'));
  await expect(modelDeletePlan(source, 'Models/unit.mdx')).rejects.toThrow('invalid model');
  expect(mocks.resolve).not.toHaveBeenCalled();
});
