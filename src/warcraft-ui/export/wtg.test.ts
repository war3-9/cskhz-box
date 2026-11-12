import { expect, test } from 'vitest';
import { exportT } from './wtg';
import { exampleNodes } from '../state/layout';

test('exports paired native trigger files without custom JASS', () => {
  const result = exportT(exampleNodes);
  expect(new TextDecoder().decode(result.wtg.slice(0, 4))).toBe('WTG!');
  expect(new DataView(result.wct.buffer).getInt32(0, true)).toBe(1);
  expect(result.wtg.length).toBeGreaterThan(200);
  expect(new TextDecoder().decode(result.wtg)).not.toContain('CustomScriptCode');
  expect(new TextDecoder().decode(result.wtg)).toContain('|cffffffffUI 预览|r');
});

test('rejects unsafe or overlong WTG strings instead of truncating them', () => {
  expect(() => exportT([{ ...exampleNodes[1], text: 'a\0b' }])).toThrow('空字符');
  expect(() => exportT([{ ...exampleNodes[1], text: '中'.repeat(100) }])).toThrow('299');
  expect(() => exportT([{ ...exampleNodes[0], x: Infinity }])).toThrow('coordinate');
});
