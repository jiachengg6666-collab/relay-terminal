import { describe, expect, it } from 'vitest';
import { AiSessionContext } from './session-context';

describe('temporary AI session context', () => {
  it('keeps recent commands in order and returns defensive copies', () => {
    const context = new AiSessionContext();
    context.append({ type: 'command', command: 'pwd', cwd: '/work', exitCode: 0, output: '/work' });
    context.append({ type: 'command', command: 'git status', cwd: '/work', exitCode: 0, output: 'clean' });

    const snapshot = context.snapshot();
    expect(snapshot.map((entry) => entry.type === 'command' ? entry.command : '')).toEqual(['pwd', 'git status']);
    const first = snapshot[0];
    if (first.type !== 'command') throw new Error('Expected command context.');
    first.command = 'changed';
    const retainedFirst = context.snapshot()[0];
    expect(retainedFirst.type === 'command' ? retainedFirst.command : '').toBe('pwd');
  });

  it('retains AI requests and suggestions for coherent follow-up instructions', () => {
    const context = new AiSessionContext();
    context.append({
      type: 'ai-exchange',
      cwd: '/work/project',
      userRequest: 'remember this project',
      suggestedCommand: 'pwd',
      explanation: 'Shows the current project directory.',
    });

    expect(context.snapshot()).toEqual([{
      type: 'ai-exchange',
      cwd: '/work/project',
      userRequest: 'remember this project',
      suggestedCommand: 'pwd',
      explanation: 'Shows the current project directory.',
    }]);
  });

  it('redacts credentials before retaining context in memory', () => {
    const context = new AiSessionContext();
    context.append({
      type: 'command',
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
        type: 'command',
        command: `echo ${index}`,
        cwd: '/work',
        exitCode: 0,
        output: Array.from({ length: 40 }, () => `output-${index}`).join('\n'),
      });
    }

    const snapshot = context.snapshot();
    expect(snapshot.length).toBeLessThanOrEqual(12);
    const last = snapshot.at(-1);
    expect(last?.type === 'command' ? last.command : '').toBe('echo 19');
    expect(Buffer.byteLength(JSON.stringify(snapshot), 'utf8')).toBeLessThanOrEqual(32 * 1024);
    context.clear();
    expect(context.snapshot()).toEqual([]);
  });
});
