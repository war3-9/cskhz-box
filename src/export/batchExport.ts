import type { Asset, EditorDocument } from "../shared/types";
import {
  cycleAsset,
  extension,
  outputNames,
  replaceBatchLayer,
  replaceBatchText,
  validateBatch,
  type BatchFormat,
} from "./batchConfig";
import { renderDocument } from "./render";
import { writeBatchImage } from "./batchIO";
import { useBatchState } from "./batchState";
import { rasterizeBatchText } from "./batchText";
import { AiBatchNames, emptyBatchStats, type BatchControl, type BatchStats } from "./aiBatch";
import { validateIconPairs, type IconPairOptions } from './iconPairs/config';
import { exportIconPair } from './iconPairs/export';
import { outputFolderName, outputFolderError } from './outputFolder';
export interface BatchJob {
  document: EditorDocument;
  layerId: string;
  assets: Asset[];
  count: number;
  names: string[];
  numberFilenames?: boolean;
  format: BatchFormat;
  directory: string;
  subdirectory?: string;
  replaceText?: boolean;
  textLayerId?: string;
  blpSize?: number;
  namingMode?: "txt" | "ai";
  iconPairs?: IconPairOptions;
}
export async function exportBatch(
  job: BatchJob,
  progress: (done: number) => void,
  writer = writeBatchImage,
  control?: BatchControl,
): Promise<string[] | BatchStats> {
  const paired = job.iconPairs?.enabled === true;
  const format = paired ? 'blp' : job.format;
  const error = (!paired && job.subdirectory !== undefined ? outputFolderError(job.subdirectory) : '') || (job.iconPairs ? validateIconPairs(job.iconPairs) : '') || validateBatch(
    job.document,
    job.layerId,
    job.assets,
    job.count,
    format,
    job.directory,
    job.replaceText,
    job.textLayerId,
  );
  if (error) throw new Error(error);
  if (useBatchState.getState().busy) throw new Error("已有批量导出正在进行");
  useBatchState.setState({ busy: true });
  const stats = emptyBatchStats();
  stats.iconPairs = paired;
  const actions = control ?? { stopped: false };
  let ai: AiBatchNames | undefined;
  try {
    if (!paired && job.namingMode === "ai") ai = await AiBatchNames.start(stats, actions);
    const names = outputNames(job.names, job.count);
    const numberFilenames = job.numberFilenames && job.namingMode !== 'ai' && !paired;
    const sequenceWidth = Math.max(4, String(job.count).length);
    let sequence = 1;
    for (let index = 0; index < job.count; index++) {
      if (actions.stopped) break;
      const asset = cycleAsset(job.assets, index);
      const name = ai ? await ai.name(asset, index) : names[index];
      if (!name || actions.stopped) break;
      actions.phase?.(`正在导出：第 ${index + 1} 张`);
      let document = replaceBatchLayer(
        job.document,
        job.layerId,
        asset,
      );
      if (paired) {
        const result = await exportIconPair(job, document, sequence, actions);
        if (!result) break;
        sequence = result.next;
        stats.outputs.push(...result.outputs);
        progress(index + 1);
        await new Promise(resolve => setTimeout(resolve, 0));
        continue;
      }
      if (job.replaceText && job.textLayerId) {
        document = replaceBatchText(document, job.textLayerId, name);
        document = await rasterizeBatchText(document, job.textLayerId);
      }
      const blob = await renderDocument(document, job.format, 0.95, {
        blpSize: job.blpSize,
      });
      if (actions.stopped) break;
      stats.outputs.push(
        await writer(
          job.directory,
          `${numberFilenames ? `${String(index + 1).padStart(sequenceWidth, '0')}_` : ''}${name}.${extension(job.format)}`,
          blob,
          ...(!paired && job.subdirectory !== undefined ? [outputFolderName(job.subdirectory)] : []),
        ),
      );
      progress(index + 1);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (actions.stopped) stats.status = "stopped";
    return control ? stats : stats.outputs;
  } catch (error) {
    if (!control) throw error;
    stats.status = "failed"; stats.error = String(error);
    return stats;
  } finally {
    try { await ai?.finish(); } catch { /* Closing a session must not keep the editor locked. */ }
    useBatchState.setState({ busy: false });
  }
}
