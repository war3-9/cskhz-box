import type { model } from 'war3-model';
export function appearanceNote(data: model.Model): string {
  if (!data.Geosets.length && !data.ParticleEmitters.length && !data.ParticleEmitters2.length && !data.RibbonEmitters.length) {
    return data.Attachments.length ? `挂点辅助模型：${data.Attachments.length} 个挂点、${data.Sequences.length} 个动作。文件本身不含外观，需挂载其他模型使用。` : '结构模型：没有可绘制的网格、粒子或飘带。';
  }
  return '';
}
