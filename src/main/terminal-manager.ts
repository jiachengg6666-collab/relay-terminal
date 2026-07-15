import * as pty from 'node-pty';
import type {
  CommandFinishedEvent,
  NaturalLanguageEvent,
  ShellProfile,
  TerminalCreateOptions,
  TerminalCwdEvent,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalPromptStateEvent,
  TerminalSession,
} from '../shared/types';
import { limitOutput, stripAnsi } from './security/redaction';
import { integrationLaunchConfig, ShellIntegrationParser } from './shell-integration';
import { classifyTerminalInput } from './natural-language';

interface TerminalCallbacks {
  onData(event: TerminalDataEvent): void;
  onExit(event: TerminalExitEvent): void;
  onCwd(event: TerminalCwdEvent): void;
  onPromptState(event: TerminalPromptStateEvent): void;
  onNaturalLanguage(event: NaturalLanguageEvent): void;
  onCommandFinished(event: CommandFinishedEvent): void;
}

interface SessionState {
  session: TerminalSession;
  pty: pty.IPty;
  parser: ShellIntegrationParser;
  inputLine: string;
  currentCommand: string;
  commandOutput: string;
  commandRunning: boolean;
  interrupted: boolean;
  inputAnimation?: ReturnType<typeof setTimeout>;
  inputLocked: boolean;
}

function processEnvironment(overrides: Record<string, string>): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') environment[key] = value;
  }
  const merged = { ...environment, ...overrides };
  const hasLocale = [merged.LC_ALL, merged.LC_CTYPE, merged.LANG]
    .some((value) => Boolean(value?.trim()));
  if (process.platform === 'darwin' && !hasLocale) merged.LANG = 'en_US.UTF-8';
  return { ...merged, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
}

export class TerminalManager {
  private sessions = new Map<string, SessionState>();

  constructor(
    private readonly shells: ShellProfile[],
    private readonly integrationDirectory: string,
    private readonly callbacks: TerminalCallbacks,
    private readonly onSessionDisabled: (sessionId: string) => void,
    private readonly isKnownProviderProfile: (profileId: string) => boolean,
  ) {}

  create(options: TerminalCreateOptions): TerminalSession {
    if (this.sessions.has(options.sessionId)) throw new Error('Terminal session already exists.');
    const shell = this.shells.find((candidate) => candidate.id === options.shellProfileId && candidate.available);
    if (!shell) throw new Error('The selected shell is not available.');

    const launch = shell.integration
      ? integrationLaunchConfig(shell.kind, shell.args, this.integrationDirectory)
      : { args: shell.args, env: {} };
    const cwd = options.cwd || process.env.USERPROFILE || process.env.HOME || process.cwd();
    const terminalPty = pty.spawn(shell.path, launch.args, {
      name: 'xterm-256color',
      cols: Math.max(options.cols, 2),
      rows: Math.max(options.rows, 1),
      cwd,
      env: processEnvironment(launch.env),
      useConpty: process.platform === 'win32',
    });

    const session: TerminalSession = {
      id: options.sessionId,
      title: shell.name,
      shellProfileId: shell.id,
      shellKind: shell.kind,
      cwd,
      aiEnabled: false,
    };
    const state: SessionState = {
      session,
      pty: terminalPty,
      parser: new ShellIntegrationParser(),
      inputLine: '',
      currentCommand: '',
      commandOutput: '',
      commandRunning: false,
      interrupted: false,
      inputLocked: false,
    };
    this.sessions.set(session.id, state);

    terminalPty.onData((data) => this.handlePtyData(state, data));
    terminalPty.onExit(({ exitCode, signal }) => {
      this.callbacks.onExit({ sessionId: session.id, exitCode, signal });
      this.sessions.delete(session.id);
      this.onSessionDisabled(session.id);
    });
    return { ...session };
  }

  write(sessionId: string, data: string): void {
    const state = this.requireSession(sessionId);
    if (state.inputLocked) return;
    if (state.session.aiEnabled && (data === '\r' || data === '\n')) {
      const classification = classifyTerminalInput(state.inputLine, {
        shell: state.session.shellKind,
        cwd: state.session.cwd,
      });
      if (classification.kind === 'ai') {
        const cwd = state.session.cwd;
        this.animateClearInput(state, () => {
          if (!state.session.aiEnabled) return;
          this.callbacks.onNaturalLanguage({ sessionId, prompt: classification.prompt, cwd });
        });
        return;
      }
    }
    if (state.session.aiEnabled) this.trackInput(state, data);
    state.pty.write(data);
  }

  clearInput(sessionId: string): void {
    const state = this.requireSession(sessionId);
    this.cancelInputAnimation(state);
    state.inputLine = '';
    state.currentCommand = '';
    state.commandOutput = '';
    state.commandRunning = false;
    state.interrupted = false;
    state.pty.write('\x07');
  }

  insertCommand(sessionId: string, command: string): void {
    const state = this.requireSession(sessionId);
    if (state.inputLocked || !command) return;
    const characters = [...command];
    const chunkSize = Math.max(1, Math.ceil(characters.length / 120));
    let offset = 0;
    state.inputLocked = true;

    const typeNext = () => {
      if (!this.sessions.has(sessionId)) return;
      const chunk = characters.slice(offset, offset + chunkSize).join('');
      if (!chunk) {
        state.inputAnimation = undefined;
        state.inputLocked = false;
        return;
      }
      this.trackInput(state, chunk);
      state.pty.write(chunk);
      offset += chunkSize;
      state.inputAnimation = setTimeout(typeNext, 9);
    };
    typeNext();
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const state = this.requireSession(sessionId);
    state.pty.resize(Math.max(cols, 2), Math.max(rows, 1));
  }

  close(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    this.cancelInputAnimation(state);
    this.onSessionDisabled(sessionId);
    state.pty.kill();
    this.sessions.delete(sessionId);
  }

  setAiEnabled(sessionId: string, enabled: boolean, profileId?: string): void {
    const state = this.requireSession(sessionId);
    if (enabled && (!profileId || !this.isKnownProviderProfile(profileId))) {
      throw new Error('Select a configured model profile before enabling AI.');
    }
    if (state.session.aiEnabled && (!enabled || state.session.providerProfileId !== profileId)) {
      this.onSessionDisabled(sessionId);
    }
    if (!enabled && state.inputLocked) {
      this.cancelInputAnimation(state);
      state.pty.write('\x07');
      state.inputLine = '';
    }
    state.session.aiEnabled = enabled;
    state.session.providerProfileId = enabled ? profileId : undefined;
    state.commandOutput = '';
    state.currentCommand = '';
    state.commandRunning = false;
    state.interrupted = false;
  }

  isAiAuthorized(sessionId: string, profileId: string): boolean {
    const session = this.sessions.get(sessionId)?.session;
    return Boolean(session?.aiEnabled && session.providerProfileId === profileId);
  }

  closeAll(): void {
    for (const sessionId of [...this.sessions.keys()]) this.close(sessionId);
  }

  private handlePtyData(state: SessionState, data: string): void {
    this.callbacks.onData({ sessionId: state.session.id, data });
    for (const event of state.parser.feed(data)) {
      if (event.type === 'text') {
        if (state.session.aiEnabled && state.commandRunning) {
          state.commandOutput = limitOutput(`${state.commandOutput}${stripAnsi(event.data)}`);
        }
        continue;
      }
      if (event.type === 'cwd') {
        if (event.cwd && event.cwd !== state.session.cwd) {
          state.session.cwd = event.cwd;
          this.callbacks.onCwd({ sessionId: state.session.id, cwd: event.cwd });
        }
        continue;
      }
      if (event.type === 'prompt') {
        this.callbacks.onPromptState({ sessionId: state.session.id, atPrompt: true });
        continue;
      }
      if (event.type === 'command') {
        this.callbacks.onPromptState({ sessionId: state.session.id, atPrompt: false });
        if (!state.session.aiEnabled) {
          state.currentCommand = '';
          state.commandOutput = '';
          state.commandRunning = false;
          continue;
        }
        if (event.command.trim()) state.currentCommand = event.command.trim();
        state.commandOutput = '';
        state.commandRunning = Boolean(state.currentCommand);
        state.interrupted = false;
        continue;
      }
      if (event.type === 'finished') this.finishCommand(state, event.exitCode);
    }
  }

  private finishCommand(state: SessionState, exitCode: number): void {
    if (!state.commandRunning || !state.currentCommand.trim()) return;
    const interrupted = state.interrupted || [130, 143, -1073741510].includes(exitCode);
    if (state.session.aiEnabled && exitCode !== 0 && !interrupted) {
      this.callbacks.onCommandFinished({
        sessionId: state.session.id,
        command: state.currentCommand,
        cwd: state.session.cwd,
        exitCode,
        output: limitOutput(state.commandOutput),
        interrupted,
      });
    }
    state.currentCommand = '';
    state.commandOutput = '';
    state.commandRunning = false;
    state.interrupted = false;
  }

  private trackInput(state: SessionState, data: string): void {
    if (data.includes('\x03')) {
      state.interrupted = true;
      state.inputLine = '';
      return;
    }
    if (data.includes('\x1b')) return;

    for (const character of data) {
      if (character === '\r' || character === '\n') {
        const command = state.inputLine.trim();
        if (command) {
          state.currentCommand = command;
          state.commandOutput = '';
          state.commandRunning = true;
          state.interrupted = false;
        }
        state.inputLine = '';
      } else if (character === '\x7f' || character === '\b') {
        state.inputLine = state.inputLine.slice(0, -1);
      } else if (character === '\x15') {
        state.inputLine = '';
      } else if (character >= ' ') {
        state.inputLine += character;
      }
    }
  }

  private animateClearInput(state: SessionState, onCleared: () => void): void {
    const characterCount = Math.min([...state.inputLine].length, 80);
    let remaining = characterCount;
    state.inputLine = '';
    state.currentCommand = '';
    state.commandOutput = '';
    state.commandRunning = false;
    state.interrupted = false;
    state.inputLocked = true;

    const eraseNext = () => {
      if (!this.sessions.has(state.session.id)) return;
      if (remaining > 0) {
        state.pty.write('\x7f');
        remaining -= 1;
        state.inputAnimation = setTimeout(eraseNext, 16);
        return;
      }
      state.pty.write('\x07');
      state.inputAnimation = undefined;
      state.inputLocked = false;
      onCleared();
    };
    eraseNext();
  }

  private cancelInputAnimation(state: SessionState): void {
    if (state.inputAnimation) clearTimeout(state.inputAnimation);
    state.inputAnimation = undefined;
    state.inputLocked = false;
  }

  private requireSession(sessionId: string): SessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error('Terminal session does not exist.');
    return state;
  }
}
