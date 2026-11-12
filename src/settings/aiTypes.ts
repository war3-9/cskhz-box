export interface QuotaConfig {
  path: string;
  method: "GET" | "POST";
  body: string;
  remainingField: string;
  usedField: string;
  validField: string;
  unit: string;
  multiplier: number;
}
export const defaultQuota: QuotaConfig = {
  path: "", method: "GET", body: "", remainingField: "", usedField: "",
  validField: "", unit: "", multiplier: 1,
};
export interface AiConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  style: string;
  maxLength: number;
  timeout: number;
  quota: QuotaConfig;
}
export interface SavedAi { config: AiConfig; hasKey: boolean; verifiedAt: number }
export interface AiReply {
  text: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}
export interface QuotaResult {
  remaining?: number;
  used?: number;
  unit: string;
  valid?: boolean;
  updatedAt: number;
}
export const defaultAiConfig: AiConfig = {
  endpoint: "https://api.openai.com/v1", apiKey: "", model: "",
  style: "简短中文魔幻道具名", maxLength: 8, timeout: 30, quota: defaultQuota,
};
