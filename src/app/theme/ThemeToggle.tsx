import { Shirt } from 'lucide-react';
import { IconButton } from '../../shared/components/IconButton';
import { useTheme } from './store';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return <IconButton label={theme === 'light' ? '切换夜间主题' : '切换白天主题'}
    onClick={toggle}><Shirt size={18} /></IconButton>;
}
