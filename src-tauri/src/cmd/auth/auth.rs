use crate::api::ApiClient;
use crate::cmd::CmdResult;
use crate::cmd::StringifyErr as _;
use crate::config::{decrypt_data, encrypt_data};
use crate::utils::dirs;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// Mock 鉴权数据，后续接入真实后端时只需替换本文件中的命令实现。
// token、账号均加密后写入 app 目录下的 auth.dat，明文不落盘。

const AUTH_FILE: &str = "auth.dat";
const SESSION_TTL_SECS: i64 = 7 * 24 * 60 * 60; // 7 天

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSession {
    pub token: String,
    pub username: String,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AuthUser {
    username: String,
    password: String,
}

// 注册Model
#[derive(Debug, Default, Serialize, Deserialize)]
struct RegisterModel {
    username: String,
    password: String,
    repassword: String,
    jiqi_code: Option<String>,
    device_id: i32,
    key: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct AuthStore {
    #[serde(default)]
    users: Vec<AuthUser>,
    #[serde(default)]
    session: Option<AuthSession>,
}

fn auth_path() -> Result<PathBuf, String> {
    dirs::app_home_dir()
        .map(|dir| dir.join(AUTH_FILE))
        .map_err(|e| e.to_string())
}

fn read_store() -> AuthStore {
    let Ok(path) = auth_path() else {
        return AuthStore::default();
    };
    let Ok(encrypted) = std::fs::read_to_string(&path) else {
        return AuthStore::default();
    };
    if encrypted.trim().is_empty() {
        return AuthStore::default();
    }
    match decrypt_data(&encrypted) {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(_) => AuthStore::default(),
    }
}

fn write_store(store: &AuthStore) -> Result<(), String> {
    let path = auth_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string(store).map_err(|e| e.to_string())?;
    let encrypted = encrypt_data(&json).map_err(|e| e.to_string())?;
    std::fs::write(&path, encrypted).map_err(|e| e.to_string())
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn new_session(username: &str) -> AuthSession {
    AuthSession {
        token: nanoid::nanoid!(32),
        username: username.to_string(),
        expires_at: now() + SESSION_TTL_SECS,
    }
}

/// 注册：调用后台 `/register`，成功返回会话信息
#[tauri::command]
pub async fn auth_register(
    username: String,
    password: String,
    repassword: String,
    jiqi_code: Option<String>,
    key: Option<String>,
) -> CmdResult<AuthSession> {
    let model = RegisterModel {
        username,
        password,
        repassword,
        jiqi_code,
        device_id: 3,
        key,
    };
    ApiClient::global()
        .post("/register", &model, None)
        .await
        .stringify_err()
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct SendSmsModel {
    phone: String,
}

#[derive(Debug, Deserialize, Clone, Serialize, Default)]
pub struct SendSmsData {
    key: String,
}

#[tauri::command]
pub async fn get_verify_code(phone: String) -> CmdResult<SendSmsData> {
    let model = SendSmsModel { phone };
    let data: SendSmsData = ApiClient::global()
        .post("/sendsms", &model, None)
        .await
        .stringify_err()?;
    Ok(data)
}

/// 登录（Mock）：校验本地已注册账号
#[tauri::command]
pub fn auth_login(username: String, password: String) -> CmdResult<AuthSession> {
    let username = username.trim().to_string();
    let mut store = read_store();
    let matched = store
        .users
        .iter()
        .any(|u| u.username == username && u.password == password);
    if !matched {
        return Err("用户名或密码错误".into());
    }
    let session = new_session(&username);
    store.session = Some(session.clone());
    write_store(&store)?;
    Ok(session)
}

/// 登出：清除已存 token
#[tauri::command]
pub fn auth_logout() -> CmdResult {
    let mut store = read_store();
    store.session = None;
    write_store(&store)?;
    Ok(())
}

/// 启动时读取当前会话，过期或不存在返回 None
#[tauri::command]
pub fn auth_get_session() -> Option<AuthSession> {
    let mut store = read_store();
    match &store.session {
        Some(session) if session.expires_at > now() => Some(session.clone()),
        Some(_) => {
            store.session = None;
            let _ = write_store(&store);
            None
        }
        None => None,
    }
}
