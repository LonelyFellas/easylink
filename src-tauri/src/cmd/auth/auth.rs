use crate::api::ApiClient;
use crate::cmd::CmdResult;
use crate::cmd::StringifyErr as _;
use crate::config::{decrypt_data, encrypt_data};
use crate::utils::dirs;
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use std::path::PathBuf;

/// 设备指纹：machine-uid → SHA256 → 小写 hex
/// - 不直接暴露原始 machine-uid，避免泄露平台特征
/// - 跨平台输出统一为 64 字符
/// - 同机重启 / 重装应用保持一致；重装系统后变化
fn device_imei() -> String {
    let raw = machine_uid::get().unwrap_or_default();
    if raw.is_empty() {
        return String::new();
    }
    let digest = Sha256::digest(raw.as_bytes());
    format!("{digest:x}")
}

// Mock 鉴权数据，后续接入真实后端时只需替换本文件中的命令实现。
// token、账号均加密后写入 app 目录下的 auth.dat，明文不落盘。

const AUTH_FILE: &str = "auth.dat";
#[allow(dead_code)] // 暂未使用：接入真实后端会改走服务端下发的 expires_at
const SESSION_TTL_SECS: i64 = 7 * 24 * 60 * 60; // 7 天

// {
//     "status": "success",
//     "data": {
//         "id": 385752,
//         "status": 1,
//         "class": 0,
//         "level": 0,
//         "expire_in": "2026-05-29 22:02:18",
//         "invite_code": 10385752,
//         "invite_url": "http://vpnapi.easylinkvpn.com/qrcodes/10385752.png",
//         "text": "",
//         "buy_link": "",
//         "money": "0.00",
//         "sspannelName": "ssrpanel",
//         "usedTraffic": "0B",
//         "Traffic": "97.66GB",
//         "all": 1,
//         "residue": "",
//         "nodes": [
//             {
//                 "name": "HK CMI",
//                 "server": "113.105.92.212",
//                 "server_port": "7184",
//                 "password": "123456",
//                 "method": "none",
//                 "obfs": "plain",
//                 "obfsparam": "",
//                 "protocol": "auth_chain_a",
//                 "protocolparam": "77122:3DWZSm",
//                 "flags": "https://share.sdwan88.com/assets/images/country/hk.png",
//                 "group": "国服",
//                 "vip_type": "vip"
//             },
//             {
//                 "name": "日本",
//                 "server": "113.105.92.212",
//                 "server_port": "8135",
//                 "password": "123456",
//                 "method": "none",
//                 "obfs": "plain",
//                 "obfsparam": "",
//                 "protocol": "auth_chain_a",
//                 "protocolparam": "77122:3DWZSm",
//                 "flags": "https://share.sdwan88.com/assets/images/country/jp.png",
//                 "group": "亚服",
//                 "vip_type": "vip"
//             },
//             {
//                 "name": "日本2",
//                 "server": "113.105.92.212",
//                 "server_port": "8191",
//                 "password": "123456",
//                 "method": "none",
//                 "obfs": "plain",
//                 "obfsparam": "",
//                 "protocol": "auth_chain_a",
//                 "protocolparam": "77122:3DWZSm",
//                 "flags": "https://share.sdwan88.com/assets/images/country/jp.png",
//                 "group": "美服",
//                 "vip_type": "svip"
//             },
//             {
//                 "name": "吉隆坡",
//                 "server": "113.105.92.212",
//                 "server_port": "7105",
//                 "password": "123456",
//                 "method": "none",
//                 "obfs": "plain",
//                 "obfsparam": "",
//                 "protocol": "auth_chain_a",
//                 "protocolparam": "77122:3DWZSm",
//                 "flags": "https://share.sdwan88.com/assets/images/country/my.png",
//                 "group": "日服",
//                 "vip_type": "svip"
//             },
//             {
//                 "name": "华盛顿",
//                 "server": "113.105.92.212",
//                 "server_port": "8120",
//                 "password": "123456",
//                 "method": "none",
//                 "obfs": "plain",
//                 "obfsparam": "",
//                 "protocol": "auth_chain_a",
//                 "protocolparam": "77122:3DWZSm",
//                 "flags": "https://share.sdwan88.com/assets/images/country/us.png",
//                 "group": "全球",
//                 "vip_type": "svip"
//             },
//             {
//                 "name": "台北",
//                 "server": "113.105.92.212",
//                 "server_port": "7104",
//                 "password": "123456",
//                 "method": "none",
//                 "obfs": "plain",
//                 "obfsparam": "",
//                 "protocol": "auth_chain_a",
//                 "protocolparam": "77122:3DWZSm",
//                 "flags": "https://share.sdwan88.com/assets/images/country/tw.png",
//                 "group": null,
//                 "vip_type": "svip"
//             },
//             {
//                 "name": "菲律宾",
//                 "server": "113.105.92.212",
//                 "server_port": "7100",
//                 "password": "123456",
//                 "method": "none",
//                 "obfs": "plain",
//                 "obfsparam": "",
//                 "protocol": "auth_chain_a",
//                 "protocolparam": "77122:3DWZSm",
//                 "flags": "https://share.sdwan88.com/assets/images/country/ph.png",
//                 "group": "国服",
//                 "vip_type": "svip"
//             },
//             {
//                 "name": "纽约",
//                 "server": "113.105.92.212",
//                 "server_port": "8134",
//                 "password": "123456",
//                 "method": "none",
//                 "obfs": "plain",
//                 "obfsparam": "",
//                 "protocol": "auth_chain_a",
//                 "protocolparam": "77122:3DWZSm",
//                 "flags": "https://share.sdwan88.com/assets/images/country/us.png",
//                 "group": null,
//                 "vip_type": "svip"
//             },
//             {
//                 "name": "印度尼西亚",
//                 "server": "113.105.92.212",
//                 "server_port": "7103",
//                 "password": "123456",
//                 "method": "none",
//                 "obfs": "plain",
//                 "obfsparam": "",
//                 "protocol": "auth_chain_a",
//                 "protocolparam": "77122:3DWZSm",
//                 "flags": "https://share.sdwan88.com/assets/images/country/id.png",
//                 "group": null,
//                 "vip_type": "svip"
//             },
//             {
//                 "name": "泰国",
//                 "server": "113.105.92.212",
//                 "server_port": "7102",
//                 "password": "123456",
//                 "method": "none",
//                 "obfs": "plain",
//                 "obfsparam": "",
//                 "protocol": "auth_chain_a",
//                 "protocolparam": "77122:3DWZSm",
//                 "flags": "https://share.sdwan88.com/assets/images/country/th.png",
//                 "group": null,
//                 "vip_type": "svip"
//             }
//         ],
//         "link": "https://share.sdwan88.com/s/385752",
//         "total": 104857600000,
//         "vip_type": null,
//         "vip_begin_time": null,
//         "vip_end_time": null
//     },
//     "message": "登录成功"
// }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub name: Option<String>,
    pub server: Option<String>,
    pub server_port: Option<String>,
    pub password: Option<String>,
    pub method: Option<String>,
    pub obfs: Option<String>,
    pub obfsparam: Option<String>,
    pub protocol: Option<String>,
    pub protocolparam: Option<String>,
    pub flags: Option<String>,
    pub group: Option<String>,
    pub vip_type: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthUserInfo {
    /// 登录时使用的用户名（手机/邮箱），由后端响应不带，本地填充
    #[serde(default)]
    pub username: Option<String>,
    pub Traffic: Option<String>,
    pub all: Option<i32>,
    pub buy_link: Option<String>,
    pub expire_in: Option<String>,
    pub id: Option<i64>,
    pub invite_code: Option<i64>,
    pub invite_url: Option<String>,
    pub level: Option<i32>,
    pub link: Option<String>,
    pub total: Option<i64>,
    pub vip_type: Option<String>,
    pub vip_begin_time: Option<String>,
    pub vip_end_time: Option<String>,
    pub nodes: Option<Vec<Node>>,
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
    session: Option<AuthUserInfo>,
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

#[allow(dead_code)] // 暂未使用：接入真实后端后会用于会话过期判断
fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

#[allow(dead_code)] // 暂未使用：接入真实后端后会改用服务端返回的 session
fn new_session(username: &str) -> AuthUserInfo {
    AuthUserInfo {
        username: Some(username.into()),
        Traffic: None,
        all: None,
        buy_link: None,
        expire_in: None,
        id: None,
        invite_code: None,
        invite_url: None,
        level: None,
        link: None,
        total: None,
        vip_type: None,
        vip_begin_time: None,
        vip_end_time: None,
        nodes: None,
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
) -> CmdResult<AuthUserInfo> {
    let model = RegisterModel {
        username,
        password,
        repassword,
        jiqi_code,
        device_id: 3,
        key,
    };
    println!("model: {:?}", model);
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

#[derive(Debug, Default, Serialize, Deserialize)]
struct LoginModel {
    username: String,
    password: String,
    /// 电脑唯一标识（网卡或mac地址）
    DeviceIMEI: String,
    /// 电脑系统（macos、windows、linux）
    hbcode: String,
    /// client类型（app、web）
    hbtype: String,
}
/// 登录（Mock）：校验本地已注册账号
#[tauri::command]
pub async fn auth_login(username: String, password: String) -> CmdResult<AuthUserInfo> {
    let mut model = LoginModel {
        username,
        password,
        DeviceIMEI: "".to_string(),
        hbcode: "".to_string(),
        hbtype: "".to_string(),
    };
    // 1) 获取设备指纹：machine-uid 经 SHA256 哈希
    model.DeviceIMEI = device_imei();
    // 2) 获取电脑系统（macos / windows / linux / ios / android …）
    //    用标准库常量，编译期就确定，避免再绕 sysinfo plugin
    model.hbcode = std::env::consts::OS.to_string();
    model.hbtype = String::from("pc");

    println!("model: {:?}", model);
    let mut data: AuthUserInfo = ApiClient::global()
        .post("/login", &model, None)
        .await
        .inspect_err(|e| eprintln!("auth_login /login failed: {e}"))
        .stringify_err()?;
    data.username = Some(model.username.clone());
    println!("data: {:?}", data);

    // let session = new_session(&username);
    // store.session = Some(session.clone());
    // write_store(&store)?;
    Ok(data)
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
pub fn auth_get_session() -> Option<AuthUserInfo> {
    let mut store = read_store();
    match &store.session {
        // Some(session) if session.expire_in > now() => Some(session.clone()),
        Some(_) => {
            store.session = None;
            let _ = write_store(&store);
            None
        }
        None => None,
    }
}
