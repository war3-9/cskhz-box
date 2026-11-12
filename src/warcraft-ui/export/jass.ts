import type { UiNode } from '../document/model';
import { anchorIndex, frameGeometry, framePosition, hasText, fontHeight, frameFont } from '../output/geometry';
import { frameName } from '../document/frameVariables';
import { outputFrames } from '../output/frames';
import { validateNodes } from '../document/validation';
import { validateArrayName } from '../document/arrayName';
export { frameGeometry } from '../output/geometry';

export const quoteJass = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '').replace(/\n/g, '\\n')}"`;

export function exportJass(nodes: UiNode[], arrayName?: string): string {
  validateNodes(nodes);
  const frames = outputFrames(nodes);
  nodes = frames.map(frame => frame.node);
  const array = validateArrayName(arrayName ?? 'War3LabFrames');
  const handles = frames.map(({ node }, index) => `${array}[${arrayName ? node.frameIndex : index}]`);
  const destroy = arrayName ? [...handles].reverse().flatMap(frame => [
    `    if ${frame} != 0 then`, `        call DzDestroyFrame(${frame})`, `        set ${frame} = 0`, '    endif',
  ]) : [`    local integer i = ${nodes.length - 1}`, '    loop',
    '        exitwhen i < 0', `        if ${array}[i] != 0 then`,
    `            call DzDestroyFrame(${array}[i])`, `            set ${array}[i] = 0`,
    '        endif', '        set i = i - 1', '    endloop'];
  const lines = ['// KKWE DzFrame UI. Import BlizzardAPI.j and call War3LabCreateUI.',
    '// Reference viewport: 4:3, 0.8 x 0.6; widescreen alignment needs a game test.',
    'globals', `    integer array ${array}`, 'endglobals', '',
    'function War3LabDestroyUI takes nothing returns nothing', ...destroy, 'endfunction', '',
    'function War3LabCreateUI takes nothing returns nothing', '    call War3LabDestroyUI()'];
  frames.forEach(({ node, type, template, alignment }, index) => {
    const frame = handles[index];
    const g = frameGeometry(node);
    const parent = node.parentId ? handles[nodes.findIndex(item => item.id === node.parentId)] : 'DzGetGameUI()';
    const offset = framePosition(node, nodes.find(item => item.id === node.parentId));
    lines.push(`    set ${frame} = DzCreateFrameByTagName("${type}", ${quoteJass(frameName(node))}, ${parent}, ${quoteJass(template)}, 0)`,
      node.parentId || node.selfAnchor || node.targetAnchor ? `    call DzFrameSetPoint(${frame}, ${anchorIndex(node.selfAnchor)}, ${parent}, ${anchorIndex(node.targetAnchor)}, ${offset.x}, ${offset.y})` : `    call DzFrameSetAbsolutePoint(${frame}, 0, ${g.x}, ${g.y})`,
      `    call DzFrameSetSize(${frame}, ${g.width}, ${g.height})`);
    if (hasText(node)) {
      lines.push(`    call DzFrameSetText(${frame}, ${quoteJass(node.text ?? '')})`,
        `    call DzFrameSetFont(${frame}, ${quoteJass(frameFont(node))}, ${fontHeight(node)}, 0)`,
        `    call DzFrameSetTextAlignment(${frame}, ${alignment})`);
    } else if (node.texture) {
      lines.push(`    call DzFrameSetTexture(${frame}, ${quoteJass(node.texture)}, 0)`);
    }
    const rgb = Number.parseInt((node.textColor ?? node.color).slice(1), 16);
    if (!/^#[0-9a-f]{6}$/i.test(node.color)) throw new Error('Invalid frame color');
    const color = (0xff000000 | rgb) | 0;
    if (hasText(node)) lines.push(`    call DzFrameSetTextColor(${frame}, ${color})`);
    if (node.opacity !== undefined) lines.push(`    call DzFrameSetAlpha(${frame}, ${Math.round(node.opacity * 255)})`);
    lines.push(`    call DzFrameShow(${frame}, ${node.visible !== false ? 'true' : 'false'})`);
  });
  lines.push('endfunction', '');
  return lines.join('\n');
}
