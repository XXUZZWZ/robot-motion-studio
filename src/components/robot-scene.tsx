'use client';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Grid, Line, OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { AxesHelper, BufferGeometry, Material, Mesh, MeshStandardMaterial, PCFShadowMap, Vector3, type Object3D } from 'three';
import URDFLoader, { URDFRobot } from 'urdf-loader';
import { advanceTime, sampleMotion } from '@/lib/motion';
import { useStudio } from '@/lib/store';
import { sampleTelemetry, telemetryBuffer } from '@/lib/telemetry';

export type SceneMetrics = { fps: number; calls: number; geometries: number; triangles: number; tip: [number, number, number] };

function disposeRobot(robot: URDFRobot) {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
  robot.traverse(obj => {
    if (obj instanceof Mesh) {
      geometries.add(obj.geometry);
      for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(mat);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}

function useRobot(onReady: (ready: boolean) => void) {
  const revision = useStudio(s => s.modelRevision);
  const [robot, setRobot] = useState<URDFRobot | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController(); let owned: URDFRobot | null = null;
    setRobot(null); setError(''); onReady(false);
    fetch('/models/rms-arm.urdf', { signal: abort.signal }).then(r => {
      if (!r.ok) throw new Error(`模型加载失败 (${r.status})`); return r.text();
    }).then(xml => {
      if (abort.signal.aborted) return;
      owned = new URDFLoader().parse(xml);
      // Convert URDF Z-up to Three.js Y-up once, at the model root.
      owned.rotation.x = -Math.PI / 2;
      const oldMaterials = new Set<Material>();
      owned.traverse(obj => {
        if (!(obj instanceof Mesh)) return;
        const old = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as MeshStandardMaterial;
        oldMaterials.add(old);
        obj.material = new MeshStandardMaterial({ color: old.color, roughness: 0.39, metalness: 0.42 });
        obj.castShadow = true; obj.receiveShadow = true;
        let parent: Object3D | null = obj;
        while (parent && !(parent as Object3D & { isURDFLink?: boolean }).isURDFLink) parent = parent.parent;
        obj.userData.jointId = parent?.parent?.name ?? '';
      });
      oldMaterials.forEach(material => material.dispose());
      owned.setJointValues(useStudio.getState().pose); owned.updateMatrixWorld(true);
      setRobot(owned); onReady(true);
    }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => {
      abort.abort();
      if (owned) {
        // Detach before disposal: React's next commit can lag behind a render frame.
        // A still-visible disposed geometry would be uploaded again by WebGLRenderer.
        owned.removeFromParent();
        disposeRobot(owned);
      }
    };
  }, [revision, onReady]);
  return { robot, error };
}

function Robot({ robot, onMetrics }: { robot: URDFRobot; onMetrics: (metrics: SceneMetrics) => void }) {
  const project = useStudio(s => s.project), selectedJoint = useStudio(s => s.selectedJoint);
  const showTrail = useStudio(s => s.showTrail), showAxes = useStudio(s => s.showAxes);
  const mode = useStudio(s => s.mode);
  const clock = useRef({ time: 0, published: 0, wasPlaying: false, lastUi: 0, lastMetrics: 0, frames: 0 });
  const tip = useMemo(() => new Vector3(), []);
  const trail = useMemo(() => {
    // This clone shares GPU resources; use it only for FK, never dispose shared assets here.
    const ghost = robot.clone() as URDFRobot;
    const points: Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      ghost.setJointValues(sampleMotion(project, project.duration * i / 160)); ghost.updateMatrixWorld(true);
      points.push(ghost.links.tool_tip.getWorldPosition(new Vector3()));
    }
    return points;
  }, [robot, project]);

  useEffect(() => {
    robot.traverse(obj => {
      if (!(obj instanceof Mesh)) return;
      const material = obj.material as MeshStandardMaterial;
      material.emissive.set(obj.userData.jointId === selectedJoint ? '#07836c' : '#000000');
      material.emissiveIntensity = obj.userData.jointId === selectedJoint ? 0.25 : 0;
    });
  }, [robot, selectedJoint]);

  useEffect(() => {
    if (!showAxes) return;
    const joint = robot.joints[selectedJoint], axes = new AxesHelper(0.3);
    joint.add(axes);
    return () => { joint.remove(axes); axes.dispose(); };
  }, [robot, selectedJoint, showAxes]);

  useFrame(({ gl }, delta) => {
    const s = useStudio.getState(), c = clock.current, now = performance.now();
    if (!c.lastMetrics) c.lastMetrics = now;
    let pose = s.pose;
    if (s.mode === 'live') pose = sampleTelemetry(telemetryBuffer, now) ?? s.pose;
    else if (s.playing) {
      if (!c.wasPlaying || Math.abs(s.time - c.published) > 0.0001) c.time = s.time;
      const next = advanceTime(c.time, delta, s.speed, s.project.duration, s.loop);
      c.time = next.time; pose = sampleMotion(s.project, c.time);
      if (now - c.lastUi >= 50 || next.ended) {
        c.published = c.time; c.lastUi = now;
        useStudio.setState({ time: c.time, pose, playing: !next.ended });
      }
    }
    if (s.mode === 'live' && now - c.lastUi >= 50) { c.lastUi = now; useStudio.setState({ pose }); }
    c.wasPlaying = s.playing;
    robot.setJointValues(pose); robot.updateMatrixWorld(true);
    c.frames++;
    if (now - c.lastMetrics > 500) {
      robot.links.tool_tip.getWorldPosition(tip);
      onMetrics({ fps: Math.round(c.frames * 1000 / (now - c.lastMetrics)), calls: gl.info.render.calls,
        geometries: gl.info.memory.geometries, triangles: gl.info.render.triangles, tip: tip.toArray() as [number, number, number] });
      c.lastMetrics = now; c.frames = 0;
    }
    // Aggregate the main scene, shadow and gizmo passes from the previous frame.
    gl.info.reset();
  });
  const select = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation(); const id = event.object.userData.jointId;
    if (id?.startsWith('joint_')) useStudio.setState({ selectedJoint: id });
  };
  return <>
    <primitive object={robot} dispose={null} onPointerDown={select} />
    {showTrail && mode === 'edit' && <Line points={trail} color="#07977e" lineWidth={2} transparent opacity={0.75} />}
  </>;
}

function CameraRig() {
  const reset = useStudio(s => s.cameraReset), { camera } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => { camera.position.set(3.1, 2.3, 3.3); controls.current?.target.set(0, 0.95, 0); controls.current?.update(); }, [reset, camera]);
  return <OrbitControls ref={controls} makeDefault minDistance={1.5} maxDistance={8} maxPolarAngle={Math.PI / 2 + 0.05} target={[0, 0.95, 0]} enableDamping />;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="scene-message">3D 场景无法启动，请启用浏览器硬件加速后刷新。</div> : this.props.children; }
}

export default function RobotScene({ onMetrics, onReady }: { onMetrics: (metrics: SceneMetrics) => void; onReady: (ready: boolean) => void }) {
  const { robot, error } = useRobot(onReady);
  return <SceneBoundary>
    <Canvas shadows={{ type: PCFShadowMap }} onCreated={({ gl }) => { gl.info.autoReset = false; }} dpr={[1, 1.75]} camera={{ position: [3.1, 2.3, 3.3], fov: 36, near: 0.05, far: 50 }} gl={{ antialias: true }}>
      <color attach="background" args={['#f7f7f5']} />
      <fog attach="fog" args={['#f7f7f5', 7, 16]} />
      <ambientLight intensity={0.8} />
      <hemisphereLight args={['#e4efff', '#29323c', 2]} />
      <directionalLight position={[4, 6, 3]} intensity={3} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} shadow-normalBias={0.02} />
      <directionalLight position={[-3, 2, -4]} intensity={2} color="#8dbfff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow><planeGeometry args={[30, 30]} /><meshStandardMaterial color="#f0f0ed" roughness={0.95} /></mesh>
      <Grid position={[0, 0.002, 0]} args={[20, 20]} cellSize={0.25} cellThickness={0.55} cellColor="#deded8" sectionSize={1} sectionThickness={0.8} sectionColor="#c9cbc5" fadeDistance={9} fadeStrength={1.5} />
      {robot && <Robot robot={robot} onMetrics={onMetrics} />}
      <CameraRig />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}><GizmoViewport axisColors={['#f67d77', '#82c8a4', '#77aef3']} labelColor="#10151b" /></GizmoHelper>
    </Canvas>
    {!robot && <div className="scene-message">{error || '正在加载机械臂…'}</div>}
  </SceneBoundary>;
}
