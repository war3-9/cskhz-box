import type { model } from 'war3-model';

// Some optimized SD models leave static geometry unbound, or use the sole
// matrix's node ID instead of its local group index. Adapt only the render copy.
export function compatibleSkinning(data: model.Model): model.Model {
  if (data.Version >= 900) return data;
  let changed = false, identity: model.Node | undefined;
  const geosets = data.Geosets.map(geoset => {
    // Some models retain invalid bindings on vertices not used by any face.
    // Give only those unused vertices a valid buffer slot; visible skinning is untouched.
    if (geoset.Groups[0]?.length && geoset.Faces?.length) {
      const invalid = Array.from(geoset.VertexGroup, (group, vertex) => ({ group, vertex })).filter(item => !geoset.Groups[item.group]?.length);
      const referenced = new Set(geoset.Faces);
      if (invalid.length && invalid.every(item => !referenced.has(item.vertex))) {
        const vertexGroup = geoset.VertexGroup.slice();
        for (const item of invalid) vertexGroup[item.vertex] = 0;
        changed = true;
        return { ...geoset, VertexGroup: vertexGroup };
      }
    }
    if (!geoset.Groups.length && geoset.VertexGroup.length && geoset.VertexGroup.every(id => id === 0)) {
      if (!identity) {
        const id = Array.from({ length: 256 }, (_, i) => i).find(id => !data.Nodes.some(node => node?.ObjectId === id));
        if (id === undefined) throw new Error('静态网格没有可用的预览矩阵');
        identity = { Name: '静态预览矩阵', ObjectId: id, Flags: 0, PivotPoint: new Float32Array(3) };
      }
      changed = true;
      return { ...geoset, Groups: [[identity.ObjectId]], TotalGroupsCount: 1 };
    }
    if (geoset.Groups.length === 1 && geoset.Groups[0].length === 1 &&
        geoset.VertexGroup.some(id => id >= geoset.Groups.length) &&
        geoset.VertexGroup.every(id => id === 0 || id === geoset.Groups[0][0])) {
      changed = true;
      return { ...geoset, VertexGroup: new Uint8Array(geoset.VertexGroup.length) };
    }
    return geoset;
  });
  if (!changed) return data;
  return { ...data, Geosets: geosets, ...(identity ? { Nodes: [...data.Nodes, identity], Helpers: [...data.Helpers, identity] } : {}) };
}
