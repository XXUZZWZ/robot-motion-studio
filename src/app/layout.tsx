import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/app-shell';
export const metadata: Metadata = {
  title: 'Robot Motion Studio · 机器人动作工作台',
  description: '机器人关节控制、关键帧编辑、运动轨迹与实时状态可视化学习项目。',
  icons: { icon: '/favicon.svg' },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body><AppShell>{children}</AppShell></body></html>;
}
