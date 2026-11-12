import { StyledSelect } from '../shared/components/StyledSelect';
import type { QuotaConfig } from "./aiTypes";
import { QuotaHelp } from "./QuotaHelp";
export function QuotaSettings({ value, update, test }: { value: QuotaConfig; update: (value: QuotaConfig) => void; test: () => void }) {
  const change = (key: keyof QuotaConfig, next: string | number) => update({ ...value, [key]: next });
  return <details className="quota-settings">
    <summary>额度查询配置<QuotaHelp /></summary>
    <div className="quota-fields">
      <label>查询路径<input aria-label="额度查询路径" value={value.path} placeholder="自动：API 基础路径/usage" onChange={e => change("path", e.target.value)} /></label>
      <div className="quota-grid">
        <label>请求方法<StyledSelect aria-label="额度请求方法" value={value.method} onChange={e => change("method", e.target.value)}><option>GET</option><option>POST</option></StyledSelect></label>
        <label>换算倍率<input aria-label="额度换算倍率" type="number" min="0.000001" step="any" value={value.multiplier} onChange={e => change("multiplier", Number(e.target.value))} /></label>
      </div>
      {value.method === "POST" && <label>JSON 请求体<textarea aria-label="额度 JSON 请求体" rows={3} value={value.body} placeholder="{}" onChange={e => change("body", e.target.value)} /></label>}
      <div className="quota-grid">
        <label>余额字段<input aria-label="余额字段" value={value.remainingField} placeholder="自动 / data.balance" onChange={e => change("remainingField", e.target.value)} /></label>
        <label>累计用量字段<input aria-label="累计用量字段" value={value.usedField} placeholder="自动 / data.used" onChange={e => change("usedField", e.target.value)} /></label>
        <label>有效状态字段<input aria-label="有效状态字段" value={value.validField} placeholder="自动 / is_active" onChange={e => change("validField", e.target.value)} /></label>
        <label>单位<input aria-label="额度单位" value={value.unit} placeholder="自动 / USD / CNY" onChange={e => change("unit", e.target.value)} /></label>
      </div>
      <button type="button" className="secondary" onClick={test}>测试额度查询</button>
    </div>
  </details>;
}
