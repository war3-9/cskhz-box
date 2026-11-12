import { encodeColors, parseColors, type ColorRun } from './colorCodes';

export function renderPreview(element: HTMLElement, code: string) {
  const nodes = parseColors(code).map(run => {
    const span = document.createElement('span'); span.textContent = run.text;
    if (run.color) { span.style.color = '#' + run.color.slice(2); span.dataset.war3Color = run.color; } return span;
  });
  element.replaceChildren(...nodes);
}
function readPreview(root: Node): ColorRun[] {
  const runs: ColorRun[] = [];
  const walk = (node: Node, color?: string) => {
    if (node.nodeType === Node.TEXT_NODE) { runs.push({ text: node.textContent ?? '', color }); return; }
    if (node instanceof HTMLElement) {
      color = node.dataset.war3Color ?? color;
      if (node.tagName === 'BR') { runs.push({ text: '\n', color }); return; }
      if (['DIV', 'P'].includes(node.tagName) && node.previousSibling) runs.push({ text: '\n', color });
    }
    node.childNodes.forEach(child => walk(child, color));
  };
  root.childNodes.forEach(node => walk(node)); return runs;
}
export const previewCode = (root: Node) => encodeColors(readPreview(root));
export function previewSelection(root: HTMLElement | null): [number, number] | null {
  if (!root) return null;
  const s = window.getSelection(); if (!s?.rangeCount || !root.contains(s.anchorNode) || !root.contains(s.focusNode)) return null;
  const range = s.getRangeAt(0), before = range.cloneRange(); before.selectNodeContents(root); before.setEnd(range.startContainer, range.startOffset);
  const start = readPreview(before.cloneContents()).reduce((n, r) => n + r.text.length, 0);
  return [start, start + readPreview(range.cloneContents()).reduce((n, r) => n + r.text.length, 0)];
}
