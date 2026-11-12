import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { isTauri } from '@tauri-apps/api/core';
import { FolderOpen } from 'lucide-react';
import { changeDesignDirectory, designDirectory, retryDesignCleanup, useDesignLibrary } from '../../warcraft-ui/tasks/library';
import type { DirectoryInfo } from '../../warcraft-ui/tasks/types';

export function DesignDirectorySettings() {
  const [info, setInfo] = useState<DirectoryInfo | null>(null);
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const busy = useDesignLibrary(state => state.busy);
  useEffect(() => { let alive = true; void designDirectory().then(value => { if (alive) { setInfo(value); setPath(value.directory); } }).catch(error => { if (alive) setError(String(error)); }); return () => { alive = false; }; }, []);
  const choose = async () => {
    try {
      if (!isTauri()) throw new Error('请在桌面版中选择保存目录');
      const directory = await open({ directory: true, multiple: false, title: '选择 UI 设计保存目录' });
      if (typeof directory === 'string') setPath(directory);
    } catch (error) { setError(String(error)); }
  };
  const apply = async (directory: string | null, retry = false) => {
    setError(''); setMessage('');
    try {
      const result = retry ? await retryDesignCleanup() : await changeDesignDirectory(directory);
      setInfo(result); setPath(result.directory); setMessage(result.warning || '保存目录已设置，现有保存稿已搬迁。');
    } catch (error) { setError(String(error)); }
  };
  return <section className="box-design-settings" aria-label="UI 设计保存目录">
    <h3>UI 设计保存目录</h3><p className="box-ui-settings-hint">默认在软件所在文件夹的“UI设计保存稿-开源版”。更改路径会自动搬迁现有保存稿。</p>
    <label htmlFor="box-design-path">保存路径</label><div className="box-ui-settings-path">
      <input id="box-design-path" aria-label="UI 设计保存路径" value={path} disabled={busy || !isTauri()} onChange={event => setPath(event.target.value)} />
      <button disabled={busy} onClick={() => void choose()}><FolderOpen size={17} />选择保存目录</button></div>
    {info?.defaultDirectory && <p className="box-ui-settings-hint">默认路径：{info.defaultDirectory}</p>}
    {error && <p role="alert" className="box-ui-settings-error">{error}</p>}
    {(message || info?.warning) && <p role="status" className={info?.warning ? 'box-ui-settings-error' : 'box-ui-settings-success'}>{message || info?.warning}</p>}
    <div className="box-design-actions"><button disabled={busy || !isTauri()} onClick={() => void apply(null)}>恢复默认目录</button>
      {info?.warning && <button disabled={busy} onClick={() => void apply(null, true)}>重试清理旧稿</button>}
      <button className="box-ui-settings-primary" disabled={busy || !path.trim() || !isTauri()} onClick={() => void apply(path.trim())}>{busy ? '正在处理保存稿…' : '应用保存目录'}</button></div>
  </section>;
}
