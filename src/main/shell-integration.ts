import type { ShellKind } from '../shared/types';

export type ShellMarker =
  | { type: 'prompt' }
  | { type: 'command'; command: string }
  | { type: 'cwd'; cwd: string }
  | { type: 'finished'; exitCode: number };

export type ShellStreamEvent = ShellMarker | { type: 'text'; data: string };

const MARKER_PATTERN = /\x1b\]633;([ABDP])(?:;([^\x07\x1b]*))?(?:\x07|\x1b\\)/;

function decodeBase64(value: string | undefined): string {
  if (!value) return '';
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

export class ShellIntegrationParser {
  private buffer = '';

  feed(data: string): ShellStreamEvent[] {
    this.buffer += data;
    const events: ShellStreamEvent[] = [];
    const prefix = '\x1b]633;';

    while (this.buffer.length > 0) {
      const prefixIndex = this.buffer.indexOf(prefix);
      if (prefixIndex < 0) {
        let keep = 0;
        const maxPartial = Math.min(prefix.length - 1, this.buffer.length);
        for (let length = maxPartial; length > 0; length -= 1) {
          if (prefix.startsWith(this.buffer.slice(-length))) {
            keep = length;
            break;
          }
        }
        const flushLength = this.buffer.length - keep;
        if (flushLength > 0) events.push({ type: 'text', data: this.buffer.slice(0, flushLength) });
        this.buffer = this.buffer.slice(flushLength);
        break;
      }
      if (prefixIndex > 0) {
        events.push({ type: 'text', data: this.buffer.slice(0, prefixIndex) });
        this.buffer = this.buffer.slice(prefixIndex);
      }

      const match = MARKER_PATTERN.exec(this.buffer);
      if (!match || match.index !== 0) break;
      const [raw, code, payload] = match;
      if (code === 'A') events.push({ type: 'prompt' });
      if (code === 'B') events.push({ type: 'command', command: decodeBase64(payload) });
      if (code === 'P' && payload?.startsWith('Cwd=')) {
        events.push({ type: 'cwd', cwd: decodeBase64(payload.slice(4)) });
      }
      if (code === 'D') {
        const exitCode = Number.parseInt(payload ?? '', 10);
        if (Number.isFinite(exitCode)) events.push({ type: 'finished', exitCode });
      }
      this.buffer = this.buffer.slice(raw.length);
    }
    return events;
  }
}

export function integrationLaunchConfig(
  kind: ShellKind,
  originalArgs: string[],
  integrationDirectory: string,
): { args: string[]; env: Record<string, string> } {
  if (kind === 'powershell') {
    return { args: [...originalArgs, '-NoExit', '-File', `${integrationDirectory}/relay.ps1`], env: {} };
  }
  if (kind === 'bash') {
    return { args: [...originalArgs, '--rcfile', `${integrationDirectory}/relay.bash`, '-i'], env: {} };
  }
  if (kind === 'zsh') {
    return { args: [...originalArgs, '-i'], env: { ZDOTDIR: `${integrationDirectory}/zsh` } };
  }
  return { args: originalArgs, env: {} };
}

export function shellKindFromPath(shellPath: string): ShellKind {
  const name = shellPath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  if (name === 'pwsh' || name === 'pwsh.exe' || name === 'powershell' || name === 'powershell.exe') return 'powershell';
  if (name === 'bash' || name === 'bash.exe') return 'bash';
  if (name === 'zsh' || name === 'zsh.exe') return 'zsh';
  return 'other';
}
