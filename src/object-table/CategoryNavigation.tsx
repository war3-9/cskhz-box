import { FileSpreadsheet, FlaskConical, Gem, Layers3, Sprout, Swords, WandSparkles } from 'lucide-react';
import { categories } from './schema';
import { useObjectTable } from './store';
import { ThemeSelect } from '../shared/components/ThemeSelect';

const categoryIcons = { item: Gem, unit: Swords, ability: WandSparkles, upgrade: FlaskConical, doodad: Sprout, buff: Layers3 };
export function CategoryNavigation({ onActivate }: { onActivate: (id: string) => void }) {
  const active = useObjectTable(state => state.active), sheets = useObjectTable(state => state.sheets);
  const options = [
    ...categories.map(({ id, title, color }) => {
      const Icon = categoryIcons[id];
      return { value: id, text: title, label: <span className="ot-category-choice" style={{ color }}><Icon size={17} /><span>{title}</span><small>{sheets[id].rows.length}</small></span> };
    }),
    ...Object.entries(sheets).filter(([id]) => !categories.some(category => category.id === id)).map(([id, sheet]) => ({
      value: id, text: sheet.name,
      label: <span className="ot-category-choice" style={{ color: '#8b9bb0' }}><FileSpreadsheet size={17} /><span>{sheet.name}</span><small>{sheet.rows.length} · 本地</small></span>,
    })),
  ];
  return <nav className="ot-category-tabs ot-category-select" aria-label="物编分类">
    <ThemeSelect label="物编分类" value={active} onChange={onActivate} options={options} />
  </nav>;
}
