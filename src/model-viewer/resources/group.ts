import type { model } from 'war3-model';
export function modelGroup(data: model.Model, path: string) {
  const normalized = path.toLowerCase().replace(/\\/g, '/');
  if (normalized.startsWith('units/')) return 0;
  if (normalized.startsWith('buildings/')) return 1;
  if (normalized.startsWith('doodads/')) return 2;
  const names = data.Sequences.map(item => item.Name.toLowerCase());
  if (names.some(name => name.startsWith('walk'))) return 0;
  if (names.some(name => name.startsWith('stand work') || name.startsWith('upgrade'))) return 1;
  return names.some(name => name.startsWith('attack')) ? 0 : 2;
}
