import { create } from "zustand";
import { loadAiConfig, queryAiQuota } from "./aiConfig";
import type { SavedAi, QuotaResult } from "./aiTypes";
interface Status {
  saved?: SavedAi;
  ready: boolean;
  revision: number;
  quota?: QuotaResult;
  stale: boolean;
  refreshing: boolean;
  quotaError: string;
}
export const useAiStatus = create<Status>(() => ({ ready: false, revision: 0, stale: false, refreshing: false, quotaError: "" }));
export function invalidateAiStatus() {
  const state = useAiStatus.getState();
  useAiStatus.setState({ ready: false, revision: state.revision + 1, refreshing: false });
}
export async function syncAiStatus() {
  const revision = useAiStatus.getState().revision;
  const saved = await loadAiConfig();
  if (revision !== useAiStatus.getState().revision) return;
  const previous = useAiStatus.getState().saved;
  const changed = previous && (previous.config.endpoint !== saved.config.endpoint || previous.config.model !== saved.config.model || previous.hasKey !== saved.hasKey || JSON.stringify(previous.config.quota) !== JSON.stringify(saved.config.quota));
  useAiStatus.setState({ saved, ready: saved.hasKey && !!saved.verifiedAt, revision: revision + 1, refreshing: false,
    ...(changed ? { quota: undefined, stale: false, quotaError: "" } : {}) });
}
export async function refreshAiQuota() {
  const state = useAiStatus.getState();
  if (!state.ready || !state.saved || state.refreshing) return;
  const revision = state.revision;
  useAiStatus.setState({ refreshing: true });
  try {
    const quota = await queryAiQuota(state.saved.config);
    if (revision === useAiStatus.getState().revision) useAiStatus.setState({ quota, stale: false, quotaError: "" });
  } catch (error) {
    if (revision === useAiStatus.getState().revision) useAiStatus.setState({ stale: true, quotaError: String(error) });
  } finally {
    if (revision === useAiStatus.getState().revision) useAiStatus.setState({ refreshing: false });
  }
}
export function publishBatchQuota(quota: QuotaResult | undefined, revision: number) {
  if (revision !== useAiStatus.getState().revision) return;
  useAiStatus.setState(quota ? { quota, stale: false, quotaError: "" } : { stale: true });
}
