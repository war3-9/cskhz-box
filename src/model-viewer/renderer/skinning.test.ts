import { expect, it } from 'vitest';
import type { model } from 'war3-model';
import { compatibleSkinning } from './skinning';

it('binds unbound static geometry to a neutral matrix without changing source data', () => {
  const animated = { ObjectId: 0, Translation: { Keys: [10, 20, 30] } };
  const data = { Version: 800, Nodes: [animated], Helpers: [], Geosets: [{ Groups: [], VertexGroup: new Uint8Array([0, 0]), TotalGroupsCount: 0 }] } as unknown as model.Model;
  const rendered = compatibleSkinning(data);
  expect(rendered.Geosets[0].Groups).toEqual([[1]]);
  expect(rendered.Nodes[1]).toMatchObject({ ObjectId: 1, Flags: 0, PivotPoint: new Float32Array(3) });
  expect(rendered.Nodes[1].Translation).toBeUndefined();
  expect(rendered.Nodes[0]).toBe(animated);
  expect(data.Geosets[0].Groups).toEqual([]);
  expect(data.Nodes).toHaveLength(1);
});

it('retains the sole animated binding when its node ID was used as a group index', () => {
  const data = { Version: 800, Geosets: [{ Groups: [[1]], VertexGroup: new Uint8Array([1, 1]), TotalGroupsCount: 1 }] } as unknown as model.Model;
  const rendered = compatibleSkinning(data);
  expect(rendered.Geosets[0].VertexGroup).toEqual(new Uint8Array([0, 0]));
  expect(rendered.Geosets[0].Groups).toBe(data.Geosets[0].Groups);
  expect(data.Geosets[0].VertexGroup).toEqual(new Uint8Array([1, 1]));
});

it('preserves valid and ambiguous bindings and HD skinning', () => {
  for (const [version, groups, index] of [[800, [[0]], 0], [800, [[0], [1]], 2], [900, [], 0]] as const) {
    const data = { Version: version, Geosets: [{ Groups: groups, VertexGroup: new Uint8Array([index]) }] } as unknown as model.Model;
    expect(compatibleSkinning(data)).toBe(data);
  }
});

it('adapts invalid bindings only on vertices unused by every face', () => {
  const geoset = { Groups: [[3], [4]], VertexGroup: new Uint8Array([0, 1, 0, 40]), Faces: new Uint16Array([0, 1, 2]) };
  const data = { Version: 800, Geosets: [geoset] } as unknown as model.Model;
  const rendered = compatibleSkinning(data);
  expect([...rendered.Geosets[0].VertexGroup]).toEqual([0, 1, 0, 0]);
  expect(rendered.Geosets[0].Faces).toBe(geoset.Faces);
  expect([...data.Geosets[0].VertexGroup]).toEqual([0, 1, 0, 40]);
  geoset.Faces = new Uint16Array([1, 2, 3]);
  expect(compatibleSkinning(data)).toBe(data);
});
