import { describe, expect, it } from 'vitest';
import { limitOutput, prepareModelText, redactSecrets, stripAnsi } from './redaction';

describe('terminal context security', () => {
  it('redacts common credentials without changing surrounding context', () => {
    const value = [
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
      'API_KEY=sk-12345678901234567890',
      'curl https://alice:secret@example.com/path',
    ].join('\n');
    const redacted = redactSecrets(value);
    expect(redacted).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(redacted).not.toContain('12345678901234567890');
    expect(redacted).not.toContain('alice:secret');
    expect(redacted).toContain('[REDACTED');
  });

  it('removes terminal control sequences', () => {
    expect(stripAnsi('\x1b[31mfailed\x1b[0m\r\n')).toBe('failed\n');
  });

  it('keeps only the tail within the line and byte limits', () => {
    const output = Array.from({ length: 250 }, (_, index) => `line-${index}`).join('\n');
    const result = limitOutput(output, 200, 32 * 1024);
    expect(result.split('\n')).toHaveLength(200);
    expect(result).toContain('line-249');
    expect(result).not.toContain('line-0\n');
  });

  it('applies cleanup and redaction together', () => {
    expect(prepareModelText('\x1b[31mpassword=hunter2\x1b[0m')).toContain('password=[REDACTED]');
  });
});
