# Plan2World 开发交接

更新：2026-10-28，P17网上新图与画作图片。先读本页、[`AGENTS.md`](../AGENTS.md)和
[当前问题](current-issues.md)。本页保留当前实现与证据入口；旧逐轮开发日志已在Git历史
`c02dfc37547094ac52317f12d848288ed8f65777:docs/development-handoff.md`完整保留。
[实验记录](observation-experiment-results.md)按用户要求继续保留，不删除失败。

## 当前任务与发布边界

用户本轮明确要求：网上找住宅/公司/博物馆图自行测试，补齐贴墙画作本地图片导入，完成后
清理确认无效文件并合并GitHub。因此本轮可推送、建PR和正常合并；不得绕过检查或强推。
后续新任务仍默认本地，授权不自动延续。上一已发布版本是PR[#83](https://github.com/6jingyong/plan2world/pull/83)，
main `d63c532`；本轮包含此前本地P15 `d2f4e7a`、P16 `c02dfc3`与P17，最终提交/PR/CI以
GitHub及本轮私有`completion.json`为准，不借旧25项CI替代新版本验证。

## P17已实现与真实边界

- **新图识别仍未解决**：五张全新公开原图，分别为NASA住宅、Insurance Exchange办公室、
  Peale博物馆、Kumaya博物馆导览图和FOCSA住宅。直接Skill观察，不调用外部付费provider，
  不读历史候选/人工参考。原图SHA/URL/作者/许可只进入版本化源清单，生成产物留在ignored目录。
  五图分别21/11/17/1/5待审项，全部`review_required`，没有完整图源验收或整屋漫游结论。
- **发现并修复报警含义**：前序观察/预检失败时，不再把未检查的开口都说成无宿主；明确
  尚未组装/尚未评估。确实匹配失败才标无宿主；已匹配、后续组装失败也单独说明。
  零已确认门窗的闭合轮廓新增输入类型提示，避免场地图被误当无问题室内图，不造门窗。
  回退工程保留原始建筑/家具假设，完整原记录仍在`architectureReview`。
- **指引v24**：明确wire `kind`只有door/window，滑门用`doorType: sliding`。源预检、
  宿主/闭合容差和几何算法未放宽，没有第三次修复请求。更新后从新FOCSA原图完整执行，
  仍保留5处问题；这不是外部模型A/B准确率提高证明。旧版本检查点按原绑定规则拒绝不匹配。
- **画作图片补齐**：添加Wall Art并挂墙后，俯视/漫游选中→Modify→Import picture。
  PNG/JPG本地解码、预览/旋转/明确Apply或取消。8MiB、4096px/边、1600万像素，转PNG后
  仍需8MiB。保留纵横比，在现有框内留边；位置/尺寸/宿主/碰撞/其他世界状态不变。
  使用共享核心生成内嵌PNG的GLB，复用既有`customModels`/Project附件；purpose为
  `wall-art-image`，图鉴复用仍要求挂墙。工程JSON/包/运行时ZIP自包含，没有本机路径。
  Remove picture只恢复通用框，保留共享附件；无账户/网络/token/Undo历史。
- **验证边界**：实际Godot窗口证明PNG/JPG、旋转、取消/应用、真实纹理颜色、保存/导出、
  删除原图片后重开及移除图片。五新图纠错打开/保存/重开精确保持，墙编辑仍默认禁用。
  四旧图canonical与严格结果保持，黑底canonical/runtime/建筑GLB逐字节保持。
  新图NASA/FOCSA锚点缺地面、Peale楼面三角化拒绝均保留；未改原观察/挪家具/填洞/猜入口。

详细使用：[画作图片](wall-art-images.md)、[原生纠错](native-architecture-correction.md)、
[续跑与用量](desktop-reconstruction-resume.md)、[游戏式编辑](godot-furniture-layout.md)。

## 之前实现，勿重做

- **P15**：语义展示方块不能充当实测占地，`source-marker`只验证实际锚点支撑且不阻挡
  行走；真实替代家具仍完整占地/门关闭体积验证。入口Start页支持点已有门、朝内箭头
  预览/确认/取消，无改墙权限；非法入口不自动挪出生点。未来默认多边形，旧曲线仅兼容。
- **P16**：合法Project因几何/入口失败后可明确打开该工程纠错，保留旧世界与未保存保护；
  文件/格式/资产IO/写入错误仍为操作失败。显式检查点续跑缺失2/1/0次，绑定原/工作图、
  像素、变换、模型、比例、指引/提示词SHA，先继承观察再发布新检查点，不自动复用/重试。
  token仅显示提供方报告，缓存/推理是子项，文本字节分开，费用按当前尝试，缺失/中断未知。
  检查点与用量不进入Project/runtime，凭据只在内存/私有stdio。
- **已发布原生功能**：同一Godot世界的俯视/漫游；共享分类Add/Modify图鉴；家具/贴墙物/
  灯具安装与可取消移动；木/玻璃/钢门材质不改机械；多叶门；显式铺地与并集外沿空气墙；
  门窗宿主/位置/尺寸预览；高级改墙默认禁用，实际改过的存活墙段琥珀标记并保护重复修改。
  无产品Undo/Redo/操作历史。黑底自相矛盾暗门由用户明确豁免，不能借此造开口。
- **既有实走**：黑底铺地作者工程24检查/17路线已通过，含两卫浴、消防通道、外沿空气墙，
  不是全屋验收。本轮不把不变字节对照说成新路线测试。其他办公室/入口/真实替代物仍需实走。

## 验证与清理入口

本轮证据目录：`.plan2world-validation/runs/20261028-web-floorplans-and-wall-art/`。

- `source-manifest.json`、五图`source-*.json`/原图/源叠图与前后输出、`source-evaluation.json`：
  直接Skill源质量与报警变化；四图同观察前后几何不变，FOCSA仅有v24新样本结果。
- `web-native-first/`与最终精确包复核、`art-rendered-first/`与最终复核：真实窗口，非截图拼接。
- `paired-replay.json`：P16核心与P17核心的四旧图/黑底确定性回归。
- 本地1,848单测/215文件、类型0/0、生产构建、最终Linux20组和release正常启动通过。
  `unit-*.log`、`types-*.log`、`build-*.log`、`delivery-release.log`保留首轮
  类型、语言覆盖、脚本路径和Godot解析错误，不覆盖为成功。最终状态见`evaluation.json`。
- `cleanup.json`：逐项核对后清理约1.8GiB（最终精确字节见清单），只移除与保留ZIP逐文件SHA吻合的解压包/重复构建；差异开发核心先保留。
  原图、冻结观察、作者工程、检查点、失败、独有版本不删除。不清用户未完成任务目录。
- 正式交付在仓库外`/workspace/plan2world-deliveries/`，当前路径见`LATEST.md`；本轮开发播放器保留在`player-linux-release/`。
  不上传这些大文件到源码仓库。源代码/证据bundle、ZIP与校验清单提供恢复。

通常合并前运行`npm test`、`npm run check`、`npm run build`，Godot变更还需搬移整包20组
及release正常启动。Windows跨构建不等于实际Windows执行；CI结果与显卡/键鼠硬件分别记录。
浏览器未改UI，但源指引/共享契约仍需CI回归。未测范围保持`not_run`。

工具版本：Godot4.7.2，构建脚本校验下载SHA；Node24.19.0；实际云端图形为Mesa/llvmpipe。
运行时/原生Project架构约束见AGENTS；不要为通过测试放宽楼板/入口/开口/支撑检查。
