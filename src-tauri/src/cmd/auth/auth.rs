use crate::api::ApiClient;
use crate::cmd::CmdResult;
use crate::cmd::StringifyErr as _;
use crate::config::{decrypt_data, encrypt_data};
use crate::utils::dirs;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use std::collections::HashMap;
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
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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
    jiqi_code: String,
    device_id: String,
    key: Option<String>,
    DeviceID: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct AuthStore {
    #[serde(default)]
    users: Vec<AuthUser>,
    #[serde(default)]
    session: Option<AuthUserInfo>,
    /// 会话写入时间（unix 秒）。读取时与 SESSION_TTL_SECS 比较，过期视为未登录。
    #[serde(default)]
    session_saved_at: Option<i64>,
    /// 用户 id → 上次手动选择的节点名。跨登出存活，供再次登录恢复。
    #[serde(default)]
    node_cache: HashMap<String, String>,
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

/// 将登录会话加密写入本地，供下次启动恢复登录态。
fn persist_session(session: &AuthUserInfo) -> Result<(), String> {
    let mut store = read_store();
    store.session = Some(session.clone());
    store.session_saved_at = Some(now());
    write_store(&store)
}

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
    jiqi_code: String,
    key: Option<String>,
) -> CmdResult<AuthUserInfo> {
    let model = RegisterModel {
        device_id: username.clone(),
        DeviceID: Some(username.clone()),
        username,
        password,
        repassword,
        jiqi_code,
        key,
    };
    println!("model: {:?}", model);
    let data: AuthUserInfo = ApiClient::global()
        .post("/register", &model, None)
        .await
        .inspect_err(|e| eprintln!("auth_register /register failed: {e}"))
        .stringify_err()?;
    println!("data: {:?}", data);
    Ok(data)
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

#[tauri::command]
pub async fn get_verify_code_by_email(email: String) -> CmdResult<()> {
    // 邮箱接口成功时 data 为 []，无法用 SendSmsData / () 解析，只校验 envelope 成功即可
    let _: Value = ApiClient::global()
        .get(&format!("/sendEmail?email={}&DeviceId={}", email, email), None)
        .await
        .inspect_err(|e| eprintln!("get_verify_code_by_email failed: {e}"))
        .stringify_err()?;
    Ok(())
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct LoginModel {
    username: String,
    password: Option<String>,
    /// 电脑唯一标识（网卡或mac地址）
    DeviceIMEI: String,
    /// 电脑系统（macos、windows、linux）
    hbcode: String,
    /// client类型（app、web）
    hbtype: String,
    /// 验证码
    key: Option<String>,
}
/// 登录（Mock）：校验本地已注册账号
#[tauri::command]
pub async fn auth_login(username: String, password: Option<String>, code: Option<String>) -> CmdResult<AuthUserInfo> {
    if password.is_none() && code.is_none() {
        return Err(String::from("password or code is required").into());
    };

    let mut model = LoginModel {
        username,
        password: None,
        key: None,
        DeviceIMEI: device_imei(),
        hbcode: std::env::consts::OS.to_string(),
        hbtype: String::from("pc"),
    };

    let mut data: AuthUserInfo = AuthUserInfo::default();

    // 密码登录
    if let Some(password) = password {
        model.password = Some(password);
        data = ApiClient::global()
            .post("/login", &model, None)
            .await
            .inspect_err(|e| eprintln!("auth_login /login failed: {e}"))
            .stringify_err()?;
        data.username = Some(model.username.clone());
        persist_session(&data)?;
        return Ok(data);
    }

    // 验证码登录
    if let Some(code) = code {
        model.key = Some(code);
        data = ApiClient::global()
            .post("/login", &model, None)
            .await
            .inspect_err(|e| eprintln!("auth_login /login failed: {e}"))
            .stringify_err()?;
    }
    data.username = Some(model.username.clone());

    // 持久化会话，下次启动自动恢复登录态
    persist_session(&data)?;

    Ok(data)
}

// {
//     status: 'success',
//     message: '',
//     data: {
//       id: 385426,
//       username: '18970030363',
//       mailname: '',
//       password: '$2y$10$HYHrJHhsTakZO27Uf4wOquufEEruB3ft9TjNOxs2rQD5hpsoBOG76',
//       port: 7160,
//       passwd: '6cuYVY',
//       vmess_id: '7b83269e-dbd7-8139-eb83-0cf246bfadad',
//       transfer_enable: 11064185794330624,
//       u: 1323380287,
//       d: 12805917424,
//       t: 1780190337,
//       enable: 1,
//       method: 'aes-256-ctr',
//       protocol: 'origin',
//       protocol_param: null,
//       obfs: 'plain',
//       obfs_param: null,
//       speed_limit_per_con: 10737418240,
//       speed_limit_per_user: 10737418240,
//       gender: 1,
//       wechat: null,
//       qq: null,
//       usage: '4',
//       pay_way: 0,
//       balance: 0,
//       enable_time: '2026-04-22',
//       expire_time: '2028-05-09 00:00:00',
//       ban_time: 0,
//       remark: '',
//       level: 1,
//       is_admin: 0,
//       reg_ip: '115.148.168.37',
//       last_login: 1778763469,
//       referral_uid: 0,
//       invite_code: 10385426,
//       invite_url: 'http://vpnapi.easylinkvpn.com/qrcodes/10385426.png',
//       traffic_reset_day: 2,
//       status: 1,
//       remember_token: '41lRJOSkkLDg2VJj4ewtcAA1rKtLoIM4WvaV5sl1bR9VYKkiPKjiforPSayM',
//       created_at: '2026-04-22 15:18:12',
//       updated_at: '2026-05-31 09:18:57',
//       jiqi_code: '0',
//       agent_level: 0,
//       agent_fencheng: 0,
//       agents: 0,
//       invite_level: 0,
//       total_commission: '0.00',
//       total_nowithdraw: '0.00',
//       total_frozen_mount: '0.00',
//       device_num: 30,
//       deleted_at: null,
//       email_unsubscribe: 0,
//       gpt_member_id: null,
//       is_vip: 1,
//       vip_begin_time: '2024-06-13 23:21:14',
//       vip_end_time: '2029-06-13 23:21:14',
//       vip_type: 'svip',
//       valid_invitation: 1,
//       redemption_equity: 0,
//       source_id: 1,
//       expire_in: '2028-05-09 00:00:00',
//       invite_nums: 0
//     }
//   }
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub mailname: Option<String>,
    pub password: Option<String>,
    pub port: Option<i32>,
    pub passwd: Option<String>,
    pub vmess_id: Option<String>,
    pub transfer_enable: Option<i64>,
    pub u: Option<i64>,
    pub d: Option<i64>,
    pub t: Option<i64>,
    pub enable: Option<i32>,
    pub method: Option<String>,
    pub protocol: Option<String>,
    pub protocol_param: Option<String>,
    pub obfs: Option<String>,
    pub obfs_param: Option<String>,
    pub speed_limit_per_con: Option<i64>,
    pub speed_limit_per_user: Option<i64>,
    pub gender: Option<i32>,
    pub wechat: Option<String>,
    pub qq: Option<String>,
    pub usage: Option<String>,
    pub pay_way: Option<i32>,
    pub balance: Option<i64>,
    pub enable_time: Option<String>,
    pub expire_time: Option<String>,
    pub ban_time: Option<i32>,
    pub remark: Option<String>,
    pub level: Option<i32>,
    pub is_admin: Option<i32>,
    pub reg_ip: Option<String>,
    pub last_login: Option<i64>,
    pub referral_uid: Option<i64>,
    pub invite_code: Option<i64>,
    pub invite_url: Option<String>,
    pub traffic_reset_day: Option<i32>,
    pub status: Option<i32>,
    pub remember_token: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub jiqi_code: Option<String>,
    pub agent_level: Option<i32>,
    pub agent_fencheng: Option<i32>,
    pub agents: Option<i32>,
    pub invite_level: Option<i32>,
    pub total_commission: Option<String>,
    pub total_nowithdraw: Option<String>,
    pub total_frozen_mount: Option<String>,
    pub device_num: Option<i32>,
    // pub deleted_at: Option<String>,
    pub email_unsubscribe: Option<i32>,
    pub gpt_member_id: Option<i32>,
    pub is_vip: Option<i32>,
    pub vip_begin_time: Option<String>,
    pub vip_end_time: Option<String>,
    pub vip_type: Option<String>,
    pub valid_invitation: Option<i32>,
    pub redemption_equity: Option<i32>,
    pub source_id: Option<i32>,
    pub expire_in: Option<String>,
    pub invite_nums: Option<i32>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct UserIdModel {
    UserID: String,
}
// 获取用户详情
#[tauri::command]
pub async fn get_user_info(userId: String) -> CmdResult<UserInfo> {
    ApiClient::global()
        // UserId query参数方式传入
        .post("/getUserInfo", &UserIdModel { UserID: userId }, None)
        .await
        .inspect_err(|e| eprintln!("get_user_info failed: {e}"))
        .stringify_err()
}

/// 登出：清除已存 token
#[tauri::command]
pub fn auth_logout() -> CmdResult {
    let mut store = read_store();
    store.session = None;
    store.session_saved_at = None;
    write_store(&store)?;
    Ok(())
}

/// 启动时读取持久化的会话；超过 SESSION_TTL_SECS（7 天）视为过期，清除并返回 None
#[tauri::command]
pub fn auth_get_session() -> Option<AuthUserInfo> {
    let mut store = read_store();
    let session = store.session.as_ref()?;
    let saved_at = store.session_saved_at.unwrap_or(0);
    if now().saturating_sub(saved_at) >= SESSION_TTL_SECS {
        store.session = None;
        store.session_saved_at = None;
        let _ = write_store(&store);
        return None;
    }
    Some(session.clone())
}

/// 记住当前登录用户最后手动选择的节点（按 user id 绑定，跨登出存活）。
/// user id 取自已持久化的 session，未登录则忽略。
#[tauri::command]
pub fn auth_cache_node(node: String) -> CmdResult {
    let mut store = read_store();
    let Some(id) = store.session.as_ref().and_then(|s| s.id) else {
        return Ok(());
    };
    store.node_cache.insert(id.to_string(), node);
    write_store(&store)?;
    Ok(())
}

/// 读取当前登录用户上次选择的节点，无则返回 None。
#[tauri::command]
pub fn auth_get_cached_node() -> Option<String> {
    let store = read_store();
    let id = store.session.as_ref().and_then(|s| s.id)?;
    store.node_cache.get(&id.to_string()).cloned()
}
