import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import type { CellAlignment } from './model';
import type { CategoryId } from './schema';
import type { CellSelection } from './grid/geometry';
import { useObjectTable } from './store';
import { selectionAlignment } from './alignment';
import { commitObjectEditor } from './commit';
import { useUi } from '../app/uiStore';

const choices = [
  { value: 'left', label: '左对齐', Icon: AlignLeft },
  { value: 'center', label: '居中', Icon: AlignCenter },
  { value: 'right', label: '右对齐', Icon: AlignRight },
] as const;

export function AlignmentButtons({ category, selection, disabled }: { category: CategoryId; selection: CellSelection; disabled: boolean }) {
  const sheet = useObjectTable(s => s.sheets[category]);
  const selected = selectionAlignment(sheet, selection);
  const apply = (alignment: CellAlignment) => {
    try {
      commitObjectEditor();
      useObjectTable.getState().setAlignment(category, selection, alignment);
      document.querySelector<HTMLElement>('.ot-grid-wrap')?.focus();
    } catch (error) { useUi.getState().notify(String(error), 'error'); }
  };
  return <div className="ot-alignment" role="group" aria-label="选中单元格对齐方式">
    {choices.map(({ value, label, Icon }) => <button key={value} type="button" className="ot-button" disabled={disabled} aria-label={label} aria-pressed={!disabled && selected === value} title={`选中单元格${label}（自动记忆）`} onMouseDown={e => e.preventDefault()} onClick={() => apply(value)}><Icon size={14} />{label}</button>)}
  </div>;
}
