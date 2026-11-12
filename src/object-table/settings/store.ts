import { create } from 'zustand';

export interface ObjectPreferences { realtime: boolean; intervalSeconds: number; previewHeight: number; sourceHeight: number; closePaletteOnSave: boolean; showWar3Colors: boolean }
const key = 'box-object-preferences-v1';
export const defaultPreferences: ObjectPreferences = { realtime: true, intervalSeconds: 30, previewHeight: 65, sourceHeight: 62, closePaletteOnSave: false, showWar3Colors: true };
export function parsePreferences(value: unknown): ObjectPreferences {
  const v = value && typeof value === 'object' ? value as Partial<ObjectPreferences> : {};
  const number = (n: unknown, fallback: number, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : fallback;
  return { realtime: typeof v.realtime === 'boolean' ? v.realtime : true, intervalSeconds: number(v.intervalSeconds, 30, 5, 600), previewHeight: number(v.previewHeight, 65, 45, 1200), sourceHeight: number(v.sourceHeight, 62, 35, 1200), closePaletteOnSave: v.closePaletteOnSave === true, showWar3Colors: typeof v.showWar3Colors === 'boolean' ? v.showWar3Colors : true };
}
function load() { try { return parsePreferences(JSON.parse(localStorage.getItem(key) ?? '{}')); } catch { return defaultPreferences; } }
export const useObjectPreferences = create<ObjectPreferences>(() => load());
let failure: unknown;
export function updateObjectPreferences(value: Partial<ObjectPreferences>) {
  const next = parsePreferences({ ...useObjectPreferences.getState(), ...value });
  try { localStorage.setItem(key, JSON.stringify(next)); failure = undefined; } catch (error) { failure = error; }
  useObjectPreferences.setState(next);
  if (failure) throw new Error(`物编设置保存失败：${String(failure)}`);
}
export function checkPreferencePersistence() { if (failure) throw failure; }
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === key) { try { useObjectPreferences.setState(parsePreferences(JSON.parse(event.newValue ?? '{}'))); } catch { /* Keep valid current settings. */ } }
});
