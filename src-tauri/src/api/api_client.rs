//! 后台 HTTP API 客户端。
//!
//! - 直连：显式禁用代理，避免请求被本机 Clash 代理截获。
//! - 单例：通过 `ApiClient::global()` 获取共享实例（复用连接池）。
//! - 约定：响应体为 `{ code, msg|message, data }` 结构，成功时 `code` 为 0 或 200。

use std::{sync::OnceLock, time::Duration};

use anyhow::{Context as _, Result, anyhow, bail};
use reqwest::{
    Client, Method, Response, StatusCode,
    header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue, USER_AGENT},
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;

use crate::constants::api::base_url;

/// 整体请求超时。
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// 仅连接握手超时。
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// 错误响应回显的最大字节数。
const ERROR_BODY_PREVIEW: usize = 512;

/// 业务响应外层结构：`{ status: "success" | ..., message, data }`
/// `status == "success"` 视为成功，其余一律失败。
#[derive(Debug, Clone, Deserialize)]
struct Envelope {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    data: Option<Value>,
}

impl Envelope {
    fn is_ok(&self) -> bool {
        self.status.as_deref() == Some("success")
    }

    fn message(&self) -> String {
        self.message
            .as_deref()
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| "请求失败".to_owned())
    }
}

/// 单例 HTTP 客户端。
pub struct ApiClient {
    http: Client,
    base_url: String,
    user_agent: String,
}

impl ApiClient {
    pub fn global() -> &'static Self {
        static INSTANCE: OnceLock<ApiClient> = OnceLock::new();
        INSTANCE.get_or_init(Self::new)
    }

    fn new() -> Self {
        // reqwest 客户端构造仅在初始化失败（无法加载 TLS 后端等）时返回 Err，属于不可恢复错误
        #[allow(clippy::expect_used)]
        let http = Client::builder()
            // 关键：禁用系统/环境代理，确保不会被本机 Clash 拦截。
            .no_proxy()
            .tls_backend_rustls()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(CONNECT_TIMEOUT)
            .pool_idle_timeout(Duration::from_secs(60))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .expect("build api http client");

        Self {
            http,
            base_url: default_base_url().trim_end_matches('/').to_owned(),
            user_agent: format!("easylink-pc/{}", env!("CARGO_PKG_VERSION")),
        }
    }

    /// POST JSON，按 envelope 协议解出 `data`。
    pub async fn post<B, T>(&self, path: &str, body: &B, token: Option<&str>) -> Result<T>
    where
        B: Serialize + ?Sized + Sync,
        T: DeserializeOwned,
    {
        self.request(Method::POST, path, Some(body), token).await
    }

    /// GET，按 envelope 协议解出 `data`。
    #[allow(dead_code)]
    pub async fn get<T>(&self, path: &str, token: Option<&str>) -> Result<T>
    where
        T: DeserializeOwned,
    {
        self.request::<(), T>(Method::GET, path, None, token).await
    }

    /// POST JSON，直接按 `T` 反序列化（用于非 envelope 接口）。
    #[allow(dead_code)]
    pub async fn post_json<B, T>(&self, path: &str, body: &B, token: Option<&str>) -> Result<T>
    where
        B: Serialize + ?Sized + Sync,
        T: DeserializeOwned,
    {
        let text = self.send_for_text(Method::POST, path, Some(body), token).await?;
        serde_json::from_str(&text).with_context(|| format!("解析响应失败: {}", preview(&text)))
    }

    /// 通用 envelope 请求。
    async fn request<B, T>(&self, method: Method, path: &str, body: Option<&B>, token: Option<&str>) -> Result<T>
    where
        B: Serialize + ?Sized + Sync,
        T: DeserializeOwned,
    {
        let text = self.send_for_text(method, path, body, token).await?;
        let env: Envelope = serde_json::from_str(&text).with_context(|| format!("解析响应失败: {}", preview(&text)))?;

        if !env.is_ok() {
            bail!(env.message());
        }

        // data 缺失时按 `null` 解析，允许 T = () / Option<_>。
        let data = env.data.unwrap_or(Value::Null);
        serde_json::from_value(data).with_context(|| format!("解析 data 失败: {}", preview(&text)))
    }

    /// 发起请求并读取响应文本。HTTP 状态非 2xx 直接报错。
    async fn send_for_text<B>(
        &self,
        method: Method,
        path: &str,
        body: Option<&B>,
        token: Option<&str>,
    ) -> Result<String>
    where
        B: Serialize + ?Sized + Sync,
    {
        let url = self.endpoint(path);
        let mut req = self.http.request(method, &url).headers(self.build_headers(token)?);
        if let Some(body) = body {
            req = req.json(body);
        }

        let resp = req.send().await.with_context(|| format!("请求失败: {url}"))?;
        read_text(resp, &url).await
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}/{}", self.base_url, path.trim_start_matches('/'))
    }

    fn build_headers(&self, token: Option<&str>) -> Result<HeaderMap> {
        let mut h = HeaderMap::with_capacity(4);
        h.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        h.insert(ACCEPT, HeaderValue::from_static("application/json"));
        h.insert(USER_AGENT, HeaderValue::from_str(&self.user_agent)?);
        if let Some(t) = token.map(str::trim).filter(|s| !s.is_empty()) {
            h.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {t}"))?);
        }
        Ok(h)
    }
}

async fn read_text(resp: Response, url: &str) -> Result<String> {
    let status = resp.status();
    let text = resp.text().await.with_context(|| format!("读取响应失败: {url}"))?;
    if status.is_success() {
        Ok(text)
    } else {
        Err(http_error(status, &text))
    }
}

fn http_error(status: StatusCode, body: &str) -> anyhow::Error {
    anyhow!("HTTP {}: {}", status, preview(body))
}

fn preview(s: &str) -> String {
    if s.len() <= ERROR_BODY_PREVIEW {
        s.to_owned()
    } else {
        let mut end = ERROR_BODY_PREVIEW;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}…", &s[..end])
    }
}

const fn default_base_url() -> &'static str {
    #[cfg(feature = "verge-dev")]
    {
        base_url::DEV
    }
    #[cfg(not(feature = "verge-dev"))]
    {
        base_url::PROD
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    fn parse<T: DeserializeOwned>(text: &str) -> Result<T> {
        let env: Envelope = serde_json::from_str(text)?;
        if !env.is_ok() {
            bail!(env.message());
        }
        let data = env.data.unwrap_or(Value::Null);
        Ok(serde_json::from_value(data)?)
    }

    #[test]
    fn envelope_success_with_data() {
        #[derive(Deserialize)]
        struct Out {
            key: String,
        }
        let v: Out = parse(r#"{"status":"success","message":"ok","data":{"key":"abc"}}"#).unwrap();
        assert_eq!(v.key, "abc");
    }

    #[test]
    fn envelope_failure_uses_message() {
        let err = parse::<Value>(r#"{"data":[],"message":"账号不存在","status":"fail"}"#).unwrap_err();
        assert_eq!(err.to_string(), "账号不存在");
    }

    #[test]
    fn envelope_failure_default_when_no_message() {
        let err = parse::<Value>(r#"{"status":"fail"}"#).unwrap_err();
        assert_eq!(err.to_string(), "请求失败");
    }

    #[test]
    fn preview_truncates_at_char_boundary() {
        let s = "你".repeat(300);
        let out = preview(&s);
        assert!(out.ends_with('…'));
    }
}
