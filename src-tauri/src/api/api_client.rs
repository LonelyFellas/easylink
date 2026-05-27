//! 后台 API 基础 HTTP 封装（直连，不走 Clash 代理）。

use anyhow::{Context as _, Result, anyhow};
use reqwest::{
    Client, Method,
    header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue, USER_AGENT},
};
use serde::{Serialize, de::DeserializeOwned};
use std::{sync::OnceLock, time::Duration};

use crate::constants::api::base_url;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// 常见 `{ code, msg/message, data }` 响应结构。
#[derive(Debug, Clone, serde::Serialize)]
pub struct ApiEnvelope<T> {
    pub code: i32,
    pub msg: Option<String>,
    pub message: Option<String>,
    pub data: Option<T>,
}

/// 先反序列化为非泛型结构，再解析 `data`，避免 `ApiEnvelope<T>` 的 derive 要求 `T: Default`。
#[derive(serde::Deserialize)]
struct ApiEnvelopeRaw {
    code: i32,
    #[serde(default)]
    msg: Option<String>,
    #[serde(default)]
    message: Option<String>,
    data: Option<serde_json::Value>,
}

fn parse_envelope<T: DeserializeOwned>(text: &str) -> Result<ApiEnvelope<T>> {
    let raw: ApiEnvelopeRaw = serde_json::from_str(text).with_context(|| format!("解析响应失败: {text}"))?;
    let data = match raw.data {
        Some(v) => Some(serde_json::from_value(v).with_context(|| format!("解析 data 失败: {text}"))?),
        None => None,
    };
    Ok(ApiEnvelope {
        code: raw.code,
        msg: raw.msg,
        message: raw.message,
        data,
    })
}

impl<T> ApiEnvelope<T> {
    pub fn into_result(self) -> Result<T> {
        if self.is_success() {
            self.data.context("响应缺少 data 字段")
        } else {
            Err(anyhow!(self.error_message()))
        }
    }

    pub fn is_success(&self) -> bool {
        self.code == 0 || self.code == 200
    }

    pub fn error_message(&self) -> String {
        self.msg
            .clone()
            .or_else(|| self.message.clone())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("请求失败 (code={})", self.code))
    }
}

/// 后台 API 客户端（单例）。
pub struct ApiClient {
    client: Client,
    base_url: String,
}

impl ApiClient {
    pub fn global() -> &'static Self {
        static INSTANCE: OnceLock<ApiClient> = OnceLock::new();
        INSTANCE.get_or_init(Self::new)
    }

    fn new() -> Self {
        let client = Client::builder()
            .no_proxy()
            .tls_backend_rustls()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .expect("failed to build API http client");

        Self {
            client,
            base_url: default_base_url().trim_end_matches('/').to_string(),
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}/{}", self.base_url, path.trim_start_matches('/'))
    }

    fn headers(token: Option<&str>) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(&format!("easylink-pc/v{}", env!("CARGO_PKG_VERSION")))?,
        );
        if let Some(token) = token.filter(|t| !t.is_empty()) {
            headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {token}"))?);
        }
        Ok(headers)
    }

    /// GET，解析为 `ApiEnvelope` 并取出 `data`。
    pub async fn get<T>(&self, path: &str, token: Option<&str>) -> Result<T>
    where
        T: DeserializeOwned,
    {
        self.request_envelope(Method::GET, path, None::<&()>, token)
            .await?
            .into_result()
    }

    /// POST JSON，解析为 `ApiEnvelope` 并取出 `data`。
    pub async fn post<B, T>(&self, path: &str, body: &B, token: Option<&str>) -> Result<T>
    where
        B: Serialize,
        T: DeserializeOwned,
    {
        self.request_envelope(Method::POST, path, Some(body), token)
            .await?
            .into_result()
    }

    /// 返回完整 envelope，便于处理无 `data` 字段的接口。
    pub async fn post_envelope<B, T>(&self, path: &str, body: &B, token: Option<&str>) -> Result<ApiEnvelope<T>>
    where
        B: Serialize,
        T: DeserializeOwned,
    {
        self.request_envelope(Method::POST, path, Some(body), token).await
    }

    async fn request_envelope<B, T>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
        token: Option<&str>,
    ) -> Result<ApiEnvelope<T>>
    where
        B: Serialize,
        T: DeserializeOwned,
    {
        let text = self.request_text(method, path, body, token).await?;
        parse_envelope(&text)
    }

    /// 原始 JSON 反序列化（响应体非 envelope 时使用）。
    pub async fn post_json<B, T>(&self, path: &str, body: &B, token: Option<&str>) -> Result<T>
    where
        B: Serialize,
        T: DeserializeOwned,
    {
        let text = self.request_text(Method::POST, path, Some(body), token).await?;
        serde_json::from_str(&text).with_context(|| format!("解析响应失败: {text}"))
    }

    async fn request_text<B>(&self, method: Method, path: &str, body: Option<&B>, token: Option<&str>) -> Result<String>
    where
        B: Serialize,
    {
        let url = self.endpoint(path);
        let mut req = self.client.request(method, &url).headers(Self::headers(token)?);

        if let Some(body) = body {
            req = req.json(body);
        }

        let resp = req.send().await.with_context(|| format!("请求失败: {url}"))?;
        let status = resp.status();
        let text = resp.text().await.with_context(|| format!("读取响应失败: {url}"))?;

        if !status.is_success() {
            return Err(anyhow!("HTTP {}: {}", status, trim_body(&text)));
        }

        Ok(text)
    }
}

fn default_base_url() -> &'static str {
    #[cfg(feature = "verge-dev")]
    {
        base_url::DEV
    }
    #[cfg(not(feature = "verge-dev"))]
    {
        base_url::PROD
    }
}

fn trim_body(body: &str) -> String {
    const MAX: usize = 512;
    if body.len() <= MAX {
        return body.to_string();
    }
    format!("{}…", &body[..MAX])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_success() {
        let env = parse_envelope::<String>(r#"{"code":0,"msg":"ok","data":"x"}"#).unwrap();
        assert_eq!(env.into_result().unwrap(), "x");
    }

    #[test]
    fn envelope_error() {
        let env = parse_envelope::<serde_json::Value>(r#"{"code":400,"msg":"bad request"}"#).unwrap();
        assert!(env.into_result().is_err());
    }
}
