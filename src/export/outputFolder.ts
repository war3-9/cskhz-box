import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export function outputFolderName(value: string) {
  const name = value.replace(/[\\/]+$/, '');
  if (!name || name.length > 100 || /[<>:"/\\|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('导出路径请填写一个有效文件夹名称，不能包含多级目录或特殊字符');
  return name;
}
export function outputFolderError(value: string) {
  try { outputFolderName(value); return ''; } catch (error) { return (error as Error).message; }
}
export const useOutputFolder = create<{ folder: string; setFolder: (folder: string) => void }>()(persist(set => ({
  folder: 'war3mapImported\\', setFolder: folder => set({ folder }),
}), { name: 'box-icon-output-folder', merge: (saved, current) => {
  const folder = (saved as { folder?: unknown } | undefined)?.folder;
  return { ...current, ...(typeof folder === 'string' ? { folder } : {}) };
} }));
