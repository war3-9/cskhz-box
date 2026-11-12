import { useEffect } from "react";
import { refreshAiQuota, syncAiStatus, useAiStatus } from "./aiStatus";
export function AiStatusBadge() {
  const state = useAiStatus();
  useEffect(() => { void syncAiStatus().catch(() => {}); }, []);
  if (!state.ready) return null;
  const timestamp = (value?: number) => value ? new Date(value).toLocaleString() : "未查询";
  const remaining = state.quota?.remaining;
  const title = `模型：${state.saved?.config.model}\n连接验证：${timestamp(state.saved?.verifiedAt)}\n额度更新：${timestamp(state.quota?.updatedAt)}${state.stale ? "（已过期）" : ""}\n点击刷新${state.quotaError ? `\n${state.quotaError}` : ""}`;
  return <button type="button" className="ai-status-badge" aria-label="刷新 AI 额度" title={title} disabled={state.refreshing} onClick={() => void refreshAiQuota()}>
    <span className="ai-connected-dot" />
    <span>{remaining === undefined ? "额度未知" : `${remaining.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${state.quota?.unit}`}{state.stale && remaining !== undefined ? "（过期）" : ""}</span>
  </button>;
}
