'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Axis3D, Braces, Cable, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
const SignatureScene = dynamic(() => import('./signature-scene'), { ssr: false, loading: () => <div className="signature-loading">正在准备机械臂…</div> });
export default function Home() {
  const [playing, setPlaying] = useState(false), [progress, setProgress] = useState(0), [seek, setSeek] = useState(0), [revision, setRevision] = useState(0);
  useEffect(() => { setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, []);
  const complete = useCallback(() => setPlaying(false), []);
  const replay = () => { setSeek(0); setProgress(0); setRevision(n => n + 1); setPlaying(true); };
  return <main className="home-page">
    <header className="home-header"><span>Robot Motion Studio <span className="home-header-tag">Playground</span></span><Link href="/studio">打开工作台 <ArrowRight size={15} /></Link></header>
    <div className="home-inner"><div className="home-intro"><span className="home-kicker"><Sparkles size={14} /> 让每一个动作，都有迹可循</span><h1>从想象，到运动。</h1><p>给机械臂一个想法，看它在空间里写下答案。</p></div>
      <section className="signature-card" aria-label="机械臂绘制 Bridgedp 展示">
        <div className="signature-topline"><span><span className={playing ? 'demo-dot playing' : 'demo-dot'} />{progress >= 1 ? '绘制完成' : playing ? '正在绘制' : '已暂停'}<b>Bridgedp</b></span><span>机械臂书写演示</span></div>
        <div className="signature-viewport"><SignatureScene playing={playing} seek={seek} revision={revision} onProgress={setProgress} onComplete={complete} /></div>
        <div className="signature-controls"><button aria-label={playing ? '暂停书写' : '播放书写'} onClick={() => { if (progress >= 1) replay(); else setPlaying(v => !v); }}>{playing ? <Pause size={17} /> : <Play size={17} />}</button><button aria-label="重新绘制" onClick={replay}><RotateCcw size={16} /></button><input type="range" min="0" max="1" step="0.001" value={progress} aria-label="书写进度" onChange={e => { const p = Number(e.target.value); setSeek(p); setProgress(p); setRevision(n => n + 1); setPlaying(false); }} /><output aria-label="书写完成百分比">{Math.round(progress * 100)}%</output><span className="signature-caption">轨迹跟随 · 抬笔落笔</span></div>
      </section>
      <div className="home-cta"><Link className="primary-link" href="/studio">开始编排动作 <ArrowRight size={17} /></Link><span>调整关节，记录你的第一个关键帧</span></div>
      <section className="home-features" aria-label="工作台能力"><Link href="/studio"><Axis3D size={21} /><h2>在空间里探索</h2><p>旋转视角、调节六轴关节，<br />直观看到每一次姿态变化。</p><span>查看模型 <ArrowRight size={14} /></span></Link><Link href="/studio#timeline"><Braces size={21} /><h2>把姿态变成动作</h2><p>记录关键帧，编辑时间轴，<br />用平滑插值连接每个瞬间。</p><span>编排动作 <ArrowRight size={14} /></span></Link><Link href="/studio#device"><Cable size={21} /><h2>连接实时状态</h2><p>连接本地模拟设备，<br />观察关节状态与模型同步。</p><span>连接设备 <ArrowRight size={14} /></span></Link></section>
      <footer className="home-footer">为学习与探索而构建 <span>·</span> Three.js / React Three Fiber <span>·</span> 书写演示使用独立的平面机械臂</footer>
    </div>
  </main>;
}
