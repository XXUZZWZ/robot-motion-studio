'use client';
import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Group, Mesh, Vector3 } from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { sampleSignature, SIGNATURE, SIGNATURE_DURATION, solveArm } from '@/lib/signature';

type Props = { playing: boolean; seek: number; revision: number; onProgress: (p: number) => void; onComplete: () => void };
function Mechanism({ playing, seek, revision, onProgress, onComplete }: Props) {
  const upper = useRef<Mesh>(null), lower = useRef<Mesh>(null), elbow = useRef<Group>(null), wrist = useRef<Group>(null);
  const clock = useRef({ progress: seek, published: 0, finishTime: 0 });
  const { size, invalidate } = useThree();
  const previousInk = useRef(-1);
  const ink = useMemo(() => SIGNATURE.segments.filter(s => s.draw), []);
  const inkLine = useMemo(() => {
    const positions = new Float32Array(SIGNATURE.inkCount * 6);
    SIGNATURE.segments.filter(s => s.draw).forEach(s => { positions.set(s.a, s.inkIndex * 6); positions.set(s.b, s.inkIndex * 6 + 3); });
    const geometry = new LineSegmentsGeometry().setPositions(positions);
    geometry.instanceCount = 0;
    const line = new LineSegments2(geometry, new LineMaterial({ color:'#07836c', linewidth:2.4 }));
    line.frustumCulled = false; return line;
  }, []);
  const scratch = useMemo(() => ({ start: new Vector3(), end: new Vector3(), direction: new Vector3(), up: new Vector3(0, 1, 0) }), []);
  useEffect(() => { clock.current.progress = seek; clock.current.finishTime = 0; onProgress(seek); }, [seek, revision, onProgress]);
  useEffect(() => { inkLine.material.resolution.set(size.width, size.height); }, [inkLine, size]);
  useEffect(() => () => { inkLine.geometry.dispose(); inkLine.material.dispose(); }, [inkLine]);
  useEffect(() => { invalidate(); }, [playing, seek, revision, invalidate]);
  useEffect(() => { const resume = () => { if (!document.hidden) invalidate(); }; document.addEventListener('visibilitychange', resume); return () => document.removeEventListener('visibilitychange', resume); }, [invalidate]);
  useFrame((_, delta) => {
    const c = clock.current;
    if (playing && !document.hidden) {
      c.progress = Math.min(1, c.progress + Math.min(delta, .05) / SIGNATURE_DURATION);
      if (c.progress === 1) onComplete();
    }
    const { point, segment } = sampleSignature(c.progress);
    // Lift and park below the inscription, leaving the finished word unobstructed.
    c.finishTime = c.progress === 1 ? c.finishTime + Math.min(delta, .05) : 0;
    const lift = Math.min(1, c.finishTime / .3), park = Math.max(0, Math.min(1, (c.finishTime - .3) / .8));
    const eased = park * park * (3 - 2 * park);
    const px = point[0] + (.4 - point[0]) * eased, py = point[1] + (-2.05 - point[1]) * eased;
    const pz = point[2] + .35 * lift;
    const [ex, ey] = solveArm(px, py);
    const positionLink = (mesh: Mesh | null, ax: number, ay: number, bx: number, by: number) => {
      if (!mesh) return;
      scratch.start.set(ax, ay, .65); scratch.end.set(bx, by, .65);
      mesh.position.copy(scratch.start).lerp(scratch.end, .5);
      scratch.direction.subVectors(scratch.end, scratch.start);
      mesh.scale.y = scratch.direction.length();
      mesh.quaternion.setFromUnitVectors(scratch.up, scratch.direction.normalize());
    };
    positionLink(upper.current, 0, -1.75, ex, ey);
    positionLink(lower.current, ex, ey, px, py);
    elbow.current?.position.set(ex, ey, .65);
    wrist.current?.position.set(px, py, pz);
    // Restore the preceding partial segment before advancing or scrubbing backwards.
    const attr = inkLine.geometry.attributes.instanceEnd;
    if (previousInk.current >= 0) attr.setXYZ(previousInk.current, ...ink[previousInk.current].b);
    if (segment.draw) attr.setXYZ(segment.inkIndex, ...point);
    previousInk.current = segment.draw ? segment.inkIndex : -1;
    attr.needsUpdate = true;
    inkLine.geometry.instanceCount = segment.inkIndex + (segment.draw ? 1 : 0);
    c.published += delta;
    if (c.published > .1) { onProgress(c.progress); c.published = 0; }
    if (!document.hidden && (playing || (c.progress === 1 && c.finishTime < 1.2))) invalidate();
  });
  return <>
    <ambientLight intensity={1.7} /><directionalLight position={[-3, 5, 8]} intensity={3} /><directionalLight position={[4, -2, 3]} intensity={1.5} />
    <mesh position={[0, .28, -.08]}><boxGeometry args={[7.6, 3.9, .12]} /><meshStandardMaterial color="#faf9f6" roughness={.95} /></mesh>
    <gridHelper args={[7.5, 30, '#e7e5e0', '#efede8']} rotation={[Math.PI / 2, 0, 0]} position={[0, .2, -.01]} scale={[1, 1, .51]} />
    <primitive object={inkLine} dispose={null} />
    <mesh ref={upper}><cylinderGeometry args={[.15, .2, 1, 6]} /><meshStandardMaterial color="#e5e7e4" metalness={.55} roughness={.3} /><mesh position={[0, 0, .14]}><boxGeometry args={[.075, .72, .03]} /><meshStandardMaterial color="#59635c" metalness={.5} roughness={.3} /></mesh></mesh>
    <mesh ref={lower}><cylinderGeometry args={[.09, .14, 1, 6]} /><meshStandardMaterial color="#e5e7e4" metalness={.55} roughness={.3} /><mesh position={[0, 0, .1]}><boxGeometry args={[.045, .7, .025]} /><meshStandardMaterial color="#59635c" metalness={.5} roughness={.3} /></mesh></mesh>
    {[[0, -1.75, .65] as [number, number, number]].map(position => <group key="base" position={position}><mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.31, .36, .35, 40]} /><meshStandardMaterial color="#454b49" metalness={.65} roughness={.35} /></mesh><mesh position={[0, 0, .23]}><sphereGeometry args={[.15, 24, 24]} /><meshStandardMaterial color="#737d79" metalness={.8} roughness={.2} /></mesh></group>)}
    <group ref={elbow}><mesh><sphereGeometry args={[.2, 24, 24]} /><meshStandardMaterial color="#3c4642" metalness={.7} roughness={.3} /></mesh><mesh position={[0, 0, .16]}><torusGeometry args={[.12, .025, 12, 32]} /><meshStandardMaterial color="#10a37f" /></mesh></group>
    <group ref={wrist}><mesh position={[0, 0, .35]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.12, .12, .32, 24]} /><meshStandardMaterial color="#374b43" metalness={.6} roughness={.3} /></mesh><mesh position={[0, 0, .16]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.028, .065, .32, 16]} /><meshStandardMaterial color="#10a37f" metalness={.5} roughness={.25} /></mesh><mesh><sphereGeometry args={[.036, 16, 16]} /><meshBasicMaterial color="#10a37f" /></mesh></group>
  </>;
}
function ResponsiveCamera() {
  const { camera, size } = useThree();
  useEffect(() => { camera.zoom = Math.min(size.width / 8.6, size.height / 5); camera.updateProjectionMatrix(); }, [camera, size]);
  return null;
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="signature-fallback">Bridgedp<small>3D 展示暂不可用，请启用浏览器硬件加速。</small></div> : this.props.children; }
}
export default function SignatureScene(props: Props) {
  return <Boundary><Canvas frameloop="demand" orthographic camera={{ position: [0, .45, 12], zoom: 77, near: .1, far: 40 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}><ResponsiveCamera /><Mechanism {...props} /></Canvas></Boundary>;
}
