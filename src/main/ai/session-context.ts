import { limitOutput, prepareModelText } from '../security/redaction';

export interface TerminalCommandContextEntry {
  type: 'command';
  command: string;
  cwd: string;
  exitCode: number;
  output: string;
}

export interface AiExchangeContextEntry {
  type: 'ai-exchange';
  cwd: string;
  userRequest: string;
  suggestedCommand: string;
  explanation: string;
}

export type TerminalContextEntry = TerminalCommandContextEntry | AiExchangeContextEntry;

const MAX_CONTEXT_ENTRIES = 12;
const MAX_CONTEXT_LINES = 200;
const MAX_CONTEXT_BYTES = 32 * 1024;
const MAX_ENTRY_OUTPUT_LINES = 80;
const MAX_ENTRY_OUTPUT_BYTES = 8 * 1024;

function entryBytes(entry: TerminalContextEntry): number {
  return Buffer.byteLength(JSON.stringify(entry), 'utf8');
}

function entryLines(entry: TerminalContextEntry): number {
  const values = entry.type === 'command'
    ? [entry.command, entry.cwd, entry.output]
    : [entry.cwd, entry.userRequest, entry.suggestedCommand, entry.explanation];
  return values.reduce((total, value) => total + value.split('\n').length, 0);
}

function sanitizeEntry(entry: TerminalContextEntry): TerminalContextEntry | undefined {
  const cwd = limitOutput(prepareModelText(entry.cwd).trim(), 4, 2 * 1024);
  if (entry.type === 'command') {
    const command = prepareModelText(entry.command).trim();
    if (!command) return undefined;
    return {
      type: 'command',
      command: limitOutput(command, 20, 4 * 1024),
      cwd,
      exitCode: entry.exitCode,
      output: limitOutput(prepareModelText(entry.output), MAX_ENTRY_OUTPUT_LINES, MAX_ENTRY_OUTPUT_BYTES),
    };
  }

  const userRequest = limitOutput(prepareModelText(entry.userRequest).trim(), 20, 4 * 1024);
  const suggestedCommand = limitOutput(prepareModelText(entry.suggestedCommand).trim(), 20, 4 * 1024);
  if (!userRequest || !suggestedCommand) return undefined;
  return {
    type: 'ai-exchange',
    cwd,
    userRequest,
    suggestedCommand,
    explanation: limitOutput(prepareModelText(entry.explanation).trim(), 20, 4 * 1024),
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
