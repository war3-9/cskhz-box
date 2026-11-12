mod config;
pub(crate) mod secret;
mod request;
mod quota;
use config::AiConfig;
use serde_json::Value;
use std::sync::{LazyLock, Mutex};
use std::collections::HashMap;
static TESTED: LazyLock<Mutex<Option<AiConfig>>> = LazyLock::new(|| Mutex::new(None));
static CONFIG_LOCK: Mutex<()> = Mutex::new(());
static SESSIONS: LazyLock<Mutex<HashMap<u64, AiConfig>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
pub fn now() -> u64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
fn public(config: Option<AiConfig>) -> Value {
    config.map(|mut value| {
        let has_key = !value.api_key.is_empty();
        let verified_at = value.verified_at;
        value.api_key.clear();
        serde_json::json!({ "config": value, "hasKey": has_key, "verifiedAt": verified_at })
    }).unwrap_or(Value::Null)
}
#[tauri::command]
pub fn load_ai_config(app: tauri::AppHandle) -> Result<Value, String> { config::read(&app).map(public) }
#[tauri::command]
pub fn save_ai_config(app: tauri::AppHandle, mut config: AiConfig) -> Result<Value, String> {
    let _guard = CONFIG_LOCK.lock().map_err(|_| "配置锁错误")?;
    config::resolve_key(&app, &mut config)?;
    if config.model.is_empty() { return Err("请填写模型名称".into()); }
    let saved = config::read(&app)?;
    config.verified_at = TESTED.lock().map_err(|_| "配置锁错误")?.as_ref().filter(|tested| config::same_identity(tested, &config)).map(|c| c.verified_at)
        .or_else(|| saved.filter(|c| config::same_identity(c, &config)).map(|c| c.verified_at)).unwrap_or(0);
    config::write(&app, &config)?;
    Ok(public(Some(config)))
}
#[tauri::command]
pub fn delete_ai_config(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = CONFIG_LOCK.lock().map_err(|_| "配置锁错误")?;
    *TESTED.lock().map_err(|_| "配置锁错误")? = None;
    config::delete(&app)
}
#[tauri::command]
pub async fn test_ai_config(app: tauri::AppHandle, mut config: AiConfig, image: Option<String>) -> Result<Value, String> {
    config::resolve_key(&app, &mut config)?;
    let reply = request::test(&config, image).await?;
    config.verified_at = now();
    let _guard = CONFIG_LOCK.lock().map_err(|_| "配置锁错误")?;
    *TESTED.lock().map_err(|_| "配置锁错误")? = Some(config.clone());
    if let Some(mut saved) = config::read(&app)? {
        if config::same_identity(&saved, &config) { saved.verified_at = config.verified_at; config::write(&app, &saved)?; }
    }
    Ok(reply)
}
#[tauri::command]
pub async fn ai_models(app: tauri::AppHandle, mut config: AiConfig) -> Result<Vec<String>, String> {
    config::resolve_key(&app, &mut config)?;
    let data = request::json_request(&config, &quota::sibling(&config, "models"), "GET", None).await?;
    let mut models: Vec<String> = data.get("data").and_then(Value::as_array).ok_or("接口未提供标准模型列表，可手动填写")?.iter()
        .filter_map(|item| item.get("id").and_then(Value::as_str).map(str::to_owned)).collect();
    models.sort(); models.dedup();
    if models.is_empty() { return Err("未获取到模型，可手动填写".into()); }
    Ok(models)
}
#[tauri::command]
pub async fn ai_quota(app: tauri::AppHandle, mut config: AiConfig) -> Result<Value, String> {
    config::resolve_key(&app, &mut config)?;
    quota::query(&config).await
}
#[tauri::command]
pub fn begin_ai_batch(app: tauri::AppHandle) -> Result<u64, String> {
    let config = config::read(&app)?.ok_or("请先保存 AI 配置")?;
    if config.verified_at == 0 || config.api_key.is_empty() { return Err("请先保存 AI 配置并测试连接".into()); }
    let mut sessions = SESSIONS.lock().map_err(|_| "批次锁错误")?;
    if !sessions.is_empty() { return Err("已有 AI 批次正在进行".into()); }
    let id = now(); sessions.insert(id, config); Ok(id)
}
fn session(id: u64) -> Result<AiConfig, String> { SESSIONS.lock().map_err(|_| "批次锁错误")?.get(&id).cloned().ok_or("AI 批次已结束".into()) }
#[tauri::command]
pub async fn ai_batch_name(id: u64, image: String) -> Result<Value, String> { request::test(&session(id)?, Some(image)).await }
#[tauri::command]
pub async fn ai_batch_quota(id: u64) -> Result<Value, String> { quota::query(&session(id)?).await }
#[tauri::command]
pub fn end_ai_batch(id: u64) -> Result<(), String> { SESSIONS.lock().map_err(|_| "批次锁错误")?.remove(&id); Ok(()) }
