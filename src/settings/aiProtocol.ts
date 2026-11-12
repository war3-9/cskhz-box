import { defaultQuota, type AiConfig, type AiReply, type QuotaResult } from "./aiTypes";
export function aiEndpoint(value: string) {
  const url = new URL(value.trim());
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error("请输入不含账户、查询参数或片段的 HTTP(S) 接口地址。");
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/chat/completions") ? path : `${path || "/v1"}/chat/completions`;
  return url.href;
}
export function siblingEndpoint(endpoint: string, resource: string) {
  return aiEndpoint(endpoint).replace(/\/chat\/completions$/, `/${resource}`);
}
export function quotaEndpoint(config: AiConfig) {
  const url = new URL(aiEndpoint(config.endpoint));
  if (config.quota.path) {
    if (!config.quota.path.startsWith("/") || config.quota.path.startsWith("//")) throw new Error("额度路径须以单个 / 开头。");
    const custom = new URL(config.quota.path, url.origin);
    if (custom.origin !== url.origin || custom.search || custom.hash) throw new Error("额度查询须使用同站点路径。");
    return custom.href;
  }
  return siblingEndpoint(config.endpoint, "usage");
}
export function validateAi(input: AiConfig, requireModel = true) {
  const config = { ...input, quota: { ...defaultQuota, ...input.quota }, endpoint: aiEndpoint(input.endpoint), model: input.model.trim(), apiKey: input.apiKey.trim() };
  if (requireModel && !config.model) throw new Error("请填写服务商提供的模型名称。");
  if (config.model.length > 200 || config.style.length > 100) throw new Error("模型或命名风格过长。");
  if (config.apiKey.length > 4096 || /[\r\n]/.test(config.apiKey)) throw new Error("API Key 格式无效。");
  if (!Number.isInteger(config.maxLength) || config.maxLength < 2 || config.maxLength > 32) throw new Error("名称长度须为 2–32 个字。");
  if (!Number.isInteger(config.timeout) || config.timeout < 5 || config.timeout > 120) throw new Error("超时须为 5–120 秒。");
  if (!["GET", "POST"].includes(config.quota.method) || !Number.isFinite(config.quota.multiplier) || config.quota.multiplier <= 0) throw new Error("额度查询方法或倍率无效。");
  quotaEndpoint(config);
  if (config.quota.body) JSON.parse(config.quota.body);
  return config;
}
function field(data: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) => value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined, data);
}
const numeric = (value: unknown) => {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
};
export function parseQuota(data: unknown, config: AiConfig): QuotaResult {
  const pick = (custom: string, paths: string[]) => custom ? field(data, custom) : paths.map(path => field(data, path)).find(value => value !== undefined && value !== null);
  const remaining = numeric(pick(config.quota.remainingField, ["remaining", "quota.remaining", "balance", "data.remaining", "data.quota.remaining", "data.balance"]));
  const used = numeric(pick(config.quota.usedField, ["used", "quota.used", "data.used", "data.quota.used"]));
  if (remaining === undefined && used === undefined) throw new Error("额度接口未返回可识别的数值，请配置查询字段。");
  if ([remaining, used].some(value => value !== undefined && !Number.isFinite(value * config.quota.multiplier))) throw new Error("额度换算结果无效。");
  const valid = pick(config.quota.validField, ["is_active", "isValid", "data.is_active", "data.isValid"]);
  const unit = config.quota.unit || pick("", ["unit", "quota.unit", "data.unit", "data.quota.unit"]);
  return { remaining: remaining === undefined ? undefined : remaining * config.quota.multiplier,
    used: used === undefined ? undefined : used * config.quota.multiplier,
    unit: typeof unit === "string" && unit ? unit : "额度", valid: typeof valid === "boolean" ? valid : undefined, updatedAt: Date.now() };
}
export function parseReply(data: unknown, fallbackModel: string): AiReply {
  const text = field(data, "choices.0.message.content");
  if (typeof text !== "string" || !text.trim()) throw new Error("未收到模型回复，请确认接口支持 Chat Completions。");
  const model = field(data, "model");
  const count = (path: string) => { const value = numeric(field(data, path)); return value !== undefined && value >= 0 && Number.isInteger(value) ? value : undefined; };
  const promptTokens = count("usage.prompt_tokens"), completionTokens = count("usage.completion_tokens"), totalTokens = count("usage.total_tokens");
  return { text: [...text.trim()].slice(0, 200).join(""), model: typeof model === "string" ? model : fallbackModel,
    usage: [promptTokens, completionTokens, totalTokens].some(value => value !== undefined) ? { promptTokens, completionTokens, totalTokens } : undefined };
}
