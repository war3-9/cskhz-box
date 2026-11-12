import { describe, expect, it, vi } from 'vitest';
import { ModelRenderer, parseMDL } from 'war3-model';
import { sdDrawUniforms, sdFragment } from './sdMaterials';
describe('SD geoset and material opacity', () => {
  it('leaves particle/ribbon/HD shaders unchanged', () => {
    const shader='uniform vec4 uColor; void main() { gl_FragColor = uColor; }';
    expect(sdFragment(shader)).toBe(shader);
    const hd='uniform float uWireframe; uniform mat3 uTVertexAnim; // hand-made alpha-test';
    expect(sdFragment(hd)).toBe(hd);
    expect(sdFragment('uniform float uReplaceableType; '+hd)).toContain('gl_FragColor *= uBoxGeosetColor');
  });
  it('multiplies mesh and layer opacity at each real renderer draw and respects program boundaries', () => {
    const data=parseMDL('Version { FormatVersion 800, } Model "Tint" {} Sequences 1 { Anim "Stand" { Interval { 0, 1000 }, } }');
    const renderer=new ModelRenderer(data),program={},vertex={};
    const layer={Alpha:.7,FilterMode:4};
    const setLayer=vi.fn(),uniform4f=vi.fn();
    Object.assign(renderer,{shaderProgram:program,vertexBuffer:[vertex],setLayerProps:setLayer,rendererData:{geosetAlpha:[.4],geosetAnims:[{Flags:2,Color:new Float32Array([.25,.5,1])}]},interp:{animVectorVal:(n:number)=>n}});
    const gl={getUniformLocation:()=>({}),uniform4f,uniform1f:vi.fn()};
    const hook=sdDrawUniforms(renderer,gl as unknown as WebGL2RenderingContext);
    (renderer as unknown as {setLayerProps:(layer:unknown,n:number)=>void}).setLayerProps(layer,0);
    hook.bind(vertex as WebGLBuffer);hook.program(program as WebGLProgram);hook.draw();
    expect(uniform4f.mock.calls[0].slice(1)).toEqual([.25,.5,1,.4*.7]);
    hook.program({} as WebGLProgram);hook.draw();expect(uniform4f).toHaveBeenCalledTimes(1);
  });
});
