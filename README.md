# Relay Terminal

[![CI](https://github.com/jiachengg6666-collab/relay-terminal/actions/workflows/ci.yml/badge.svg)](https://github.com/jiachengg6666-collab/relay-terminal/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Status: Preview](https://img.shields.io/badge/status-preview-orange.svg)](#project-status)

Relay Terminal is a cross-platform terminal with optional AI command assistance. It is built with Electron, React, TypeScript, xterm.js, and node-pty.

Chinese documentation: [安装、构建与使用指南](docs/platform-guide.zh-CN.md)

AI is disabled by default. With AI off, Relay Terminal behaves like a regular PTY terminal and makes no model requests. With AI enabled for a tab, natural-language input and failed commands can be converted into shell commands for review before execution.

## Highlights

- Real PowerShell, Zsh, and Bash sessions backed by node-pty
- Multiple tabs, terminal search, themes, font scaling, clipboard support, and command history
- Per-tab AI enablement and provider selection
- Natural-language command generation, unknown-command correction, and failed-command analysis
- DeepSeek, DashScope, Volcengine Ark, and OpenAI-compatible endpoints
- Local risk classification, output redaction, and explicit confirmation for high-risk commands
- API key encryption through Electron `safeStorage`

## Platform Support

| Platform | Recommended shell | Support |
| --- | --- | --- |
| Windows 10/11 | PowerShell 7 | Supported; Windows PowerShell is used as a fallback |
| macOS, Intel or Apple Silicon | Zsh | Supported; Bash is also available |
| Desktop Linux | Bash or Zsh | Supported on common x64 distributions |

CMD and deep WSL integration are not currently supported. Other shells can be used as basic PTY sessions, but command boundaries and exit-code reporting are not guaranteed.

## Install From Source

Relay Terminal is currently distributed as a preview source build. Officially signed and notarized installers are not available yet.

Requirements:

- Node.js 22 or later
- npm 10 or later
- Platform build tools when node-pty cannot use a prebuilt binary

```sh
git clone https://github.com/jiachengg6666-collab/relay-terminal.git
cd relay-terminal
npm ci
npm run dev
```

To create a standalone application for the current platform:

```sh
npm run package
```

The unpacked application is written under `release/`:

| Platform | Typical output |
| --- | --- |
| Windows | `release/win-unpacked/Relay Terminal.exe` |
| macOS | `release/mac*/Relay Terminal.app` |
| Linux | `release/linux-unpacked/` |

See the [installation, build, and usage guide](docs/platform-guide.zh-CN.md) for platform prerequisites, installer generation, and troubleshooting.

## Use Relay Terminal

### As a regular terminal

Open a tab, select an available shell, and enter commands normally. Up and Down navigate shell history; Backspace edits the current line. AI remains inactive until it is explicitly enabled for that tab.

Command history remains owned by the selected shell. PowerShell uses its normal PSReadLine history file, while Bash and Zsh keep their native history behavior. Closing a Relay Terminal tab does not delete shell command history.

### With AI assistance

1. Open Settings and add a model profile.
2. Enter the provider, base URL, model name, and original API key.
3. Test and save the profile.
4. Enable `AI on` in the target tab and select the profile.
5. Enter a command or a natural-language request.
6. Review the generated command and risk level before pressing Enter.

Low- and medium-risk suggestions are inserted into the prompt but are never executed automatically. High-risk suggestions remain in the review popover until the user explicitly inserts them.

While AI is enabled, each tab keeps a small temporary context of its recent commands, working directories, exit codes, and limited output. This context helps the model understand follow-up intent. It stays in main-process memory only, is isolated between tabs, and is cleared when AI is disabled, the tab closes, or the shell exits.

## Provider Defaults

| Provider | Default base URL | Default model |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| DashScope | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Volcengine Ark | `https://ark.cn-beijing.volces.com/api/v3` | Deployment or model ID required |
| OpenAI-compatible | Provider-defined | Provider-defined |

## Shortcuts

| Action | macOS | Windows/Linux |
| --- | --- | --- |
| Insert `/ai ` | `Cmd+Shift+G` | `Ctrl+Shift+G` |
| Search terminal | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| Copy selection | `Cmd+Shift+C` | `Ctrl+Shift+C` |
| Paste | `Cmd+Shift+V` | `Ctrl+Shift+V` |
| Previous/next command | `Up` / `Down` | `Up` / `Down` |

## Security And Privacy

- AI-off tabs do not issue model requests and cancel in-flight requests when disabled.
- Model requests contain only limited shell, platform, working-directory, user-input, failed-command, or current-tab command context.
- Temporary AI context is capped at 12 recent entries, 200 lines, and 32 KB; it is redacted before retention and never written to disk.
- Disabling AI or closing a tab clears its temporary AI context without deleting the shell's native command history.
- Failed output is limited to the last 200 lines or 32 KB and redacted before transmission.
- API keys and raw model responses are not written to application logs.
- API keys are encrypted by Windows DPAPI or macOS Keychain through Electron `safeStorage`.
- Linux persistence requires a Secret Service backend such as GNOME Keyring or KWallet. Relay Terminal refuses plaintext persistence when only `basic_text` storage is available.

Risk detection and redaction are defense-in-depth controls, not a replacement for reviewing commands and model endpoints.

## Project Status

Relay Terminal is a preview release intended for development, evaluation, and internal use. The project does not currently provide code-signed Windows binaries, Apple Developer ID signing or notarization, or signed Linux packages.

The first release does not include split panes, session restoration, configuration sync, telemetry, continuous conversation, or multi-step agents.

## Development

```sh
npm test
npm run build
npm run test:e2e
npm run smoke:pty:node
npm run package
```

Do not commit `node_modules/`, `release/`, application data, terminal history, or API keys.

## Documentation

- [Installation, build, and usage guide](docs/platform-guide.zh-CN.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [MIT License](LICENSE)

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Security issues should be reported privately according to [SECURITY.md](SECURITY.md), not through a public issue.
