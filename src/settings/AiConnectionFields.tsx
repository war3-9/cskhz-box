import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { useState } from "react";
import { IconButton } from "../shared/components/IconButton";
import type { AiConfig } from "./aiTypes";
export function AiConnectionFields({ config, hasKey, models, update, fetchModels }: {
  config: AiConfig; hasKey: boolean; models: string[];
  update: (key: keyof AiConfig, value: string | number) => void; fetchModels: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  return <>
    <label>API 地址<input aria-label="API 地址" value={config.endpoint} onChange={e => update("endpoint", e.target.value)} placeholder="https://中转地址/v1" /></label>
    <label>API Key<div className="settings-secret">
      <input aria-label="API Key" type={showKey ? "text" : "password"} value={config.apiKey} onChange={e => update("apiKey", e.target.value)} placeholder={hasKey ? "已保存，留空沿用；更换地址需重填" : "输入中转站或官方密钥"} autoComplete="off" spellCheck={false} />
      <IconButton label={showKey ? "隐藏密钥" : "显示密钥"} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</IconButton>
    </div></label>
    <label>模型名称<div className="settings-model-row">
      <input aria-label="模型名称" list="ai-model-options" role="combobox" value={config.model} onChange={e => update("model", e.target.value)} placeholder="选择模型或手动填写" />
      <button type="button" className="secondary" onClick={fetchModels}><RefreshCw size={16} />获取模型</button>
      <datalist id="ai-model-options">{models.map(model => <option key={model} value={model} />)}</datalist>
    </div></label>
    <div className="settings-field-grid">
      <label>命名风格<input aria-label="命名风格" maxLength={100} value={config.style} onChange={e => update("style", e.target.value)} /></label>
      <label>名称长度（字）<input aria-label="名称长度" type="number" min={2} max={32} value={config.maxLength} onChange={e => update("maxLength", Number(e.target.value))} /></label>
      <label>超时（秒）<input aria-label="请求超时" type="number" min={5} max={120} value={config.timeout} onChange={e => update("timeout", Number(e.target.value))} /></label>
    </div>
  </>;
}
