import { expect, it } from 'vitest';
import { outputFolderName, outputFolderError } from './outputFolder';
it('accepts the default trailing slash and a custom Chinese child folder', () => {
  expect(outputFolderName('war3mapImported\\')).toBe('war3mapImported');
  expect(outputFolderName('自定义图标')).toBe('自定义图标');
});
it.each(['', '..', '../escape', 'a/b', 'C:\\tmp', 'CON', 'nul.png', 'folder.', 'folder ', 'a\u0000b'])('rejects an unsafe child folder %j', folder => {
  expect(() => outputFolderName(folder)).toThrow();
  expect(outputFolderError(folder)).not.toBe('');
});
