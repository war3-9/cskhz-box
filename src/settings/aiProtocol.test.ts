import { expect, it } from "vitest";
import { parseQuota, parseReply, quotaEndpoint, siblingEndpoint, validateAi } from "./aiProtocol";
import { defaultAiConfig } from "./aiTypes";
const config = () => structuredClone({ ...defaultAiConfig, endpoint: "https://relay.example/custom/v1", model: "vision" });
it("distinguishes zero balance from unknown and parses wrapped numeric strings", () => {
  const c = config();
  expect(parseQuota({ balance: 0 }, c).remaining).toBe(0);
  expect(() => parseQuota({}, c)).toThrow("数值");
  expect(parseQuota({ data: { quota: { remaining: "2.25", unit: "USD" }, is_active: false } }, c)).toMatchObject({ remaining: 2.25, unit: "USD", valid: false });
  expect(() => parseQuota({ balance: "" }, c)).toThrow();
  expect(parseQuota({ used: 1 }, c).remaining).toBeUndefined();
});
it("supports custom quota mapping, units and same-site request paths", () => {
  const c = config();
  c.quota = { ...c.quota, path: "/api/balance", remainingField: "wallet.cents", multiplier: 0.01, unit: "CNY" };
  expect(parseQuota({ wallet: { cents: "1200" } }, c)).toMatchObject({ remaining: 12, unit: "CNY" });
  expect(quotaEndpoint(c)).toBe("https://relay.example/api/balance");
  expect(siblingEndpoint(c.endpoint, "models")).toBe("https://relay.example/custom/v1/models");
  expect(quotaEndpoint(config())).toBe("https://relay.example/custom/v1/usage");
  for (const path of ["//evil.example/usage", "/\\evil.example/usage", "https://evil.example/usage", "/usage?key=test"]) {
    c.quota.path = path; expect(() => quotaEndpoint(c)).toThrow();
  }
});
it("validates body and multiplier without requiring a model for list discovery", () => {
  const c = config(); c.model = "";
  expect(validateAi(c, false).model).toBe(""); expect(() => validateAi(c)).toThrow("模型");
  c.quota.multiplier = 0; expect(() => validateAi(c, false)).toThrow("倍率");
  c.quota.multiplier = 1; c.quota.body = "bad json"; expect(() => validateAi(c, false)).toThrow();
});
it("supports POST JSON and refuses overflowing balance conversion", () => {
  const c = config(); c.quota.method = "POST"; c.quota.body = '{"account":"test"}';
  expect(validateAi(c).quota.method).toBe("POST");
  c.quota.multiplier = Number.MAX_VALUE;
  expect(() => parseQuota({ balance: 10 }, c)).toThrow("换算");
});
it("retains actual model and optional usage without inventing missing tokens", () => {
  expect(parseReply({ model: "actual", choices: [{ message: { content: " 名称 " } }], usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 } }, "selected")).toEqual({ text: "名称", model: "actual", usage: { promptTokens: 20, completionTokens: 3, totalTokens: 23 } });
  expect(parseReply({ choices: [{ message: { content: "名称" } }] }, "selected").usage).toBeUndefined();
});
