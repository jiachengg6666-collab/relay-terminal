const pty = require('node-pty');

const windows = process.platform === 'win32';
const shell = windows ? (process.env.ComSpec || 'cmd.exe') : (process.env.SHELL || '/bin/sh');
const args = windows ? ['/d', '/c', 'echo RELAY_PTY_OK'] : ['-lc', 'echo RELAY_PTY_OK'];
let output = '';
const child = pty.spawn(shell, args, {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd: process.cwd(),
  env: process.env,
});
const timeout = setTimeout(() => {
  console.error('Electron Node PTY check timed out.');
  process.exit(1);
}, 10_000);
child.onData((data) => { output += data; });
child.onExit(() => {
  clearTimeout(timeout);
  if (!output.includes('RELAY_PTY_OK')) {
    console.error('Electron Node PTY check did not receive expected output.');
    process.exit(1);
  }
  console.log(`Electron Node PTY check passed (Node-API ${process.versions.napi}).`);
  process.exit(0);
});
