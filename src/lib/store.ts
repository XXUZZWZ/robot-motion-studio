import { create } from 'zustand';
import { clamp, HOME, JOINTS, makeDemo, sampleMotion, type MotionProject, type Pose } from './motion';

type StudioState = {
  project: MotionProject; pose: Pose; time: number; playing: boolean; speed: number; loop: boolean;
  mode: 'edit' | 'live'; selectedJoint: string; selectedFrame: string | null;
  showTrail: boolean; showAxes: boolean; cameraReset: number; modelRevision: number;
  notice: string; saved: boolean; initialized: boolean;
  seek: (time: number) => void;
  setJoint: (id: string, angle: number) => void;
  togglePlay: () => void;
  addFrame: () => void;
  deleteFrame: () => void;
  selectFrame: (id: string) => void;
  moveFrame: (id: string, time: number) => void;
  loadProject: (project: MotionProject) => void;
  setInterpolation: (kind: MotionProject['interpolation']) => void;
  resetPose: () => void;
};

export const useStudio = create<StudioState>((set, get) => ({
  initialized: false, project: makeDemo(), pose: { ...HOME }, time: 0, playing: false, speed: 1, loop: true,
  mode: 'edit', selectedJoint: 'joint_2', selectedFrame: 'demo-0', showTrail: true, showAxes: false,
  cameraReset: 0, modelRevision: 0, notice: '拖动关节，或播放示例动作。', saved: false,
  seek: time => {
    const s = get(); if (s.mode === 'live') return;
    const next = clamp(time, 0, s.project.duration);
    set({ time: next, pose: sampleMotion(s.project, next), playing: false, selectedFrame: null });
  },
  setJoint: (id, angle) => {
    const s = get(), joint = JOINTS.find(j => j.id === id);
    if (!joint || s.mode === 'live' || !Number.isFinite(angle)) return;
    set({ pose: { ...s.pose, [id]: clamp(angle, joint.lower, joint.upper) }, playing: false, selectedJoint: id,
      notice: '姿态已调整；点击“记录姿态”写入当前时间。' });
  },
  togglePlay: () => {
    const s = get(); if (s.mode === 'live') return;
    set({ playing: !s.playing, time: !s.playing && s.time >= s.project.duration ? 0 : s.time, selectedFrame: null });
  },
  addFrame: () => {
    const s = get(); if (s.mode === 'live') return;
    const time = Math.round(s.time * 100) / 100;
    const existing = s.project.keyframes.find(f => Math.abs(f.time - time) < 0.011);
    if (!existing && s.project.keyframes.length >= 200) { set({ notice: '最多支持 200 个关键帧。' }); return; }
    const id = existing?.id ?? `frame-${Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('')}`;
    const keyframes = [...s.project.keyframes.filter(f => f.id !== existing?.id), { id, time: existing?.time ?? time, pose: { ...s.pose } }].sort((a, b) => a.time - b.time);
    set({ project: { ...s.project, keyframes }, selectedFrame: id, playing: false, saved: false,
      notice: existing ? '已更新当前关键帧。' : `已记录 ${time.toFixed(2)} 秒的姿态。` });
  },
  deleteFrame: () => {
    const s = get(); if (s.mode === 'live' || !s.selectedFrame) return;
    if (s.project.keyframes.length <= 1) { set({ notice: '至少保留一个关键帧。' }); return; }
    const project = { ...s.project, keyframes: s.project.keyframes.filter(f => f.id !== s.selectedFrame) };
    set({ project, selectedFrame: null, pose: sampleMotion(project, s.time), playing: false, saved: false, notice: '关键帧已删除。' });
  },
  selectFrame: id => {
    const s = get(); if (s.mode === 'live') return;
    const frame = s.project.keyframes.find(f => f.id === id); if (!frame) return;
    set({ selectedFrame: id, time: frame.time, pose: { ...frame.pose }, playing: false });
  },
  moveFrame: (id, value) => {
    const s = get(); if (s.mode === 'live' || !Number.isFinite(value)) return;
    const time = Math.round(clamp(value, 0, s.project.duration) * 100) / 100;
    if (s.project.keyframes.some(f => f.id !== id && Math.abs(f.time - time) < 0.011)) {
      set({ notice: '该时间已有关键帧，请选择其他时间。' }); return;
    }
    const keyframes = s.project.keyframes.map(f => f.id === id ? { ...f, time } : f).sort((a, b) => a.time - b.time);
    set({ project: { ...s.project, keyframes }, saved: false }); get().selectFrame(id);
  },
  loadProject: project => set({ project, time: 0, pose: sampleMotion(project, 0), playing: false,
    selectedFrame: project.keyframes[0].id, saved: false, notice: '动作已加载。' }),
  setInterpolation: interpolation => {
    const s = get(), project = { ...s.project, interpolation };
    set({ project, pose: sampleMotion(project, s.time), playing: false, saved: false });
  },
  resetPose: () => { if (get().mode === 'edit') set({ pose: { ...HOME }, playing: false, notice: '已恢复初始姿态；可记录为关键帧。' }); },
}));
