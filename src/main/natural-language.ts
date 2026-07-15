import { constants, accessSync, statSync } from 'node:fs';
import { delimiter, extname, isAbsolute, join, resolve } from 'node:path';
import type { ShellKind } from '../shared/types';

const COMMAND_PREFIX = /^(?:[A-Za-z]:[\\/]|\.{0,2}[\\/]|[$.&|><()[\]{}]|(?:Get|Set|New|Remove|Add|Clear|Copy|Move|Start|Stop|Test|Invoke|Import|Export|Select|Where|ForEach|Write|Read|Join|Split|ConvertTo|ConvertFrom|Measure|Resolve|Update|Enable|Disable|Register|Unregister|Out)-[A-Za-z][\w-]*\b|(?:cd|dir|ls|pwd|echo|cat|type|find|findstr|grep|rg|git|npm|npx|pnpm|yarn|node|python|python3|py|pip|pip3|docker|kubectl|curl|wget|ssh|scp|tar|zip|unzip|mkdir|rmdir|rm|cp|mv|touch|code|pwsh|powershell|bash|zsh|conda)\b)/i;
const SHELL_OPERATOR = /(?:\|\||&&|[|><;$`]\s*|\$\(|`\w)/;
const ENGLISH_INTENT = /^(?:please\s+|can you\s+|could you\s+|i (?:want|need)\s+to\s+|how (?:do|can|to)\s+|what (?:is|are)\s+|show me\s+|list (?:all|the|files|folders)\s+|find (?:all|the|files)\s+)/i;

const POWERSHELL_COMMANDS = new Set([
  'ac', 'cat', 'cd', 'chdir', 'clc', 'clear', 'cli', 'clp', 'cls', 'clv', 'cnsn', 'compare', 'copy', 'cp',
  'curl', 'del', 'diff', 'dir', 'dnsn', 'echo', 'epal', 'epcsv', 'erase', 'etsn', 'exsn', 'fc', 'fhx',
  'fl', 'foreach', 'ft', 'fw', 'gal', 'gbp', 'gc', 'gci', 'gcm', 'gcs', 'gdr', 'ghy', 'gi', 'gjb',
  'gl', 'gm', 'gmo', 'gp', 'gps', 'group', 'gsn', 'gsnp', 'gsv', 'gu', 'gv', 'h', 'history', 'icm',
  'iex', 'ihy', 'ii', 'ipal', 'ipcsv', 'irm', 'ise', 'iwmi', 'iwr', 'kill', 'lp', 'ls', 'man', 'md',
  'measure', 'mi', 'mount', 'move', 'mp', 'mv', 'nal', 'ndr', 'ni', 'nmo', 'nsn', 'nv', 'ogv', 'oh',
  'popd', 'ps', 'pushd', 'pwd', 'r', 'rbp', 'rcjb', 'rcsn', 'rd', 'rdr', 'ren', 'ri', 'rjb', 'rm',
  'rmdir', 'rmo', 'rni', 'rnp', 'rp', 'rsn', 'rsnp', 'rujb', 'rv', 'rvpa', 'rwmi', 'sajb', 'sal',
  'saps', 'sasv', 'sbp', 'sc', 'select', 'set', 'shcm', 'si', 'sl', 'sleep', 'sls', 'sort', 'sp',
  'spjb', 'spps', 'spsv', 'start', 'stz', 'sujb', 'sv', 'swmi', 'tee', 'trcm', 'type', 'where',
  'write', 'wget', 'wjb', 'write-output', 'write-host', 'exit', 'help', 'function', 'filter', 'param',
]);

const POSIX_COMMANDS = new Set([
  '.', ':', 'alias', 'bg', 'bind', 'break', 'builtin', 'caller', 'cd', 'command', 'compgen', 'complete',
  'continue', 'declare', 'dirs', 'disown', 'echo', 'enable', 'eval', 'exec', 'exit', 'export', 'false',
  'fc', 'fg', 'getopts', 'hash', 'help', 'history', 'jobs', 'kill', 'let', 'local', 'logout', 'mapfile',
  'popd', 'printf', 'pushd', 'pwd', 'read', 'readonly', 'return', 'set', 'shift', 'shopt', 'source',
  'suspend', 'test', 'times', 'trap', 'true', 'type', 'typeset', 'ulimit', 'umask', 'unalias', 'unset',
  'wait', 'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'case', 'esac', 'select', 'function',
]);

export interface InputClassificationOptions {
  shell: ShellKind;
  cwd: string;
  commandExists?: (command: string) => boolean;
}

export type InputClassification =
  | { kind: 'command' }
  | { kind: 'ai'; prompt: string; reason: 'natural-language' | 'unresolved-command' };

export function extractNaturalLanguage(input: string): string | undefined {
  const text = input.trim();
  if (!text) return undefined;

  const explicit = /^(?:\/ai|\?\?|？？)\s+(.+)$/i.exec(text);
  if (explicit) return explicit[1].trim();
  if (text.length < 4 || COMMAND_PREFIX.test(text) || SHELL_OPERATOR.test(text)) return undefined;
  // Once known command forms have been excluded, Han text is overwhelmingly an
  // instruction rather than a shell command. This also covers terse requests
  // such as "找E盘里是否有work文件夹" without maintaining a fragile verb list.
  if (/\p{Script=Han}/u.test(text)) return text;
  if (ENGLISH_INTENT.test(text)) return text;
  return undefined;
}

function firstCommandToken(input: string): string | undefined {
  const text = input.trim();
  if (!text || /^(?:#|\/\/)/.test(text)) return undefined;
  const quoted = /^(?:&\s*)?(['"])(.*?)\1/.exec(text);
  if (quoted) return quoted[2];
  return /^(?:command\s+|builtin\s+|sudo\s+)?([^\s]+)/i.exec(text)?.[1];
}

function isShellConstruct(input: string, shell: ShellKind): boolean {
  const text = input.trim();
  if (/^(?:[$@%({[]|\d|!|\.\s|\.\.\s)/.test(text)) return true;
  if (/^[A-Za-z_][\w]*\s*=/.test(text)) return true;
  if (shell === 'powershell' && /^(?:using|class|enum|data|dynamicparam|begin|process|end|throw|return|try|catch|finally|trap)\b/i.test(text)) return true;
  if (shell !== 'powershell' && /^(?:if|then|else|elif|fi|for|while|until|case|esac|select|function|time|coproc)\b/.test(text)) return true;
  return false;
}

function fileIsRunnable(candidate: string): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    accessSync(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandExistsOnPath(command: string, cwd: string): boolean {
  const clean = command.replace(/^['"]|['"]$/g, '');
  const hasPath = isAbsolute(clean) || clean.includes('/') || clean.includes('\\');
  const directories = hasPath
    ? ['']
    : [cwd, ...(process.env.PATH ?? '').split(delimiter).filter(Boolean)];
  const base = hasPath ? (isAbsolute(clean) ? clean : resolve(cwd, clean)) : clean;
  const extensions = process.platform === 'win32' && !extname(base)
    ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD;.PS1').split(';')
    : [''];

  return directories.some((directory) => extensions.some((extension) => {
    const candidate = directory ? join(directory, `${base}${extension}`) : `${base}${extension}`;
    return fileIsRunnable(candidate);
  }));
}

export function classifyTerminalInput(input: string, options: InputClassificationOptions): InputClassification {
  const text = input.trim();
  const naturalLanguage = extractNaturalLanguage(text);
  if (naturalLanguage) return { kind: 'ai', prompt: naturalLanguage, reason: 'natural-language' };
  if (!text || isShellConstruct(text, options.shell)) return { kind: 'command' };

  const token = firstCommandToken(text);
  if (!token || SHELL_OPERATOR.test(text)) return { kind: 'command' };
  const normalized = token.toLowerCase();
  if (options.shell === 'powershell') {
    if (POWERSHELL_COMMANDS.has(normalized) || /^[A-Za-z]+-[A-Za-z][\w-]*$/.test(token)) return { kind: 'command' };
  } else if (POSIX_COMMANDS.has(normalized)) {
    return { kind: 'command' };
  }

  const commandExists = options.commandExists ?? ((candidate: string) => commandExistsOnPath(candidate, options.cwd));
  if (commandExists(token)) return { kind: 'command' };
  return { kind: 'ai', prompt: text, reason: 'unresolved-command' };
}
