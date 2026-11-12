import { beforeEach, expect, it, vi } from "vitest";
import { AiBatchNames, batchSummary, emptyBatchStats } from "./aiBatch";
import { beginAiSession } from "../settings/aiConfig";
import { prepareAiImage } from "../settings/testImage";
import { defaultAiConfig } from "../settings/aiTypes";
import type { Asset } from "../shared/types";
vi.mock("../settings/aiConfig", () => ({ beginAiSession: vi.fn() }));
vi.mock("../settings/testImage", () => ({ prepareAiImage: vi.fn(async () => "image") }));
const asset = { id: "a", imagePath: "image" } as Asset;
const close = vi.fn(async () => {});
const name = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(beginAiSession).mockResolvedValue({ config: { ...defaultAiConfig, model: "chosen" }, name, close, quota: vi.fn().mockResolvedValue({ remaining: 10, used: 2, unit: "USD", updatedAt: 1 }) });
  name.mockResolvedValue({ text: "赤焰战刃", model: "actual", usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 } });
});
it("caches per batch, deduplicates filenames and counts actual model/token usage", async () => {
  const stats = emptyBatchStats(); const batch = await AiBatchNames.start(stats, { stopped: false });
  expect(await batch.name(asset, 0)).toBe("赤焰战刃");
  expect(await batch.name(asset, 1)).toBe("赤焰战刃 (2)");
  expect(name).toHaveBeenCalledTimes(1); expect(prepareAiImage).toHaveBeenCalledTimes(1);
  expect(stats).toMatchObject({ requests: 1, models: ["chosen", "actual"], totalTokens: 13, missingUsage: 0 });
  await batch.finish(); expect(close).toHaveBeenCalledTimes(1);
  const second = await AiBatchNames.start(emptyBatchStats(), { stopped: false });
  await second.name(asset, 0); expect(name).toHaveBeenCalledTimes(2); await second.finish();
});
it("retries failed current request, accounts missing usage and preserves cached names", async () => {
  name.mockRejectedValueOnce(new Error("429"));
  const retry = vi.fn(async () => true); const stats = emptyBatchStats();
  const batch = await AiBatchNames.start(stats, { stopped: false, retry });
  expect(await batch.name(asset, 0)).toBe("赤焰战刃"); expect(retry).toHaveBeenCalledOnce();
  await batch.name(asset, 1); expect(stats.requests).toBe(2); expect(stats.missingUsage).toBe(1);
  await batch.finish();
});
it("stops paused batch without fallback names or further requests", async () => {
  name.mockRejectedValueOnce(new Error("401")); const control = { stopped: false, retry: vi.fn(async () => false) };
  const batch = await AiBatchNames.start(emptyBatchStats(), control);
  expect(await batch.name(asset, 0)).toBeUndefined(); expect(control.stopped).toBe(true);
  expect(await batch.name(asset, 1)).toBeUndefined(); expect(name).toHaveBeenCalledOnce(); await batch.finish();
});
it("reports unknown usage and labels account delta rather than exact batch price", () => {
  const stats = emptyBatchStats(); stats.missingUsage = 1; stats.models = ["chosen"]; stats.requests = 1;
  stats.before = { remaining: 10, unit: "USD", updatedAt: 1 }; stats.after = { remaining: 9, unit: "USD", updatedAt: 2 };
  expect(batchSummary(stats, true)).toContain("统计不完整"); expect(batchSummary(stats, true)).toContain("额度变化 1.000000 USD"); expect(batchSummary(stats, true)).toContain("可能包含其他调用");
});
