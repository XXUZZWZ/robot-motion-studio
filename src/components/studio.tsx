'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { Activity, Axis3D, BookOpen, Box, Cable, Check, ChevronDown, ChevronRight, CircleDot, Crosshair, Diamond, Download, FileJson, FolderOpen, Layers3, Link2, Maximize, Pause, Play, Plus, Radio, Repeat2, RotateCcw, Save, SkipBack, SlidersHorizontal, Trash2, Unplug, Upload, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { clamp, degrees, JOINTS, makeDemo, parseProject, radians, sampleMotion, type Keyframe } from '@/lib/motion';
import { useStudio } from '@/lib/store';
import { useDevice, type DeviceStatus } from '@/hooks/use-device';
import type { SceneMetrics } from './robot-scene';

const RobotScene = dynamic(() => import('./robot-scene'), { ssr: false, loading: () => <div className="scene-message">正在准备 3D 场景…</div> });
const STORAGE_KEY = 'robot-motion-studio.project.v1';
const emptyMetrics: SceneMetrics = { fps: 0, calls: 0, geometries: 0, triangles: 0, tip: [0, 0, 0] };
function saveCurrentProject() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(useStudio.getState().project)); useStudio.setState({ saved: true, notice: '动作已保存到本机浏览器。' }); }
  catch { useStudio.setState({ notice: '浏览器存储不可用，请导出 JSON 保存。' }); }
}

function IconButton({ label, children, onClick, active = false, disabled = false }: {
  label: string; children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean;
}) {
  return <Button variant="ghost" size="icon" title={label} aria-label={label} aria-pressed={active} disabled={disabled} className={`icon-button ${active ? 'is-active' : ''}`} onClick={onClick}>{children}</Button>;
}

function LearningGuide() {
  const topics = [
    ['01', '关节为什么会带动下一级？', 'URDF 用 link 表示刚性零件，joint 连接父子零件。修改父关节后，子零件的世界变换随层级更新。先选 J2，观察 J3–J6 一起移动。', 'public/models/rms-arm.urdf'],
    ['02', '角度与坐标系', '界面显示角度，文件保存弧度。URDF 使用 Z 向上，场景根节点旋转 −90° 转为 Y 向上。开启关节坐标轴，再改一条 axis，比较结果。', 'src/components/robot-scene.tsx'],
    ['03', '关键帧怎样变成动画？', '每个关键帧保存时间与六个关节角度。播放时查找左右两帧并插值。线性插值匀速，平滑插值会在关键帧处减速。', 'src/lib/motion.ts'],
    ['04', '轨迹从哪里来？', '给定关节角度，沿层级计算工具末端的世界位置，这就是正向运动学。青色曲线是整段动作的末端采样路径，未验证碰撞或动力学可行性。', 'src/components/robot-scene.tsx'],
    ['05', '实时通信与渲染', 'Node.js 每秒发 20 次模拟关节状态。浏览器保留有限缓冲，并以 100ms 延迟插值显示；断流时保持最后姿态，连接关闭后自动重试。', 'src/hooks/use-device.ts'],
    ['06', '一次动手练习', '拖动时间到 3 秒，调整 J2 / J3，记录姿态后播放；再导出 JSON，找到这个关键帧，修改一个合法角度并重新导入。', 'docs/学习路线.md'],
  ];
  return <Dialog.Root><Dialog.Trigger asChild><Button variant="ghost" className="guide-trigger"><BookOpen size={16} />学习指南</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="guide-dialog">
      <div className="guide-heading"><div><span className="eyebrow">LEARN BY BUILDING</span><Dialog.Title>从一次关节旋转开始</Dialog.Title></div><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="关闭学习指南"><X /></Button></Dialog.Close></div>
      <Dialog.Description className="guide-description">每一项都有可以观察的现象、对应代码和动手练习。</Dialog.Description>
      <div className="learning-topics">{topics.map(([num, title, description, file]) => <article key={num}><span className="lesson-number">{num}</span><div><h3>{title}</h3><p>{description}</p><code>{file}</code></div></article>)}</div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

function JointTree() {
  const selected = useStudio(s => s.selectedJoint);
  return <div className="tree"><div className="tree-root"><ChevronDown size={14} /><Box size={15} /><span>RMS ARM / 06</span></div>
    {JOINTS.map((j, i) => <button key={j.id} className={`tree-item ${selected === j.id ? 'selected' : ''}`} style={{ paddingLeft: `${18 + i * 7}px` }} onClick={() => useStudio.setState({ selectedJoint: j.id })} aria-pressed={selected === j.id}>
      <span className="tree-line" /><CircleDot size={13} /><span>J{i + 1}</span><span className="tree-name">{j.name}</span>
    </button>)}
    <div className="tree-tip"><Crosshair size={12} />tool_tip</div>
  </div>;
}

function Sidebar({ device, endpoint, setEndpoint }: { device: DeviceStatus; endpoint: string; setEndpoint: (value: string) => void }) {
  const mode = useStudio(s => s.mode);
  return <aside className="sidebar">
    <div className="panel-heading"><span><Layers3 size={15} />场景结构</span><span className="count-badge">01</span></div>
    <JointTree />
    <div className="model-details"><span className="eyebrow">ROBOT MODEL</span><dl><div><dt>自由度</dt><dd>6 DOF</dd></div><div><dt>模型格式</dt><dd>URDF</dd></div><div><dt>长度单位</dt><dd>m</dd></div><div><dt>模型类型</dt><dd>教学机械臂</dd></div></dl></div>
    <div className="device-card" id="device"><div className="device-title"><Radio size={15} /><span>模拟设备</span><span className={`connection-dot ${device.state === 'live' ? 'online' : ''}`} /></div>
      <p>通过实时关节状态驱动模型</p>
      <label htmlFor="device-url">WebSocket 地址</label><input id="device-url" value={endpoint} disabled={mode === 'live'} onChange={e => setEndpoint(e.target.value)} spellCheck={false} />
      <div className="device-stat"><span>接收频率</span><strong>20 Hz</strong></div>
      <div className="device-stat"><span>已接收</span><strong>{device.packets} 帧</strong></div>
      {mode === 'live' && <div className="device-stat"><span>距最近帧</span><strong>{device.age} ms</strong></div>}
      {device.state === 'retrying' && <p className="retry-note">连接中断，正在重试。请确认模拟服务已启动。</p>}
      <span className="simulation-note">数据来自本地模拟器</span>
    </div>
    <div className="sidebar-bottom"><FileJson size={14} /><span>项目文件保存关节动作</span></div>
  </aside>;
}

function AngleField({ joint, value, disabled }: { joint: typeof JOINTS[number]; value: number; disabled: boolean }) {
  const [draft, setDraft] = useState(degrees(value).toFixed(1));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setDraft(degrees(value).toFixed(1)); }, [value]);
  return <input aria-label={`${joint.name}角度数值`} type="text" inputMode="decimal" value={draft} disabled={disabled}
    onFocus={() => { editing.current = true; }}
    onChange={e => {
      const raw = e.target.value; setDraft(raw);
      if (raw.trim() && Number.isFinite(Number(raw))) useStudio.getState().setJoint(joint.id, radians(Number(raw)));
    }}
    onBlur={() => {
      editing.current = false;
      const next = draft.trim() && Number.isFinite(Number(draft)) ? clamp(radians(Number(draft)), joint.lower, joint.upper) : value;
      useStudio.getState().setJoint(joint.id, next); setDraft(degrees(next).toFixed(1));
    }}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}

function JointControls() {
  const pose = useStudio(s => s.pose), selected = useStudio(s => s.selectedJoint), mode = useStudio(s => s.mode);
  const setJoint = useStudio(s => s.setJoint), resetPose = useStudio(s => s.resetPose);
  return <aside className="inspector">
    <div className="panel-heading"><span><SlidersHorizontal size={15} />关节控制</span><span className="unit-label">DEG</span></div>
    <div className="inspector-intro">{mode === 'live' ? '实时姿态 · 编辑已锁定' : '调整姿态后，记录到时间轴'}</div>
    <div className="joint-list">{JOINTS.map((j, index) => <div className={`joint-control ${selected === j.id ? 'selected' : ''}`} key={j.id} onFocus={() => useStudio.setState({ selectedJoint: j.id })}>
      <div className="joint-label"><button onClick={() => useStudio.setState({ selectedJoint: j.id })}><span className="joint-code">J{index + 1}</span>{j.name}</button><span className="axis-tag">{j.axis}</span></div>
      <div className="joint-input-row"><Slider min={degrees(j.lower)} max={degrees(j.upper)} step={0.1} value={[degrees(pose[j.id])]} disabled={mode === 'live'} onValueChange={([value]) => setJoint(j.id, radians(value))} aria-label={`${j.name}角度`} />
        <div className="angle-input"><AngleField joint={j} value={pose[j.id]} disabled={mode === 'live'} /><span>°</span></div></div>
      <div className="joint-limits"><span>{degrees(j.lower).toFixed(0)}°</span><span>{degrees(j.upper).toFixed(0)}°</span></div>
    </div>)}</div>
    <Button variant="outline" className="reset-pose" onClick={resetPose} disabled={mode === 'live'}><RotateCcw size={14} />恢复初始姿态</Button>
    <div className="inspector-hint"><CircleDot size={15} /><span>点击模型零件可选中对应关节</span></div>
  </aside>;
}

function FrameMarker({ frame, jointIndex }: { frame: Keyframe; jointIndex: number }) {
  const duration = useStudio(s => s.project.duration), selected = useStudio(s => s.selectedFrame), mode = useStudio(s => s.mode);
  const beginDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (mode === 'live') return;
    event.stopPropagation();
    const startX = event.clientX, rect = event.currentTarget.parentElement!.getBoundingClientRect();
    const finish = (up: globalThis.PointerEvent) => {
      if (Math.abs(up.clientX - startX) > 4) useStudio.getState().moveFrame(frame.id, frame.time + (up.clientX - startX) / rect.width * duration);
      else useStudio.getState().selectFrame(frame.id);
      window.removeEventListener('pointerup', finish);
    };
    window.addEventListener('pointerup', finish, { once: true });
  };
  return <button className={`frame-marker ${selected === frame.id ? 'selected' : ''}`} style={{ left: `${frame.time / duration * 100}%` }} aria-label={`J${jointIndex + 1} ${frame.time.toFixed(2)}秒关键帧`} disabled={mode === 'live'} title={`${frame.time.toFixed(2)}s · 可左右拖动`} onPointerDown={beginDrag} onKeyDown={e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); useStudio.getState().selectFrame(frame.id); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); useStudio.getState().moveFrame(frame.id, frame.time + (e.key === 'ArrowRight' ? 0.1 : -0.1)); }
  }} />;
}

function Timeline() {
  const project = useStudio(s => s.project), time = useStudio(s => s.time), playing = useStudio(s => s.playing);
  const speed = useStudio(s => s.speed), loop = useStudio(s => s.loop), mode = useStudio(s => s.mode), selectedId = useStudio(s => s.selectedFrame);
  const selectedFrame = project.keyframes.find(f => f.id === selectedId), disabled = mode === 'live';
  return <section className="timeline" id="timeline" aria-label="动作时间轴">
    <div className="timeline-toolbar"><div className="timeline-title"><Activity size={16} /><strong>动作时间轴</strong><span>{project.keyframes.length} 个关键帧</span></div>
      <div className="transport"><IconButton label="回到起点" disabled={disabled} onClick={() => useStudio.getState().seek(0)}><SkipBack size={16} /></IconButton>
        <Button size="icon" className="play-button" disabled={disabled} aria-label={playing ? '暂停动作' : '播放动作'} onClick={() => useStudio.getState().togglePlay()}>{playing ? <Pause size={16} /> : <Play size={16} fill="currentColor" />}</Button>
        <IconButton label="循环播放" disabled={disabled} active={loop} onClick={() => useStudio.setState({ loop: !loop })}><Repeat2 size={16} /></IconButton>
        <div className="time-readout"><strong data-testid="current-time">{time.toFixed(2)}</strong><span>/ {project.duration.toFixed(2)} s</span></div>
        <select aria-label="播放速度" value={speed} disabled={disabled} onChange={e => useStudio.setState({ speed: Number(e.target.value) })}>{[0.25, 0.5, 1, 1.5, 2].map(n => <option key={n} value={n}>{n}×</option>)}</select></div>
      <div className="timeline-actions"><select aria-label="插值方式" value={project.interpolation} disabled={disabled} onChange={e => useStudio.getState().setInterpolation(e.target.value as 'linear' | 'smooth')}><option value="smooth">平滑插值</option><option value="linear">线性插值</option></select>
        <Button className="record-button" onClick={() => useStudio.getState().addFrame()} disabled={disabled}><Plus size={15} />记录姿态</Button></div>
    </div>
    <div className="timeline-content"><div className="track-labels"><span className="track-label-header">关节轨道</span>{JOINTS.map((j, i) => <div key={j.id}><span className="track-dot" />J{i + 1}<span>{j.name}</span></div>)}</div>
      <div className="tracks"><div className="ruler">{Array.from({ length: 9 }, (_, i) => <span key={i} style={{ left: `${i / 8 * 100}%` }}>{(i * project.duration / 8).toFixed(1)}<small>s</small></span>)}
        <input type="range" aria-label="播放位置" min="0" max={project.duration} step="0.01" value={time} disabled={disabled} onChange={e => useStudio.getState().seek(Number(e.target.value))} /></div>
        <div className="track-area"><div className="playhead" style={{ left: `${time / project.duration * 100}%` }}><span /></div>
          {JOINTS.map((j, i) => <div className="track-row" key={j.id}>{project.keyframes.map(frame => <FrameMarker key={frame.id} frame={frame} jointIndex={i} />)}</div>)}</div>
      </div>
    </div>
    <div className="timeline-bottom"><span><Diamond size={12} />点击关键帧选中 · 拖动调整时间 · 空格播放</span><div>{selectedFrame ? <><label>选中时间 <input key={`${selectedFrame.id}-${selectedFrame.time}`} aria-label="关键帧时间" type="number" defaultValue={selectedFrame.time} min={0} max={project.duration} step={0.1} disabled={disabled} onBlur={e => useStudio.getState().moveFrame(selectedFrame.id, Number(e.target.value))} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /> s</label><Button variant="ghost" size="sm" disabled={disabled || project.keyframes.length <= 1} onClick={() => useStudio.getState().deleteFrame()}><Trash2 size={13} />删除</Button></> : <span>整段动作 · {project.duration.toFixed(0)} s</span>}</div></div>
  </section>;
}

export default function Studio() {
  const project = useStudio(s => s.project), mode = useStudio(s => s.mode), notice = useStudio(s => s.notice), saved = useStudio(s => s.saved);
  const showTrail = useStudio(s => s.showTrail), showAxes = useStudio(s => s.showAxes);
  const [metrics, setMetrics] = useState(emptyMetrics), [ready, setReady] = useState(false);
  const [endpoint, setEndpoint] = useState('ws://127.0.0.1:3101');
  const fileInput = useRef<HTMLInputElement>(null), device = useDevice(endpoint);
  const handleReady = useCallback((value: boolean) => setReady(value), []);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') setEndpoint(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw && !useStudio.getState().initialized) { useStudio.getState().loadProject(parseProject(JSON.parse(raw))); useStudio.setState({ saved: true, notice: '已恢复本机保存的动作。' }); } }
    catch { useStudio.setState({ notice: '本机存档无法读取，已载入示例动作。' }); }
    useStudio.setState({ initialized: true });
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrentProject(); return; }
      const element = e.target as HTMLElement;
      if (element.closest('input,select,textarea,button,[role="dialog"],[role="slider"]') || element.isContentEditable) return;
      if (e.code === 'Space') { e.preventDefault(); useStudio.getState().togglePlay(); }
    };
    window.addEventListener('keydown', key); return () => { window.removeEventListener('keydown', key); useStudio.setState({ playing: false, mode: 'edit' }); };
  }, []);
  const exportProject = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'robot-motion.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    useStudio.setState({ notice: '动作 JSON 已导出，可重新导入继续编辑。' });
  };
  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('动作文件不能超过 2 MB');
      const next = parseProject(JSON.parse(await file.text())); useStudio.getState().loadProject(next);
      useStudio.setState({ notice: `已导入“${next.name}”。` });
    } catch (error) { useStudio.setState({ notice: `导入失败：${error instanceof Error ? error.message : '文件格式错误'}` }); }
  };
  const toggleDevice = () => {
    if (mode === 'live') { useStudio.setState({ mode: 'edit', pose: sampleMotion(project, useStudio.getState().time), notice: '已断开模拟设备，回到动作编辑。' }); return; }
    try { const url = new URL(endpoint); if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error(); }
    catch { useStudio.setState({ notice: '请输入有效的 ws:// 或 wss:// 地址。' }); return; }
    useStudio.setState({ mode: 'live', playing: false, selectedFrame: null, notice: '正在连接模拟设备；接收实时关节姿态。' });
  };
  return <main className="studio-shell">
    <header className="app-header"><div className="brand"><div className="brand-symbol"><Axis3D size={25} strokeWidth={1.7} /></div><div><h1>Robot Motion <span>Studio</span></h1><p>机器人动作工作台</p></div><span className="version-badge">LAB 01</span></div>
      <div className="header-actions"><LearningGuide /><span className="header-divider" /><Button variant="outline" onClick={saveCurrentProject} title="保存到本机 · Ctrl / ⌘ + S" className="save-button">{saved ? <Check size={15} /> : <Save size={15} />}{saved ? '已保存' : '保存'}</Button><Button variant="outline" onClick={exportProject}><Download size={15} /><span>导出动作</span></Button></div>
    </header>
    <div className="workspace-bar"><div className="project-breadcrumb"><FolderOpen size={15} /><span>工作空间</span><ChevronRight size={12} /><input aria-label="动作名称" maxLength={80} value={project.name} onChange={e => useStudio.setState({ project: { ...project, name: e.target.value }, saved: false })} onBlur={() => { if (!project.name.trim()) useStudio.setState({ project: { ...project, name: '未命名动作' } }); }} /></div>
      <div className="mode-controls"><span className={`mode-badge ${mode === 'live' ? 'live' : ''}`}><span />{mode === 'live' ? device.state === 'live' ? '实时监看' : '连接中' : '动作编辑'}</span><Button variant="ghost" size="sm" className="connect-button" onClick={toggleDevice}>{mode === 'live' ? <Unplug size={14} /> : <Cable size={14} />}{mode === 'live' ? '断开连接' : '连接模拟设备'}</Button></div>
    </div>
    <div className="workspace"><Sidebar device={device} endpoint={endpoint} setEndpoint={setEndpoint} />
      <section className="viewport" aria-label="机器人三维场景"><div className="viewport-top"><div><span className="scene-label">PERSPECTIVE</span><span className="scene-subtitle">RMS ARM / 06</span></div><div className="viewport-tools"><IconButton label="显示末端轨迹" active={showTrail} disabled={mode === 'live'} onClick={() => useStudio.setState({ showTrail: !showTrail })}><Activity size={16} /></IconButton><IconButton label="显示关节坐标轴" active={showAxes} onClick={() => useStudio.setState({ showAxes: !showAxes })}><Axis3D size={16} /></IconButton><IconButton label="重置视角" onClick={() => useStudio.setState(s => ({ cameraReset: s.cameraReset + 1 }))}><Maximize size={16} /></IconButton><IconButton label="重新加载模型" onClick={() => useStudio.setState(s => ({ modelRevision: s.modelRevision + 1 }))}><RotateCcw size={16} /></IconButton></div></div>
        <RobotScene onMetrics={setMetrics} onReady={handleReady} />
        <div className="viewport-info"><span className={`ready-dot ${ready ? 'ready' : ''}`} />{ready ? '模型已就绪' : '加载中'}<span className="info-divider">/</span>{metrics.fps} FPS<span className="info-divider">/</span>{metrics.calls} DRAW CALLS</div>
        <div className="viewport-caption"><span>左键旋转</span><span>右键平移</span><span>滚轮缩放</span></div>
        <div className="tip-readout"><span><Crosshair size={12} />末端位置 <small>世界坐标 / m</small></span><div>{['X', 'Y', 'Z'].map((axis, i) => <span key={axis}><b>{axis}</b>{metrics.tip[i].toFixed(3)}</span>)}</div></div>
      </section><JointControls />
    </div>
    <div className="asset-strip"><span><Link2 size={14} />{project.name}</span><span className="asset-meta">{project.duration.toFixed(1)} s<span>·</span>6 个关节<span>·</span>{project.keyframes.length} 个关键帧</span><div><Button size="sm" variant="ghost" disabled={mode === 'live'} onClick={() => { if (window.confirm('载入示例将替换当前编辑中的动作。继续？')) useStudio.getState().loadProject(makeDemo()); }}><RotateCcw size={13} />载入示例</Button><Button size="sm" variant="ghost" disabled={mode === 'live'} onClick={() => fileInput.current?.click()}><Upload size={13} />导入动作</Button><input hidden ref={fileInput} type="file" accept=".json,application/json" onChange={importProject} aria-label="导入动作文件" /></div></div>
    <Timeline />
    <footer className="status-bar"><div role="status" aria-live="polite"><span className="status-square" />{notice}</div><span>{metrics.geometries} geometries<span className="footer-separator">/</span>{metrics.triangles.toLocaleString()} triangles<span className="footer-separator">/</span>v0.1.0</span></footer>
  </main>;
}
