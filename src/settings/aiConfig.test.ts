import { beforeEach, expect, it, vi } from "vitest";
import { aiEndpoint, defaultAiConfig, saveAiConfig, testAiConfig, deleteAiConfig, loadAiConfig, beginAiSession, fetchAiModels } from "./aiConfig";
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
const storage = new Map<string, string>();
beforeEach(async () => {
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  await deleteAiConfig();
});
it("normalizes relay root, v1 and complete paths", () => {
  expect(aiEndpoint("https://relay.example")).toBe("https://relay.example/v1/chat/completions");
  expect(aiEndpoint("https://relay.example/custom/v1/")).toBe("https://relay.example/custom/v1/chat/completions");
  expect(aiEndpoint("https://relay.example/v1/chat/completions")).toBe("https://relay.example/v1/chat/completions");
  expect(() => aiEndpoint("https://user:pass@relay.example")).toThrow("账户");
});
it("keeps browser key out of local storage and reuses it only on matching endpoint", async () => {
  const config = { ...defaultAiConfig, apiKey: "test-secret", model: "vision-model" };
  await saveAiConfig(config);
  expect([...storage.values()].join()).not.toContain("test-secret");
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "连接成功" } }] }) });
  vi.stubGlobal("fetch", fetchMock);
  expect(await testAiConfig({ ...config, apiKey: "" })).toBe("连接成功");
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-secret");
  await expect(testAiConfig({ ...config, apiKey: "", endpoint: "https://other.example/v1" })).rejects.toThrow("API Key");
});
it("rejects empty replies even when HTTP succeeds", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  await expect(testAiConfig({ ...defaultAiConfig, model: "vision", apiKey: "test" })).rejects.toThrow("未收到");
});
it("requires save and matching successful test in either order and invalidates changed identity", async () => {
  const config = { ...defaultAiConfig, model: "vision", apiKey: "secret" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "连接成功" } }] }) }));
  await saveAiConfig(config); expect((await loadAiConfig()).verifiedAt).toBe(0);
  await expect(beginAiSession()).rejects.toThrow("测试");
  await testAiConfig({ ...config, apiKey: "" }); expect((await loadAiConfig()).verifiedAt).toBeGreaterThan(0);
  await saveAiConfig({ ...config, apiKey: "different" }); expect((await loadAiConfig()).verifiedAt).toBe(0);
  await deleteAiConfig(); await testAiConfig(config); expect((await loadAiConfig()).hasKey).toBe(false);
  await saveAiConfig(config); expect((await loadAiConfig()).verifiedAt).toBeGreaterThan(0);
  await saveAiConfig({ ...config, model: "other" }); expect((await loadAiConfig()).verifiedAt).toBe(0);
});
it("freezes batch credentials across changed settings and discovers models without model input", async () => {
  const config = { ...defaultAiConfig, model: "vision", apiKey: "old-secret" };
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "名称" } }], data: [{ id: "vision" }, { id: "vision" }, { id: "other" }] }) });
  vi.stubGlobal("fetch", fetchMock);
  expect(await fetchAiModels({ ...config, model: "" })).toEqual(["other", "vision"]);
  await saveAiConfig(config); await testAiConfig(config);
  const session = await beginAiSession();
  await saveAiConfig({ ...config, apiKey: "new-secret", model: "new-model" });
  await session.name("data:image/png;base64,test");
  expect(fetchMock.mock.calls.at(-1)?.[1].headers.Authorization).toBe("Bearer old-secret");
  expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1].body).model).toBe("vision");
  await session.close();
});
it("keeps manual model entry available on unsupported discovery endpoint", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  await expect(fetchAiModels({ ...defaultAiConfig, model: "", apiKey: "test" })).rejects.toThrow("404");
});
