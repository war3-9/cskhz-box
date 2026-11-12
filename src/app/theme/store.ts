import { create } from 'zustand';

export type Theme = 'light' | 'dark';
const key = 'box-ui-theme';
function loadTheme(): Theme {
  try { return localStorage.getItem(key) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}
const initial = loadTheme();
applyTheme(initial);
export const useTheme = create<{ theme: Theme; toggle: () => void }>((set, get) => ({
  theme: initial,
  toggle: () => {
    const theme = get().theme === 'light' ? 'dark' : 'light';
    applyTheme(theme);
    try { localStorage.setItem(key, theme); } catch { /* Keep the current session usable. */ }
    set({ theme });
  },
}));
