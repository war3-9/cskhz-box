import { useState } from 'react';
import type { ResourceSession } from './session';
import { ModelCanvas, previewSequence, useResourceModel } from './ModelCanvas';
export function ResourceModelPreview({ session, path }: { session: ResourceSession; path: string }) {
  const { loaded, error } = useResourceModel(session, path), [sequence, setSequence] = useState<number>();
  return <div className="ot-resource-model"><strong>{path}</strong>{error && <p role="alert">{error}</p>}
    {!loaded && !error && <p>正在读取模型…</p>}
    {loaded && <><ModelCanvas loaded={loaded} sequence={sequence} label="导入模型放大预览" />
      <label>动画 <select aria-label="导入模型动画" value={sequence ?? previewSequence(loaded)} onChange={event => setSequence(Number(event.target.value))}>
        {loaded.model.Sequences.length ? loaded.model.Sequences.map((item, index) => <option key={index} value={index}>{item.Name}</option>) : <option value={0}>静态</option>}
      </select></label>
      {loaded.dependencies.some(d => d.error) && <small>缺少贴图：{loaded.dependencies.filter(d => d.error).map(d => d.path).join('、')}</small>}
      {!loaded.model.Sequences.length && <small>静态模型，可拖动旋转查看</small>}</>}
    <small>拖动旋转 · 滚轮缩放</small></div>;
}
