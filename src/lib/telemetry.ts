import { MODEL_ID, validatePose, type Pose } from './motion';
export type TelemetryFrame = { type: 'joint_state'; modelId: string; session: string; seq: number; timestamp: number; joints: Pose };
export type BufferedFrame = TelemetryFrame & { receivedAt: number };
export function parseTelemetry(raw: string): TelemetryFrame {
  if (raw.length > 16_384) throw new Error('状态消息过大');
  const p = JSON.parse(raw);
  if (p.type !== 'joint_state' || p.modelId !== MODEL_ID || typeof p.session !== 'string' || !p.session || p.session.length > 100 ||
      !Number.isSafeInteger(p.seq) || p.seq < 0 || typeof p.timestamp !== 'number' || !Number.isFinite(p.timestamp)) throw new Error('状态消息格式错误');
  return { type: 'joint_state', modelId: MODEL_ID, session: p.session, seq: p.seq, timestamp: p.timestamp, joints: validatePose(p.joints) };
}
// Interpolate in local arrival-time space: no assumption about the device clock.
export function sampleTelemetry(frames: BufferedFrame[], now: number, delay = 100): Pose | null {
  if (!frames.length) return null;
  const target = now - delay;
  if (target <= frames[0].receivedAt) return frames[0].joints;
  for (let i = 1; i < frames.length; i++) {
    const b = frames[i], a = frames[i - 1];
    if (target <= b.receivedAt) {
      const t = Math.max(0, Math.min(1, (target - a.receivedAt) / Math.max(0.001, b.receivedAt - a.receivedAt)));
      return Object.fromEntries(Object.keys(a.joints).map(id => [id, a.joints[id] + (b.joints[id] - a.joints[id]) * t]));
    }
  }
  return frames[frames.length - 1].joints;
}
export const telemetryBuffer: BufferedFrame[] = [];
