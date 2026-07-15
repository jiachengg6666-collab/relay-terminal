const fs = require('node:fs');
const path = require('node:path');

if (process.platform !== 'darwin') process.exit(0);

const nodePtyDirectory = path.dirname(require.resolve('node-pty/package.json'));
const candidates = [
  path.join(nodePtyDirectory, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper'),
  path.join(nodePtyDirectory, 'build', 'Release', 'spawn-helper'),
];
const helper = candidates.find((candidate) => fs.existsSync(candidate));

if (!helper) {
  throw new Error(`node-pty spawn-helper was not found for darwin-${process.arch}.`);
}

fs.chmodSync(helper, 0o755);
console.log(`Enabled node-pty spawn-helper: ${helper}`);
