import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { resourceKey, type Source } from '../types';
import { useViewer } from '../workspace/store';
import { exportRefs } from './scope';
import { mapDirectory, renameConflict, renamePlan } from './naming';

export function BatchRenameDialog({ source, close }: { source: Source; close: () => void }) {
  const [paths] = useState(() => exportRefs(useViewer.getState(), 'selected').map(ref => ref.path).filter(path => /\.(mdx|mdl)$/i.test(path)));
  const [prefix, setPrefix] = useState(''), [start, setStart] = useState('1');
  const [directory, setDirectory] = useState('');
  const state = useViewer();
  let plan: ReturnType<typeof renamePlan> = [], pathError = '', folder = '';
  try { folder = mapDirectory(directory); plan = renamePlan(paths, prefix, start, directory); }
  catch (error) { pathError = (error as Error).message; }
  const names = { ...state.exportNames, ...Object.fromEntries(plan.map(item => [resourceKey(source, item.path), item.name])) };
  const error = pathError || (folder && !isTauri() ? '带目录的模型请在桌面版导出；浏览器下载无法保留目录结构' : '')
    || (plan.length ? renameConflict(source, names) : '请输入有效名称前缀和 1–999999999 的起始序号');
  const apply = () => { if (error) return; state.patch({ exportNames: names, status: `已设置 ${plan.length} 个模型，地图内目录：${folder || '根目录'}。下一步点击“导出选中”；导入后可“检查地图路径”` }); close(); };
  return <div className="viewer-dialog-backdrop" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}><section className="viewer-dialog viewer-file-action" role="dialog" aria-modal="true" aria-label="批量重命名">
    <h3>批量重命名<button className="viewer-icon" title="关闭操作" onClick={close}><X size={17} /></button></h3>
    <p>已勾选 {paths.length} 个模型。先设置名称和地图内目录，再点击“导出选中”。模型、贴图及模型内部引用会一起更新，原文件不变。</p>
    <label><span>统一前缀</span><input aria-label="统一前缀" placeholder="例如 tx" value={prefix} maxLength={60} onChange={e => setPrefix(e.target.value)} /></label>
    <label><span>起始序号</span><input aria-label="起始序号" inputMode="numeric" value={start} maxLength={9} onChange={e => setStart(e.target.value)} /></label>
    <label><span>地图内路径前缀</span><input aria-label="地图内路径前缀" aria-describedby="viewer-rename-path-help" placeholder="例如 unit；留空表示根目录" value={directory} maxLength={120} onChange={e => setDirectory(e.target.value)} /></label>
    <p id="viewer-rename-path-help">这里填地图里的目录，不是电脑磁盘路径。支持 unit、zs 或 Models\Units，末尾反斜杠自动补齐。建议使用英文字母、数字和下划线。</p>
    <div className="viewer-file-preview">{plan.map(item => <div key={item.path}>{item.path} → {item.name}</div>)}</div>
    {plan[0] && <div className="viewer-rename-guide">
      <strong>导入编辑器时，两边路径必须一致</strong>
      <p>模型路径：<code>{plan[0].name}</code><br />贴图路径示例：<code>{plan[0].name.replace(/\.[^.]+$/, '')}1.blp</code><br />模型内部会写入相同的贴图路径；实际贴图扩展名和数量以原素材为准。</p>
      <ol><li>选择导出位置时，选{folder ? <>包含 <code>{folder}</code> 的上一级目录；软件会自动创建子目录，不要再手动进入同名文件夹。</> : '一个空文件夹；模型和贴图会直接放在里面。'}</li>
        <li>把模型和配套贴图一起导入，输入管理器中的完整路径必须与上方预览一致。不要再多套一层目录；只有预览本身包含 war3mapImported\ 时才保留该前缀。</li>
        <li>保存地图后，点击左侧“检查地图路径”。仅在查看器里能显示，不代表地图中的引用正确。</li></ol>
      <small>找不到的原贴图会保留原引用，并在导出结果中提示缺失；不会虚构新路径。</small>
    </div>}
    {error && <p role="alert">{error}</p>}
    <footer><button onClick={close}><X size={16} />取消</button><button disabled={!!error} onClick={apply}><Check size={16} />应用导出设置</button></footer>
  </section></div>;
}
