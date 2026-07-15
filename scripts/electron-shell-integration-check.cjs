const path = require('node:path');
const pty = require('node-pty');

if (process.platform !== 'win32') {
  console.log('PowerShell integration check is Windows-only.');
  process.exit(0);
}

const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const integration = path.join(process.cwd(), 'resources', 'shell', 'relay.ps1');
let output = '';
let clearLineTestStarted = false;
const child = pty.spawn(shell, ['-NoLogo', '-NoExit', '-File', integration], {
  name: 'xterm-256color',
  cols: 100,
  rows: 30,
  cwd: process.cwd(),
  env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
});
child.onData((data) => {
  output += data;
  if (!clearLineTestStarted && output.includes('\u001b]633;A\u0007')) {
    clearLineTestStarted = true;
    child.write('this text should disappear');
    setTimeout(() => {
      child.write('\x07');
      setTimeout(() => child.write('echo RELAY_CLEAR_OK\r'), 80);
    }, 80);
  }
});

setTimeout(() => {
  child.kill();
  const successfulPrompts = [...output.matchAll(/\u001b\]633;D;0\u0007/g)].length;
  const clearLineWorked = output.includes('RELAY_CLEAR_OK')
    && successfulPrompts >= 2
    && !output.includes('CommandNotFoundException')
    && !output.includes('^C');
  if (!clearLineWorked) {
    console.error(`PowerShell clear-line integration failed. Output: ${JSON.stringify(output)}`);
    process.exit(1);
  }
  console.log('PowerShell integration prompt and clear-line checks passed.');
  process.exit(0);
}, 3_000);
