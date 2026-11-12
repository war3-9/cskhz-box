import type { AiConfig } from "./aiTypes";
import { parseQuota, parseReply, quotaEndpoint, siblingEndpoint } from "./aiProtocol";
async function browserJson(config: AiConfig, url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, redirect: "error", signal: AbortSignal.timeout(config.timeout * 1000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`HTTP ${response.status}，请检查密钥、模型、接口地址或额度。`);
  return response.json();
}
export async function browserReply(config: AiConfig, image?: string) {
  const content = image ? [
    { type: "text", text: `根据图片起一个中文游戏道具名，风格：${config.style}。最多${config.maxLength}个字。只返回名称，不要说明。` },
    { type: "image_url", image_url: { url: image, detail: "low" } },
  ] : "请只回复：连接成功";
  return parseReply(await browserJson(config, config.endpoint, "POST", {
    model: config.model, messages: [{ role: "user", content }], stream: false, max_tokens: 128,
  }), config.model);
}
export async function browserQuota(config: AiConfig) {
  return parseQuota(await browserJson(config, quotaEndpoint(config), config.quota.method,
    config.quota.method === "POST" ? JSON.parse(config.quota.body || "{}") : undefined), config);
}
export async function browserModels(config: AiConfig) {
  const data = await browserJson(config, siblingEndpoint(config.endpoint, "models"), "GET");
  if (!Array.isArray(data?.data)) throw new Error("接口未提供标准模型列表，可手动填写。");
  const models = [...new Set<string>(data.data.filter((item: { id?: unknown }) => typeof item?.id === "string").map((item: { id: string }) => item.id))];
  if (!models.length) throw new Error("未获取到模型，可手动填写。");
  return models.sort();
}
