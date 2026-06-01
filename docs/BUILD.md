# EasyLink 手动打包文档

> 适用于 LonelyFellas/easylink 发版流程
> 三平台手动构建 + 上传 GitHub Release + 生成 update.json

## 一、通用前置（所有平台都要）

### 1.1 工具版本要求

| 工具 | 推荐版本 | 安装方式 |
|---|---|---|
| Node.js | ≥ 20（项目使用 25 验证通过） | https://nodejs.org 或 nvm |
| pnpm | ≥ 9 | `npm i -g pnpm` |
| Rust | stable 最新（≥ 1.78） | https://rustup.rs |
| Git | 任意 | 系统包管理器 |

### 1.2 Tauri 签名密钥（**全平台共用同一把**）

签名密钥决定了客户端能不能信任你的更新包。三个平台**必须用同一把私钥**，否则用户在不同系统上更新会失败。

把你 Mac 上生成的 `~/.tauri/easylink.key` 和 `easylink.key.pub` **同步到 Windows / Linux 同一相对位置**，例如：

- Windows：`C:\Users\<你>\.tauri\easylink.key`
- Linux：`~/.tauri/easylink.key`

> ⚠️ 私钥文件**绝对不要 push 到 Git 仓库**，用 U 盘 / 加密云盘 / 密码管理器同步。

### 1.3 GitHub Personal Access Token

每次跑 `scripts/updater.mjs` 上传 `update.json` 都要用到。

- 打开 https://github.com/settings/tokens?type=beta（Fine-grained token）
- Repository access: Only select repositories → `LonelyFellas/easylink`
- Permissions → Repository permissions:
  - `Contents`: **Read and write**
  - `Metadata`: Read
- 复制 token 保存好（只显示一次）

### 1.4 仓库可见性

`LonelyFellas/easylink` 必须是 **Public**，否则用户客户端拉不到 release 资产。

---

## 二、macOS 环境配置

### 2.1 安装 Xcode Command Line Tools

```bash
xcode-select --install
```

### 2.2 安装 Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

### 2.3 配置签名环境变量

写入 `~/.zshrc`：

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/easylink.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="你设置的密码"
```

然后：

```bash
source ~/.zshrc
```

### 2.4 构建命令

在仓库根目录：

```bash
pnpm install
pnpm tauri build                          # 当前架构（Apple Silicon 产 arm64）
pnpm tauri build --target x86_64-apple-darwin  # Intel 架构
pnpm tauri build --target aarch64-apple-darwin # M 系列架构
```

### 2.5 产物位置

```
target/release/bundle/
├── dmg/Easy Link_1.0.0_aarch64.dmg       ← 首次安装包（无 .sig 是正常的）
├── macos/Easy Link.app.tar.gz            ← 自动更新包
└── macos/Easy Link.app.tar.gz.sig        ← 更新包签名
```

> ℹ️ macOS 上 `.dmg` **没有** `.sig` 是正常的。Tauri updater 只用 `.app.tar.gz` 做更新，所以只签名它。`.dmg` 仅供新用户首次下载安装。
>
> 上传到 GitHub Release 时需要 3 个文件：`.dmg`（新用户）+ `.app.tar.gz` + `.app.tar.gz.sig`（自动更新）。

如果同时构建了两种架构，会有 `_x64` 和 `_aarch64` 两组文件。

---

## 三、Windows 环境配置

### 3.1 安装 Visual Studio Build Tools

下载 https://visualstudio.microsoft.com/visual-cpp-build-tools/

安装时勾选：
- **"使用 C++ 的桌面开发"** 工作负载
- 确保包含 **MSVC v143** 和 **Windows 10/11 SDK**

### 3.2 安装 WebView2 Runtime

Windows 11 自带；Windows 10 需要手动装：
https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### 3.3 安装 Rust

PowerShell（管理员）：

```powershell
Invoke-WebRequest -Uri https://win.rustup.rs -OutFile rustup-init.exe
.\rustup-init.exe
rustup target add x86_64-pc-windows-msvc
```

### 3.4 安装 Node.js + pnpm

- 下载 Node.js LTS：https://nodejs.org
- 安装后 PowerShell 执行：`npm i -g pnpm`

### 3.5 配置签名环境变量

PowerShell（每次开新终端都要，或写入用户环境变量）：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $HOME\.tauri\easylink.key -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "你设置的密码"
```

**永久写入用户环境变量**（推荐）：

```powershell
[Environment]::SetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY", (Get-Content $HOME\.tauri\easylink.key -Raw), "User")
[Environment]::SetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY_PASSWORD", "你设置的密码", "User")
```

设完**关闭重开 PowerShell**才生效。

### 3.6 构建命令

```powershell
pnpm install
pnpm tauri build
```

### 3.7 产物位置

```
target\release\bundle\
├── nsis\EasyLink_1.0.0_x64-setup.exe
├── nsis\EasyLink_1.0.0_x64-setup.exe.sig
├── msi\EasyLink_1.0.0_x64_en-US.msi
└── msi\EasyLink_1.0.0_x64_en-US.msi.sig
```

### 3.8 Portable 版本（可选）

仓库提供了 `scripts/portable.mjs`，构建完后可生成绿色便携版：

```powershell
pnpm portable
```

---

## 四、Linux 环境配置（Ubuntu 22.04 / Debian 12 示例）

### 4.1 安装系统依赖

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

> Tauri v2 需要 `libwebkit2gtk-4.1`，老版本 `4.0` 不行。

### 4.2 安装 Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

### 4.3 安装 Node.js + pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pnpm
```

### 4.4 配置签名环境变量

写入 `~/.bashrc`：

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/easylink.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="你设置的密码"
```

然后 `source ~/.bashrc`。

### 4.5 构建命令

```bash
pnpm install
pnpm tauri build
```

### 4.6 产物位置

```
target/release/bundle/
├── deb/easylink_1.0.0_amd64.deb
├── deb/easylink_1.0.0_amd64.deb.sig
├── rpm/easylink-1.0.0-1.x86_64.rpm
├── rpm/easylink-1.0.0-1.x86_64.rpm.sig
├── appimage/easylink_1.0.0_amd64.AppImage
└── appimage/easylink_1.0.0_amd64.AppImage.sig
```

---

## 五、发版流程（每次发版）

### Step 1：改版本号

修改两个文件中的 `version`：

- `package.json`
- `src-tauri/tauri.conf.json`

三处版本号必须**完全一致**（macOS / Windows / Linux 构建时都读这两个）。

### Step 2：三平台分别构建

在 macOS / Windows / Linux 三台机器上分别执行：

```bash
pnpm install
pnpm tauri build
```

**验证是否签名成功**：产物目录里必须有 `.sig` 后缀文件。没有 = 环境变量没读到，停下来排查。

### Step 3：收集所有产物到一台机器

把三台机器构建出的所有 `.dmg` / `.exe` / `.msi` / `.deb` / `.AppImage` 以及对应的 `.sig` 文件汇总到一台机器（一般是你主用的 Mac）的一个目录。

### Step 4：在 GitHub 网页创建 Release

1. 打开 `https://github.com/LonelyFellas/easylink/releases/new`
2. **Choose a tag**: 输入 `v1.0.0` → Create new tag on publish
3. **Release title**: `v1.0.0`
4. **Describe this release**: 写更新日志（`scripts/updater.mjs` 会读取这段作为 release notes 显示给用户）
5. **Attach binaries**: 把 Step 3 收集的所有文件**全部拖到附件区**（安装包 + `.sig` 都要）
6. 点 **Publish release**

> ⚠️ Tag 格式必须是 `v1.0.0`（vX.Y.Z），`scripts/updater.mjs` 第 56 行的正则只认这种格式。

### Step 5：生成并上传 update.json

在仓库根目录执行：

```bash
export GITHUB_TOKEN="github_pat_xxxxx"          # 你的 PAT
export GITHUB_REPOSITORY="LonelyFellas/easylink"
node scripts/updater.mjs
```

脚本会自动：
- 通过 GitHub API 找到 `v1.0.0` 这个 release
- 读取所有 `.sig` 文件内容
- 生成 `update.json` 和 `update-proxy.json`
- 创建（或更新）一个固定 `updater` tag 的 release
- 把两个 json 上传上去

### Step 6：验证

浏览器直接访问：

```
https://github.com/LonelyFellas/easylink/releases/download/updater/update.json
```

应该能下载到一个 json 文件，内容形如：

```json
{
  "version": "v1.0.0",
  "notes": "更新日志...",
  "pub_date": "2026-05-31T...",
  "platforms": {
    "darwin-aarch64": {
      "signature": "...",
      "url": "https://github.com/LonelyFellas/easylink/releases/download/v1.0.0/EasyLink_1.0.0_aarch64.app.tar.gz"
    },
    "windows-x86_64": { ... },
    "linux-x86_64": { ... }
  }
}
```

**能直接下载 = updater 正常工作**。

### Step 7：客户端验证

装一个旧版本的 EasyLink，启动后看是否能检测到 v1.0.0 并提示升级。

---

## 六、常见问题

### Q：构建后没有 `.sig` 文件

签名环境变量没读到。检查：
- `TAURI_SIGNING_PRIVATE_KEY` 是不是私钥**文件的完整内容**（不是文件路径）
- 终端 `echo $TAURI_SIGNING_PRIVATE_KEY` 看是不是非空
- Windows 上是不是开了新 PowerShell 后才生效

### Q：客户端检测更新报 "signature verification failed"

`tauri.conf.json` 里的 `pubkey` 和打包时用的私钥不是一对。检查：
- 是不是三平台用了同一把私钥
- `tauri.conf.json` 的 `pubkey` 是不是最新公钥的 base64

### Q：客户端检测更新返回 404

- 仓库不是 Public → 设成 Public
- `updater` tag 的 release 不存在 → 重跑 Step 5
- endpoints 写错 → 检查 `tauri.conf.json` 的 endpoints

### Q：`scripts/updater.mjs` 报 `GITHUB_TOKEN is required`

环境变量没设。`export GITHUB_TOKEN=xxx` 后再跑。

### Q：Mac 用户安装时提示 "已损坏，无法打开"

没做苹果开发者签名 + 公证。用户需要执行：

```bash
sudo xattr -dr com.apple.quarantine /Applications/EasyLink.app
```

或者你买苹果开发者账号（$99/年）做正式签名。

---

## 七、跨平台构建快捷方案

如果不想准备三台真机：

| 方案 | 说明 |
|---|---|
| **Parallels / VMware** | Mac 装 Windows / Linux 虚拟机 |
| **OrbStack** | Mac 上轻量级 Linux 容器，适合构建 Linux 包 |
| **远程机器** | 租个云服务器（Windows / Linux）远程构建 |
| **GitHub Actions** | 改回路径 1，让 Actions 帮你构建三平台 |

如果发版频率高，**强烈建议改回 GitHub Actions**，本地构建三平台维护成本很高。

