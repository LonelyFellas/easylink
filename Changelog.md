## v1.1.5

### 🐞 修复问题

- 修复部分用户启动后「当前节点」显示「暂无激活的代理节点」、代理模式提示「内核通信错误」、无法连接的问题。根因是分流规则用到 `GEOSITE,cn` / `GEOIP,CN`，依赖 `geosite.dat` / `geoip.dat` / `Country.mmdb` 三份地理数据；当安装包未包含这些数据时，内核会尝试联网下载并超时，导致配置校验失败、内核无法就绪。现已确保发布包必定带齐地理数据，并在缺失时给出明确日志。

<details>
<summary><strong> 🚀 优化改进 </strong></summary>

- 构建期增加地理数据校验门禁：正式构建若缺少 `geosite.dat` / `geoip.dat` / `Country.mmdb` 将直接失败，杜绝发出缺数据的残缺安装包
- 内核 IPC 通道改用应用专属命名，避免与其他基于同内核的客户端（如 Clash Verge）抢占同一通信通道而互相干扰

</details>

## v1.1.1

### 🐞 修复问题

- 原生右键菜单（reload / 打开控制台）改为仅在生产环境禁用，开发环境保留以便调试

<details>
<summary><strong> ✨ 新增功能 </strong></summary>

- 「当前节点」卡片新增刷新节点按钮：一键拉取并激活最新个人节点
- 刷新个人详情时一并刷新个人节点（详情接口直接携带节点返回）

</details>

<details>
<summary><strong> 🚀 优化改进 </strong></summary>

- 节点接口异常时不再影响用户详情加载（节点拉取做成非致命）

</details>

## v1.1.0

### 🐞 修复问题

- 禁用首页原生右键菜单：不再弹出 reload / 打开控制台等菜单（输入框等可编辑区域的右键保留，方便复制粘贴）

<details>
<summary><strong> ✨ 新增功能 </strong></summary>

- 新增版本更新提示：检测到新版本时，左下角浮起提示卡片，点击即可查看更新详情并安装

</details>

<details>
<summary><strong> 🚀 优化改进 </strong></summary>

- 更新品牌 Logo，首页与登录页改用文字版 Logo
- 精简「当前节点」卡片：隐藏代理跳转按钮与节点协议 / 特性标签，界面更清爽

</details>

## v1.0.2

### 🐞 修复问题

- 修复应用内更新下载 403：更新源改为 GitHub 直链优先，第三方代理降级为备用
- 安装包名称去除空格（`Easy Link` → `EasyLink`），规避代理对 `%20` 路径的拦截

### ⚠️ 升级提示

- macOS 用户：由于应用包名由 `Easy Link.app` 调整为 `EasyLink.app`，本次自动更新可能失败一次，请手动下载安装最新版本，之后即可正常自动更新。

</details>

## v2.5.1

### 🐞 修复问题

- 备份设置功能异常
- 修复 Windows 节点交互异常 

</details>
