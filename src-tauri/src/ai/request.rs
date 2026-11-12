use super::config::AiConfig;
use serde_json::{json, Value};

pub fn payload(config: &AiConfig, image: Option<String>) -> Result<Value, String> {
    let content = if let Some(image) = image {
        if image.len() > 1024 * 1024 || !image.starts_with("data:image/png;base64,") { return Err("测试图片格式或大小无效".into()); }
        json!([
            {"type": "text", "text": format!("根据图片起一个中文游戏道具名，风格：{}。最多{}个字。只返回名称，不要说明。", config.style, config.max_length)},
            {"type": "image_url", "image_url": {"url": image, "detail": "low"}}
        ])
    } else { json!("请只回复：连接成功") };
    Ok(json!({"model": config.model, "messages": [{"role": "user", "content": content}], "stream": false, "max_tokens": 128}))
}

pub async fn test(config: &AiConfig, image: Option<String>) -> Result<Value, String> {
    let body = payload(config, image)?;
    if config.model.is_empty() { return Err("请填写模型名称".into()); }
    let data = json_request(config, &config.endpoint, "POST", Some(body)).await?;
    let text = parse_result(&data)?;
    let usage = data.get("usage");
    let count = |name: &str| usage.and_then(|u| u.get(name)).and_then(Value::as_u64);
    Ok(json!({"text":text, "model":data.get("model").and_then(Value::as_str).unwrap_or(&config.model),
        "usage":{"promptTokens":count("prompt_tokens"), "completionTokens":count("completion_tokens"), "totalTokens":count("total_tokens")}}))
}

pub async fn json_request(config: &AiConfig, url: &str, method: &str, body: Option<Value>) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(config.timeout))
        .build().map_err(|_| "无法初始化网络连接")?;
    let mut request = client.request(if method == "POST" { reqwest::Method::POST } else { reqwest::Method::GET }, url).bearer_auth(&config.api_key);
    if let Some(body) = body { request = request.json(&body); }
    let response = request.send().await.map_err(|error| {
            if error.is_timeout() { "请求超时，请检查地址或延长超时" } else { "连接失败，请检查接口地址、网络和证书" }
        })?;
    let status = response.status();
    if !status.is_success() {
        let reason = match status.as_u16() {
            401 | 403 => "密钥或访问权限无效",
            404 => "接口路径或模型不存在",
            429 => "请求限流或额度不足",
            _ => "服务返回错误，请检查模型和接口兼容性",
        };
        return Err(format!("HTTP {}：{reason}", status.as_u16()));
    }
    if response.content_length().unwrap_or(0) > 1024 * 1024 { return Err("响应过大".into()); }
    let mut response = response;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "无法读取响应")? {
        if bytes.len() + chunk.len() > 1024 * 1024 { return Err("响应过大".into()); }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "返回内容不是有效的 JSON".into())
}

pub fn parse_result(data: &Value) -> Result<String, String> {
    let content = data.pointer("/choices/0/message/content").and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty()).ok_or("未收到模型回复，请确认接口支持 Chat Completions")?;
    Ok(content.trim().chars().take(200).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn desktop_requests_preserve_auth_payload_and_usage() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
            let mut bytes = Vec::new();
            loop {
                let mut buffer = [0u8; 4096];
                let n = stream.read(&mut buffer).unwrap();
                if n == 0 { break; }
                bytes.extend_from_slice(&buffer[..n]);
                if let Some(end) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..end]).to_lowercase();
                    let length: usize = headers.lines().find_map(|line| line.strip_prefix("content-length: ")).unwrap().parse().unwrap();
                    if bytes.len() >= end + 4 + length { break; }
                }
            }
            let request = String::from_utf8(bytes).unwrap();
            assert!(request.starts_with("POST /v1/chat/completions"));
            assert!(request.to_lowercase().contains("authorization: bearer fake-native-test"));
            let body: Value = serde_json::from_str(request.split("\r\n\r\n").nth(1).unwrap()).unwrap();
            assert_eq!(body["model"], "vision-test");
            assert_eq!(body["messages"][0]["content"][1]["image_url"]["detail"], "low");
            let body = r#"{"model":"actual-model","choices":[{"message":{"content":"Blade"}}],"usage":{"prompt_tokens":20,"completion_tokens":4,"total_tokens":24}}"#;
            write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
        });
        let config: AiConfig = serde_json::from_value(json!({"endpoint":format!("http://{address}/v1/chat/completions"), "apiKey":"fake-native-test", "model":"vision-test", "style":"", "maxLength":8, "timeout":5})).unwrap();
        let result = tauri::async_runtime::block_on(test(&config, Some("data:image/png;base64,iVBORw0KGgo=".into()))).unwrap();
        assert_eq!(result["text"], "Blade"); assert_eq!(result["model"], "actual-model");
        assert_eq!(result["usage"]["totalTokens"], 24); server.join().unwrap();
    }
    #[test]
    fn distinguishes_model_reply_from_http_success() {
        assert_eq!(parse_result(&json!({"choices":[{"message":{"content":"赤焰战刃"}}]})).unwrap(), "赤焰战刃");
        assert!(parse_result(&json!({"error": "failure"})).is_err());
        assert!(parse_result(&json!({"choices":[{"message":{"content":""}}]})).is_err());
    }
}
