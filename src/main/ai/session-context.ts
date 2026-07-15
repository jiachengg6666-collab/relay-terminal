import { limitOutput, prepareModelText } from '../security/redaction';

export interface TerminalContextEntry {
  command: string;
  cwd: string;
  exitCode: number;
  output: string;
}

const MAX_CONTEXT_ENTRIES = 12;
const MAX_CONTEXT_LINES = 200;
const MAX_CONTEXT_BYTES = 32 * 1024;
const MAX_ENTRY_OUTPUT_LINES = 80;
const MAX_ENTRY_OUTPUT_BYTES = 8 * 1024;

function entryBytes(entry: TerminalContextEntry): number {
  return Buffer.byteLength(`${entry.command}\n${entry.cwd}\n${entry.exitCode}\n${entry.output}`, 'utf8');
}

function entryLines(entry: TerminalContextEntry): number {
  return 3 + entry.output.split('\n').length;
}

function sanitizeEntry(entry: TerminalContextEntry): TerminalContextEntry | undefined {
  const command = prepareModelText(entry.command).trim();
  if (!command) return undefined;
  return {
    command: limitOutput(command, 20, 4 * 1024),
    cwd: limitOutput(prepareModelText(entry.cwd).trim(), 4, 2 * 1024),
    exitCode: entry.exitCode,
    output: limitOutput(prepareModelText(entry.output), MAX_ENTRY_OUTPUT_LINES, MAX_ENTRY_OUTPUT_BYTES),
  };
}

export class AiSessionContext {
  private entries: TerminalContextEntry[] = [];

  append(entry: TerminalContextEntry): void {
    const sanitized = sanitizeEntry(entry);
    if (!sanitized) return;
    this.entries.push(sanitized);
    if (this.entries.length > MAX_CONTEXT_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_CONTEXT_ENTRIES);
    }

    let bytes = this.entries.reduce((total, item) => total + entryBytes(item), 0);
    let lines = this.entries.reduce((total, item) => total + entryLines(item), 0);
    while (this.entries.length > 1 && (bytes > MAX_CONTEXT_BYTES || lines > MAX_CONTEXT_LINES)) {
      const removed = this.entries.shift()!;
      bytes -= entryBytes(removed);
      lines -= entryLines(removed);
    }
  }

  snapshot(): TerminalContextEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  clear(): void {
    this.entries.length = 0;
  }
}
