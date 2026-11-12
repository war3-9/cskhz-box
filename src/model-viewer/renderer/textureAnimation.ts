import type { model } from 'war3-model';

// Texture IDs select an image; interpolating between them produces fractional array indices.
export function discreteTextureAnimations(data: model.Model): model.Model {
  let changed = false;
  const materials = data.Materials.map(material => ({ ...material, Layers: material.Layers.map(layer => {
    const texture = layer.TextureID;
    // Some shipped models reference a UV animation that is absent from TXAN.
    // Use static UVs for that layer in the rendering copy, keeping valid tracks.
    const animation = layer.TVertexAnimId;
    const missingAnimation = typeof animation === 'number' && (!Number.isInteger(animation) || !data.TextureAnims?.[animation]);
    const interpolateTexture = texture && typeof texture !== 'number' && texture.LineType !== 0;
    if (!missingAnimation && !interpolateTexture) return layer;
    changed = true;
    return { ...layer, ...(missingAnimation ? { TVertexAnimId: undefined } : {}),
      ...(interpolateTexture ? { TextureID: { ...texture, LineType: 0 as model.LineType } } : {}) };
  }) }));
  return changed ? { ...data, Materials: materials } : data;
}
