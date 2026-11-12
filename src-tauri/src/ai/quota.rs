use serde::{Deserialize, Serialize};
use serde_json::Value;
use super::config::AiConfig;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct QuotaConfig {
    pub path: String, pub method: String, pub body: String,
    pub remaining_field: String, pub used_field: String, pub valid_field: String,
    pub unit: String, pub multiplier: f64,
}
impl Default for QuotaConfig {
    fn default() -> Self {
        Self { path: String::new(), method: "GET".into(), body: String::new(),
            remaining_field: String::new(), used_field: String::new(), valid_field: String::new(),
            unit: String::new(), multiplier: 1.0 }
    }
}
pub fn sibling(config: &AiConfig, resource: &str) -> String {
    format!("{}/{}", config.endpoint.trim_end_matches("/chat/completions"), resource)
}
pub fn url(config: &AiConfig) -> Result<String, String> {
    if config.quota.path.is_empty() { return Ok(sibling(config, "usage")); }
    let base = reqwest::Url::parse(&config.endpoint).map_err(|_| "地址无效")?;
    let path = &config.quota.path;
    if !path.starts_with('/') || path.starts_with("//") { return Err("额度路径须以单个 / 开头".into()); }
    let target = base.join(path).map_err(|_| "额度路径无效")?;
    if target.origin() != base.origin() || target.query().is_some() || target.fragment().is_some() {
        return Err("额度查询须使用同站点路径".into());
    }
    Ok(target.into())
}
pub fn validate(config: &AiConfig) -> Result<(), String> {
    let q = &config.quota;
    if !["GET", "POST"].contains(&q.method.as_str()) || !q.multiplier.is_finite() || q.multiplier <= 0.0 {
        return Err("额度查询方法或倍率无效".into());
    }
    if q.body.len() > 16 * 1024 || q.path.len() > 1000 || [&q.remaining_field, &q.used_field, &q.valid_field].iter().any(|s| s.len() > 200) {
        return Err("额度配置过长".into());
    }
    if !q.body.is_empty() { serde_json::from_str::<Value>(&q.body).map_err(|_| "额度请求体须为 JSON")?; }
    url(config)?;
    Ok(())
}
fn field<'a>(data: &'a Value, path: &str) -> Option<&'a Value> {
    path.split('.').try_fold(data, |value, part| {
        if value.is_array() { part.parse::<usize>().ok().and_then(|i| value.get(i)) } else { value.get(part) }
    })
}
fn pick<'a>(data: &'a Value, custom: &str, paths: &[&str]) -> Option<&'a Value> {
    if !custom.is_empty() { field(data, custom) }
    else { paths.iter().find_map(|p| field(data, p).filter(|v| !v.is_null())) }
}
fn number(value: Option<&Value>) -> Option<f64> {
    value.and_then(|v| v.as_f64().or_else(|| v.as_str()?.trim().parse().ok())).filter(|v| v.is_finite())
}
pub fn parse(data: &Value, config: &AiConfig) -> Result<Value, String> {
    let q = &config.quota;
    let remaining = number(pick(data, &q.remaining_field, &["remaining", "quota.remaining", "balance", "data.remaining", "data.quota.remaining", "data.balance"]));
    let used = number(pick(data, &q.used_field, &["used", "quota.used", "data.used", "data.quota.used"]));
    if remaining.is_none() && used.is_none() { return Err("额度接口未返回可识别的数值，请配置查询字段".into()); }
    if [remaining, used].iter().flatten().any(|v| !(v*q.multiplier).is_finite()) { return Err("额度换算结果无效".into()); }
    let unit = if q.unit.is_empty() { pick(data, "", &["unit", "quota.unit", "data.unit", "data.quota.unit"]).and_then(Value::as_str).filter(|s| !s.is_empty()).unwrap_or("额度") } else { &q.unit };
    let valid = pick(data, &q.valid_field, &["is_active", "isValid", "data.is_active", "data.isValid"]).and_then(Value::as_bool);
    let mut result = serde_json::json!({"remaining": remaining.map(|v| v*q.multiplier), "used": used.map(|v| v*q.multiplier), "unit": unit, "valid": valid, "updatedAt": super::now()});
    result.as_object_mut().unwrap().retain(|_, value| !value.is_null());
    Ok(result)
}
pub async fn query(config: &AiConfig) -> Result<Value, String> {
    let body = if config.quota.method == "POST" { Some(serde_json::from_str(&if config.quota.body.is_empty() { "{}" } else { &config.quota.body }).map_err(|_| "请求体无效")?) } else { None };
    let data = super::request::json_request(config, &url(config)?, &config.quota.method, body).await?;
    parse(&data, config)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn config() -> AiConfig { serde_json::from_value(serde_json::json!({"endpoint":"https://relay.example/v1/chat/completions", "apiKey":"test", "model":"vision", "style":"", "maxLength":8, "timeout":30})).unwrap() }
    #[test]
    fn zero_missing_wrapped_and_custom() {
        let mut c = config();
        assert_eq!(parse(&serde_json::json!({"balance":0}), &c).unwrap()["remaining"], 0.0);
        assert!(parse(&serde_json::json!({}), &c).is_err());
        assert_eq!(parse(&serde_json::json!({"data":{"quota":{"remaining":"12.5", "unit":"USD"}}}), &c).unwrap()["remaining"], 12.5);
        c.quota.remaining_field = "wallet.cents".into(); c.quota.multiplier = 0.01;
        assert_eq!(parse(&serde_json::json!({"wallet":{"cents":123}}), &c).unwrap()["remaining"], 1.23);
        c.quota.path = "//other.example/usage".into(); assert!(url(&c).is_err());
    }
}
