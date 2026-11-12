import { useCallback, useEffect, useState } from 'react';
import type { Source } from '../types';
import { useViewer } from '../workspace/store';
import { applyDuplicates, cancelDuplicateScan, duplicateChoices, findDuplicates, type DuplicateKind, type DuplicateProgress, type DuplicateScan } from '../resources/duplicates';
import './duplicates.css';

const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`;
const stages: Record<DuplicateProgress['stage'], string> = { waiting: '等待文件操作完成', indexing: '读取资源目录', reading: '读取资源文件', hashing: '计算文件内容指纹', fingerprint: '核对地图指纹', references: '解析模型贴图引用', models: '比较模型内容', textures: '比较贴图内容', external: '检查地图中的其他贴图引用' };
export function DuplicateDialog({ source, kind, close }: { source: Source; kind: DuplicateKind; close: () => void }) {
  const [scan, setScan] = useState<DuplicateScan>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [checked, setChecked] = useState<string[]>([]), [keep, setKeep] = useState<Record<string, string>>({}), [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<DuplicateProgress>();
  const title = kind === 'models' ? '重复模型检测' : '重复贴图合并';
  const cancelScan = useCallback(async () => {
    try { await cancelDuplicateScan(source.id); } catch { /* The dialog must remain closable if the native command fails. */ }
    useViewer.getState().patch({ fileBusy: false, status: '已取消查重扫描' });
    close();
  }, [source.id, close]);
  const load = async () => {
    setBusy(true); setError(''); setConfirming(false); setScan(undefined); setProgress(undefined); useViewer.getState().patch({ fileBusy: true });
    try {
      const result = await findDuplicates(source, kind, setProgress); setScan(result);
      setChecked(result[kind].filter(group => !group.blockedReason).map(group => group.key));
      setKeep(Object.fromEntries(result[kind].map(group => [group.key, group.paths[0]])));
    } catch (failure) { setError(String(failure)); }
    finally { setBusy(false); useViewer.getState().patch({ fileBusy: false }); }
  };
  useEffect(() => { void load(); }, [source.id, kind]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (busy && !confirming) cancelScan(); else if (!busy && confirming) setConfirming(false); else if (!busy) close(); } };
    window.addEventListener('keydown', escape, true); return () => window.removeEventListener('keydown', escape, true);
  }, [busy, confirming, close, cancelScan]);
  const groups = scan?.[kind] || [], choices = duplicateChoices(groups, checked, keep);
  const removing = choices.flatMap(group => group.remove), reclaim = groups.filter(group => checked.includes(group.key) && !group.blockedReason).reduce((total, group) => total + group.reclaimBytes, 0);
  const apply = async () => {
    if (!scan || !choices.length || busy) return;
    setBusy(true); setError(''); useViewer.getState().patch({ fileBusy: true });
    try { await applyDuplicates(source, scan, kind, choices); close(); }
    catch (failure) { setError(String(failure)); setConfirming(false); }
    finally { setBusy(false); useViewer.getState().patch({ fileBusy: false }); }
  };
  return <div className="viewer-dialog-backdrop"><section className="viewer-dialog viewer-duplicates" role="dialog" aria-modal="true" aria-label={title}>
    <h3>{title}<button disabled={busy && confirming} onClick={busy && !confirming ? cancelScan : close}>{busy && !confirming ? '取消扫描' : '关闭'}</button></h3>
    <p>{kind === 'models' ? '比较模型内容；引用的贴图内容相同、只有贴图路径不同的模型也会归为同组。每组保留一份，仅删除重复模型，贴图保留。' : '按贴图文件内容查重。每组保留一份，更新所有关联模型的贴图路径后，再删除其余贴图。'}</p>
    {busy && <p role="status">{confirming ? '正在备份并处理…' : '正在扫描模型和贴图…'}{!confirming && progress && <><br />{stages[progress.stage]}{progress.total > 0 && `：${['hashing', 'fingerprint', 'external'].includes(progress.stage) ? `${size(progress.completed)} / ${size(progress.total)}` : `${progress.completed} / ${progress.total}`}`}</>}</p>}
    {scan && <p>发现 {groups.length} 组 · 已选 {choices.length} 组 · 预计回收 {size(reclaim)}（地图压缩后大小可能不同）</p>}
    {!busy && scan && !groups.length && <p>没有发现可处理的重复{kind === 'models' ? '模型' : '贴图'}。</p>}
    {!confirming && groups.length > 0 && <><div className="viewer-duplicate-controls"><button disabled={busy} onClick={() => setChecked(groups.filter(group => !group.blockedReason).map(group => group.key))}>全选可处理组</button><button disabled={busy} onClick={() => setChecked([])}>全不选</button></div>
      <div className="viewer-duplicate-groups">{groups.map((group, index) => <fieldset key={group.key} disabled={busy || !!group.blockedReason}>
        <legend><label><input type="checkbox" checked={checked.includes(group.key)} onChange={event => setChecked(event.target.checked ? [...checked, group.key] : checked.filter(key => key !== group.key))} />第 {index + 1} 组 · {group.paths.length} 份 · 可回收 {size(group.reclaimBytes)}</label></legend>
        {group.paths.map(path => <label className="viewer-duplicate-path" key={path}><input type="radio" name={`keep-${group.key}`} aria-label={`保留 ${path}`} checked={keep[group.key] === path} onChange={() => setKeep({ ...keep, [group.key]: path })} /><span>{keep[group.key] === path ? '保留：' : '删除：'}{path}</span></label>)}
        {group.references.map(reference => <details key={reference.texture}><summary>{reference.texture} · {reference.models.length} 个模型引用</summary>{reference.models.map(path => <div className="viewer-duplicate-reference" key={path}>{path}</div>)}</details>)}
        {group.blockedReason && <p className="viewer-warning">{group.blockedReason}</p>}
      </fieldset>)}</div></>}
    {confirming && <><p>{kind === 'textures' ? '将修改关联模型并删除以下重复贴图。' : '将删除以下重复模型，引用贴图保留。'}修改前会备份到下载文件夹，当前{source.kind === 'archive' ? '地图将直接保存' : '文件夹将直接修改'}。</p><div className="viewer-file-preview">{choices.map(group => <div key={group.keep}><strong>保留：{group.keep}</strong>{group.remove.map(path => <div key={path}>删除：{path}</div>)}</div>)}</div></>}
    {scan?.warnings.map((warning, index) => <p className="viewer-warning" key={index}>{warning}</p>)}
    {scan && !scan.canMerge && <p>当前来源仅可查重，不能直接修改。</p>}
    {error && <p role="alert">{error}</p>}
    <footer><button disabled={busy} onClick={() => confirming ? setConfirming(false) : void load()}>{confirming ? '返回检查' : '重新扫描'}</button><button disabled={busy && confirming} onClick={busy && !confirming ? cancelScan : close}>{busy && !confirming ? '取消扫描' : '取消'}</button><button disabled={busy || !scan?.canMerge || !removing.length} onClick={() => confirming ? void apply() : setConfirming(true)}>{confirming ? kind === 'models' ? '确认删除重复模型' : '确认合并贴图' : `处理选中 ${choices.length} 组`}</button></footer>
  </section></div>;
}
