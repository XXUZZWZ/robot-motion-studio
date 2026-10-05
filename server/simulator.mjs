import { WebSocketServer, WebSocket } from 'ws';
import { readFileSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const config = JSON.parse(readFileSync(new URL('../src/lib/robot-config.json', import.meta.url), 'utf8'));
export function startSimulator(port = Number(process.env.SIM_PORT || 3101)) {
  const wss = new WebSocketServer({ port, host: '127.0.0.1', maxPayload: 4096 });
  const session = randomUUID(), started = performance.now();
  let seq = 0;
  const amplitudes = [0.9, 0.35, 0.5, 0.6, 0.5, 0.6];
  const timer = setInterval(() => {
    const t = (performance.now() - started) / 1000;
    const joints = Object.fromEntries(config.joints.map((j, i) => [j.id,
      Math.max(j.lower, Math.min(j.upper, j.home + Math.sin(t * (0.45 + i * 0.06) + i * 0.3) * amplitudes[i]))]));
    const data = JSON.stringify({ type: 'joint_state', modelId: config.modelId, session, seq: seq++, timestamp: Date.now(), joints });
    for (const client of wss.clients) if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 65536) client.send(data);
  }, 50);
  wss.on('connection', socket => {
    socket.on('error', () => {});
    socket.on('message', raw => {
      try { if (JSON.parse(raw.toString()).type === 'ping') socket.ping(); } catch { socket.close(1007, 'invalid JSON'); }
    });
  });
  wss.on('listening', () => console.log(`Simulated robot: ws://127.0.0.1:${port} (20 Hz; no hardware)`));
  wss.on('close', () => clearInterval(timer));
  wss.on('error', error => { console.error(error.message); clearInterval(timer); process.exitCode = 1; });
  return () => { clearInterval(timer); for (const client of wss.clients) client.close(); wss.close(); };
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const stop = startSimulator(); process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
