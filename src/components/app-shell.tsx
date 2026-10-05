'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Box, House, PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from 'lucide-react';
import { useStudio } from '@/lib/store';

function ProjectShortcut() {
  const name = useStudio(s => s.project.name);
  return <div className="nav-project"><span className="nav-section-label">当前项目</span><Link href="/studio" title={name}><span className="project-dot" /><span>{name}</span><ArrowUpRight size={14} /></Link></div>;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { content.current?.scrollTo(0, 0); }, [pathname]);
  return <div className={`app-frame ${collapsed ? 'nav-collapsed' : ''}`}>
    <a className="skip-link" href="#page-content">跳到内容</a>
    <aside className="app-navigation" aria-label="主导航">
      <div className="nav-top"><Link className="nav-brand" href="/" aria-label="Robot Motion Studio 首页"><Box size={24} /><span>Motion Studio</span></Link>
        <button className="nav-toggle" aria-label={collapsed ? '展开菜单' : '收起菜单'} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button></div>
      <nav className="nav-scroll"><span className="nav-section-label">工作空间</span>
        <Link className={`nav-link ${pathname === '/' ? 'active' : ''}`} aria-current={pathname === '/' ? 'page' : undefined} href="/" title="首页"><House size={18} /><span>首页</span></Link>
        <Link className={`nav-link ${pathname === '/studio' ? 'active' : ''}`} aria-current={pathname === '/studio' ? 'page' : undefined} href="/studio" title="动作工作台"><SlidersHorizontal size={18} /><span>动作工作台</span></Link>
        <ProjectShortcut />
        <div className="nav-note"><span>从一个姿态，到一段动作。</span><p>在三维空间里探索、编排，<br />让想法动起来。</p></div>
      </nav>
      <div className="nav-profile"><span className="profile-avatar">M</span><div><strong>个人工作空间</strong><span>本地保存 · 学习项目</span></div></div>
    </aside>
    <div className="app-content" id="page-content" tabIndex={-1} ref={content}>{children}</div>
  </div>;
}
