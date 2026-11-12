import { invoke, isTauri } from '@tauri-apps/api/core';

export async function prepareIconPairDirectory(directory: string) {
  if (!isTauri()) throw new Error('生成光暗图标需要在桌面版选择保存目录');
  await invoke('prepare_icon_pair_directory', { directory });
}
export const nextIconPairSequence = (directory: string, prefix: string, start: number) =>
  invoke<number>('next_icon_pair_sequence', { directory, prefix, start });
export async function writeIconPair(directory: string, prefix: string, sequence: number, normal: Blob, disabled: Blob) {
  return invoke<string[] | null>('write_icon_pair', {
    directory, prefix, sequence,
    normal: Array.from(new Uint8Array(await normal.arrayBuffer())),
    disabled: Array.from(new Uint8Array(await disabled.arrayBuffer())),
  });
}
