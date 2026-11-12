import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ColoredText, coloredTitle } from './ColoredText';
describe('表格颜色仅改变渲染', () => {
  it('多色、重置、中文、透明度规则和换行保留', () => {
    const raw = '|c00ff2424分裂战斧|r普通|cff24ff24一级|r|n第二行';
    const html = renderToStaticMarkup(<ColoredText text={raw} />);
    expect(html).toContain('color:#ff2424'); expect(html).toContain('color:#24ff24');
    expect(html).not.toContain('|cff'); expect(coloredTitle(raw)).toBe('分裂战斧普通一级\n第二行');
    expect(raw).toContain('|c00ff2424');
    expect(html).toContain('\n');
    expect(renderToStaticMarkup(<ColoredText text={'普通\n中文'} />)).toContain('普通\n中文');
  });
  it('关闭颜色显示时保留原始代码与真实换行，不改变原始文字', () => {
    const raw = '|cffff0000属性|n+10|r\n第二段';
    const html = renderToStaticMarkup(<ColoredText text={raw} showColors={false} />);
    expect(html).toContain(raw); expect(html).not.toContain('color:');
    expect(coloredTitle(raw, false)).toBe(raw);
  });
  it('无效颜色代码按原文字保留', () => {
    const text = '|czzff2424无效颜色';
    expect(coloredTitle(text)).toBe(text);
    expect(renderToStaticMarkup(<ColoredText text={text} />)).toContain(text);
  });
});
