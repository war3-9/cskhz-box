import { ModelRenderer, type model } from 'war3-model';
import { sdDrawUniforms, sdFragment } from './sdMaterials';
export function managedRenderer(data: model.Model, gl: WebGLRenderingContext | WebGL2RenderingContext) {
  let material: ReturnType<typeof sdDrawUniforms> | undefined;
  const resources = new Map<string, Set<unknown>>();
  const kinds = ['Buffer', 'Texture', 'Shader', 'Program', 'Framebuffer', 'Renderbuffer', 'VertexArray'];
  const methods = new Map<PropertyKey, unknown>();
  const context = new Proxy(gl, { get(target, key) {
    if (methods.has(key)) return methods.get(key);
    const value = Reflect.get(target, key, target);
    if (typeof value !== 'function') return value;
    if (key === 'shaderSource') return (shader: WebGLShader, source: string) => gl.shaderSource(shader, sdFragment(source));
    if (key === 'useProgram') return (program: WebGLProgram | null) => { material?.program(program); gl.useProgram(program); };
    if (key === 'bindBuffer') return (kind: number, buffer: WebGLBuffer | null) => { if (kind === gl.ARRAY_BUFFER) material?.bind(buffer); gl.bindBuffer(kind, buffer); };
    if (key === 'drawElements') return (mode: number, count: number, type: number, offset: number) => { material?.draw(); gl.drawElements(mode, count, type, offset); };
    const kind = kinds.find(kind => key === `create${kind}` || key === `delete${kind}`);
    if (!kind) { const bound = value.bind(target); methods.set(key, bound); return bound; }
    const method = (...args: unknown[]) => {
      const result = value.apply(target, args);
      if (key === `create${kind}` && result) { if (!resources.has(kind)) resources.set(kind, new Set()); resources.get(kind)!.add(result); }
      if (key === `delete${kind}`) resources.get(kind)?.delete(args[0]);
      return result;
    };
    methods.set(key, method); return method;
  } });
  const renderer = new ModelRenderer(data);
  const render = renderer.render.bind(renderer);
  renderer.render = (...args) => {
    // SD materials draw multiple layers on the same geometry. LESS discards the
    // skin layer after the opaque team-color layer has written its depth.
    gl.depthFunc(gl.LEQUAL);
    return render(...args);
  };
  // war3-model 4.0.1 destroys optional HD shader objects without checking their presence.
  const internal = renderer as unknown as { destroyShaderProgramObject: (object: unknown) => void };
  const disposeShader = internal.destroyShaderProgramObject.bind(renderer);
  internal.destroyShaderProgramObject = object => { if (object) disposeShader(object); };
  const destroy = renderer.destroy.bind(renderer);
  renderer.destroy = () => {
    try { destroy(); } finally {
      for (const [kind, objects] of resources) for (const object of objects) (Reflect.get(gl, `delete${kind}`, gl) as (value: unknown) => void).call(gl, object);
      resources.clear();
    }
  };
  try { renderer.initGL(context); material = sdDrawUniforms(renderer, gl); } catch (error) { renderer.destroy(); throw error; }
  return renderer;
}
