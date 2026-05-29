//! 把后端登录返回的 `Node[]` 转成 mihomo 可加载的 YAML 配置。
//!
//! 节点协议为 SSR：`server_port` 是字符串，`obfsparam`/`protocolparam` 需要
//! 重命名为 `obfs-param`/`protocol-param`，`method` 重命名为 `cipher`。

use anyhow::{Result, anyhow};
use serde_yaml_ng::{Mapping, Value};

use super::auth::Node;
use crate::cmd::{CmdResult, StringifyErr as _};

/// 用 session 里的 nodes 生成 mihomo 配置 YAML，返回字符串给前端写盘。
#[tauri::command]
pub async fn auth_build_profile_yaml(nodes: Vec<Node>) -> CmdResult<String> {
    build_mihomo_yaml(&nodes, "").stringify_err()
}

const DEFAULT_PROXY_GROUP: &str = "PROXY";

/// 用一组节点拼一份完整 mihomo YAML（含 proxies + proxy-groups + rules）。
/// `owner` 仅用于注释/将来扩展，目前不影响输出结构。
pub fn build_mihomo_yaml(nodes: &[Node], _owner: &str) -> Result<String> {
    if nodes.is_empty() {
        return Err(anyhow!("nodes 为空，无法生成 profile"));
    }

    let (proxies, names) = build_proxies(nodes)?;

    let mut root = Mapping::new();
    root.insert("mixed-port".into(), 7890.into());
    root.insert("mode".into(), "rule".into());
    root.insert("log-level".into(), "info".into());
    root.insert("allow-lan".into(), false.into());
    root.insert("ipv6".into(), false.into());
    root.insert("external-controller".into(), "127.0.0.1:9090".into());

    root.insert("proxies".into(), Value::Sequence(proxies));
    root.insert(
        "proxy-groups".into(),
        Value::Sequence(build_proxy_groups(&names)),
    );
    root.insert("rules".into(), Value::Sequence(build_rules()));

    Ok(serde_yaml_ng::to_string(&Value::Mapping(root))?)
}

fn build_proxies(nodes: &[Node]) -> Result<(Vec<Value>, Vec<String>)> {
    let mut proxies = Vec::with_capacity(nodes.len());
    let mut names: Vec<String> = Vec::with_capacity(nodes.len());
    let mut seen = std::collections::HashSet::new();

    for (idx, node) in nodes.iter().enumerate() {
        let raw_name = node
            .name
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("node-{idx}"));
        // 同名后缀去重，mihomo 要求 proxies.name 唯一
        let name = dedupe_name(raw_name, &mut seen);

        let server = node
            .server
            .clone()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| anyhow!("节点 `{name}` 缺少 server"))?;
        let port: u16 = node
            .server_port
            .as_deref()
            .unwrap_or("")
            .parse()
            .map_err(|_| anyhow!("节点 `{name}` server_port 非法: {:?}", node.server_port))?;

        let mut proxy = Mapping::new();
        proxy.insert("name".into(), name.clone().into());
        proxy.insert("type".into(), "ssr".into());
        proxy.insert("server".into(), server.into());
        proxy.insert("port".into(), port.into());
        proxy.insert(
            "password".into(),
            node.password.clone().unwrap_or_default().into(),
        );
        proxy.insert(
            "cipher".into(),
            node.method.clone().unwrap_or_else(|| "none".into()).into(),
        );
        proxy.insert(
            "obfs".into(),
            node.obfs.clone().unwrap_or_else(|| "plain".into()).into(),
        );
        proxy.insert(
            "protocol".into(),
            node.protocol
                .clone()
                .unwrap_or_else(|| "origin".into())
                .into(),
        );
        if let Some(v) = node.obfsparam.as_deref().filter(|s| !s.is_empty()) {
            proxy.insert("obfs-param".into(), v.to_owned().into());
        }
        if let Some(v) = node.protocolparam.as_deref().filter(|s| !s.is_empty()) {
            proxy.insert("protocol-param".into(), v.to_owned().into());
        }
        proxy.insert("udp".into(), true.into());

        proxies.push(Value::Mapping(proxy));
        names.push(name);
    }

    Ok((proxies, names))
}

fn dedupe_name(raw: String, seen: &mut std::collections::HashSet<String>) -> String {
    if seen.insert(raw.clone()) {
        return raw;
    }
    for i in 2..u32::MAX {
        let candidate = format!("{raw} #{i}");
        if seen.insert(candidate.clone()) {
            return candidate;
        }
    }
    raw
}

fn build_proxy_groups(node_names: &[String]) -> Vec<Value> {
    let mut proxies: Vec<Value> = node_names.iter().map(|n| n.clone().into()).collect();
    proxies.push("DIRECT".into());

    let mut group = Mapping::new();
    group.insert("name".into(), DEFAULT_PROXY_GROUP.into());
    group.insert("type".into(), "select".into());
    group.insert("proxies".into(), Value::Sequence(proxies));

    vec![Value::Mapping(group)]
}

fn build_rules() -> Vec<Value> {
    // 用 IP-CIDR 让私网/本机直连，其余全部走 PROXY。
    // 不用 GEOIP/GEOSITE，避免对 MMDB/geosite 数据库的依赖导致校验失败。
    vec![
        "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve".into(),
        "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve".into(),
        "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve".into(),
        "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve".into(),
        format!("MATCH,{DEFAULT_PROXY_GROUP}").into(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_node(name: &str, port: &str) -> Node {
        Node {
            name: Some(name.into()),
            server: Some("1.2.3.4".into()),
            server_port: Some(port.into()),
            password: Some("pwd".into()),
            method: Some("none".into()),
            obfs: Some("plain".into()),
            obfsparam: Some("".into()),
            protocol: Some("auth_chain_a".into()),
            protocolparam: Some("77122:3DWZSm".into()),
            flags: None,
            group: None,
            vip_type: None,
        }
    }

    #[test]
    fn empty_nodes_returns_error() {
        assert!(build_mihomo_yaml(&[], "u").is_err());
    }

    #[test]
    fn invalid_port_returns_error() {
        let nodes = vec![sample_node("HK", "abc")];
        let err = build_mihomo_yaml(&nodes, "u").unwrap_err().to_string();
        assert!(err.contains("server_port"));
    }

    #[test]
    fn yaml_contains_proxies_and_groups() {
        let nodes = vec![sample_node("HK", "7184"), sample_node("JP", "8135")];
        let yaml = build_mihomo_yaml(&nodes, "u").unwrap();
        // 是合法 YAML
        let parsed: serde_yaml_ng::Value = serde_yaml_ng::from_str(&yaml).unwrap();
        let root = parsed.as_mapping().unwrap();

        let proxies = root.get("proxies").unwrap().as_sequence().unwrap();
        assert_eq!(proxies.len(), 2);

        let first = proxies[0].as_mapping().unwrap();
        assert_eq!(first.get("type").unwrap().as_str(), Some("ssr"));
        assert_eq!(first.get("port").unwrap().as_u64(), Some(7184));
        assert_eq!(first.get("cipher").unwrap().as_str(), Some("none"));
        assert_eq!(
            first.get("protocol-param").unwrap().as_str(),
            Some("77122:3DWZSm")
        );
        // 空 obfsparam 不应出现
        assert!(first.get("obfs-param").is_none());

        let groups = root.get("proxy-groups").unwrap().as_sequence().unwrap();
        let group = groups[0].as_mapping().unwrap();
        assert_eq!(group.get("name").unwrap().as_str(), Some(DEFAULT_PROXY_GROUP));
        let group_proxies = group.get("proxies").unwrap().as_sequence().unwrap();
        // 2 节点 + DIRECT
        assert_eq!(group_proxies.len(), 3);
        assert_eq!(group_proxies[0].as_str(), Some("HK"));
        assert_eq!(group_proxies[2].as_str(), Some("DIRECT"));
    }

    #[test]
    fn duplicate_names_are_suffixed() {
        let nodes = vec![sample_node("JP", "8135"), sample_node("JP", "8191")];
        let yaml = build_mihomo_yaml(&nodes, "u").unwrap();
        let parsed: serde_yaml_ng::Value = serde_yaml_ng::from_str(&yaml).unwrap();
        let proxies = parsed["proxies"].as_sequence().unwrap();
        assert_eq!(proxies[0]["name"].as_str(), Some("JP"));
        assert_eq!(proxies[1]["name"].as_str(), Some("JP #2"));
    }
}
