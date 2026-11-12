import { invoke, isTauri } from "@tauri-apps/api/core";
import { defaultAiConfig, defaultQuota, type AiConfig, type AiReply, type SavedAi, type QuotaResult } from "./aiTypes";
import { validateAi } from "./aiProtocol";
import { browserReply, browserQuota, browserModels } from "./aiTransport";
export { defaultAiConfig } from "./aiTypes";
export type { AiConfig, SavedAi } from "./aiTypes";
export { aiEndpoint, validateAi } from "./aiProtocol";
const storageKey = "layerforge-ai-config";
let sessionKey = "", sessionEndpoint = "";
let tested: { endpoint: string; apiKey: string; model: string; at: number } | undefined;
let browserVerified = 0;
const identityMatches = (a: AiConfig, b: { endpoint: string; apiKey: string; model: string }) => a.endpoint === b.endpoint && a.apiKey === b.apiKey && a.model === b.model;
function credentials(input: AiConfig, requireModel = true) {
  const config = validateAi(input, requireModel);
  config.apiKey ||= sessionEndpoint === config.endpoint ? sessionKey : "";
  if (!config.apiKey) throw new Error("请填写 API Key；更换地址时需重新输入密钥。");
  return config;
}
export async function loadAiConfig(): Promise<SavedAi> {
  if (isTauri()) {
    const saved = await invoke<SavedAi | null>("load_ai_config");
    return saved ? { ...saved, config: { ...saved.config, quota: { ...defaultQuota, ...saved.config.quota } }, verifiedAt: saved.verifiedAt || 0 }
      : { config: structuredClone(defaultAiConfig), hasKey: false, verifiedAt: 0 };
  }
  let stored: Partial<AiConfig> = {};
  try { stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}"); } catch { /* Recover invalid local data. */ }
  return { config: { ...defaultAiConfig, ...stored, quota: { ...defaultQuota, ...stored.quota }, apiKey: "" }, hasKey: !!sessionKey, verifiedAt: browserVerified };
}
export async function saveAiConfig(input: AiConfig): Promise<SavedAi> {
  const config = validateAi(input);
  if (isTauri()) return invoke<SavedAi>("save_ai_config", { config });
  const resolved = credentials(config);
  const previous = await loadAiConfig();
  browserVerified = tested && identityMatches(resolved, tested) ? tested.at
    : previous.verifiedAt && identityMatches(resolved, { ...previous.config, apiKey: sessionKey }) ? previous.verifiedAt : 0;
  sessionKey = resolved.apiKey; sessionEndpoint = resolved.endpoint;
  localStorage.setItem(storageKey, JSON.stringify({ ...config, apiKey: "" }));
  return loadAiConfig();
}
export async function deleteAiConfig() {
  if (isTauri()) await invoke("delete_ai_config");
  else { localStorage.removeItem(storageKey); sessionKey = ""; sessionEndpoint = ""; browserVerified = 0; tested = undefined; }
}
async function requestAi(input: AiConfig, image?: string): Promise<AiReply> {
  const config = validateAi(input);
  return isTauri() ? invoke("test_ai_config", { config, image: image ?? null }) : browserReply(credentials(config), image);
}
export async function testAiConfig(input: AiConfig, image?: string) {
  const reply = await requestAi(input, image);
  if (!isTauri()) {
    const resolved = credentials(input);
    tested = { ...resolved, at: Date.now() };
    const saved = await loadAiConfig();
    if (saved.hasKey && identityMatches(resolved, { ...saved.config, apiKey: sessionKey })) browserVerified = tested.at;
  }
  return reply.text;
}
export async function fetchAiModels(input: AiConfig): Promise<string[]> {
  return isTauri() ? invoke("ai_models", { config: validateAi(input, false) }) : browserModels(credentials(input, false));
}
export async function queryAiQuota(input: AiConfig): Promise<QuotaResult> {
  return isTauri() ? invoke("ai_quota", { config: validateAi(input) }) : browserQuota(credentials(input));
}
export interface AiSession {
  config: AiConfig;
  name: (image: string) => Promise<AiReply>;
  quota: () => Promise<QuotaResult>;
  close: () => Promise<void>;
}
export async function beginAiSession(): Promise<AiSession> {
  const saved = await loadAiConfig();
  if (!saved.hasKey || !saved.verifiedAt) throw new Error("请先保存 AI 配置并测试连接。");
  if (isTauri()) {
    const id = await invoke<number>("begin_ai_batch");
    return { config: saved.config,
      name: image => invoke("ai_batch_name", { id, image }),
      quota: () => invoke("ai_batch_quota", { id }), close: () => invoke("end_ai_batch", { id }) };
  }
  const config = structuredClone(credentials(saved.config));
  return { config: { ...config, apiKey: "" }, name: image => browserReply(config, image), quota: () => browserQuota(config), close: async () => { config.apiKey = ""; } };
}
