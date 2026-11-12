import { expect, test } from 'vitest';
import type { UiNode } from '../document/model';
import { buildTActionPlan } from '../export/tActions';
import { exportJass } from '../export/jass';
import { defaultMapFont } from './geometry';

test('Chinese text uses the verified game font in every output and preserves explicit custom fonts', () => {
  const base: UiNode = { id: 'text', name: '中文', kind: 'text', text: '背包按钮', color: '#ffffff', x: 0, y: 0, width: 100, height: 40 };
  for (const fontPath of [undefined, '', 'war3mapImported\\custom.ttf']) {
    const nodes = [{ ...base, fontPath }];
    const path = fontPath || defaultMapFont;
    const font = buildTActionPlan(nodes).find(action => action.name === 'DzFrameSetFont');
    expect(font!.args![1].value).toBe(path);
    expect(exportJass(nodes)).toContain(path.replaceAll('\\', '\\\\'));
    
  }
});
