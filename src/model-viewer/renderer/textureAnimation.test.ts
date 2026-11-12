import { describe, expect, it } from 'vitest';
import { renderModel } from './engine';
import type { model } from 'war3-model';
import { ModelRenderer, parseMDL } from 'war3-model';

describe('texture ID animation', () => {
  it('uses discrete images without mutating model data and caches the rendering copy', () => {
    const data = { Info: { MinimumExtent: [0, 0, 0], MaximumExtent: [1, 1, 1], BoundsRadius: 1 }, Geosets: [], Sequences: [], Materials: [{ Layers: [{ TextureID: { LineType: 1, Times: new Uint32Array([0, 1]), Keys: new Uint32Array([0, 1]) } }] }] } as unknown as model.Model;
    const original = data.Materials[0].Layers[0].TextureID;
    expect(typeof original).toBe('object');
    const rendered = renderModel(data);
    expect(rendered.Materials[0].Layers[0].TextureID).toMatchObject({ LineType: 0 });
    expect(original).toMatchObject({ LineType: 1 });
    expect(renderModel(data)).toBe(rendered);
  });
  it('renders static UVs for an absent animation while retaining valid tracks and original data', () => {
    const data = parseMDL(`Version { FormatVersion 800, } Model "Missing UV" {}
      Materials 1 { Material { Layer { FilterMode None, static TextureID 0, TVertexAnimId 1, }
      Layer { FilterMode None, static TextureID 0, TVertexAnimId 0, } } }`);
    data.TextureAnims = [{}];
    const rendered = renderModel(data);
    const renderer = new ModelRenderer(rendered) as unknown as { getTexCoordMatrix: (layer: model.Layer) => ArrayLike<number> };
    expect(Array.from(renderer.getTexCoordMatrix(rendered.Materials[0].Layers[0]))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(rendered.Materials[0].Layers[1].TVertexAnimId).toBe(0);
    expect(data.Materials[0].Layers[0].TVertexAnimId).toBe(1);
    expect(data.Materials[0].Layers[1].TVertexAnimId).toBe(0);
  });
});
