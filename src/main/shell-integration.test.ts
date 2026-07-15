import { describe, expect, it } from 'vitest';
import { ShellIntegrationParser, shellKindFromPath } from './shell-integration';

const marker = (code: string, value?: string) => `\x1b]633;${code}${value === undefined ? '' : `;${value}`}\x07`;

describe('shell integration parser', () => {
  it('parses command, cwd and exit markers in stream order', () => {
    const parser = new ShellIntegrationParser();
    const command = Buffer.from('git status').toString('base64');
    const cwd = Buffer.from('/work/repo').toString('base64');
    const events = parser.feed(`${marker('B', command)}fatal: nope\n${marker('P', `Cwd=${cwd}`)}${marker('D', '128')}`);
    expect(events).toEqual([
      { type: 'command', command: 'git status' },
      { type: 'text', data: 'fatal: nope\n' },
      { type: 'cwd', cwd: '/work/repo' },
      { type: 'finished', exitCode: 128 },
    ]);
  });

  it('handles markers split across PTY chunks', () => {
    const parser = new ShellIntegrationParser();
    expect(parser.feed('output\x1b]63')).toEqual([{ type: 'text', data: 'output' }]);
    expect(parser.feed('3;D;1\x07')).toEqual([{ type: 'finished', exitCode: 1 }]);
  });

  it('detects supported shell paths', () => {
    expect(shellKindFromPath('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe('powershell');
    expect(shellKindFromPath('/bin/bash')).toBe('bash');
    expect(shellKindFromPath('/bin/fish')).toBe('other');
  });
});
