import { stageSize, type AnchorPoint, type UiNode } from '../document/model';
import { anchorOffset } from '../document/position';
const real = (value: number) => {
  if (!Number.isFinite(value)) throw new Error('Invalid coordinate');
  return value.toFixed(6);
};
export const frameGeometry = (node: UiNode) => ({
  x: real(node.x * 0.8 / stageSize.width),
  y: real(0.6 - node.y * 0.6 / stageSize.height),
  width: real(node.width * 0.8 / stageSize.width),
  height: real(node.height * 0.6 / stageSize.height),
});

export const anchorIndex = (anchor?: AnchorPoint) => ['TOPLEFT', 'TOP', 'TOPRIGHT', 'LEFT', 'CENTER', 'RIGHT', 'BOTTOMLEFT', 'BOTTOM', 'BOTTOMRIGHT'].indexOf(anchor ?? 'TOPLEFT');
export const anchorPreset = (anchor?: AnchorPoint) => `FramePoints_${['TopLeft', 'Top', 'TopRight', 'Left', 'Center', 'Right', 'BottomLeft', 'Bottom', 'BottomRight'][anchorIndex(anchor)]}`;
export function framePosition(node: UiNode, parent?: UiNode) {
  if (parent) return frameRelativeOffset(node, parent);
  // Explicit root anchors use the game UI rectangle. Legacy roots retain absolute top-left positioning.
  const root = { x: 0, y: 0, width: stageSize.width, height: stageSize.height } as UiNode;
  return node.selfAnchor || node.targetAnchor ? frameRelativeOffset(node, root) : frameGeometry(node);
}
export const frameType = (node: UiNode) => node.kind === 'text' ? 'TEXT' : node.kind === 'button' ? 'GLUEBUTTON' : 'BACKDROP';
export const hasText = (node: UiNode) => node.kind === 'text' || node.kind === 'button';
export const textAlignment = (node: UiNode) => node.kind === 'button' ? 18 : 9;
export const fontHeight = (node: UiNode) => real((node.fontSize ?? 54) * 0.6 / stageSize.height);
export const defaultMapFont = 'Fonts\\FZL2JW.TTF';
export const frameFont = (node: UiNode) => node.fontPath?.trim() || defaultMapFont;
export function frameRelativeOffset(node: UiNode, parent: UiNode) {
  const offset = anchorOffset(node, parent);
  return { x: real(offset.x * 0.8 / stageSize.width), y: real(-offset.y * 0.6 / stageSize.height) };
}
