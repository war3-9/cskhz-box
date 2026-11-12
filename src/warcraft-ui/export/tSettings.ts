import { create } from 'zustand';
import type { TMode } from './tLoops';

const key = 'box.ui.t.mode';
const saved = () => { try { return localStorage.getItem(key) === 'loop' ? 'loop' : 'individual'; } catch { return 'individual'; } };
export const useTSettings = create<{ mode: TMode; setMode: (mode: TMode) => void }>(set => ({
  mode: saved(), setMode: mode => { set({ mode }); try { localStorage.setItem(key, mode); } catch { /* The setting still works for this session. */ } },
}));
