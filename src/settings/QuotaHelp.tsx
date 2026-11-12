import { BatchHelp } from "../export/BatchHelp";

const example = [
  ["查询路径", "/api/usage/token/"],
  ["请求方法", "GET"],
  ["换算倍率", "0.000002"],
  ["余额字段", "data.total_available"],
  ["累计用量字段", "data.total_used"],
  ["有效状态字段", "success"],
  ["单位", "USD"],
];

export function QuotaHelp() {
  return <span className="quota-help" onClick={event => event.preventDefault()}>
    <BatchHelp label="额度查询配置" maxWidth={420}>
      <strong className="quota-help-title">BestAPI 额度查询示例</strong>
      <table className="quota-help-table">
        <thead><tr><th>配置项</th><th>填写值</th></tr></thead>
        <tbody>{example.map(([label, value]) => <tr key={label}><td>{label}</td><td><code>{value}</code></td></tr>)}</tbody>
      </table>
      <span className="quota-help-note">适用于 bestapi.space 的 API 密钥额度查询；其他中转站以其接口为准。无限额度密钥的数值不代表账户余额。</span>
    </BatchHelp>
  </span>;
}
