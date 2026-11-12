import { beforeEach, expect, it, vi } from 'vitest';
import { resourceEntries } from '../workspace/resourceFilters';
import { exportRefs } from '../export/scope';
import { useViewer } from '../workspace/store';
import { resourceKey, type Source } from '../types';
import { MusicPlayback } from './playback';
const source: Source = { id: 'music', path: 'F:/music', name: 'music', kind: 'archive', complete: true,
  entries: ['Music/theme.MP3', 'sounds/a.wav', 'music/a.ogg', 'music/a.flac', 'music/a.m4a', 'music/a.aac', 'a.mdx', 'texture.png', 'notes.txt'].map(path => ({ path, model: path.endsWith('.mdx'), size: 10, anonymous: false })) };
beforeEach(() => { vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() }); });
it('music filtering and export retain paths and exclude models, textures and unrelated selected files', () => {
  expect(resourceEntries(source, 'music')).toHaveLength(6);
  expect(resourceEntries(source, 'texture').map(e => e.path)).toEqual(['texture.png']);
  useViewer.setState({ sources: [source], activeSource: source.id, kind: 'music', selected: [resourceKey(source, 'Music/theme.MP3'), resourceKey(source, 'texture.png')], sort: 'name' });
  expect(exportRefs(useViewer.getState(), 'selected')).toEqual([{ sourceId: 'music', path: 'Music/theme.MP3' }]);
  expect(exportRefs(useViewer.getState(), 'all')).toHaveLength(6);
});
it('playback pause, seek, loop and dispose stop old nodes and close the audio context', async () => {
  const nodes: { stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; loop: boolean }[] = [];
  const context = { currentTime: 0, destination: {}, createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
    decodeAudioData: vi.fn().mockResolvedValue({ duration: 30 }), resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
    createBufferSource: () => { const node = { start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), connect: vi.fn(), loop: false }; nodes.push(node); return node; } };
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  const player = new MusicPlayback(vi.fn()); await player.load(new ArrayBuffer(0)); await player.play();
  context.currentTime = 5; expect(player.time).toBe(5); player.pause(); expect(nodes[0].stop).toHaveBeenCalledOnce();
  await player.play(); expect(nodes[1].start).toHaveBeenCalledWith(0, 5);
  await player.seek(12); expect(nodes[1].stop).toHaveBeenCalledOnce(); expect(nodes[2].start).toHaveBeenCalledWith(0, 12);
  player.repeat(true); context.currentTime = 45; expect(player.time).toBe(22);
  player.repeat(false); expect(player.time).toBe(22); expect(nodes[2].loop).toBe(false);
  player.dispose(); expect(nodes[2].stop).toHaveBeenCalledOnce(); expect(context.close).toHaveBeenCalledOnce();
  expect(player.playing).toBe(false); await player.play(); expect(nodes).toHaveLength(3);
});
