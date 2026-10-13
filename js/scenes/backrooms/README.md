# Backrooms：课程 WebXR 场景

这是运行在 `Keyu-VR-2026/js/scenes` 中的 Clay 场景。入口为 `../backrooms.js`，使用框架已有的 WebXR 会话、双眼绘制、手柄跟踪与 `model.animate()`。无需启动 3037 服务。

## 启动与打开

在课程工程根目录运行，使用工程要求的 Node **18.20.8**：

```sh
cd /Users/rzzz/Desktop/Workspace/Affair/NYU/26Fall/VR/Keyu-VR-2026
./start-backrooms
```

- 常规课程入口：**http://localhost:2026**，点击 **backrooms** 场景按钮。
- 游戏直达入口：**http://localhost:2026/backrooms.html**，通过框架已有的 `onlyScene` 功能自动选择场景。
- 在头显浏览器进入同一服务，点击框架的 **ENTER VR**，按右扳机开始。

电脑上的 localhost 指电脑本身；头显仍沿用课程工程原有的连接方式：电脑的局域网 IP 加端口 2026，或已配置的 USB localhost 端口转发。直达页路径同样为 `/backrooms.html`。连接设置参考工程根目录 README。本次没有改变浏览器安全设置或安装证书。

`start-backrooms` 使用本机已有的 Node 18，不执行原 `startserver` 的全局 killall。可用 `BACKROOMS_NODE` 指定另一份 Node 18。Node 24 会触发旧 Express 依赖的 last-modified 错误，不能用于此服务。

当前框架的 XR 入口已从 `immersive-ar` 调整为 `immersive-vr`，按钮同步显示 VR。没有另外创建 WebXR 会话或渲染循环。

## 操作

| 操作 | 功能 |
| --- | --- |
| 左摇杆 | 按头部水平方向移动，支持轻推慢走与平移 |
| 右摇杆 | 每次转向 30°，回中后再次触发 |
| 左握把 | 快跑 |
| 右扳机 | 开始 / 恢复；操作附近的门、开关和出口；结束后重开 |
| 右 A / B | 暂停 / 恢复 |
| 左 X | 暂停或结束时重新开始 |
| 桌面 WASD、鼠标拖动 | 使用课程框架已有的平移与观察 |
| 桌面 E / P / R | 开始或操作 / 暂停 / 重开 |

头显内面板提供任务、怪物真实位置、AI 状态与短对白、地图和交互提示。单人状态只保存在当前浏览器，不同步给其他课程客户端。无需聊天即可通关。

唯一任务：去泵房恢复供电，再回黄色柱廊西墙出口逃生。关闭门可以阻挡追逐，怪物约 1.8 秒后能开门；泳池必须沿边绕行。物理走动与摇杆都经过同一套碰撞检查。

## 实现方式

| 文件 | 职责 |
| --- | --- |
| `../backrooms.js` | 标准 `init(model)`、`model.animate()` 与 `deinit()`；建立 Clay 节点、更新人物与 HUD、清理输入和 AI 请求 |
| `world.js` | 共享地图几何、圆形角色碰撞、视线与检查整段通路的 BFS |
| `simulation.js` | 任务、门、声音、怪物状态机与胜负；沿用泳池追逐修复 |
| `geometry.js` | 从共享地图生成三角形，转换为 `clay.trianglesMesh()`；静态环境合成一个网格 |
| `shader.js` | 通过课程 `model.customShader()` 提供黄色壁纸、瓷砖、微弱灯光变化和水面材质 |
| `vr-input.js` | 读取课程 `joyStickState` 和 `buttonState` 后处理死区、边沿与转向；不直接申请 XR 会话 |
| `xr-math.js` | 跟踪空间与游戏空间的刚性变换 |
| `hud.js` | Canvas 面板，经 Clay 的 `txtrSrc()` 贴到头部前方的场景矩形 |
| `director.js` | 通过现有 `/api/aiquery` 请求受限工具，限频、过期回答隔离和离线巡查 |

场景把头显姿态转换到课程根坐标，移动游戏中的玩家，再反算世界节点的变换。头显与手柄仍由课程框架绘制，碰撞不会绕过游戏规则。

静态材质使用原有视觉思路。泳池保留波纹法线、Snell 折射、Fresnel 和水下吸收；在 Clay 内采用灯光与拱门的解析反射近似，未加入独立版本的离屏反射渲染器。

AI 使用课程 `server/main.js` 已有配置及密钥，默认 DeepSeek。仅提供 `moveToRegion`、`searchRegion`、`investigateSound`、`guardExit`，没有任意代码执行。实时追逐优先，模型不会接收隐藏玩家的实时坐标。

切换场景、重载和重新开始会取消待处理请求，旧回答不能影响新局。框架根变换和全局手柄事件没有被接管，离开场景后恢复菜单显示。

## 检查

```sh
cd js/scenes/backrooms
npm test
```

自动测试覆盖地图、通行、完整供电逃生、追逐失败、泳池绕行、门延迟、声音、工具与旧请求隔离。浏览器检查与尚未完成的实机验证见 `VALIDATION.md`。

`/backrooms.html?test=1` 在课程画布的 `data-state` 输出只读验收状态；不提供传送、无敌或调试控制入口。
