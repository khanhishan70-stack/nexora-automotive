const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');

const server = spawn(process.execPath, [path.join(root, 'server', 'index.cjs')], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

function shutdown() {
  server.kill();
  vite.kill();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
