import { beforeEach, expect, it, vi } from "vitest";
import { defaultAiConfig, type QuotaResult } from "./aiTypes";
import { queryAiQuota } from "./aiConfig";
import { invalidateAiStatus, refreshAiQuota, useAiStatus } from "./aiStatus";
vi.mock("./aiConfig", () => ({ loadAiConfig: vi.fn(), queryAiQuota: vi.fn() }));
beforeEach(() => useAiStatus.setState({ ready: true, saved: { config: defaultAiConfig, hasKey: true, verifiedAt: 1 }, revision: 1, quota: undefined, stale: false, refreshing: false, quotaError: "" }));
it("drops late quota results after config invalidation", async () => {
  let resolve!: (value: QuotaResult) => void;
  vi.mocked(queryAiQuota).mockImplementation(() => new Promise(r => { resolve = r; }));
  const request = refreshAiQuota(); invalidateAiStatus();
  resolve({ remaining: 10, unit: "USD", updatedAt: 1 }); await request;
  expect(useAiStatus.getState().quota).toBeUndefined(); expect(useAiStatus.getState().ready).toBe(false);
});
it("retains last successful balance and marks it stale on query failure", async () => {
  useAiStatus.setState({ quota: { remaining: 12, unit: "USD", updatedAt: 1 } });
  vi.mocked(queryAiQuota).mockRejectedValue(new Error("timeout")); await refreshAiQuota();
  expect(useAiStatus.getState()).toMatchObject({ quota: { remaining: 12 }, stale: true, refreshing: false });
});
