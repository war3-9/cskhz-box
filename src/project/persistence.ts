import { get, set } from "idb-keyval";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { useEditor, emptyDocument } from "../layers/store";
import { useLibrary } from "../assets/store";
import { useUi } from "../app/uiStore";
import type { ProjectFile } from "../shared/types";
import { loadBuiltinLibrary } from "../assets/services/builtin";
import { serializeWorkspace } from "../tasks/workspace";
import { recoverWorkspace, preserveWorkspace, useWorkspaceRecovery } from './recovery';
import { workspaceImages } from './workspaceImages';
import { useTasks } from "../tasks/store";

let flush = async () => {};
let initialization: Promise<void> | undefined;
export async function flushWorkspace() {
  // Closing during restoration must wait before flushing pending edits.
  await initialization?.catch(() => {});
  await flush();
}

export function initializeWorkspace(): Promise<void> {
  return initialization ??= restoreAndSubscribe().catch(error => {
    initialization = undefined;
    throw error;
  });
}

async function restoreAndSubscribe() {
  let builtin;
  const issues: string[] = [];
  try { builtin = await loadBuiltinLibrary(); }
  catch (error) { builtin = { categories: [], assets: [] }; issues.push('内置素材加载失败：' + String(error)); }
  useLibrary.getState().setLibrary(builtin);
  let fingerprint = '';
  let previous: { fingerprint: string; issues: string[]; blocked: boolean; notification: string } | undefined;
  let deferred = false;
  try {
    if (isTauri() && await invoke<boolean>('workspace_recovery_interrupted')) issues.push('检测到上次保存中断，原工作区、备份和待提交文件将分别保全');
    const text = isTauri()
      ? await invoke<string | null>("read_workspace")
      : await get<string>("layerforge-workspace");
    if (text) {
      fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');
      previous = await get('layerforge-workspace-recovery-state').catch(() => undefined);
      if (previous?.fingerprint === fingerprint && previous.blocked) {
        deferred = true;
        issues.push(...previous.issues);
        useTasks.getState().restore([], null);
        useWorkspaceRecovery.setState({ issues, protected: true });
      } else {
        const parsed = await recoverWorkspace(text, builtin);
        issues.push(...parsed.issues);
        useLibrary.getState().setLibrary(parsed.library);
        useTasks.getState().restore(parsed.entries, parsed.activeId);
      }
    }
  } catch (error) {
    issues.push('自动恢复失败：' + String(error).slice(0, 300));
    useTasks.getState().restore([], null);
  }
  if (issues.length) {
    if (!deferred) {
      try { useWorkspaceRecovery.setState({ location: await preserveWorkspace(), issues, protected: false }); }
      catch (error) { useWorkspaceRecovery.setState({ issues: [...issues, '原数据保全尚未成功，自动覆盖保存已暂停：' + String(error)], protected: true }); }
    }
    const notification = JSON.stringify([fingerprint, issues]);
    if (previous?.notification !== notification) useUi.getState().notify('部分工作区未能恢复，可继续使用；请从“恢复工作区”查看保留数据。', 'error');
    await set('layerforge-workspace-recovery-state', { fingerprint, issues, blocked: useWorkspaceRecovery.getState().protected, notification }).catch(() => {});
  }
  let timer: ReturnType<typeof setTimeout>;
  let writing: Promise<void> | null = null;
  let pending = false;
  flush = async () => {
    clearTimeout(timer);
    if (useWorkspaceRecovery.getState().protected) return;
    if (writing) { await writing; if (pending) await flush(); return; }
    if (pending) {
      pending = false;
      writing = (async () => {
        const snapshot: ProjectFile = {
          version: 1,
          document: useEditor.getState().document ?? emptyDocument(),
          library: useLibrary.getState().library,
        };
        const text = JSON.stringify(await workspaceImages(serializeWorkspace(snapshot, builtin)));
        if (isTauri()) {
          await invoke("write_workspace", { text });
        }
        else await set("layerforge-workspace", text);
      })().catch(error => { pending = true; throw error; }).finally(() => { writing = null; });
      await writing;
      if (pending) await flush();
    }
  };
  const persist = () => {
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void flush().catch(() => {
        useUi.getState().notify("本地保存失败，请保存工程文件。", "error");
      });
    }, 400);
  };
  useEditor.subscribe((next, prev) => {
    if (next.document !== prev.document) persist();
  });
  useLibrary.subscribe((next, prev) => {
    if (next.library !== prev.library) persist();
  });
  useTasks.subscribe((next, prev) => {
    if (
      next.activeId !== prev.activeId ||
      next.tasks.length !== prev.tasks.length ||
      next.tasks.some(
        (task, index) =>
          task.document !== prev.tasks[index]?.document ||
          task.savedDocument !== prev.tasks[index]?.savedDocument,
      )
    )
      persist();
  });
  if (issues.length && !useWorkspaceRecovery.getState().protected) persist();
}

export async function retryWorkspaceProtection() {
  const location = await preserveWorkspace();
  useWorkspaceRecovery.setState({ location, protected: false });
  await set('layerforge-workspace-recovery-state', undefined).catch(() => {});
  useLibrary.getState().setLibrary({ ...useLibrary.getState().library });
  await flushWorkspace();
}
