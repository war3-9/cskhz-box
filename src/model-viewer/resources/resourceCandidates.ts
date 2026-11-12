import { normalizePath } from '../types';
export function resourceCandidates(path: string, modelPath?: string) {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  const candidates = [normalized];
  if (modelPath) {
    const parts = modelPath.replace(/\\/g, '/').split('/'); parts.pop();
    for (const part of normalized.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { if (!parts.length) return candidates; parts.pop(); }
      else parts.push(part);
    }
    const relative = parts.join('/');
    if (relative && !candidates.some(candidate => normalizePath(candidate) === normalizePath(relative))) candidates.push(relative);
    const directory = modelPath.replace(/\\/g, '/').split('/').slice(0, -1);
    const local = [...directory, normalized.split('/').at(-1)].join('/');
    if (local && !candidates.some(candidate => normalizePath(candidate) === normalizePath(local))) candidates.push(local);
  }
  return candidates;
}
