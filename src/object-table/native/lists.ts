// Warcraft repeat columns sometimes use a Lua-like, CSV-shaped level list.
export function levelList(value: string): string[] {
  if (!value.startsWith('{') || !value.endsWith('}')) return [value];
  const result: string[] = []; let text = '', quoted = false, closed = false;
  for (const ch of value.slice(1, -1)) {
    if (ch === '"') { if (closed) { text += '"'; closed = false; quoted = true; } else if (quoted) { quoted = false; closed = true; } else { quoted = true; } }
    else if (ch === ',' && !quoted) { result.push(text.trim()); text = ''; closed = false; }
    else { if (closed && ch.trim()) throw new Error('等级列表引号后有无效字符'); text += ch; }
  }
  if (quoted) throw new Error('等级列表引号未结束');
  result.push(text.trim()); return result;
}
