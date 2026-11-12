import { beginAiSession, type AiSession } from "../settings/aiConfig";
import type { AiReply, QuotaResult } from "../settings/aiTypes";
import { prepareAiImage } from "../settings/testImage";
import { cleanFilename } from "./batchConfig";
import type { Asset } from "../shared/types";
import { publishBatchQuota, useAiStatus } from "../settings/aiStatus";
export interface BatchControl {
  stopped: boolean;
  phase?: (message: string) => void;
  retry?: (error: string) => Promise<boolean>;
}
export interface BatchStats {
  iconPairs?: boolean;
  outputs: string[];
  status: "completed" | "stopped" | "failed";
  error?: string;
  requests: number;
  models: string[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  missingUsage: number;
  before?: QuotaResult;
  after?: QuotaResult;
}
export const emptyBatchStats = (): BatchStats => ({ outputs: [], status: "completed", requests: 0, models: [], promptTokens: 0, completionTokens: 0, totalTokens: 0, missingUsage: 0 });
function addUsage(stats: BatchStats, reply: AiReply) {
  if (!stats.models.includes(reply.model)) stats.models.push(reply.model);
  const u = reply.usage;
  stats.promptTokens += u?.promptTokens ?? 0;
  stats.completionTokens += u?.completionTokens ?? 0;
  const total = u?.totalTokens ?? (u?.promptTokens != null && u?.completionTokens != null ? u.promptTokens + u.completionTokens : undefined);
  if (total == null) stats.missingUsage++;
  else stats.totalTokens += total;
}
export class AiBatchNames {
  private cache = new Map<string, string>();
  private used = new Set<string>();
  private revision = useAiStatus.getState().revision;
  private constructor(private session: AiSession, private stats: BatchStats, private control: BatchControl) {}
  static async start(stats: BatchStats, control: BatchControl) {
    const session = await beginAiSession();
    const batch = new AiBatchNames(session, stats, control);
    stats.models.push(session.config.model);
    try { stats.before = await session.quota(); } catch { /* Quota support is optional. */ }
    publishBatchQuota(stats.before, batch.revision);
    return batch;
  }
  async name(asset: Asset, index: number): Promise<string | undefined> {
    let raw = this.cache.get(asset.id);
    while (!raw && !this.control.stopped) {
      this.control.phase?.(`AI 正在起名：第 ${index + 1} 张`);
      try {
        const image = await prepareAiImage(asset.imagePath);
        if (this.control.stopped) return;
        this.stats.requests++;
        let reply: AiReply;
        try { reply = await this.session.name(image); }
        catch (error) { this.stats.missingUsage++; throw error; }
        addUsage(this.stats, reply);
        raw = [...reply.text.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")].slice(0, this.session.config.maxLength).join("");
        if (!raw) throw new Error("AI 返回了空名称");
        this.cache.set(asset.id, raw);
      } catch (error) {
        if (this.control.stopped) return;
        this.control.phase?.(`起名暂停：第 ${index + 1} 张`);
        if (!this.control.retry || !(await this.control.retry(String(error)))) { this.control.stopped = true; return; }
      }
    }
    if (!raw || this.control.stopped) return;
    const stem = cleanFilename(raw);
    let name = stem, suffix = 2;
    while (this.used.has(name.toLowerCase())) name = `${stem} (${suffix++})`;
    this.used.add(name.toLowerCase());
    return name;
  }
  async finish() {
    try { this.stats.after = await this.session.quota(); } catch { /* Preserve completed outputs when quota is unavailable. */ }
    publishBatchQuota(this.stats.after, this.revision);
    await this.session.close();
  }
}
export function batchSummary(stats: BatchStats, ai: boolean) {
  if (stats.iconPairs) return `${stats.status === 'completed' ? '已完成' : stats.status === 'stopped' ? '已停止' : '导出失败'}：已导出 ${stats.outputs.length / 2} 对图标，共 ${stats.outputs.length} 个 BLP 文件${stats.error ? `；${stats.error}` : ''}`;
  let message = `${stats.status === "completed" ? "已完成" : stats.status === "stopped" ? "已停止" : "导出失败"}：已导出 ${stats.outputs.length} 张图片`;
  if (!ai) return stats.status === "completed" ? `已导出 ${stats.outputs.length} 张图片` : `${message}${stats.error ? `；${stats.error}` : ""}`;
  const tokens = stats.requests && stats.missingUsage === stats.requests ? "未提供" : stats.totalTokens;
  message += `；模型：${stats.models.join(" / ") || "未调用"}；请求 ${stats.requests} 次；Token ${tokens}${stats.missingUsage ? `（${stats.missingUsage} 次未提供用量，统计不完整）` : ""}`;
  const a = stats.before, b = stats.after;
  if (a && b && a.unit === b.unit) {
    if (a.used != null && b.used != null) message += `；累计用量增量 ${(b.used - a.used).toFixed(6)} ${b.unit}`;
    else if (a.remaining != null && b.remaining != null) message += `；额度变化 ${(a.remaining - b.remaining).toFixed(6)} ${b.unit}`;
    message += "（可能包含其他调用）";
  } else message += "；额度变化未知";
  return `${message}${stats.error ? `；${stats.error}` : ""}`;
}
