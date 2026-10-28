# 源观察失败隔离与评估

P18只改基础流程，不修改识别提示词、宿主容差、栅格修正或闭合算法。正常输入仍走一次
建筑观察、一次家具观察和原有确定性组装；原始观察与失败审计始终保留。

## 部分导入

严格导入API仍拒绝非法观察。纠错入口额外逐条检查墙、门窗、功能区、门缝、接点和家具，
在独立作者投影中保留通过校验的构件。部分投影不运行自动闭合、栅格拟合或推导房间，
不返回完整draft。源错误不等于提供方、文件或图像身份错误；后者继续正常失败。

合法墙逐条保留源坐标；归一化墙冲突使用结构化源墙身份定位。争议墙保持可见，不自动
删除。开口必须在现有投影规则内有唯一合法宿主；涉及争议墙、无法定位的非法墙时保持
受阻。同一宿主上相互重叠的开口均待审，不按先后顺序挑一个。非法门类型不猜测改名。
家具逐条校验源位置，不移动锚点或补地面。

返回值新增`partialImport`、`diagnostics`、`features`，审计的`correction`同时绑定
`projectContentSha256`。诊断包含`code/phase/category/sourcePaths/blockedBy`；category
区分直接问题、受阻项和不确定观察。路径指向对应程序投影记录，完整原观察及既有投影
变换仍在审计中。Project的`architectureReview.issues`兼容保存这些可选字段，旧工程
无需迁移。它们不进入运行时语义或碰撞，也不是实时源准确性判决。

## 提供方结构约束和续跑

新桌面任务先做一次免费端点能力查询，最多等待10秒。确认端点声明支持
`response_format`和`structured_outputs`后，使用阶段专属严格JSON Schema以及
`provider.require_parameters: true`。未知/不支持时在发送观察前选用旧JSON模式；
观察请求失败后不自动降级重试。Schema不能证明视觉坐标正确，本地严格解析仍是必要步骤。

Schema只输出新建多边形合同，通过合法变体保留可选证据/门运动字段，以`$defs`复用
重复定义，不引入null占位。旧曲线输入解析和原生Project兼容继续保留。

新检查点和冻结收据记录响应格式及两阶段Schema的共同SHA。续跑沿用原合同，不重新
查询并切换格式；旧检查点缺少该字段时按原`json_object`合同处理。合同、源图、模型或
提示词不匹配时，在新付费请求前拒绝。`schemaBytes`与`promptBytes/responseBytes`
分别记录文本大小；token及费用只采用提供方报告值，缺失保持未知。不能把字节下降
等同token节省，也不能把结构约束等同识别提升。

## 离线前后对照

```bash
npm run source:evaluate -- replay \
  --source original.png \
  --architecture frozen-architecture.json --furnishing frozen-furnishing.json \
  --before-project before.project.json --output new-run-directory

npm run source:evaluate -- evaluate \
  --source original.png --project frozen.project.json \
  --audit source-correction-audit.json --output another-new-directory
```

`replay`使用明确提供的冻结观察，只比较程序行为，不是新识图。`evaluate`读取现有工程；
提供审计时必须匹配源图及工程内容，改过的工程不能借用旧审计。输出目录必须全新。
两个命令均零模型调用，默认实际执行共享运行时产物编译，可用`--check-runtime false`
明确跳过。编译成功不代表指定了主入口、源图准确或完成了漫游验收。

输出包括只读Project、身份freeze、JSON报告和可独立打开的`review.html`。
对照页可切换原图/改造前/改造后，叠加当前保存的墙、门窗和问题位置。报告分别列出
直接问题、受阻项、检查过宿主的开口、各类构件保留情况和运行时拒绝。旧标注未分类时
填未知，不通过解析旧错误文案猜测。

独立源参考通过可选`--reference reviewed-reference.json`提供，且在生成输出冻结后
才读取。格式为`plan2world-source-correction-reference-v1`，包含：

- `source`：原图SHA、宽高及本次冻结Project文件的`resultSha256`。
- `reviewer`：明确的`kind: human|synthetic`与姓名/来源；`coverage: partial|complete`。
- `findings`：唯一ID、构件类别、`correct/missing/extra/geometry-error/connectivity-error/uncertain`
  判定、原图证据和对应记录路径；缺失构件可使用空路径。

真实图目前没有独立人工参考，`sourceReview`保持`not_run`。修正finding数量只作为
工作量参考，实际人工操作次数和耗时保持null；不计算或宣称未经验证的准确率。
