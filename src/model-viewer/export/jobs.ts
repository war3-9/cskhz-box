import { create } from 'zustand';
import { readResource } from '../resources/providers';
import { isTexture, resourceKey, type ResourceRef } from '../types';
import { capture, breathe, type CaptureOptions } from './capture';
import { safePath, writeOutput } from './output';
import { exportPath } from './naming';
import { useViewer } from '../workspace/store';
import { isTauri } from '@tauri-apps/api/core';
import { cancelNativeExport, exportNative } from './native';
import { prepareRawModel } from './raw';
interface Work { ref: ResourceRef; output: string; renameTextures?: boolean }
interface Job { refs: ResourceRef[]; directory: string; dependencies: boolean; options: CaptureOptions; names?: Record<string, string> }
interface Progress { busy: boolean; done: number; total: number; modelsDone: number; modelsTotal: number; message: string; failed: { work: Work; error: string }[]; missing: string[]; models: number; textures: number; stopped: boolean }
export const useViewerJobs = create<Progress>(() => ({ busy: false, done: 0, total: 0, modelsDone: 0, modelsTotal: 0, message: '', failed: [], missing: [], models: 0, textures: 0, stopped: false }));
const isModelWork = (work: Work) => /\.(mdx|mdl)$/i.test(work.ref.path);
let lastJob: Job | undefined;
export function stopViewerExport() { useViewerJobs.setState({ stopped: true, message: '正在停止导出' }); void cancelNativeExport().catch(() => {}); }
export async function startViewerExport(job: Job, retry?: Work[]) {
  if (useViewerJobs.getState().busy) return;
  lastJob = job;
  useViewerJobs.setState({ busy: true, stopped: false, done: 0, total: job.refs.length, modelsDone: 0, modelsTotal: 0, failed: [], missing: [], models: 0, textures: 0, message: '正在准备导出' });
  const stopped = () => useViewerJobs.getState().stopped;
  const viewer = useViewer.getState();
  const names = { ...viewer.exportNames, ...job.names };
  const work: Work[] = retry || job.refs.map(ref => { const path = exportPath(ref, viewer.sources, names); const source = viewer.sources.find(s => s.id === ref.sourceId); return { ref, output: job.options.format === 'raw' ? path : path.replace(/\.[^.]+$/, `.${isTexture(ref.path) ? 'png' : job.options.format}`), renameTextures: !!source && !!names[resourceKey(source, ref.path)] && !isTexture(ref.path) }; });
  const modelsTotal = work.filter(isModelWork).length;
  useViewerJobs.setState({ modelsTotal, message: modelsTotal ? `正在准备导出 ${modelsTotal} 个模型` : '正在准备导出资源' });
  const identity = (item: Work) => `${item.ref.sourceId}|${item.ref.path.replace(/\\/g, '/').toLowerCase()}`;
  const dependencies = new Map(work.map(item => [safePath(item.output).toLowerCase(), identity(item)])), allPaths = new Set<string>();
  try {
    if (stopped()) return;
    if (!isTauri() && work.some(item => item.renameTextures && /[/\\]/.test(item.output))) throw new Error('带目录的模型请在桌面版导出，浏览器下载无法保留目录结构');
    if (isTauri() && job.options.format === 'raw' && !viewer.sources.some(s => s.kind === 'browser') && work.every(item => viewer.sources.find(s => s.id === item.ref.sourceId)?.kind !== 'browser')) {
      const update = (value: Awaited<ReturnType<typeof exportNative>>) => {
        if (stopped() && !value.stopped) void cancelNativeExport().catch(() => {});
        useViewerJobs.setState(s => ({ ...value, modelsDone: value.models + value.failed.filter(f => /\.(mdx|mdl)$/i.test(f.work.path)).length, stopped: s.stopped || value.stopped,
          failed: value.failed.map(f => ({ error: f.error, work: { ref: { sourceId: f.work.sourceId, path: f.work.path }, output: f.work.output, renameTextures: f.work.renameTextures } })) }));
      };
      update(await exportNative(work, job.directory, job.dependencies, update));
      return;
    }
    useViewerJobs.setState({ total: work.length });
    for (const item of work) {
      if (stopped()) break;
      useViewerJobs.setState({ message: item.output });
      try {
        const path = safePath(item.output), key = path.toLowerCase();
        if (allPaths.has(key)) throw new Error('不同来源产生相同输出路径，请分别导出');
        allPaths.add(key);
        let bytes: Uint8Array;
        if (job.options.format === 'raw' && isModelWork(item)) {
          const prepared = await prepareRawModel(item.ref, path, !!item.renameTextures, job.dependencies);
          for (const dependency of prepared.work) {
            const output = safePath(dependency.output).toLowerCase(), existing = dependencies.get(output);
            if (existing && existing !== identity(dependency)) throw new Error(`贴图输出名称冲突：${dependency.output}`);
            if (!existing) { dependencies.set(output, identity(dependency)); work.push(dependency); }
          }
          useViewerJobs.setState(s => ({ total: work.length, missing: [...new Set([...s.missing, ...prepared.missing])] }));
          bytes = prepared.bytes;
        } else bytes = job.options.format === 'raw' ? new Uint8Array(await readResource(item.ref)) : await capture(item.ref, job.options, stopped);
        if (stopped()) break;
        await writeOutput(job.directory, path, bytes);
        useViewerJobs.setState(s => ({ done: s.done + 1, models: s.models + Number(isModelWork(item)), textures: s.textures + Number(!isModelWork(item)) }));
      } catch (error) { if (!stopped()) useViewerJobs.setState(s => ({ failed: [...s.failed, { work: item, error: String(error) }] })); }
      if (isModelWork(item)) useViewerJobs.setState(s => ({ modelsDone: s.modelsDone + 1 }));
      await breathe();
    }
  } catch (error) { useViewerJobs.setState(s => ({ failed: [...s.failed, { work: work[0] || { ref: { sourceId: '', path: '' }, output: '批量导出' }, error: String(error) }] })); }
  finally { useViewerJobs.setState(s => ({ busy: false, message: `${s.stopped ? '已停止' : '导出结束'} · ${s.modelsTotal ? `模型 ${s.models} / ${s.modelsTotal}，贴图 ${s.textures}` : `资源 ${s.textures}`}，失败 ${s.failed.length}${s.missing.length ? `，缺少贴图 ${s.missing.length}` : ''}` })); }
}
export function retryViewerExport() { if (lastJob) void startViewerExport(lastJob, useViewerJobs.getState().failed.map(f => f.work)); }
