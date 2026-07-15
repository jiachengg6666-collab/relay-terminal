# Relay Terminal

Relay Terminal 是一个基于 Electron、React、TypeScript、xterm.js 和 node-pty 的跨平台 AI 终端。AI 默认关闭；关闭时它就是普通 PTY 终端，不会调用任何模型接口。

开启单个标签页的 AI 后，可以直接输入自然语言或明显无法解析的命令。原输入会在当前提示符逐字消失，模型生成的低/中风险命令会原地回填，等待用户确认后执行。有效 Shell 命令仍按正常终端方式直接执行。

## 功能

- Windows PowerShell 7、macOS/Linux Bash 与 Zsh Shell integration
- 多标签、终端搜索、深浅主题、字号缩放、复制粘贴
- 每个标签页独立开启 AI 并选择模型配置
- 自然语言生成命令、未知命令预纠正、失败命令自动分析
- DeepSeek、通义千问/DashScope、豆包/火山方舟和 OpenAI-compatible 接口
- 本地风险分级、敏感信息遮蔽、高风险命令二次确认
- Electron `safeStorage` 加密 API Key，渲染进程不接触密钥

## 快速开始

需要 Node.js 22 或更高版本。

```sh
npm ci
npm run dev
```

常用命令：

```sh
npm test          # 单元测试
npm run test:e2e # Electron 端到端测试
npm run build     # 类型检查并构建
npm run package   # 生成当前平台的解压版应用
npm run dist      # 生成当前平台安装包
```

Windows、macOS、Linux 的完整安装、运行和打包说明见 [跨平台使用指南](docs/platform-guide.zh-CN.md)。

## AI 使用方式

1. 打开设置，新增模型配置并填写提供方、接口地址、模型名和原始 API Key。
2. 测试连接并保存配置。
3. 在目标终端标签页开启 `AI on`；AI 开关和模型选择只影响当前标签页。
4. 直接输入命令或自然语言。也可以按 `Ctrl/Cmd+Shift+G` 插入 `/ai ` 前缀。
5. 检查回填命令、解释和风险等级，确认无误后按 Enter 执行。

模型生成的命令不会自动执行。高风险命令不会自动回填，必须在提示浮层中手动确认插入。

## 安全边界

- AI 关闭时不缓存 AI 输出、不发起模型请求，并取消该会话中的未完成请求。
- 仅发送当前 Shell、系统、工作目录、用户意图，或失败命令的有限上下文。
- 失败输出最多保留最后 200 行或 32 KB，发送前会遮蔽常见密钥、密码、凭据 URL 和私钥。
- API Key 和模型原始响应不写入应用日志。
- 风险检测和脱敏属于纵深防护，不能替代人工检查。执行前仍应核对最终命令和模型端点。

## 当前边界

首版不支持 CMD、WSL 深度集成、连续对话、多步代理、分屏、会话恢复、配置同步或遥测。其他 Shell 可以作为基础 PTY 使用，但不保证自动获取退出码和失败纠错。

应用目前未配置代码签名和 macOS 公证。自行构建的安装包只适合开发、测试或内部使用。
