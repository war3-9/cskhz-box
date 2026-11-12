import { invoke } from '@tauri-apps/api/core';
import { useConsole } from './store';
import { fontLayerId } from './fontTypes';

const faces = new Map<string, FontFace>();
function releaseUnusedFonts() {
  const state = useConsole.getState();
  if (state.busy || !faces.size) return;
  const used = new Set([state.layers, state.originalLayers, state.savedLayers, ...state.past, ...state.future]
    .flatMap(layers => layers.filter(layer => layer.id === fontLayerId).map(layer => layer.image)));
  for (const [family, face] of faces) if (!used.has(family)) {
    document.fonts.delete(face); faces.delete(family);
  }
}
// Commit and history updates can happen synchronously in separate store calls.
useConsole.subscribe(() => queueMicrotask(releaseUnusedFonts));

export async function registerConsoleFont(bytes: number[]) {
  const family = `BoxConsoleFont${crypto.randomUUID().replaceAll('-', '')}`;
  const face = new FontFace(family, new Uint8Array(bytes).buffer);
  await face.load();
  document.fonts.add(face);
  faces.set(family, face);
  return { family, face };
}

export async function replaceConsoleFont(path: string) {
  const state = useConsole.getState();
  if (state.busy || !state.map) throw new Error('请先打开地图并等待当前操作完成');
  if (!/\.ttf$/i.test(path)) throw new Error('请选择静态 TrueType 字体（.ttf）');
  useConsole.setState({ busy: true });
  let registered: Awaited<ReturnType<typeof registerConsoleFont>> | undefined;
  try {
    const input = await invoke<{ bytes: number[]; chinese: boolean }>('console_font_input', { path });
    registered = await registerConsoleFont(input.bytes);
    if (useConsole.getState().map !== state.map)
      throw new Error('当前地图已变化，请重新选择字体');
    // All native text shares this document slot, including undo and right reset.
    useConsole.setState({ busy: false });
    useConsole.getState().replace([{ id: fontLayerId, image: registered.family, filename: path, sourceBytes: input.bytes }]);
    return input.chinese;
  } catch (error) {
    if (registered) { document.fonts.delete(registered.face); faces.delete(registered.family); }
    throw error;
  } finally { useConsole.setState({ busy: false }); }
}
