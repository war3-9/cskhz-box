import type { model, ModelRenderer } from 'war3-model';

// war3-model 4.0.1's WebGL SD shader omits layer opacity and geoset tint.
// Adapt only this shader and its draw uniforms; particles, ribbons and HD stay on their own programs.
export function sdFragment(source: string) {
  if (!source.includes('uniform float uReplaceableType;') || !source.includes('uniform float uWireframe;') || !source.includes('uniform mat3 uTVertexAnim;')) return source;
  return source.replace('uniform float uWireframe;', 'uniform float uWireframe;\nuniform vec4 uBoxGeosetColor;\nuniform float uBoxAdditive;')
    .replace('// hand-made alpha-test', 'gl_FragColor *= uBoxGeosetColor;\nif (uBoxAdditive > 0.) gl_FragColor.rgb *= uBoxGeosetColor.a;\n// hand-made alpha-test');
}
interface Internals {
  shaderProgram: WebGLProgram; vertexBuffer: WebGLBuffer[];
  setLayerProps: (layer: model.Layer, texture: number) => void;
  rendererData: { geosetAlpha: number[]; geosetAnims: model.GeosetAnim[] };
  interp: { animVectorVal: (value: model.Layer['Alpha'], fallback: number) => number; vec3: (out: Float32Array, value: model.GeosetAnim['Color']) => Float32Array | null };
}
export function sdDrawUniforms(renderer: ModelRenderer, gl: WebGLRenderingContext | WebGL2RenderingContext) {
  const internal = renderer as unknown as Internals;
  const color = gl.getUniformLocation(internal.shaderProgram, 'uBoxGeosetColor');
  const additive = gl.getUniformLocation(internal.shaderProgram, 'uBoxAdditive');
  if (!color) return { bind() {}, program() {}, draw() {} };
  const setLayer = internal.setLayerProps.bind(renderer), tint = new Float32Array(3);
  let layer: model.Layer | undefined, geoset = -1, current: WebGLProgram | null = null;
  internal.setLayerProps = (value, texture) => { layer = value; setLayer(value, texture); };
  return {
    bind(buffer: WebGLBuffer | null) { const index = internal.vertexBuffer.indexOf(buffer!); if (index >= 0) geoset = index; },
    program(program: WebGLProgram | null) { current = program; },
    draw() {
      if (current !== internal.shaderProgram || geoset < 0 || !layer) return;
      const anim = internal.rendererData.geosetAnims[geoset];
      let rgb: ArrayLike<number> = [1, 1, 1];
      if (anim && (anim.Flags & 2) && anim.Color) rgb = anim.Color instanceof Float32Array ? anim.Color : internal.interp.vec3(tint, anim.Color) ?? rgb;
      const opacity = Math.max(0, Math.min(1, (internal.rendererData.geosetAlpha[geoset] ?? 1) * internal.interp.animVectorVal(layer.Alpha, 1)));
      gl.uniform4f(color, rgb[0], rgb[1], rgb[2], opacity);
      gl.uniform1f(additive, layer.FilterMode === 3 ? 1 : 0);
    },
  };
}
