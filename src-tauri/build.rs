fn main() {
    #[cfg(feature = "clippy")]
    {
        println!("cargo:warning=Skipping tauri_build during Clippy");
    }

    #[cfg(not(feature = "clippy"))]
    {
        ensure_geo_resources();
        tauri_build::build();
    }
}

/// 构建期硬门禁：release 构建必须带齐 geo 数据。
///
/// 自 1.1.2 起分流规则用到了 `GEOSITE,cn` / `GEOIP,CN`，这要求 mihomo 工作目录里有
/// `geosite.dat` / `geoip.dat` / `Country.mmdb`。这三份由 `pnpm prebuild` 在构建期下载到
/// `src-tauri/resources/`（已被 .gitignore，不入库）。若发布构建漏跑 prebuild，包里就没有
/// 这些文件 → 运行时 mihomo 联网下载 geo、超时 → 配置校验失败 → 前端「内核通信错误」。
///
/// 为杜绝再发出这种残缺包：release 下缺任一文件即让构建失败并提示。
/// debug / `cargo check` / `tauri dev` 仅告警，避免打断本地开发。
#[cfg(not(feature = "clippy"))]
fn ensure_geo_resources() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default();
    let res_dir = std::path::Path::new(&manifest_dir).join("resources");
    let required = ["geosite.dat", "geoip.dat", "Country.mmdb"];

    println!("cargo:rerun-if-changed=resources");

    let missing: Vec<&str> = required
        .iter()
        .copied()
        .filter(|f| !res_dir.join(f).exists())
        .collect();

    if missing.is_empty() {
        return;
    }

    let is_release = std::env::var("PROFILE").as_deref() == Ok("release");
    let msg = format!(
        "geo 资源缺失: {} (目录: {})。请先运行 `pnpm prebuild` 下载 geo 数据，\
         否则打出的包会因缺 geosite.dat/geoip.dat/Country.mmdb 导致 mihomo 校验失败、前端报「内核通信错误」。",
        missing.join(", "),
        res_dir.display(),
    );

    if is_release {
        panic!("{msg}");
    } else {
        println!("cargo:warning={msg}");
    }
}
