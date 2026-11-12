import { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { checkMapPaths, type MapPathResult } from './checkMapPaths';

export function CheckMapPathsDialog({ paths, close }: { paths: string[]; close: () => void }) {
  const [targets] = useState(() => [...paths]);
  const [busy, setBusy] = useState(false), [done, setDone] = useState(0), [error, setError] = useState('');
  const [map, setMap] = useState(''), [result, setResult] = useState<MapPathResult>();
  const controller = useRef<AbortController | undefined>(undefined), mounted = useRef(true), choosing = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, [close]);
  const run = async () => {
    if (choosing.current) return;
    choosing.current = true; setBusy(true); setError('');
    try {
      const path = await open({ title: '选择已导入模型并保存的地图', filters: [{ name: '魔兽地图', extensions: ['w3x', 'w3m'] }] });
      if (!mounted.current || typeof path !== 'string') return;
      const abort = new AbortController(); controller.current = abort;
      setMap(path); setResult(undefined); setDone(0);
      const value = await checkMapPaths(path, targets, abort.signal, count => { if (mounted.current) setDone(count); });
      if (mounted.current && !abort.signal.aborted) setResult(value);
    } catch (error) { if (mounted.current) setError(String(error)); }
    finally { choosing.current = false; if (mounted.current) setBusy(false); }
  };
  return <div className="viewer-dialog-backdrop"><section className="viewer-dialog viewer-file-action" role="dialog" aria-modal="true" aria-label="检查地图路径">
    <h3>检查地图路径<button onClick={close} aria-label="关闭路径检查">关闭</button></h3>
    <p>只读检查当前来源已设置重命名的 {targets.length} 个模型。请先在编辑器中导入模型和贴图，并保存地图。</p>
    <button disabled={busy} onClick={() => void run()}>{busy ? `正在检查 ${done} / ${targets.length}` : '选择已保存的地图'}</button>
    {map && <p className="viewer-file-target">{map}</p>}
    {error && <p role="alert">{error}</p>}
    {result && <><p role="status">已检查 {result.models} 个模型、{result.textures} 处贴图引用；{result.issues.length ? `发现 ${result.issues.length} 项需要核对。` : '模型和贴图的精确路径均存在。'}</p>
      <div className="viewer-file-preview">{result.issues.map((issue, index) => <div key={index}>
        <strong>{issue.kind === 'texture' ? '地图内未找到贴图' : issue.kind === 'model' ? '未找到模型' : '无法读取或解析'}</strong>：{issue.path}<br />关联模型：{issue.model}
        {issue.candidates.length > 0 && <><br />发现同名文件，但路径不同：{issue.candidates.join('、')}</>}
        {issue.detail && <><br />{issue.detail}</>}
      </div>)}</div></>}
    <p>检查按模型内部写入的完整路径查找，不自动补目录。游戏自带贴图可能不在地图里，需另行核对；路径存在也不等于模型结构或游戏显示已通过验证。</p>
    <footer><button onClick={close}>{busy ? '取消检查并关闭' : '关闭'}</button></footer>
  </section></div>;
}
