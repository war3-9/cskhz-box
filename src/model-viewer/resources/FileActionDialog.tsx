import { useEffect, useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { FolderOpen, X } from 'lucide-react';
import { type Source } from '../types';
import { useViewer } from '../workspace/store';
import { exportRefs } from '../export/scope';
import { chooseViewerPath } from './dialogs';
import { mutateSource, prepareImports } from './mutations';
import { modelDeletePlan } from './deletePlan';

export function FileActionDialog({ action, source, close, targets, wholeModel = false }: { action: 'delete' | 'import'; source: Source; close: () => void; targets?: string[]; wholeModel?: boolean }) {
  const [paths, setPaths] = useState(() => targets ?? exportRefs(useViewer.getState(), 'selected').filter(ref => ref.sourceId === source.id).map(ref => ref.path));
  const [preparing, setPreparing] = useState(wholeModel), [planError, setPlanError] = useState(''), [warnings, setWarnings] = useState<string[]>([]);
  const [imports, setImports] = useState<string[]>([]), [destination, setDestination] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const map = source.kind === 'archive';
  const saveCopy = map && action === 'import';
  const title = action === 'delete' ? targets ? '删除资源' : '删除选中' : '导入文件';
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { event.preventDefault(); event.stopPropagation(); close(); } }; window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true); }, [busy, close]);
  useEffect(() => {
    if (!wholeModel) return;
    let alive = true;
    const prepare = async () => {
      const files = new Set(paths), warnings = new Set<string>();
      for (const path of paths) {
        if (!/\.(mdx|mdl)$/i.test(path)) continue;
        const plan = await modelDeletePlan(source, path); if (!alive) return;
        plan.paths.forEach(path => files.add(path)); plan.warnings.forEach(warning => warnings.add(warning));
      }
      if (alive) { setPaths([...files]); setWarnings([...warnings]); }
    };
    void prepare().catch(failure => { if (alive) setPlanError(`无法解析模型贴图，未执行删除：${String(failure)}`); }).finally(() => { if (alive) setPreparing(false); });
    return () => { alive = false; };
  }, [source, wholeModel]);
  const choose = async () => {
    try {
      const value = await chooseViewerPath({ title: '导入模型和贴图', multiple: true, filters: [{ name: '模型和贴图', extensions: ['mdx', 'mdl', 'blp', 'tga', 'dds', 'png', 'jpg', 'jpeg'] }] });
      if (value) setImports(typeof value === 'string' ? [value] : value);
    } catch (failure) { setError(String(failure)); }
  };
  const run = async () => {
    if (preparing || planError || busy) return;
    setBusy(true); setError('');
    useViewer.getState().patch({ fileBusy: true });
    try {
      await mutateSource(source, action, paths, { inputs: action === 'import' ? await prepareImports(imports) : [], destination: saveCopy ? destination : undefined });
      close();
    } catch (failure) { setError(String(failure)); }
    finally { setBusy(false); useViewer.getState().patch({ fileBusy: false }); }
  };
  return <div className="viewer-dialog-backdrop"><section className="viewer-dialog viewer-file-action" role="dialog" aria-modal="true" aria-label={title}>
    <h3>{title}<button className="viewer-icon" title="关闭操作" disabled={busy} onClick={close}><X size={17} /></button></h3>
    {action === 'delete' && <><p>将这 {paths.length} 个文件及模型在当前来源内找到的引用贴图整理到系统下载文件夹的“已删除模型”目录，备份成功后从当前{map ? '地图' : '文件夹'}删除下列文件。{map ? '当前地图会直接保存，原地图的恢复备份也放在该目录。' : ''}</p><p>{wholeModel ? '整体删除包含此模型及当前来源内找到的引用贴图。贴图可能被其他模型共用，删除后会影响共用它们的模型；外部来源及游戏本体贴图保留。' : '仅删除下面列出的文件；未列出的引用贴图保留原位。删除仍被引用的资源会导致模型缺失或显示异常。'}</p>{preparing && <p role="status">正在查找模型引用的贴图…</p>}{warnings.map(warning => <p key={warning} className="viewer-warning">{warning}</p>)}{planError && <p role="alert">{planError}</p>}<div className="viewer-file-preview">{paths.map(path => <div key={path}>{path}</div>)}</div></>}
    {action === 'import' && <><p>导入到当前{map ? '地图副本' : '文件夹'}，模型所需贴图一并复制。已有不同内容的文件不会覆盖。</p><button disabled={busy} onClick={() => void choose()}><FolderOpen size={17} />选择导入文件</button><div className="viewer-file-preview">{imports.map(path => <div key={path}>{path}</div>)}</div></>}
    {saveCopy && <><button disabled={busy} onClick={() => void save({ title: '另存修改后的地图', defaultPath: source.path.replace(/(\.w3[xm])$/i, '-修改$1'), filters: [{ name: '魔兽争霸 III 地图', extensions: ['w3x', 'w3m'] }] }).then(path => { if (path) setDestination(path); }).catch(failure => setError(String(failure)))}><FolderOpen size={17} />选择新地图路径</button><p className="viewer-file-target">{destination}</p></>}
    {error && <p role="alert">{error}</p>}<footer><button disabled={busy} onClick={close}>取消</button><button disabled={busy || preparing || !!planError || (saveCopy && !destination) || (action === 'import' ? !imports.length : !paths.length)} onClick={() => void run()}>{busy ? '正在处理…' : action === 'delete' ? '确认删除' : '确认导入'}</button></footer>
  </section></div>;
}
