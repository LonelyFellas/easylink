use std::path::Path;

// rust-i18n 的 `i18n!` 宏在编译期把 locales/*.yml 嵌入二进制，
// 但 proc-macro 读文件不会被 cargo 登记为编译依赖，改 .yml 默认不触发重编。
// 这里显式声明对每个 locale 文件的依赖，确保词条改动后 cargo 会重新编译本 crate。
fn main() {
    println!("cargo:rerun-if-changed=locales");
    track_dir(Path::new("locales"));
}

fn track_dir(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            track_dir(&path);
        } else {
            println!("cargo:rerun-if-changed={}", path.display());
        }
    }
}
