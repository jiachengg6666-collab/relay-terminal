import { describe, expect, it } from 'vitest';
import { classifyTerminalInput, extractNaturalLanguage } from './natural-language';

describe('natural language detection', () => {
  it.each([
    '我想查看E盘work里面都有什么',
    '找E盘里是否有work文件夹',
    'E盘work有哪些文件',
    '请帮我列出当前目录下最大的文件',
    'how can I find files changed today',
    'show me all running node processes',
  ])('detects a natural-language request: %s', (input) => {
    expect(extractNaturalLanguage(input)).toBe(input);
  });

  it.each([
    'Get-ChildItem E:\\work',
    'dir E:\\work',
    'python script.py 中文参数',
    'git status',
    'echo 查看文件',
  ])('leaves a shell command untouched: %s', (input) => {
    expect(extractNaturalLanguage(input)).toBeUndefined();
  });

  it('supports an explicit AI prefix for ambiguous text', () => {
    expect(extractNaturalLanguage('/ai summarize disk usage')).toBe('summarize disk usage');
  });

  it('routes an unresolved command to AI before execution', () => {
    expect(classifyTerminalInput('gti status', {
      shell: 'powershell',
      cwd: 'C:\\Users\\test',
      commandExists: () => false,
    })).toEqual({ kind: 'ai', prompt: 'gti status', reason: 'unresolved-command' });
  });

  it.each([
    ['Get-ChildItem E:\\work', 'powershell'],
    ['Test-Path E:\\work', 'powershell'],
    ['git status', 'powershell'],
    ['echo 中文参数', 'bash'],
  ] as const)('executes a valid command directly: %s', (input, shell) => {
    expect(classifyTerminalInput(input, {
      shell,
      cwd: 'C:\\Users\\test',
      commandExists: (command) => command === 'git',
    })).toEqual({ kind: 'command' });
  });
});
