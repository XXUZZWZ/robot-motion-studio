import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const children = [
  spawn(process.execPath, [fileURLToPath(new URL('../server/simulator.mjs', import.meta.url))], { cwd: root, stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', process.env.PORT || '3100'], { cwd: root, stdio: 'inherit', windowsHide: true }),
];
let stopping = false;
const stop = (code = 0) => { if (stopping) return; stopping = true; for (const child of children) child.kill(); process.exitCode = code; };
for (const child of children) child.on('exit', code => stop(code ?? 0));
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
