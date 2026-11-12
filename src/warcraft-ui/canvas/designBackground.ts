import type { UiNode } from '../document/model';

const colors: Record<UiNode['kind'], string> = {
  panel: '#354c68', backdrop: '#354c68', button: '#3c4654',
  background: '#315a50', text: '#503f61',
};
export const defaultDesignBackgroundOpacity = 0.7;
export function designBackground(node: UiNode) {
  return { fill: colors[node.kind], opacity: node.previewBackgroundOpacity ?? defaultDesignBackgroundOpacity };
}
