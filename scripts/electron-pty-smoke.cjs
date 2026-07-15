const { app } = require('electron');

const timeout = setTimeout(() => {
  console.error('PTY smoke test timed out.');
  app.exit(1);
}, 10_000);

app.whenReady().then(() => {
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
  child.onData((data) => { output += data; });
  child.onExit(() => {
    clearTimeout(timeout);
    if (!output.includes('RELAY_PTY_OK')) {
      console.error('PTY smoke test did not receive expected output.');
      app.exit(1);
      return;
    }
    console.log('Electron PTY smoke test passed.');
    app.exit(0);
  });
}).catch((error) => {
  clearTimeout(timeout);
  console.error(error);
  app.exit(1);
});
