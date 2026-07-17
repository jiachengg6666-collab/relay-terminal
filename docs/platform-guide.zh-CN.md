# Relay Terminal 安装、构建与使用指南

本指南面向从 GitHub 获取 Relay Terminal 的用户和贡献者，介绍 Windows、macOS 和 Linux 上的源码安装、本机打包、模型配置、安全边界与常见问题。

Relay Terminal 当前是预览版，尚未提供经过代码签名和 macOS 公证的安装包。从源码构建适合开发、评估和内部使用。

## 1. 安装前准备

所有平台都需要：

- Node.js 22 或更高版本，建议使用 Node.js 22 LTS
- npm 10 或更高版本
- 用于下载 npm 依赖和 Electron 运行时的网络
- 当 node-pty 没有匹配预构建文件时，需要当前平台的 C/C++ 构建工具

只有使用 AI 功能时才需要模型服务的 API Key。AI 默认关闭，不配置模型也可以将应用作为普通终端使用。

## 2. 从源码运行

克隆仓库并安装锁定版本的依赖：

```sh
git clone https://github.com/jiachengg6666-collab/relay-terminal.git
cd relay-terminal
npm ci
```

启动开发版：

```sh
npm run dev
```

构建当前平台可直接运行的解压版应用：

```sh
npm run package
```

生成当前平台配置的安装介质：

```sh
npm run dist
```

典型输出位置：

| 平台 | `npm run package` | `npm run dist` |
| --- | --- | --- |
| Windows | `release/win-unpacked/Relay Terminal.exe` | NSIS 安装包 |
| macOS | `release/mac*/Relay Terminal.app` | DMG 和 ZIP |
| Linux | `release/linux-unpacked/` | AppImage 和 DEB |

请勿将 `node_modules/`、`release/`、本地应用数据、终端历史或 API Key 提交到 Git。

## 3. Windows

### 支持范围

- 推荐 Windows 10/11 x64
- 推荐 PowerShell 7 (`pwsh.exe`)
- 未安装 PowerShell 7 时会尝试使用 Windows PowerShell
- 当前不支持 CMD 和 WSL 深度集成

安装 PowerShell 7 后重新打开 Relay Terminal，应用会在启动时自动发现可用 Shell。

### 构建工具

在 PowerShell 中执行：

```powershell
npm ci
npm run dev
```

如果 node-pty 需要本机编译，请安装 Visual Studio 2022 Build Tools，并确认包含：

- MSVC v143 C++ x64/x86 build tools
- Windows 10 或 Windows 11 SDK
- MSVC v143 C++ x64/x86 Spectre-mitigated libs

遇到 `MSB8040` 时，通常缺少 Spectre 缓解库。安装对应组件后，关闭旧终端并重新执行 `npm ci`。

### 签名和密钥存储

API Key 通过 Windows DPAPI 支持的 Electron `safeStorage` 加密。项目尚未配置 Authenticode 签名，本地构建或第三方分发的可执行文件可能显示 SmartScreen 警告。不要运行来源不明的构建。

## 4. macOS

### 支持范围

- 支持 Intel 和 Apple Silicon；默认构建当前机器架构
- macOS 默认 Zsh 可直接使用
- 同时支持 Bash

安装 Xcode Command Line Tools：

```sh
xcode-select --install
```

然后执行：

```sh
npm ci
npm run dev
```

### Shell integration

Relay Terminal 通过独立 `ZDOTDIR` 加载 Zsh integration，并会先读取用户的 `~/.zshrc`。应用不会修改 `~/.zshrc`。Bash integration 同样通过应用自己的启动文件加载。

Zsh 集成支持：

- 上、下方向键浏览 Shell 历史
- Backspace 编辑当前未执行输入
- 命令开始、退出码和工作目录标记
- 独立的输入清理 widget

### 窗口与签名

macOS 上可以通过顶部品牌或空白区域拖动窗口，系统交通灯按钮保留独立安全区。

API Key 由 macOS Keychain 支持的 Electron `safeStorage` 加密。项目尚未配置 Apple Developer ID 签名、Hardened Runtime 和公证。本地构建可用于开发测试；对外分发前应完成签名和公证。

## 5. Linux

### 支持范围

- 支持 Bash 和 Zsh
- 推荐带桌面环境的主流 x64 Linux 发行版
- 其他 Shell 可作为基础 PTY 使用，但不保证命令边界和退出码采集

Debian/Ubuntu 通常需要基础编译工具和 Electron 运行库。包名会随发行版变化，常见依赖包括：

```sh
sudo apt update
sudo apt install build-essential python3 make g++ libgtk-3-0 libnss3 libxss1 libsecret-1-0
```

较新 Ubuntu 可能使用 `libasound2t64`，较旧版本使用 `libasound2`。请按当前发行版的包管理器提示选择。

```sh
npm ci
npm run dev
```

Zsh integration 使用应用内的独立配置目录；Bash 使用 `--rcfile`。它们不会覆盖用户原有的 Shell 配置文件。

Linux 上的持久密钥加密依赖 Secret Service，例如 GNOME Keyring 或 KWallet。如果 Electron 只能使用 `basic_text` 后端，Relay Terminal 会拒绝明文持久化 API Key，只在当前进程内保存，并在界面中显示警告。

不建议用 `--no-sandbox` 作为长期解决方案。AppImage 启动失败时，应优先检查 unprivileged user namespace、FUSE 和 Electron 沙箱配置。

## 6. 配置 AI 模型

在设置中新建命名配置。内置默认值如下：

| 提供方 | Base URL | 默认模型 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| 通义千问/DashScope | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 豆包/火山方舟 | `https://ark.cn-beijing.volces.com/api/v3` | 填写推理接入点或模型 ID |
| OpenAI-compatible | 由服务方提供 | 由服务方提供 |

Base URL 可以填写 API 版本根路径，也可以直接填写以 `/chat/completions` 结尾的完整地址。应用会在需要时自动补全 `/chat/completions`。

API Key 必须是服务商生成的原始、可打印 ASCII 字符串。不要粘贴控制台中带 `••••` 的掩码值。

建议步骤：

1. 选择提供方并核对 Base URL。
2. 填写精确的模型名或部署 ID。
3. 粘贴原始 API Key。
4. 先测试连接，再保存配置。
5. 在目标标签页开启 `AI on`。

## 7. 终端与 AI 交互

### 普通命令

AI 关闭或开启时，可执行的 Shell 命令都会正常发送给当前 Shell。使用上、下方向键浏览命令历史，使用 Backspace 修改还未执行的输入。

命令历史由所选 Shell 原生管理。PowerShell 使用 PSReadLine 的历史文件，Bash 和 Zsh 保持各自的历史行为。关闭 Relay Terminal 标签页不会删除 Shell 命令历史。

### 自然语言与未知命令

AI 开启后，可以直接输入自然语言，也可以用 `/ai ` 前缀明确请求生成命令。原输入会从当前提示符清除，然后回填低风险或中风险建议。

建议只回填，不会自动发送 Enter。高风险建议保留在审查浮层中，必须由用户手动确认插入。

如果命令存在，但因参数、权限、网络或目标文件导致非零退出，Shell 必须先执行才能得知结果。此时应用会截取有限输出，脱敏后请求纠错建议。

AI 开启期间，每个标签页会在主进程内存中维护独立的短期上下文，包括近期用户意图、AI 建议、已执行命令、工作目录、退出码和受限输出。后续请求可以引用同一标签页中的前序操作，但不会读取其他标签页的上下文。关闭 AI、切换模型配置、关闭标签页或 Shell 退出时会立即清空该上下文，不会写入磁盘，也不会清除 Shell 自己的命令历史。

### 快捷键

| 操作 | macOS | Windows/Linux |
| --- | --- | --- |
| 插入 `/ai ` | `Cmd+Shift+G` | `Ctrl+Shift+G` |
| 终端搜索 | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| 复制选区 | `Cmd+Shift+C` | `Ctrl+Shift+C` |
| 粘贴 | `Cmd+Shift+V` | `Ctrl+Shift+V` |
| 上一条/下一条命令 | `Up` / `Down` | `Up` / `Down` |

AI 开关和临时上下文均按标签页隔离。关闭 AI 会取消该标签页尚未完成的模型请求并清空上下文，不影响其他标签页。

## 8. 数据与安全边界

- AI 关闭时不发起模型请求，并取消该会话未完成的请求。
- 只向模型发送有限的 Shell、系统、工作目录、用户意图、AI 建议、失败命令或当前标签页命令上下文。
- 临时 AI 上下文最多保留 12 条近期记录、200 行和 32 KB，写入内存前会脱敏，并且不会持久化到磁盘。
- 关闭 AI、切换模型、关闭标签页或 Shell 退出会清空对应的临时 AI 上下文，但不会删除 Shell 原生命令历史或影响其他标签页。
- 失败输出最多保留最后 200 行或 32 KB，发送前会遮蔽常见密钥、密码、凭据 URL 和私钥。
- API Key 和模型原始响应不写入应用日志。
- 模型生成的命令不会自动执行。
- 风险检测和脱敏属于纵深防护，不能替代人工核对最终命令和模型端点。

## 9. 常见问题

### `npm ci` 后 Electron 运行时下载失败

首先检查代理、DNS、企业 CA 和 GitHub/Electron 下载地址的访问情况。如果网络使用 TLS 检查，应将可信 CA 正确提供给 Node.js，而不是全局关闭 TLS 校验。

不建议使用 `NODE_TLS_REJECT_UNAUTHORIZED=0` 作为长期解决方案。

### AI 开启后自然语言仍被 Shell 执行

确认当前标签页显示 `AI on`，已选择含有效 API Key 的模型配置，并使用的是最新构建。源码更新后需要重新执行 `npm run package`，关闭旧进程再打开新构建。

### 模型返回 401、403 或 404

- 401：检查 API Key 是否正确且未过期
- 403：检查账号权限、区域、余额或模型授权
- 404：检查 Base URL 和模型名，避免重复填写 `/chat/completions`

### 模型连接超时

检查代理、防火墙、DNS 和服务区域。可以在配置中调高超时时间，可用范围为 5 到 120 秒。

### Linux 重启后 API Key 消失

安装并解锁 GNOME Keyring、KWallet 或其他 Secret Service。应用检测到 `basic_text` 后端时只允许会话内密钥，这是预期的安全行为。

### Shell integration 或命令历史异常

确认使用 PowerShell、Bash 或 Zsh，并使用最新构建。用户 Shell 中的交互式插件、多行编辑、自定义键位或提示符框架可能影响命令边界。其他 Shell 只保证基础 PTY 功能。

### macOS 窗口不能拖动或交通灯遮挡内容

更新到最新源码并重新执行 `npm run package`。顶部品牌和空白区域是可拖动区，标签页、按钮和选择器保持可交互。

## 10. 开发者验证

提交改动前建议执行：

```sh
npm audit --audit-level=high
npm test
npm run build
npm run test:e2e
npm run smoke:pty:node
npm run package
```

涉及 Shell integration 时，应在目标平台验证成功命令、失败命令、命令历史、未执行输入编辑、管道、多行输入和用户中断。

涉及 UI 时，应验证默认尺寸和 `760 x 520` 最小窗口，确保 macOS 交通灯、标签页、工具栏和终端不重叠。

## 11. 发布前要求

仓库 CI 会在 Windows、macOS 和 Linux 上执行安装、单元测试、构建、Electron E2E 和解压版打包。面向公众发布前还需要：

- Windows Authenticode 签名
- macOS Developer ID、Hardened Runtime 和公证
- Linux 包签名与发行版兼容性验证
- 各平台真实设备冒烟测试
- GitHub Release 版本号、变更记录和校验和

问题、功能建议和贡献流程请参阅仓库的 [CONTRIBUTING.md](../CONTRIBUTING.md)。安全漏洞请按 [SECURITY.md](../SECURITY.md) 使用 GitHub 私密安全报告，不要创建公开 Issue。
