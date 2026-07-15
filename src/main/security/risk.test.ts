import { describe, expect, it } from 'vitest';
import { assessCommandRisk } from './risk';

describe('command risk assessment', () => {
  it.each([
    'rm -rf /tmp/build',
    'Remove-Item C:\\data -Recurse -Force',
    'sudo apt install nginx',
    'shutdown -h now',
  ])('marks high-risk command: %s', (command) => {
    expect(assessCommandRisk(command).level).toBe('high');
  });

  it.each(['rm file.txt', 'git clean -fd', 'npm install lodash'])('marks medium-risk command: %s', (command) => {
    expect(assessCommandRisk(command).level).toBe('medium');
  });

  it('allows ordinary read commands', () => {
    expect(assessCommandRisk('git status').level).toBe('low');
  });
});
