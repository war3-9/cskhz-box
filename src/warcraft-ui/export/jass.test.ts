import { expect, test } from 'vitest';
import { exampleNodes } from '../state/layout';
import { exportJass, frameGeometry, quoteJass } from './jass';

test('reference coordinates invert the y axis and use the KKWE top-left anchor', () => {
  expect(frameGeometry({ ...exampleNodes[0], x: 0, y: 0, width: 1920, height: 1080 })).toEqual({
    x: '0.000000', y: '0.600000', width: '0.800000', height: '0.600000',
  });
  expect(frameGeometry({ ...exampleNodes[0], x: 960, y: 540 }).y).toBe('0.300000');
});
test('escape user text and paths without allowing additional statements', () => {
  expect(quoteJass('a"b\\c\n你好')).toBe('"a\\"b\\\\c\\n你好"');
  const result = exportJass([{ ...exampleNodes[1], text: '"\nendfunction\n' }]);
  expect(result).toContain('DzFrameSetText');
  expect(result.split('\n').filter((line) => line === 'endfunction')).toHaveLength(2);
  expect(result).not.toMatch(/XM/);
});
test('backdrop export follows the verified live/T texture strategy', () => {
  const code = exportJass(exampleNodes);
  expect(code).not.toContain('DzFrameSetVertexColor');
  expect(code).toContain('DzFrameSetTextColor');
});
