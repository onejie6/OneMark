import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import './build-electron.mjs';

const require = createRequire(import.meta.url);
const electronExecutable = require('electron');
const server = await createServer({ server: { host: '127.0.0.1', port: 5173 } });
await server.listen();
server.printUrls();

const environment = { ...process.env, ELECTRON_RENDERER_URL: server.resolvedUrls.local[0] };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(electronExecutable, ['.'], { stdio: 'inherit', env: environment, windowsHide: true });
let closing = false;

async function shutdown(exitCode = 0) {
  if (closing) return;
  closing = true;
  child.kill();
  await server.close();
  process.exit(exitCode);
}

child.on('exit', code => { void shutdown(code ?? 0); });
child.on('error', error => {
  console.error('无法启动 Electron：', error.message);
  void shutdown(1);
});
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
