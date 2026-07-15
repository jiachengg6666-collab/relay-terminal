const path = require('node:path');
const pty = require('node-pty');

if (process.platform !== 'win32') {
  console.log('PowerShell integration check is Windows-only.');
  process.exit(0);
}

const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const integration = path.join(process.cwd(), 'resources', 'shell', 'relay.ps1');
const promptMarker = '\u001b]633;A\u0007';
let output = '';
let stage = 'waiting-for-prompt';
let firstInputStartedAt = 0;
let firstInputDelay;
let historyRecalled = false;

const child = pty.spawn(shell, ['-NoLogo', '-NoExit', '-File', integration], {
  name: 'xterm-256color',
  cols: 100,
  rows: 30,
  cwd: process.cwd(),
  env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  useConpty: true,
});

function promptCount() {
  return output.split(promptMarker).length - 1;
}

function finish() {
  child.kill();
  const commandMarkers = [...output.matchAll(/\u001b\]633;B;/g)].length;
  const checks = {
    firstInputEchoed: firstInputDelay !== undefined && firstInputDelay < 1_000,
    historyRecalled,
    commandMarkers: commandMarkers >= 3,
    prompts: promptCount() >= 4,
    historyExecuted: output.includes('RELAY_HISTORY_OK'),
    clearExecuted: output.includes('RELAY_CLEAR_OK'),
    noCommandError: !output.includes('CommandNotFoundException'),
    noInterrupt: !output.includes('^C'),
  };
  const passed = Object.values(checks).every(Boolean);
  if (!passed) {
    console.error(`PowerShell integration failed. Stage: ${stage}. Checks: ${JSON.stringify(checks)}. First input delay: ${String(firstInputDelay)}ms. Output: ${JSON.stringify(output)}`);
    process.exit(1);
  }
  console.log(`PowerShell input, history, prompt and clear-line checks passed (${firstInputDelay}ms first echo).`);
  process.exit(0);
}

child.onData((data) => {
  output += data;
  if (stage === 'waiting-for-first-echo' && output.slice(-data.length).includes('e')) {
    firstInputDelay = Date.now() - firstInputStartedAt;
    stage = 'waiting-for-first-command';
    child.write('cho RELAY_HISTORY_OK\r');
    return;
  }
  if (stage === 'waiting-for-prompt' && promptCount() >= 1) {
    stage = 'waiting-for-first-echo';
    firstInputStartedAt = Date.now();
    child.write('e');
    return;
  }
  if (stage === 'waiting-for-first-command' && promptCount() >= 2) {
    stage = 'waiting-for-history';
    const historyOutputStart = output.length;
    child.write('\x1b[A');
    setTimeout(() => {
      historyRecalled = output.slice(historyOutputStart).includes('RELAY_HISTORY_OK');
      child.write('\r');
    }, 150);
    return;
  }
  if (stage === 'waiting-for-history' && promptCount() >= 3) {
    stage = 'waiting-for-clear';
    child.write('this text should disappear');
    setTimeout(() => {
      child.write('\x07');
      setTimeout(() => child.write('echo RELAY_CLEAR_OK\r'), 80);
    }, 80);
    return;
  }
  if (stage === 'waiting-for-clear' && promptCount() >= 4) {
    stage = 'complete';
    setTimeout(finish, 100);
  }
});

setTimeout(() => {
  if (stage !== 'complete') finish();
}, 10_000);
