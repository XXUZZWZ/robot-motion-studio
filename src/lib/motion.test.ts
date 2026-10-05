import { describe, expect, it } from 'vitest';
import { advanceTime, HOME, JOINTS, makeDemo, parseProject, sampleMotion } from './motion';
import { parseTelemetry, sampleTelemetry, type BufferedFrame } from './telemetry';

describe('motion playback', () => {
  it('clamps before/after the recorded range and lands exactly on keyframes', () => {
    const p = makeDemo();
    expect(sampleMotion(p, -1)).toEqual(p.keyframes[0].pose);
    expect(sampleMotion(p, 2)).toEqual(p.keyframes[1].pose);
    expect(sampleMotion(p, 50)).toEqual(p.keyframes.at(-1)!.pose);
  });
  it('interpolates within bounded joint limits without angular wrapping', () => {
    const p = makeDemo(); p.interpolation = 'linear';
    p.keyframes = [{ id: 'a', time: 0, pose: { ...HOME, joint_1: -3 } }, { id: 'b', time: 8, pose: { ...HOME, joint_1: 3 } }];
    expect(sampleMotion(p, 4).joint_1).toBe(0);
    for (let t = 0; t <= 8; t += 0.1) for (const j of JOINTS) expect(sampleMotion(p, t)[j.id]).toBeGreaterThanOrEqual(j.lower);
  });
  it('holds a single keyframe', () => { const p = makeDemo(); p.keyframes = [p.keyframes[0]]; expect(sampleMotion(p, 5)).toEqual(HOME); });
  it('advances independently of refresh rate', () => {
    let a = 0, b = 0;
    for (let i = 0; i < 60; i++) a = advanceTime(a, 1 / 60, 1, 8, false).time;
    for (let i = 0; i < 144; i++) b = advanceTime(b, 1 / 144, 1, 8, false).time;
    expect(a).toBeCloseTo(b, 10);
    expect(advanceTime(7.9, 0.2, 1, 8, true).time).toBeCloseTo(0.1);
    expect(advanceTime(7.9, 0.2, 1, 8, false)).toEqual({ time: 8, ended: true });
  });
});
describe('project import', () => {
  it('round-trips JSON and sorts frames', () => { const p = makeDemo(); p.keyframes.reverse(); expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(makeDemo()); });
  it('rejects invalid models, limits, missing joints and colliding times', () => {
    const p = makeDemo(); expect(() => parseProject({ ...p, modelId: 'wrong' })).toThrow();
    expect(() => parseProject({ ...p, duration: Infinity })).toThrow();
    expect(() => parseProject({ ...p, keyframes: [] })).toThrow();
    p.keyframes[1].time = 0; expect(() => parseProject(p)).toThrow();
    const q = makeDemo(); q.keyframes[0].pose.joint_1 = 10; expect(() => parseProject(q)).toThrow();
    const r = makeDemo(); delete r.keyframes[0].pose.joint_2; expect(() => parseProject(r)).toThrow();
  });
});
describe('device stream', () => {
  const frame = { type: 'joint_state', modelId: 'rms-arm-6', session: 'test', seq: 1, timestamp: 100, joints: HOME };
  it('validates all incoming joint values', () => {
    expect(parseTelemetry(JSON.stringify(frame)).joints).toEqual(HOME);
    expect(() => parseTelemetry(JSON.stringify({ ...frame, joints: {} }))).toThrow();
    expect(() => parseTelemetry(JSON.stringify({ ...frame, seq: -1 }))).toThrow();
  });
  it('interpolates arrivals and holds the last state during a gap', () => {
    const a = { ...frame, receivedAt: 1000 } as BufferedFrame;
    const b = { ...a, seq: 2, receivedAt: 1100, joints: { ...HOME, joint_1: 1.35 } };
    expect(sampleTelemetry([a, b], 1150)!.joint_1).toBeCloseTo(0.85);
    expect(sampleTelemetry([a, b], 3000)).toEqual(b.joints);
    expect(sampleTelemetry([], 1000)).toBeNull();
  });
});
