import type { BatchControl } from '../aiBatch';
import type { EditorDocument } from '../../shared/types';
import { replaceBatchText } from '../batchConfig';
import { rasterizeBatchText } from '../batchText';
import { cleanIconPrefix, iconPairNames, validateIconPairs, type IconPairOptions } from './config';
import { nextIconPairSequence, writeIconPair } from './io';
import { renderIconPair } from './render';

interface PairJob {
  directory: string;
  iconPairs?: IconPairOptions;
  blpSize?: number;
  replaceText?: boolean;
  textLayerId?: string;
}
export async function saveSingleIconPair(document: EditorDocument, options: IconPairOptions, directory: string, blpSize = 0) {
  const error = validateIconPairs({ ...options, enabled: true });
  if (error) throw new Error(error);
  if (!directory) throw new Error('请选择保存地址');
  const result = await exportIconPair({ directory, iconPairs: { ...options }, blpSize }, document, 1, { stopped: false });
  if (!result) throw new Error('光暗图标导出未完成');
  return result.outputs;
}
export async function exportIconPair(job: PairJob, document: EditorDocument, start: number, control: BatchControl) {
  const options = job.iconPairs!;
  const prefix = cleanIconPrefix(options.prefix);
  let rendered: Awaited<ReturnType<typeof renderIconPair>> | undefined;
  while (start <= 100000 && !control.stopped) {
    const sequence = await nextIconPairSequence(job.directory, prefix, start);
    if (control.stopped) return;
    let copy = document;
    if (job.replaceText && job.textLayerId) {
      copy = replaceBatchText(copy, job.textLayerId, iconPairNames(prefix, sequence).normal.slice(0, -4));
      copy = await rasterizeBatchText(copy, job.textLayerId);
      rendered = undefined;
    }
    rendered ??= await renderIconPair(copy, options.brightness, job.blpSize);
    if (control.stopped) return;
    // Once writing starts, finish both files before honoring Stop.
    const outputs = await writeIconPair(job.directory, prefix, sequence, rendered.normal, rendered.disabled);
    if (outputs) return { outputs, next: sequence + 1 };
    // A competing writer claimed the sequence; try another pair without overwriting.
    start = sequence + 1;
  }
  if (!control.stopped) throw new Error('可用图标序号已用完');
}
