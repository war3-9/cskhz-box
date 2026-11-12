import type { UiNode } from '../document/model';
import { defaultDesignBackgroundOpacity } from '../canvas/designBackground';
import { useLayoutStore } from '../state/layout';

export function DesignBackgroundField({ node }: { node: UiNode }) {
  const opacity = node.previewBackgroundOpacity ?? defaultDesignBackgroundOpacity;
  const update = (value: string) => {
    if (value === '') return;
    const next = Number(value);
    if (Number.isFinite(next) && next >= 0 && next <= 1 && next !== opacity)
      useLayoutStore.getState().setNode(node.id, { previewBackgroundOpacity: next });
  };
  return <label className="design-background-field">设计背景透明度
    <input aria-label="设计背景透明度" type="number" min="0" max="1" step="0.05" value={opacity} onChange={event => update(event.target.value)} />
    <small>仅软件内的辅助底色，0 为透明，1 为不透明；不影响文字、贴图或生成的 T/JASS。</small>
  </label>;
}
