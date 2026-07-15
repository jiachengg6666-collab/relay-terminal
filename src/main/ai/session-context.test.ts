import { describe, expect, it } from 'vitest';
import { AiSessionContext } from './session-context';

describe('temporary AI session context', () => {
  it('keeps recent commands in order and returns defensive copies', () => {
    const context = new AiSessionContext();
    context.append({ command: 'pwd', cwd: '/work', exitCode: 0, output: '/work' });
    context.append({ command: 'git status', cwd: '/work', exitCode: 0, output: 'clean' });

    const snapshot = context.snapshot();
    expect(snapshot.map((entry) => entry.command)).toEqual(['pwd', 'git status']);
    snapshot[0].command = 'changed';
    expect(context.snapshot()[0].command).toBe('pwd');
  });

  it('redacts credentials before retaining context in memory', () => {
    const context = new AiSessionContext();
    context.append({
      command: 'curl -H "Authorization: Bearer abcdefghijklmnopqrstuvwxyz" https://example.com',
      cwd: '/work',
      exitCode: 1,
      output: 'password=hunter2',
    });

    const retained = JSON.stringify(context.snapshot());
    expect(retained).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(retained).not.toContain('hunter2');
    expect(retained).toContain('[REDACTED');
  });

  it('limits retained history and clears all references on demand', () => {
    const context = new AiSessionContext();
    for (let index = 0; index < 20; index += 1) {
      context.append({
        command: `echo ${index}`,
        cwd: '/work',
        exitCode: 0,
        output: Array.from({ length: 40 }, () => `output-${index}`).join('\n'),
      });
    }

    const snapshot = context.snapshot();
    expect(snapshot.length).toBeLessThanOrEqual(12);
    expect(snapshot.at(-1)?.command).toBe('echo 19');
    expect(Buffer.byteLength(JSON.stringify(snapshot), 'utf8')).toBeLessThanOrEqual(32 * 1024);
    context.clear();
    expect(context.snapshot()).toEqual([]);
  });
});
