'use client';
import { useEffect, useState } from 'react';
import { useStudio } from '@/lib/store';
import { parseTelemetry, telemetryBuffer } from '@/lib/telemetry';

export type DeviceStatus = { state: 'offline' | 'connecting' | 'live' | 'retrying'; packets: number; rejected: number; age: number; attempts: number };
export function useDevice(url: string) {
  const mode = useStudio(s => s.mode);
  const [status, setStatus] = useState<DeviceStatus>({ state: 'offline', packets: 0, rejected: 0, age: 0, attempts: 0 });
  useEffect(() => {
    telemetryBuffer.length = 0;
    if (mode !== 'live') { setStatus(s => ({ ...s, state: 'offline' })); return; }
    let disposed = false, socket: WebSocket | undefined, retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0, packets = 0, rejected = 0, lastReceived = 0, lastSeq = -1, session = '';
    let state: DeviceStatus['state'] = 'connecting';
    const report = () => { if (!disposed) setStatus({ state, packets, rejected, age: lastReceived ? Math.round(performance.now() - lastReceived) : 0, attempts }); };
    const schedule = () => {
      if (disposed) return;
      state = 'retrying'; attempts++; report();
      retry = setTimeout(connect, Math.min(5000, 500 * 2 ** Math.min(attempts - 1, 4)));
    };
    const connect = () => {
      if (disposed) return;
      state = attempts ? 'retrying' : 'connecting'; report();
      lastSeq = -1; session = ''; lastReceived = performance.now(); telemetryBuffer.length = 0;
      try { socket = new WebSocket(url); } catch { schedule(); return; }
      const current = socket;
      current.onmessage = event => {
        if (disposed || current !== socket) return;
        try {
          const frame = parseTelemetry(String(event.data));
          if (frame.session === session && frame.seq <= lastSeq) { rejected++; return; }
          if (frame.session !== session) { session = frame.session; telemetryBuffer.length = 0; }
          lastSeq = frame.seq; lastReceived = performance.now(); packets++; state = 'live'; attempts = 0;
          telemetryBuffer.push({ ...frame, receivedAt: lastReceived });
          if (telemetryBuffer.length > 120) telemetryBuffer.shift();
        } catch { rejected++; }
      };
      current.onclose = () => { if (current === socket) schedule(); };
      current.onerror = () => { /* onclose owns reconnect scheduling */ };
    };
    connect();
    const heartbeat = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        if (performance.now() - lastReceived > 3000) socket.close(4000, 'telemetry timeout');
        else socket.send(JSON.stringify({ type: 'ping' }));
      }
      report();
    }, 500);
    return () => {
      disposed = true; clearInterval(heartbeat); clearTimeout(retry);
      if (socket) { socket.onclose = null; socket.onmessage = null; socket.close(); }
      telemetryBuffer.length = 0;
    };
  }, [mode, url]);
  return status;
}
