import { describe, expect, it } from 'vitest';
import { defaultPreferences, parsePreferences } from './store';
describe('物编设置兼容与校验', () => {
  it('旧设置和损坏字段回退默认值，限制异常尺寸与间隔', () => {
    expect(parsePreferences(null)).toEqual(defaultPreferences);
    expect(parsePreferences({ realtime: false, intervalSeconds: NaN, previewHeight: -100, sourceHeight: 90000 })).toEqual({ ...defaultPreferences, realtime: false, intervalSeconds: 30, previewHeight: 45, sourceHeight: 1200 });
  });
  it('新增常规设置兼容旧值，并保留明确的布尔开关', () => {
    expect(parsePreferences({ realtime: false })).toMatchObject({ closePaletteOnSave: false, showWar3Colors: true });
    expect(parsePreferences({ closePaletteOnSave: true, showWar3Colors: false })).toMatchObject({ closePaletteOnSave: true, showWar3Colors: false });
    expect(parsePreferences({ closePaletteOnSave: 'true', showWar3Colors: 0 })).toMatchObject({ closePaletteOnSave: false, showWar3Colors: true });
  });
});
