import { expect, it, vi } from "vitest";
import { set } from "idb-keyval";
import { initializeWorkspace, flushWorkspace } from "./persistence";
import { useTasks } from "../tasks/store";
import { useEditor } from "../layers/store";
import { loadBuiltinLibrary } from '../assets/services/builtin';

const native = vi.hoisted(() => ({ enabled: false, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => native.enabled, invoke: native.invoke }));

vi.mock("idb-keyval", () => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../assets/services/builtin", () => ({
  loadBuiltinLibrary: vi.fn().mockResolvedValue({ categories: [], assets: [] }),
  getBuiltinLibrary: () => ({ categories: [], assets: [] }),
}));

it("flushes all current tasks immediately, ignores selection, and retries failed writes", async () => {
  vi.useFakeTimers();
  useTasks.getState().restore([], null);
  await flushWorkspace();
  expect(loadBuiltinLibrary).not.toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
  await initializeWorkspace();
  await Promise.all([initializeWorkspace(), initializeWorkspace()]);
  expect(loadBuiltinLibrary).toHaveBeenCalledTimes(1);
  useTasks.getState().createCanvas(122, 122);
  const first = useTasks.getState().activeId!;
  useEditor.getState().rename("A");
  useTasks.getState().createCanvas(300, 300);
  useEditor.getState().rename("B");
  await flushWorkspace();
  const recorded = JSON.parse(vi.mocked(set).mock.calls.at(-1)![1] as string);
  expect(
    recorded.session.tasks.map(
      (task: { document: { name: string } }) => task.document.name,
    ),
  ).toEqual(["A", "B"]);
  expect(recorded.session.activeId).toBe(useTasks.getState().activeId);
  expect(set).toHaveBeenCalledTimes(1);
  useEditor.getState().select(null);
  await flushWorkspace();
  expect(set).toHaveBeenCalledTimes(1);
  vi.mocked(set).mockRejectedValueOnce(new Error("write failed"));
  useTasks.getState().activate(first);
  useEditor.getState().rename("newer");
  await expect(flushWorkspace()).rejects.toThrow("write failed");
  await flushWorkspace();
  expect(
    JSON.parse(vi.mocked(set).mock.calls.at(-1)![1] as string).document.name,
  ).toBe("newer");
  useTasks
    .getState()
    .tasks.forEach((task) => useTasks.getState().close(task.id));
  await flushWorkspace();
  expect(
    JSON.parse(vi.mocked(set).mock.calls.at(-1)![1] as string).session.tasks,
  ).toEqual([]);
  vi.useRealTimers();
});

it('saves desktop edits offline without any account session', async () => {
  vi.useFakeTimers();
  native.enabled = true;
  native.invoke.mockResolvedValue(null);
  
  await initializeWorkspace();
  useTasks.getState().createCanvas(128, 128, '离线保存');
  native.invoke.mockClear();
  await vi.advanceTimersByTimeAsync(400);
  expect(native.invoke).toHaveBeenCalledWith('write_workspace', expect.objectContaining({ text: expect.any(String) }));
  const saved = JSON.parse(native.invoke.mock.calls.at(-1)![1].text);
  expect(saved.session.tasks.some((task: { document: { name: string } }) => task.document.name === '离线保存')).toBe(true);
  native.enabled = false;
  vi.useRealTimers();
});
