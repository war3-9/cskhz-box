use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub endpoint: String,
    #[serde(default)]
    pub api_key: String,
    pub model: String,
    pub style: String,
    pub max_length: u32,
    pub timeout: u64,
    #[serde(default)]
    pub quota: super::quota::QuotaConfig,
    #[serde(default)]
    pub verified_at: u64,
}

pub fn endpoint(value: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(value.trim()).map_err(|_| "接口地址无效")?;
    if !["http", "https"].contains(&url.scheme()) || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err("请输入不含账户、查询参数或片段的 HTTP(S) 接口地址".into());
    }
    let path = url.path().trim_end_matches('/');
    let path = if path.ends_with("/chat/completions") { path.to_string() }
        else if path.is_empty() { "/v1/chat/completions".into() }
        else { format!("{path}/chat/completions") };
    url.set_path(&path);
    Ok(url.into())
}

pub fn validate(config: &mut AiConfig) -> Result<(), String> {
    config.endpoint = endpoint(&config.endpoint)?;
    config.model = config.model.trim().into();
    config.api_key = config.api_key.trim().into();
    if config.model.len() > 200 { return Err("请填写有效的模型名称".into()); }
    if config.api_key.len() > 4096 || config.api_key.contains(['\r', '\n']) { return Err("API Key 格式无效".into()); }
    if !(2..=32).contains(&config.max_length) || !(5..=120).contains(&config.timeout) || config.style.len() > 500 {
        return Err("命名长度、风格或超时设置无效".into());
    }
    super::quota::validate(config)?;
    Ok(())
}

pub fn same_identity(a: &AiConfig, b: &AiConfig) -> bool {
    a.endpoint == b.endpoint && a.api_key == b.api_key && a.model == b.model
}

fn path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    crate::app_data::directory(app).map(|path| path.join("ai-config.dat"))
}

pub fn read(app: &tauri::AppHandle) -> Result<Option<AiConfig>, String> {
    let path = path(app)?;
    if !path.exists() { return Ok(None); }
    let bytes = std::fs::read(path).map_err(|_| "无法读取 AI 配置")?;
    if bytes.len() > 32 * 1024 { return Err("AI 配置文件过大".into()); }
    let text = super::secret::protect(&bytes, true)?;
    serde_json::from_slice(&text).map(Some).map_err(|_| "AI 配置损坏".into())
}

pub fn resolve_key(app: &tauri::AppHandle, config: &mut AiConfig) -> Result<(), String> {
    validate(config)?;
    if config.api_key.is_empty() {
        if let Some(saved) = read(app)? {
            if saved.endpoint == config.endpoint { config.api_key = saved.api_key; }
        }
    }
    if config.api_key.is_empty() { return Err("请填写 API Key；更换地址时需重新输入密钥".into()); }
    Ok(())
}

pub fn write(app: &tauri::AppHandle, config: &AiConfig) -> Result<(), String> {
    let path = path(app)?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|_| "无法创建 AI 配置目录")?;
    let text = serde_json::to_vec(config).map_err(|_| "AI 配置无法编码")?;
    let bytes = super::secret::protect(&text, false)?;
    let pending = path.with_extension("pending");
    std::fs::write(&pending, bytes).map_err(|_| "AI 配置写入失败")?;
    std::fs::rename(pending, path).map_err(|_| "AI 配置保存失败".into())
}

pub fn delete(app: &tauri::AppHandle) -> Result<(), String> {
    let path = path(app)?;
    if path.exists() { std::fs::remove_file(path).map_err(|_| "AI 配置删除失败")?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn old_config_defaults_unverified_and_identity_includes_key_and_model() {
        let value = serde_json::json!({"endpoint":"https://relay.example/v1/chat/completions", "apiKey":"test", "model":"vision", "style":"", "maxLength":8, "timeout":30});
        let a: super::AiConfig = serde_json::from_value(value).unwrap();
        assert_eq!(a.verified_at, 0); assert_eq!(a.quota.method, "GET");
        let mut b = a.clone(); assert!(super::same_identity(&a, &b));
        b.api_key = "other".into(); assert!(!super::same_identity(&a, &b));
        b = a.clone(); b.model = "other".into(); assert!(!super::same_identity(&a, &b));
    }
    #[test]
    fn normalizes_relay_urls_and_rejects_credentials() {
        assert_eq!(super::endpoint("https://relay.example/v1/").unwrap(), "https://relay.example/v1/chat/completions");
        assert_eq!(super::endpoint("https://relay.example").unwrap(), "https://relay.example/v1/chat/completions");
        assert_eq!(super::endpoint("http://127.0.0.1:1234/api/chat/completions").unwrap(), "http://127.0.0.1:1234/api/chat/completions");
        for url in ["file:///key", "https://user:pass@relay.example", "https://relay.example?key=secret"] { assert!(super::endpoint(url).is_err()); }
    }
}
