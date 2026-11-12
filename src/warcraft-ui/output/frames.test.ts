import { expect, test } from 'vitest';
import type { UiNode } from '../document/model';
import { buildTActionPlan } from '../export/tActions';
import { exportJass } from '../export/jass';
import { outputFrames } from './frames';
import { exportT } from '../export/wtg';

const button: UiNode = { id: 'button', kind: 'button', name: 'Buy', frameIndex: 3, x: 180, y: 100,
  width: 300, height: 90, color: '#ffffff', text: 'Buy item', texture: 'war3mapImported\\button.blp',
  parentId: 'panel', selfAnchor: 'CENTER', targetAnchor: 'TOPLEFT', opacity: .5 };
const panel: UiNode = { ...button, id: 'panel', kind: 'panel', name: 'Panel', frameIndex: 8,
  parentId: undefined, texture: undefined, opacity: 1 };

test('textured button keeps its handle and parent, with backdrop and centered text in exported outputs', () => {
  const input = [button, panel], frozen = JSON.stringify(input), frames = outputFrames(input);
  expect(JSON.stringify(input)).toBe(frozen);
  expect(frames.map(f => [f.type, f.node.frameIndex])).toEqual([['BACKDROP', 8], ['GLUEBUTTON', 3], ['BACKDROP', 9], ['TEXT', 10]]);
  expect(frames[1].node.parentId).toBe('panel');
  expect(frames.slice(2).map(f => [f.node.parentId, f.node.x, f.node.y, f.node.width, f.node.height, f.node.opacity])).toEqual([
    ['button',180,100,300,90,1], ['button',180,100,300,90,1],
  ]);
  const plan = buildTActionPlan(input);
  const create = plan.filter(a => a.name === 'SetVariable');
  expect(create.map(a => a.args![0].index!.value)).toEqual(['8','3','9','10']);
  expect(create[1].args![1].call!.args![2].index!.value).toBe('8');
  expect(create.slice(2).map(a => a.args![1].call!.args![2].index!.value)).toEqual(['3','3']);
  const texture = plan.find(a => a.name === 'DzFrameSetTexture')!;
  expect(texture.args!.map(a => a.value)).toEqual(['ui', button.texture, '0']);
  expect(texture.args![0].index!.value).toBe('9');
  const text = plan.find(a => a.name === 'DzFrameSetText')!;
  expect(text.args![0].index!.value).toBe('10'); expect(text.args![1].value).toContain('Buy item');
  const childPoints = plan.filter(a => a.name === 'DzFrameSetPoint' && ['9','10'].includes(a.args![0].index!.value));
  expect(childPoints.map(a => a.args!.slice(4).map(arg => arg.value))).toEqual([['0.000000','0.000000'], ['0.000000','0.000000']]);
  const jass = exportJass(input);
  expect(jass).toContain('DzCreateFrameByTagName("GLUEBUTTON", "Buy", War3LabFrames[0], "", 0)');
  expect(jass).toContain('DzFrameSetTexture(War3LabFrames[2], "war3mapImported\\\\button.blp", 0)');
  expect(jass).toContain('DzFrameSetText(War3LabFrames[3], "Buy item")');
  expect(jass).toContain('DzFrameSetTextAlignment(War3LabFrames[3], 18)');
});

test('removing material leaves a transparent button with centered text and validates remaining array slots', () => {
  const plain = { ...button, parentId: undefined, texture: undefined };
  expect(outputFrames([plain]).map(f => f.type)).toEqual(['GLUEBUTTON', 'TEXT']);
  expect(outputFrames([{ ...plain, text: '' }]).map(f => [f.type, f.template])).toEqual([['GLUEBUTTON', '']]);
  expect(outputFrames([{ ...plain, frameIndex: 8190 }]).map(f => f.node.frameIndex)).toEqual([8190, 8191]);
  expect(() => outputFrames([{ ...plain, frameIndex: 8191 }])).toThrow('下标不足');
  expect(outputFrames([{ ...plain, text: '', frameIndex: 8191 }])).toHaveLength(1);
  
  expect(outputFrames([{ ...button, parentId: undefined, frameIndex: 8189 }]).map(f => f.node.frameIndex)).toEqual([8189,8190,8191]);
  expect(() => outputFrames([{ ...button, parentId: undefined, frameIndex: 8190 }])).toThrow('下标不足');
});

test('auxiliary IDs do not collide with legacy document IDs or change the stable document indices', () => {
  const collision = { ...panel, id: 'button:material' };
  const frames = outputFrames([{ ...button, parentId: undefined }, collision]);
  expect(new Set(frames.map(f => f.node.id)).size).toBe(4);
  expect(frames.find(f => f.type === 'GLUEBUTTON')!.node.frameIndex).toBe(3);
});

test('blank and labeled buttons never export built-in skins; only explicit materials add a backdrop', () => {
  for (const text of ['', '透明按钮']) {
    const plain = { ...button, parentId: undefined, texture: undefined, text };
    const frames = outputFrames([plain]);
    expect(frames.map(f => [f.type, f.template])).toEqual(text ? [['GLUEBUTTON', ''], ['TEXT', '']] : [['GLUEBUTTON', '']]);
    expect(frames[0].node.frameIndex).toBe(button.frameIndex);
    const plan = buildTActionPlan([plain]);
    expect(plan.some(a => a.name === 'DzFrameSetTexture')).toBe(false);
    const serialized = [JSON.stringify(plan), exportJass([plain]), new TextDecoder().decode(exportT([plain]).wtg)];
    for (const output of serialized) {
      expect(output).not.toContain('ScriptDialogButton');
      expect(output).not.toContain('GLUETEXTBUTTON');
      expect(output).toContain('GLUEBUTTON');
    }
    expect(plan.some(a => a.name === 'DzFrameSetText')).toBe(!!text);
  }
});
