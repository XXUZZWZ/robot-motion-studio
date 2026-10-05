# Robot Motion Studio

面向机器人平台前端岗位的实践项目。使用 Next.js、React Three Fiber 和 URDF Loader，实现六轴机械臂的关节控制、关键帧动作编辑、末端轨迹和 WebSocket 实时状态展示。

## 本地启动

要求 Node.js 22+ 与 pnpm。首次运行：

```bash
pnpm install
pnpm dev
```

已安装依赖后，也可直接运行：

```bash
node scripts/dev.mjs
```

打开 <http://127.0.0.1:3100>。同一命令会启动位于 `ws://127.0.0.1:3101` 的模拟设备，两个服务均只监听本机地址。Ctrl+C 结束服务。

## 第一次操作

首页是机械臂书写 Bridgedp 的三维展示，可暂停、重播、拖动进度；点击“开始编排动作”或左侧“动作工作台”进入 `/studio`。左侧导航和内容独立滚动，场景结构和关节面板也分别滚动。收起菜单可以扩大工作区。

1. 进入工作台后点击播放，观察示例动作及绿色末端轨迹。
2. 在时间轴顶部拖动播放位置到 3 秒。
3. 调整 J2、J3 的滑块，点击“记录姿态”。
4. 播放修改后的动作。点击关键帧选中，左右拖动可改变该帧时间。
5. “保存”写入当前浏览器；“导出动作”下载 JSON，可通过“导入动作”恢复。
6. 点击“连接模拟设备”，观察实时姿态。该模式锁定动作编辑，断开后回到原动作。
7. 点击“学习指南”，按现象找到对应代码。

空格播放 / 暂停；Ctrl / ⌘ + S 保存；关键帧获得键盘焦点后，Enter 选中，左右方向键移动 0.1 秒。鼠标左键旋转视角，右键平移，滚轮缩放。首页与工作台之间切换保留未保存的项目编辑；离开工作台暂停播放并断开模拟设备。

## 当前实现

- 浅色界面、独立导航、响应式工作台与首页三维书写展示。
- 原创字母笔画路径、平面双连杆解析逆运动学、笔尖与笔迹同步、抬笔和完成后收臂；暂停后按需渲染，减少空闲 GPU 开销。
- 自带原创六轴教学机械臂 URDF，使用基本几何体，无外部网格或贴图依赖。
- 通过 URDF Loader 读取真实 link / joint 层级、关节轴和限位。
- 场景结构树、模型点击选择、关节滑块和数值输入、坐标轴、视角复位。
- 六关节关键帧记录、覆盖、选择、移动、删除，以及线性 / smoothstep 插值。
- 时间轴拖动、播放 / 暂停、倍速、循环；动画使用帧时间增量。
- 根据完整动作采样计算工具末端世界坐标和轨迹。
- JSON 导入校验、导出、本机存档恢复。
- 独立 Node.js WebSocket 模拟器，以 20Hz 发送六关节状态。
- 消息校验、序号去重、有界缓冲、100ms 显示延迟插值、断线重连和断流检测。
- FPS、draw calls、三角形及 geometry 数量显示；模型重载时释放独占资源。
- 内置学习指南与中文学习路线。

## 范围说明

当前版本加载内置机械臂，动作文件也仅支持该模型。首页书写演示使用独立的平面双连杆与抬笔机构，包含解析逆运动学，不驱动工作台的六轴 URDF。工作台尚未实现任意 URDF / mesh 文件夹导入、骨骼蒙皮、六轴逆运动学、碰撞检测、动力学仿真、真机控制、MQTT 或 WebGPU。它是动作编辑与可视化学习工具。

所有实时关节数据来自软件模拟器。轨迹由正向运动学计算，只表达几何位置，不代表动作已通过安全性或物理可行性验证。UI 的平滑插值在关键帧处速度为零，未实现速度 / 加速度约束的轨迹规划。

## 代码地图

| 文件 | 职责 |
| --- | --- |
| `public/models/rms-arm.urdf` | 机器人零件、关节轴、父子关系与限位 |
| `src/lib/robot-config.json` | 界面和模拟器共用的关节定义 |
| `src/lib/motion.ts` | 动作格式、插值、时间推进、导入校验 |
| `src/lib/store.ts` | 编辑器状态和关键帧操作 |
| `src/components/robot-scene.tsx` | URDF 加载、渲染循环、正向运动学、资源释放 |
| `src/components/studio.tsx` | 工具界面、时间轴、关节面板、文件操作 |
| `src/components/app-shell.tsx` | 持久导航和独立内容滚动容器 |
| `src/components/home.tsx` | 首页、书写动画播放控件和功能入口 |
| `src/components/signature-scene.tsx` | 书写机械臂、增量笔迹、按需渲染 |
| `src/lib/signature.ts` | Bridgedp 笔画、抬笔轨迹、二分采样与双连杆逆运动学 |
| `src/lib/telemetry.ts` | 状态消息格式及缓冲采样 |
| `src/hooks/use-device.ts` | WebSocket 生命周期、重连、消息接收 |
| `server/simulator.mjs` | 20Hz 模拟设备 |
| `docs/学习路线.md` | 从操作到概念、代码、练习的学习路线 |
| `docs/架构与协议.md` | 数据流、边界与技术取舍 |

## 检查与生产构建

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm start
```

`pnpm start` 只启动生产前端；实时模式另开终端运行 `pnpm simulator`。

工作台回归检查使用本机 Edge，运行 `node scripts/browser-smoke.mjs`，默认地址为 `http://127.0.0.1:3100/studio`。首页、导航与独立滚动检查运行 `node scripts/check-redesign.mjs`，默认地址为 `http://127.0.0.1:3100`。两者均可设置 `BASE_URL` 指定完整页面地址。截图与报告写入已忽略的 `artifacts/`。

## 来源

本项目应用层与教学 URDF 为新编写；模型解析依赖 [urdf-loader](https://github.com/gkjohnson/urdf-loaders)，其许可证为 Apache-2.0。Button / Slider 基于 [shadcn/ui](https://github.com/shadcn-ui/ui) 官方注册表，保留来源说明与许可证，见 `THIRD_PARTY_NOTICES.md`。

学习资料：

- [React Three Fiber 文档](https://r3f.docs.pmnd.rs/)
- [R3F 性能注意事项](https://r3f.docs.pmnd.rs/advanced/pitfalls)
- [Three.js 资源释放](https://threejs.org/manual/pages/how-to-dispose-of-objects.html)
- [URDF Loader 使用说明](https://github.com/gkjohnson/urdf-loaders/tree/master/javascript)
- [ROS 可动机器人模型教程](https://github.com/ros2/ros2_documentation/blob/rolling/source/Capabilities/Simulation/URDF/Building-a-Movable-Robot-Model-with-URDF.rst)

项目尚未推送或发布到远程仓库。简历中应以完成并能讲清楚的功能为准。
