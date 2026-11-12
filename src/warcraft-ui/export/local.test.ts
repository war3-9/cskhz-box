import { expect, test, vi } from 'vitest';
import { exampleNodes } from '../state/layout';
import { exportJass } from './jass';
import { exportT } from './wtg';
import { buildTActionPlan } from './tActions';

test('generates JASS and editable trigger files locally without network access', () => {
  const fetch = vi.fn(() => { throw new Error('network is unavailable'); });
  vi.stubGlobal('fetch', fetch);
  try {
    expect(exportJass(exampleNodes)).toContain('DzCreateFrameByTagName');
    const files = exportT(exampleNodes, 'ui', 'loop');
    expect(new TextDecoder().decode(files.wtg.slice(0, 4))).toBe('WTG!');
    expect(files.wct.length).toBeGreaterThan(4);
    expect(buildTActionPlan(exampleNodes).length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
