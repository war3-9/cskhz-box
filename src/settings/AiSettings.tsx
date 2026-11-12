import { useEffect, useState } from "react";
import { Save, PlugZap, ImagePlus, Trash2 } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { defaultAiConfig, loadAiConfig, saveAiConfig, testAiConfig, deleteAiConfig, fetchAiModels, queryAiQuota } from "./aiConfig";
import type { AiConfig } from "./aiTypes";
import { prepareTestImage } from "./testImage";
import { AiConnectionFields } from "./AiConnectionFields";
import { QuotaSettings } from "./QuotaSettings";
import { invalidateAiStatus, syncAiStatus, useAiStatus } from "./aiStatus";
import { aiEndpoint } from "./aiProtocol";

export function AiSettings() {
  const [config, setConfig] = useState(structuredClone(defaultAiConfig));
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [image, setImage] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [dirtyIdentity, setDirtyIdentity] = useState(false);
  const ready = useAiStatus(s => s.ready);
  useEffect(() => {
    let active = true;
    loadAiConfig().then(saved => { if (active) { setConfig(saved.config); setHasKey(saved.hasKey); } })
      .catch(cause => { if (active) setError(String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const update = (key: keyof AiConfig, value: string | number) => {
    if (["endpoint", "apiKey", "model"].includes(key)) {
      invalidateAiStatus(); setDirtyIdentity(true);
      if (["endpoint", "apiKey"].includes(key)) useAiStatus.setState({ quota: undefined, stale: false, quotaError: "" });
    }
    if (["endpoint", "apiKey"].includes(key)) setModels([]);
    setConfig(current => ({ ...current, [key]: value })); setStatus(""); setError("");
  };
  const perform = async (action: "save" | "text" | "image" | "clear" | "models" | "quota") => {
    setBusy(true); setStatus(""); setError("");
    try {
      if (action === "save") {
        const saved = await saveAiConfig(config);
        setConfig(saved.config); setHasKey(saved.hasKey); setStatus("配置已保存");
        setDirtyIdentity(false);
        await syncAiStatus();
      } else if (action === "clear") {
        await deleteAiConfig(); invalidateAiStatus(); await syncAiStatus();
        setConfig(structuredClone(defaultAiConfig)); setHasKey(false); setModels([]); setStatus("配置及密钥已清除");
        setDirtyIdentity(false);
      } else if (action === "models") {
        const values = await fetchAiModels(config); setModels(values); setStatus(`已获取 ${values.length} 个模型`);
      } else if (action === "quota") {
        const result = await queryAiQuota(config);
        setStatus(`额度查询成功：${result.remaining === undefined ? "余额未知" : result.remaining} ${result.unit}${result.valid === false ? "（服务标记不可用）" : ""}`);
      } else {
        const reply = await testAiConfig(config, action === "image" ? image : undefined);
        const saved = await loadAiConfig();
        if (!dirtyIdentity && aiEndpoint(config.endpoint) === aiEndpoint(saved.config.endpoint) && config.model.trim() === saved.config.model && saved.verifiedAt) {
          await syncAiStatus();
        } else invalidateAiStatus();
        setStatus(`${action === "image" ? "识图结果" : "连接成功"}：${reply}`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <section className="settings-section ai-settings">
    <div className="settings-section-heading"><h3>AI 对接</h3><span className="settings-badge">{ready ? "已连接" : "OpenAI 兼容"}</span></div>
    <fieldset disabled={busy || loading}>
      <AiConnectionFields config={config} hasKey={hasKey} models={models} update={update} fetchModels={() => void perform("models")} />
      <QuotaSettings value={config.quota} update={quota => { setConfig(current => ({ ...current, quota })); setStatus(""); setError(""); }} test={() => void perform("quota")} />
      <div className="settings-actions">
        <button type="button" className="secondary" onClick={() => void perform("clear")}><Trash2 size={16} />清除配置</button>
        <button type="button" className="secondary" onClick={() => void perform("text")}><PlugZap size={16} />测试连接</button>
        <button type="button" className="primary" onClick={() => void perform("save")}><Save size={16} />保存配置</button>
      </div>
      <div className="ai-image-test">
        <label className="settings-image-picker"><ImagePlus size={17} />测试图片
          <input aria-label="测试图片" type="file" accept="image/png,image/jpeg" onChange={async e => {
            const file = e.target.files?.[0]; if (!file) return;
            setBusy(true); setError("");
            try { setImage(await prepareTestImage(file)); } catch (cause) { setError(String(cause)); } finally { setBusy(false); }
          }} />
        </label>
        {image && <img src={image} alt="测试道具" />}
        <button type="button" className="secondary" disabled={!image} onClick={() => void perform("image")}><ImagePlus size={16} />测试识图</button>
      </div>
    </fieldset>
    {busy && <p role="status">处理中…</p>}
    {status && <p className="settings-success" role="status">{status}</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    <p className="settings-note">{isTauri() ? "密钥由 Windows 加密保存在本机。" : "浏览器版密钥仅在当前会话保留；服务需允许跨域。"}测试识图会将所选图片缩小后发送到配置的服务地址。</p>
  </section>;
}
