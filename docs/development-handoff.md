# Plan2World 开发交接

本页是新对话的当前开发入口，不是完成所有产品验收的声明。先读本页与
[`AGENTS.md`](../AGENTS.md)，检查下列当前分支及本地提交；保留尚未推送的本轮成果。

## 2026-10-26 后续本地实现

当前工作区 `/workspace/plan2world`，分支
`feat/native-door-and-layout-reliability`，基于 main `0b917b7`。
本轮只做本地实现/验证/提交，没有 push、PR 或合并授权。
原生实现头为 `1770b87`，后补内部3D Review 为 `4cf5e20`；后者未改变原生/core源码，
已验证的 player ZIP 仍对应当前原生实现。另有 `implementation.bundle` 增量分支备份，
在已有 main `0b917b7` 的 clone 中可恢复本轮提交，勿只复制本页后丢失本地分支。

- 已完成显式多叶滑门/固定扇/轨道/行程、不等宽双开，内部浏览器与 Godot 原生配置、
  保存/package 往返和逐门通行；内部3D Review 使用共享编译器闭合门叶，支持堆叠层。
  旧工程不自动猜配置。见 [门叶契约](native-door-panels.md)。
- 已完成全占地支撑校验和按变化 owner 更新家具/拾取/材质/灯源。
  本机固定1,000件输入的主线程更新中位数435.3→35.5ms，非端到端/硬件SLA。
  见 [支撑与性能](runtime-placement-support.md)。
- 已完成添加/替换的可取消占地预览、实际墙 owner / 唯一顶面点选；确认前不写 Project，
  保持无 Undo/Redo/history。首个移动/旋转/替换仍经共享校验与真实物理。
- 已完成墙画/镜子通用独立资产、占位提示与固定场景四预设校准。
  白天ROI近白比例83.59%→0%；保留原始对照，不借此宣称 YJ215 已复验。
  见 [照明参考](runtime-lighting-calibration.md)。
- 全量1,761单测/203文件、类型/生产构建/catalog通过；audit仍3 low，0 moderate/high/critical。
  搬移后的 Linux PCK/core 十五组门控及实际 release 启动通过；Windows只交叉构建，
  没有本轮原生 Windows/硬件声明。
- 原实现 `1770b87` 的三引擎全量1,332项通过，各444项；环境重启前139项与重启后
  1,193项合并覆盖全套。一项保存提示超时复验通过，原日志/trace保留，未改断言/期限。
  后续 `4cf5e20` 的18项三引擎定向检查通过，其中9项新增门叶3D几何检查；实际截图已查看。
  六组桌面/手机视口benchmark全部通过：改名零新增GPU资源、零内置模型请求、退出释放通过。
  软件渲染耗时不代表实体手机或Windows性能。
- `runtime:validate` 的输入/结构/逐门运动/布置一致性通过；源图审查、交互保存、玩家路线、
  渲染在该机械报告中仍为 `not_run`，整体 `review_required`（exit 2），不借独立门控填成总体通过。

本轮证据在 `.plan2world-validation/runs/20261026-native-door-layout/`，包括初始失败、
固定输入、before/after性能与照明、正常保存工程、原生截图和打包日志。
当前包为 `player-linux-verified.zip` / `player-windows-verified.zip`；首轮坏包和日志保留。
旧 YJ215 原图/Project/证据未随 clone 带来，仍需恢复后另存作者配置版本复验。
本轮没有运行识图或付费 API。复盘见 P5–P9。

## 本次交接与工作约定

- 仓库：`6jingyong/plan2world`。本轮用户明确授权将 PR #81 合入 main。
  PR #81 包含原生 Godot 布置、正交平面图、灯光、桌面作者入口及图片准备；
  功能提交为 `a8bca6a2228242887eae7845eb594ceb8e7dab1a`，本页随合并准备补入。
  已 squash 合入 main `fc9692823fdf4ac9e99fcb845a3d4288cbe35bd8`；
  后续整合修正和最新状态以 GitHub/main 为准，不从旧 `runtime-v2` 重新开工。
- 本次合并授权不自动延伸到下一阶段。之后默认在本地实现、测试和提交；
  用户明确要求时才 push、开/更新 PR 或合并。阶段尽量完整，不按小函数拆 PR。
- 上轮建议的“常用门型与通行闭环”已在上述本地分支实现；后续以本页顶部状态为准。
- 真实手机拍照识图验证暂时后置；E1/E2 固定拆图和 E3/E4 大清单继续低优先级。
  螺旋等复杂楼梯可以以后补。每轮实验仍需在复盘账本记录真实结果，包括失败。

## 必须保持的架构

```text
原图 → 可选且确认后的图片准备
→ 一次建筑/功能区观察并冻结 → 家具语义/位置观察
→ 确定性重建 → 可编辑 native Project
→ 确定性编译 runtime JSON + architecture.glb + 动态资产
→ Godot 漫游和布置
```

- AI 观察；程序拥有拓扑、几何、ID、编辑、碰撞和编译。Project 始终是作者真相。
- runtime JSON 是 `plan2world-runtime-v1`，拥有语义、碰撞、交互和通行；
  GLB 只负责编译器拥有的展示。家具/门叶是独立动态资产。
- Godot 不识图、不检测房间、不修墙、不猜楼梯目标层，也不从 GLB 推导物理。
  `.tscn` 不成为 canonical scene。未来引擎直接消费共享产物。
- 浏览器只做内部作者工具、2D 修正、3D Review、orbit/cut/stack 和快速预览。
  旧浏览器 FPS 已移除，不恢复第二套运行时。
- 交付端使用 Godot 原生控件/镜头/输入，不嵌 HTML。

## 已完成，勿重复实现

- 静态 architecture GLB：直/二次曲墙、物理宽度开口、楼板/天花/洞口、墙接头、
  窗、柱、直楼梯踏步；碰撞独立编译、资产 owner 与真实哈希验证。
- Godot grounded CharacterBody3D、重力、贴地、门碰撞和交互、相邻层直楼梯通行。
  双开/French 已有真实双叶联动；未配置的旧滑门/pocket 保持单整叶，显式多叶见本页顶部。
- 原生家具增删/移动/旋转/替换、目录/分类/搜索、网格/直墙/家具吸附、保存/重开/
  runtime 导出。共用当前 Project，没有 Undo/Redo 或已接受操作历史。
- F2 在同一世界中切换漫游与正交俯视，保持家具和门状态；俯视使用无光照的平面图
  配色，深墙、橙门、蓝窗。第一人称保留透视相机。
- 两种操作逻辑分离：俯视可拖动；漫游仅键盘/手柄微调。地面家具高度固定，
  挂墙家具绑定明确墙/侧/高度，灯具绑定明确顶面；不猜最近宿主。
- 四类吸顶灯、独立天花编辑层、开关/流明/色温、实际光源及白天/夜晚/日出/日落。
- 默认出生使用明确选择的大门及朝内侧。失败加载保留旧世界；失焦暂停、手动回出生点。
- 可选 OpenRouter 原生账户入口/图像生成、两入口中文说明书。凭据仅会话内存；
  付费观察需确认、无自动付费重试。已有 Project/场景和布置可以离线使用。
- 图片准备：JPEG EXIF、四角、已知矩形比例、旋转、预览确认；三入口复用共享代码。
  原图/工作图/矩阵/哈希保留，所有观察与背景用同一坐标；stage 绑定工作图哈希。
  不自动找纸边，不把户型外轮廓拉成矩形，不增加第三次模型观察。
- `runtime:validate`：重复导出/ZIP、GLB/资产哈希和 owner、布置建筑保持、逐门物理检查。
  源准确性、交互保存、玩家路线和渲染各自记录；未测环节保持 `not_run`。

## 上轮问题与本轮处置

| 顺序 | 事实或覆盖缺口 | 下一步 |
| --- | --- | --- |
| 1 | YJ215 三处阳台滑门的原记录仍为受阻 | 多叶作者机制与通行已验证；私有输入恢复后复验这三门，不能沿用旧结果宣称修复 |
| 已实现 | 双开门旧默认等分 | 可明确编辑不等宽比例，不自动猜图纸叶宽 |
| 已实现/需案例复验 | 白天局部过曝 | 固定参考四预设已校准；YJ215 本轮尚未重放 |
| 部分完成 | 墙画/镜子和源语义标记 | 两种通用资产及占位提示已补；其余源标记仍需用户主动替换 |
| 已实现 | 添加落点和宿主列表体验 | 已有可取消预览及明确墙/顶面点选；漫游保持微调 |
| 已验证并修复 | 五点支撑盲区、全家具更新成本 | 完整地面并集扣除通过窄洞/凹边测试；按 owner 更新解决已测重建瓶颈，编译仍完整 |

识图可靠性仍是独立问题：出现过重复共享墙、门框端点错误，北侧卫生间入口和
主卧隐私边界仍不确定。不得靠自动补门、改生成结果、放宽碰撞或增加无证据分隔
来让案例通过。源错误在观察层修；程序错误在最早负责层修。

本轮作者输入已覆盖保存重开、重复字节稳定、独立碰撞/展示、完整开关、
静态邻墙/家具/玩家阻挡和实际人物穿越。下一优先级是恢复私有 YJ215 输入，
另存明确作者配置版本复验三处阳台门；不要回写冻结的 AI 观察或宣传成识别提升。

继续后置：L/U/螺旋楼梯、折叠/车库门、曲墙挂装、桌面 ChatGPT 登录。
OpenRouter 真实授权/付费模型、Windows 显卡/DPI/文件框、实体手柄仍需独立验收。

## 验证状态与命令

PR #81 功能头 `a8bca6a`：1,738 单测/198 文件、类型/构建/catalog 通过；
audit 3 low、0 moderate/high/critical。PR required Linux/原生 Windows Godot CI 全绿：
[run 40272614129](https://github.com/6jingyong/plan2world/actions/runs/40272614129)。
PR browser/benchmark 按 policy 跳过；合并到 main 后必须检查 push 的完整矩阵，
不能把上述 PR 通过等同于 main 全部回归通过。

main 首轮完整回归发现真实户型纠错用例仍查找旧的 `Selected floor plan`，
而当前确认图使用 `Prepared floor plan`。整合修正只同步该定位并新增原图/工作图/
背景/manifest 字节身份断言；全部原有纠错、Undo/Redo、保存和3D检查保留，
应用代码和生成结果不变。保留首轮失败，最终 main 状态以最新 push 的完整矩阵为准。

本地另有三浏览器定向图像/保存检查、搬移后 PCK/core 的十一组门控和真实 release
启动、Compatibility/Mesa 原生窗口。账户/推理用 mock，直接 Skill 不建立外部模型质量。

```sh
npm test
NODE_ENV=production npm run check
NODE_ENV=production npm run build
npm run catalog:check
npm audit --audit-level=high

npm run runtime:export -- project.json --package scene.zip
GODOT_BIN=/path/to/Godot_v4.7.2 npm run runtime:validate -- \
  project.json NEW_DIRECTORY --arranged arranged.project.json
```

本机多项子进程测试与图形检查并行曾超出原有 5 秒期限；保留失败日志后串行图形与单测，
最终 `npm test -- --maxWorkers=1` 全部通过，未改断言/超时。只读架构 CLI 已关闭 HMR。
`runtime:validate` 返回1表示检查失败，2表示仍需审查/有未测环节，不能把2当总体通过。
Godot 4.7.2 与 Node 24.19.0 的固定版本、SHA 校验和交付命令见运行时文档。

## 阅读入口与本地证据

本轮汇总为 `.plan2world-validation/runs/20261026-native-door-layout/acceptance-status.json`；
包含源码/构建身份、各范围结果、ZIP哈希与独立证据路径。分支备份在同目录
`implementation.bundle`，在拥有基线的 clone 中可执行：

```sh
git fetch /path/to/implementation.bundle \
  refs/heads/feat/native-door-and-layout-reliability:refs/heads/feat/native-door-and-layout-reliability
git switch feat/native-door-and-layout-reliability
```

- [当前验证范围](runtime-validation.md)、[YJ215 案例及缺口](yj215-validation.md)
- [家具布置](godot-furniture-layout.md)、[平面图/灯光](runtime-plan-lighting.md)
- [图片准备](image-preparation.md)、[中文说明书](user-guide.zh-CN.md)
- [runtime 契约](plan2world-runtime-v1.md)、[资产契约](runtime-assets-v1.md)
- [整合验收](runtime-integration.md)、[交付](runtime-delivery.md)
- [观察复盘账本](observation-experiment-results.md)，E1/E2 无整体识图收益证据。

原工作区 `/workspace/plan2world-godot` 的忽略目录中：

- `.plan2world-validation/runs/20261025-yj215-desktop-e2e-1807/`：两轮完整原图执行、
  第一次错误门框负例、原生保存工程、布置版、截图、灯光和实际漫游证据。
- `.plan2world-validation/runs/20261026-photo-input-validation/`：输入准备与新原图
  负例、最新二进制、全部检查、`candidate.json` 和逐门报告。
- `fresh-yj215/` 的新观察重复共享墙，被 preflight 拒绝；没有家具/下游成功声明。
  `yj215-audit-final/` 是旧已保存 Project 的独立重放，8门通过/3门受阻，不能混成新识图。
- 最新归档：`player-linux-final.zip`、`player-windows-final.zip`；案例布置版在
  前一目录的 `case01-r2/native-rendered/arranged.project.json` 和 `arranged.scene.zip`。
- 约1.36GB重复解压目录已逐文件核对归档后删除，ZIP、输入、失败和截图未删。
  原始住宅图片/Project不上传公共fixtures，新的clone不会自动带这些本地证据。

重点代码：`src/lib/models/types.ts`、`src/lib/runtime/doorCompilation.ts`、
`schemas/plan2world-runtime-v1.schema.json`、`runtime/godot/scripts/door.gd`、
`runtime_loader.gd`，以及共享原生编辑核心和 `tooling/runtime-door-audit.gd`。
先检查现有入口和验证契约，再设计多叶门数据；不要在 Godot 中推测轨道或碰撞。
