# 参与贡献

感谢参与 Relay Terminal。提交改动前，请先确认问题范围清晰，并避免把真实 API Key、终端历史、构建产物或本地配置提交到仓库。

## 开发环境

- Node.js 22 或更高版本
- Windows 推荐 PowerShell 7
- macOS/Linux 使用 Bash 或 Zsh
- 当前平台需要能够运行 Electron 和 node-pty

安装依赖并启动开发环境：

```sh
npm ci
npm run dev
```

## 分支与提交

从最新的 `main` 创建短生命周期分支。提交应按功能或模块拆分，使用清晰、可回滚的消息，例如：

```text
fix(terminal): preserve input after cursor movement
feat(ai): add provider timeout validation
docs: clarify Linux secret storage
```

不要在同一提交中混入无关格式化、生成文件或依赖更新。

## 提交前检查

```sh
npm audit --audit-level=high
npm test
npm run build
npm run test:e2e
npm run package
```

涉及 Shell integration 时，应在对应平台验证成功命令、失败命令、管道、多行输入和用户中断。涉及 AI 时，应验证 AI 关闭时零模型请求、建议不会自动执行、高风险命令需要确认、跨标签页请求不会串线。

## Pull Request

PR 描述应说明：

- 改动内容和原因
- 用户可见影响
- 风险、兼容性和安全影响
- 已执行的测试
- 尚未验证的平台或边界

UI 改动请附桌面和窄窗口截图。破坏性变更应先通过 Issue 讨论。

## 安全问题

不要用公开 Issue 报告漏洞。请按照 [SECURITY.md](SECURITY.md) 使用 GitHub 私密安全报告。
