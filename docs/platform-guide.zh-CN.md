# Relay Terminal 跨平台使用指南

本文说明如何在 Windows、macOS 和 Linux 上开发、运行和打包 Relay Terminal，以及不同平台的 Shell integration、安全存储和常见问题。

## 1. 共同要求

- Node.js 22 或更高版本，建议使用当前 Node.js 22 LTS
- npm 10 或更高版本
- 可访问所选大模型接口的网络
- DeepSeek、DashScope、火山方舟或 OpenAI-compatible 服务的有效 API Key

克隆项目后，先安装锁定版本的依赖：

```sh
npm ci
```

开发启动：

```sh
npm run dev
```

构建与验证：

```sh
npm test
npm run build
```

`npm run package` 生成当前系统的解压版应用，`npm run dist` 生成当前系统配置的安装包。不要把 `release/`、`node_modules/` 或本地应用数据提交到 Git。

## 2. Windows

### 2.1 支持范围

- 推荐 Windows 10/11 x64
- 推荐 PowerShell 7 (`pwsh.exe`)
- 未安装 PowerShell 7 时，会尝试使用 Windows PowerShell
- CMD 和 WSL 深度集成暂不支持

安装 PowerShell 7 后重新打开 Relay Terminal，应用会在启动时自动发现可用 Shell。

### 2.2 开发运行

在 PowerShell 中执行：

```powershell
npm ci
npm run dev
```

如果 `node-pty` 需要在本机编译，安装 Visual Studio 2022 Build Tools，并在“使用 C++ 的桌面开发”或“单个组件”中确认存在：

- MSVC v143 C++ x64/x86 build tools
- Windows 10 或 Windows 11 SDK
- MSVC v143 C++ x64/x86 Spectre-mitigated libs

遇到 `MSB8040` 时，缺少的是最后一项 Spectre 缓解库。安装后关闭旧终端，重新执行 `npm ci`。

### 2.3 打包与启动

```powershell
npm run package
```

解压版入口：

```text
release\win-unpacked\Relay Terminal.exe
```

生成 NSIS 安装包：

```powershell
npm run dist
```

API Key 通过 Windows DPAPI 支持的 Electron `safeStorage` 加密保存。当前项目未配置 Authenticode 签名，因此下载或分发的构建可能显示 Windows SmartScreen 警告。

## 3. macOS

### 3.1 支持范围

- 支持 Intel 和 Apple Silicon；默认构建当前机器架构
- macOS 默认 Zsh 可直接使用
- 同时支持 Bash

先安装 Xcode Command Line Tools：

```sh
xcode-select --install
```

### 3.2 开发运行

```sh
npm ci
npm run dev
```

应用通过独立 `ZDOTDIR` 注入 Zsh integration，不会修改用户的 `~/.zshrc`。Bash integration 同样通过应用自己的启动文件加载。

### 3.3 打包与启动

```sh
npm run package
```

解压版通常位于 `release/mac*/Relay Terminal.app`。生成 DMG 和 ZIP：

```sh
npm run dist
```

API Key 由 macOS Keychain 支持的 Electron `safeStorage` 加密。当前项目没有 Apple Developer ID 签名和公证配置；本机构建可用于开发测试，对外分发前应配置签名、公证和 Hardened Runtime。

## 4. Linux

### 4.1 支持范围

- 支持 Bash 和 Zsh
- 推荐带桌面环境的主流 x64 Linux 发行版
- 其他 Shell 可作为基础 PTY 使用，但不保证命令边界和退出码采集

Debian/Ubuntu 系通常需要基础编译工具和 Electron 运行库。包名会随发行版版本变化，常见依赖包括：

```sh
sudo apt update
sudo apt install build-essential python3 make g++ libgtk-3-0 libnss3 libxss1 libsecret-1-0
```

较新的 Ubuntu 可能使用 `libasound2t64`，较旧版本使用 `libasound2`。请按包管理器提示选择当前发行版提供的版本。

### 4.2 开发运行

```sh
npm ci
npm run dev
```

Zsh integration 使用应用内独立配置目录；Bash 使用 `--rcfile`。它们不会覆盖用户原有的 Shell 配置文件。

### 4.3 打包与启动

```sh
npm run package
```

解压版通常位于 `release/linux-unpacked/`。生成 AppImage 和 DEB：

```sh
npm run dist
```

Linux 上的持久密钥加密依赖 Secret Service，例如 GNOME Keyring 或 KWallet。如果 Electron 只能使用 `basic_text` 后端，Relay Terminal 会拒绝明文持久化 API Key，只在当前进程内保存，并在界面中显示警告；退出应用后需要重新填写。

不建议用 `--no-sandbox` 作为长期解决方案。AppImage 启动失败时，应优先检查发行版的 unprivileged user namespace、FUSE 和 Electron 沙箱配置。

## 5. 配置模型

在设置中新增命名配置。内置默认值如下：

| 提供方 | Base URL | 默认模型 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| 通义千问/DashScope | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 豆包/火山方舟 | `https://ark.cn-beijing.volces.com/api/v3` | 填写推理接入点或模型 ID |
| OpenAI-compatible | 由服务方提供 | 由服务方提供 |

Base URL 可以填写到 API 版本根路径，也可以直接填写以 `/chat/completions` 结尾的完整地址。应用会自动补全 `/chat/completions`。

API Key 必须粘贴原始、可打印 ASCII 字符串。不要粘贴控制台中带 `••••` 的掩码值，否则会出现 ByteString 或不支持字符错误。

## 6. 终端交互

### 普通命令

AI 开启不改变正常终端使用方式。可以执行的命令直接发送给当前 Shell：

```powershell
Get-ChildItem E:\work
Test-Path E:\work
git status
```

### 自然语言与未知命令

直接输入自然语言，例如：

```text
找E盘里是否有work文件夹
```

原文字会在当前提示符逐字消失，随后回填类似命令：

```powershell
Test-Path -Path 'E:\work'
```

明显不存在的命令名也会在进入 Shell 前交给 AI。低/中风险建议只回填、不自动按 Enter；高风险建议保留在浮层中，必须手动确认插入。

如果命令本身存在但参数、权限、网络或目标文件导致非零退出，Shell 必须先执行才能知道结果。此时应用会在失败后截取有限输出并请求纠错建议。

### 快捷键

- `Ctrl+Shift+G`：Windows/Linux 插入 `/ai `
- `Cmd+Shift+G`：macOS 插入 `/ai `
- `Ctrl/Cmd+Shift+F`：终端搜索
- `Ctrl/Cmd+Shift+C`：复制选区
- `Ctrl/Cmd+Shift+V`：粘贴

AI 开关按标签页隔离。关闭 AI 会取消该标签页尚未完成的模型请求，其他标签页不受影响。

## 7. 常见问题

### AI 开启后自然语言仍被 Shell 执行

确认运行的是最新构建，重新执行 `npm run package` 后关闭旧进程再启动。检查当前标签页是否显示 `AI on`，并确认已选择带有效 API Key 的模型配置。

### 模型返回 401、403 或 404

- 401：检查 API Key 是否正确且未过期
- 403：检查账号权限、区域、余额或模型授权
- 404：检查 Base URL 和模型名；Base URL 不要重复填写 `/chat/completions`

### 模型连接超时

检查代理、防火墙、DNS 和服务区域。可以在配置中提高超时时间，但允许范围被限制在 5 到 120 秒。

### Linux 重启后 API Key 消失

安装并解锁 GNOME Keyring、KWallet 或其他 Secret Service。应用检测到 `basic_text` 后端时只允许会话内密钥，这是预期的安全行为。

### Shell integration 不工作

确认使用的是 PowerShell、Bash 或 Zsh。交互式程序、多行编辑和自定义键绑定可能影响命令边界；其他 Shell 仅保证基础 PTY 功能。

## 8. CI 与发布

仓库的 GitHub Actions 会在 Windows、macOS 和 Linux 上执行安装、单元测试、构建、Electron E2E 和解压版打包。正式公开分发前还需要补充：

- Windows Authenticode 签名
- macOS Developer ID、Hardened Runtime 和公证
- 各平台安装包的真实设备冒烟测试
- GitHub Release 版本号、变更记录和校验和
