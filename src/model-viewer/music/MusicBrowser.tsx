import { useEffect, useRef, useState } from 'react';
import { Music2, Pause, Play, Star } from 'lucide-react';
import { basename, resourceKey, type Entry, type Source } from '../types';
import { useViewer } from '../workspace/store';
import { readResource } from '../resources/providers';
import { MusicPlayback } from './playback';
import './music.css';
const timeLabel = (time: number) => `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`;
export function MusicBrowser({ source, entries, active }: { source: Source; entries: Entry[]; active: boolean }) {
  const state = useViewer();
  const current = state.current?.sourceId === source.id ? entries.find(entry => entry.path === state.current?.path) : undefined;
  return <div className="viewer-music-browser">
    {current ? <MusicPlayer key={`${source.id}:${current.path}:${state.revision}`} source={source} entry={current} active={active} /> : <p className="viewer-music-hint">选择音乐后点击播放试听，支持 MP3、WAV、OGG、FLAC、M4A、AAC。</p>}
    <div className="viewer-music-list">{entries.map(entry => {
      const key = resourceKey(source, entry.path), favorite = state.favorites.includes(key);
      return <div className={`viewer-music-row${current === entry ? ' is-current' : ''}`} key={entry.path}>
        <input type="checkbox" aria-label={`选择 ${entry.path}`} checked={state.selected.includes(key)} onChange={() => state.toggle(key)} />
        <Music2 size={22} aria-hidden="true" /><button className="viewer-music-name" onClick={() => state.focus({ sourceId: source.id, path: entry.path })} title={entry.path}><strong>{basename(entry.path)}</strong><small>{entry.path}</small></button>
        <span>{(entry.size / 1024 / 1024).toFixed(2)} MB</span><button aria-label={`${favorite ? '取消收藏' : '收藏'} ${entry.path}`} aria-pressed={favorite} onClick={() => state.favorite(key)}><Star size={16} fill={favorite ? 'currentColor' : 'none'} /></button>
      </div>;
    })}</div>
  </div>;
}
function MusicPlayer({ source, entry, active }: { source: Source; entry: Entry; active: boolean }) {
  const audio = useRef<MusicPlayback | null>(null), [version, update] = useState(0), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [volume, setVolume] = useState(.6), [loop, setLoop] = useState(false);
  useEffect(() => {
    if (!active) return;
    let alive = true; const player = new MusicPlayback(() => { if (alive) update(n => n + 1); }); audio.current = player;
    player.volume(volume); player.repeat(loop); setError(''); setLoading(true);
    void (async () => {
      if (entry.size > 32 * 1024 * 1024) throw new Error('试听文件不能超过 32MB，仍可按原格式导出');
      const bytes = await readResource({ sourceId: source.id, path: entry.path }); if (!alive) return;
      if (bytes.byteLength > 32 * 1024 * 1024) throw new Error('试听文件不能超过 32MB');
      await player.load(bytes);
    })().catch(() => { if (alive) setError(entry.size > 32 * 1024 * 1024 ? '试听文件不能超过 32MB，仍可按原格式导出' : '此音频损坏或当前系统不支持解码，仍可按原格式导出'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; player.dispose(); audio.current = null; };
  }, [active, source.id, entry.path]);
  const playing = audio.current?.playing ?? false;
  useEffect(() => { if (!playing) return; const timer = setInterval(() => update(n => n + 1), 200); return () => clearInterval(timer); }, [playing]);
  const run = async (action: () => Promise<void>) => { try { await action(); } catch { setError('试听未能开始，请再次点击播放'); } };
  const duration = audio.current?.duration ?? 0, time = audio.current?.time ?? 0;
  return <section className="viewer-music-player" aria-label="音乐试听" data-playing={playing} data-frame={version}>
    <strong>{basename(entry.path)}</strong>{error ? <p role="alert">{error}</p> : <><div className="viewer-music-controls">
      <button disabled={loading || !duration} aria-label={playing ? '暂停音乐' : '播放音乐'} onClick={() => playing ? audio.current?.pause() : void run(() => audio.current!.play())}>{playing ? <Pause size={18} /> : <Play size={18} />}{loading ? '读取中…' : playing ? '暂停' : '播放'}</button>
      <time>{timeLabel(time)} / {timeLabel(duration)}</time><input aria-label="音乐进度" type="range" min="0" max={duration || 1} step="0.1" value={time} disabled={loading} onChange={e => void run(() => audio.current!.seek(Number(e.target.value)))} />
    </div><div className="viewer-music-options"><label>音量<input aria-label="音乐音量" type="range" min="0" max="1" step="0.05" value={volume} onChange={e => { const v = Number(e.target.value); setVolume(v); audio.current?.volume(v); }} /></label><label><input type="checkbox" checked={loop} onChange={e => { setLoop(e.target.checked); audio.current?.repeat(e.target.checked); }} />循环播放</label></div></>}
  </section>;
}
