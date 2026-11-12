import { expect, it } from 'vitest';
import { duplicateChoices, type DuplicateGroup } from './duplicates';
const group: DuplicateGroup = { key: 'same', paths: ['a.mdx', 'b.mdx', 'c.mdx'], bytes: 10, reclaimBytes: 20, references: [] };
it('keeps the chosen member and never removes an entire duplicate group', () => {
  expect(duplicateChoices([group], ['same'], { same: 'b.mdx' })).toEqual([{ keep: 'b.mdx', remove: ['a.mdx', 'c.mdx'] }]);
  expect(duplicateChoices([group], ['same'], { same: 'missing.mdx' })).toEqual([{ keep: 'a.mdx', remove: ['b.mdx', 'c.mdx'] }]);
});
it('omits unchecked and blocked groups', () => {
  expect(duplicateChoices([group], [], {})).toEqual([]);
  expect(duplicateChoices([{ ...group, blockedReason: '脚本也引用了这张贴图' }], ['same'], {})).toEqual([]);
});
