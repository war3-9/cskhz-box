import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TriggerExport } from './TriggerExport';

test('offline T export retains both generation choices beside the export action', () => {
  const markup = renderToStaticMarkup(<TriggerExport onMessage={() => {}} />);
  expect(markup).toContain('aria-label="T 生成方式"');
  expect(markup).toContain('value="individual"'); expect(markup).toContain('value="loop"');
  expect(markup).toContain('逐条生成'); expect(markup).toContain('循环生成');
  expect(markup).toContain('导出 T 触发');
});
