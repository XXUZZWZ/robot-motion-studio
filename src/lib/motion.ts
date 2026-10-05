import config from './robot-config.json';

export const JOINTS = config.joints;
export const MODEL_ID = config.modelId;
export type Pose = Record<string, number>;
export type Keyframe = { id: string; time: number; pose: Pose };
export type MotionProject = {
  version: 1; modelId: string; name: string; duration: number;
  interpolation: 'linear' | 'smooth'; keyframes: Keyframe[];
};
export const HOME: Pose = Object.fromEntries(JOINTS.map(j => [j.id, j.home]));
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const degrees = (radians: number) => radians * 180 / Math.PI;
export const radians = (value: number) => value * Math.PI / 180;

export function makeDemo(): MotionProject {
  const poses = [
    [0.35, 0.6, -1.1, 0, 0.5, 0],
    [-0.65, 1.1, -0.7, 0.35, -0.4, 0.3],
    [0.75, 0.3, -1.65, -0.45, 1.1, -0.3],
    [1.15, 0.9, -0.8, 0.3, 0.15, 0.7],
    [0.35, 0.6, -1.1, 0, 0.5, 0],
  ];
  return {
    version: 1, modelId: MODEL_ID, name: '机械臂 · 巡检动作', duration: 8, interpolation: 'smooth',
    keyframes: poses.map((angles, index) => ({ id: `demo-${index}`, time: index * 2,
      pose: Object.fromEntries(JOINTS.map((joint, n) => [joint.id, angles[n]])) })),
  };
}

// Bounded revolute joints interpolate directly within their legal interval.
// Shortest-angle wrapping is for continuous joints; it can cross limits here.
export function sampleMotion(project: MotionProject, time: number): Pose {
  const frames = project.keyframes;
  if (time <= frames[0].time) return { ...frames[0].pose };
  if (time >= frames[frames.length - 1].time) return { ...frames[frames.length - 1].pose };
  let low = 0, high = frames.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (frames[mid].time <= time) low = mid; else high = mid;
  }
  const a = frames[low], b = frames[high];
  let t = (time - a.time) / (b.time - a.time);
  if (project.interpolation === 'smooth') t = t * t * (3 - 2 * t);
  return Object.fromEntries(JOINTS.map(j => [j.id, a.pose[j.id] + (b.pose[j.id] - a.pose[j.id]) * t]));
}

export function advanceTime(time: number, delta: number, speed: number, duration: number, loop: boolean) {
  const next = time + delta * speed;
  return { time: loop ? next % duration : Math.min(next, duration), ended: !loop && next >= duration };
}

export function validatePose(value: unknown): Pose {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('关节姿态必须是对象');
  const source = value as Record<string, unknown>;
  const pose: Pose = {};
  for (const joint of JOINTS) {
    const angle = source[joint.id];
    if (typeof angle !== 'number' || !Number.isFinite(angle)) throw new Error(`${joint.id} 缺少有效角度`);
    if (angle < joint.lower || angle > joint.upper) throw new Error(`${joint.id} 超出关节限位`);
    pose[joint.id] = angle;
  }
  return pose;
}

export function parseProject(value: unknown): MotionProject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('动作文件格式不正确');
  const p = value as Record<string, unknown>;
  if (p.version !== 1 || p.modelId !== MODEL_ID) throw new Error('仅支持 v1 / rms-arm-6 动作文件');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80) throw new Error('动作名称应为 1–80 个字符');
  if (typeof p.duration !== 'number' || !Number.isFinite(p.duration) || p.duration < 1 || p.duration > 60) throw new Error('时长应为 1–60 秒');
  if (p.interpolation !== 'linear' && p.interpolation !== 'smooth') throw new Error('不支持的插值方式');
  if (!Array.isArray(p.keyframes) || !p.keyframes.length || p.keyframes.length > 200) throw new Error('关键帧数量应为 1–200');
  const ids = new Set<string>();
  const frames = p.keyframes.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('关键帧格式错误');
    const frame = value as Record<string, unknown>;
    if (typeof frame.id !== 'string' || !frame.id || frame.id.length > 100 || ids.has(frame.id)) throw new Error('关键帧 ID 无效或重复');
    ids.add(frame.id);
    if (typeof frame.time !== 'number' || !Number.isFinite(frame.time) || frame.time < 0 || frame.time > (p.duration as number)) throw new Error('关键帧时间超出动作范围');
    return { id: frame.id, time: frame.time, pose: validatePose(frame.pose) };
  }).sort((a, b) => a.time - b.time);
  if (frames.some((f, i) => i > 0 && f.time - frames[i - 1].time < 0.01)) throw new Error('相邻关键帧至少间隔 0.01 秒');
  return { version: 1, modelId: MODEL_ID, name: p.name.trim(), duration: p.duration, interpolation: p.interpolation, keyframes: frames };
}
