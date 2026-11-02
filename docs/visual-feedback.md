# 有界视觉反馈与对照验证

P25/E26、P26/E27与P28/E29，2026-11-02。“首次观察→结构问题→局部回看→新解释”已接到实际纠错
入口，作为显式可选实验。默认浏览器/桌面仍为建筑、家具两次观察，没有自动增加
付费请求。没有新增提供方传输或桌面开关；调用者提供复查回调，或使用离线CLI。

## 行为与责任

- 程序从源诊断定位疑问，提供原图概览、无损focus/context像素、原坐标偏移和
  附近观察；最多三处、一次额外复查、三个候选。长墙/门窗/家具锚点是可质疑的上下文，
  不是独立真值。大范围问题保留为deferred，不改成整图重提取。
- 结构提示中立询问“开口、墙基线或程序表达哪里不成立”，不复制“添墙”等编辑命令，
  不以闭合要求作为视觉证据。候选保留证据及`clear|partial|unclear`，不是校准概率。
  `selected:null`是正常未知状态；不按报警数自动选胜者。
- 原观察不修改。新解释可凭相反视觉证据撤回局部已接受记录，再经共享预检、光栅、
  逻辑闭合与组装生成新stage/Project；不修改冻结draft或Godot几何。旧严格恢复合同
  仍保留，见[源恢复](source-recovery.md)。
- 默认v1只允许请求内局部建筑记录。全局比例、家具、功能种子和native ID不修改；长墙不能
  在未检查区域旋转或消失。可追加至多四墙/四开口，但必须有局部源证据。
- 只应用明确选中、证据为clear且合同/范围有效的候选。候选`validated`仅指源合同/
  范围检查与作者重投影完成，**不表示源准确、无部分导入或严格runtime编译通过**。
  源诊断、严格编译与实际漫游继续独立报告。

## P28/E29：已编译门的运动矛盾也能提出源问题

显式`scope: architecture-and-door-motion`生成`source-visual-feedback-v3`，CLI同名
`--scope`可准备/回放。默认入口、v1建筑与v2家具支撑请求保持。没有桌面开关、提供方
传输或自动付费重试；最多一次额外batch、三局部、三候选、24记录。

`inspectFeedbackDoors`只读调用共享编译器与`reviewDoorGeometry`，用精确features所有权
将关闭/运动相交映射到原始开口、宿主与阻挡构件；分裂/合并墙保留源父记录，不从
原生ID猜索引。门洞本身决定局部focus，长阻挡墙仅作上下文，避免整条墙扩大疑问区。
碰撞不是源错误证据；默认摆向、面板/框体表达也可能负责。原始观察、墙、运行时均
不被检测器改动。无法编译、预算/运动未完成、所有权不明分别保留。

每候选重新闭合/组装，再检查全部已接受源门是否仍有原生表示，并比较按源路径标识
的逐门/阻挡对。新增冲突、缺失已接受门、基线或候选检查不完整/所有权不明时不自动
应用，候选仍保存。不能用“门组装失败后消失、报警减少”作为改善。明确相反源证据
仍可修订/retract原解释；不是禁止从源纠错。此scope不允许家具/scale/功能种子或
原生运动参数编辑，也不自动选择摆向、缩门或删墙。

两张清晰厨房改造图在识别前入组，来自同一住宅，只算一个新来源家族。初始均完整
导入且可编译，却各有d9关闭/摆动及d11推拉运动三项几何提示；旧建筑-only复查不路由
这些问题。原图复看发现d9首次端点x416位于回折墙中心线，内缘/叶片支点实际x425，
另一端x495保持。新源解释只改该端点，原比例估计保持；重组后d9两项消除，d11仍待审。
墙、其他门窗、家具逐项保持，源待审仍7/6；不是按碰撞试小门宽，也不是整图源验收。

普通回答先冻结，再生成/读取具体结构问题；两臂原图、三组裁片、记录/锚点和一次
回放预算一致，均选相同源修订，未证明附加结构问句增益。旧v1与新v3实际视图/范围
不同，为路由/范围组合试验，不能归因单项增益。同助手非盲，无独立源参考，provider0、
真实token未知；新鲜Skill应用另从已见住宅原图新提取建筑/家具，保留楼梯未知，非新
独立样本。没有真实引擎开门/入口/全屋路线结论，不替换P24已验收播放器。

实际P27冻结核心与新核心，14张相同观察/原像素完整默认入口的几何/draft、精确
diagnostics/features/Notes与编译结论一致，均两回调；旧v1/v2请求逐项一致。12份可编译
Project各自的旧/新runtime JSON/GLB字节一致。1,988单测/225文件、类型0/0、生产构建及
相关Chromium4项通过。证据：`.plan2world-validation/runs/20261102-clean-aperture-pilot/`，
以`comparison-final/`、`study-summary.json`与`completion.json`为准。

## 接口与使用

P29在v3离线CLI旁增加**人类报告用**`baseline.motion-context.json`与
`motion-context.json`，解释当前冲突推拉门使用整跨度默认还是显式面板、实际编译扇宽/
行程，并绑定原图/Project SHA。说明不进入模型request或源观察，旧v1/v2/v3请求与
冻结回答保持；它不自动选择两扇配置。真实引擎的旋转误阻挡另在适配器修复，见
[运动与合并说明](hinged-motion-and-merge.md)。

`reconstructFloorPlanForCorrection(observe, source, options, feedback)`的可选第四参数
为`VisualFeedbackOptions`：`mode`、`actor`、`review(request, source)`、`onAudit`、
`onCandidate`。前三参数的默认路径保持原样。`reprojectSourceObservations`只回放
显式给定的建筑/家具，不请求模型、不自动读取旧检查点。

P26增加显式`scope: architecture-and-furnishing`，见下方v2扩展；省略scope仍为v1。
`onCandidate`增加第四参数（该候选的家具投影），原有三参数回调继续兼容。

`source-visual-feedback-v1`请求绑定原图SHA/尺寸、建筑投影、家具、模式、指导文本和
局部记录；`source-visual-feedback-decision-v1`回答含精确`requestId`、最多三个
`hypotheses`、零基`selected|null`和`unresolvedQuestions`。候选使用完整源记录
`changes:[{path,value}]`，以及可选`additionalWalls`/`additionalOpenings`。
过期/非法回答保留基线与审计，独立坏候选不抹掉其他候选；provider或持久化失败
报告为操作失败并携带基线，不算模型识图失败，不自动重试。

```sh
npm run source:feedback -- \
  --architecture architecture.json --furnishing furnishing.json \
  --source original.png --mode guided --output NEW_PACKET_DIRECTORY

npm run source:feedback -- \
  --architecture architecture.json --furnishing furnishing.json \
  --source original.png --mode guided \
  --request NEW_PACKET_DIRECTORY/request.json --decision answer.json \
  --actor human --output ANOTHER_NEW_DIRECTORY
```

输出目录必须不存在。CLI冻结原图/观察、请求、偏移/像素hash、回答、候选与新stage、
Project、审计和离线`review.html`。CLI不连接provider；回放回答不等于真实模型调用。
原观察与采用解释的证据进入Project作者元数据，runtime仍由同一Project派生；完整
候选/未决状态保留在独立审计，不创建第二套规范场景。

## E26实际前后对照

基线为`6a7ceea`。三张已知原图使用同一份冻结初始建筑/家具，分别运行基线、普通复看、
结构提示复看；后二者原图、局部像素、记录/锚点和回答次数相同，仅结构问题不同。
先封存全部普通回答，再读取结构问题并封存全部结构回答，之后才运行候选。
同一助手依次执行、非盲且可能有记忆影响；真实provider请求0，真实token/成本未知，
不能宣称两臂等token或节省成本。九份独立源参考均为`not_run`。

| 样本 | 基线 | 普通复看 | 结构提示复看 |
| --- | --- | --- | --- |
| Peale博物馆 | 9窗、4区域、7待审，可编译 | 修订北侧墙带基线后15窗、4区域、1待审，可编译 | 相同选中几何；保留另一部分支持解释 |
| 保险办公室 | 部分导入，0推导区域、9待审；部分几何可编译 | 撤回两条局部重复观察，完整导入、6区域、2待审，可编译 | 相同选中几何；保留另一分段解释 |
| FOCSA住宅 | 10区域、5待审，f5无地面支撑而编译拒绝 | 局部开口仍不确定，不选答案；基线保持 | 相同未知/拒绝，未移动家具或填地 |

两类局部源修订有程序收益，但**未证明结构提示优于普通复看**，也不证明整图源准确。
Peale/办公室的不同候选能得到相同待审数，不能按最少报警推断真值。FOCSA直接阻塞
在本轮固定的家具/地面范围之外，也未路由为局部复查触发；家具识别/位置、地面表达
和源歧义需拆开验证，不能直接归为模型能力瓶颈。

已确认的方法问题：旧合同拒绝撤回已接受观察（受控旧/新复现）；首次调度让大块低
优先级疑问吸收开口区域且记录上限挤掉相关墙；复制编辑命令会提示期望答案。
新入口、分优先级分组/墙上下文优先及中立问题已修正，原版本/失败包均保留。

十图相同观察经真实旧/新默认入口，几何/draft、精确diagnostics/features、源Notes及
编译结论保持，仍两次观察。五原生输入23份runtime/GLB/assets/ZIP字节保持。另从NASA
原图新提取建筑并先冻结，再提取10件家具；推导11区域、7待审、非部分导入，完成Skill
新流程应用要求，但不是独立源准确率或全屋验收。

## 结论与证据

保留可选工作流，区分方法/上下文、合同/程序、源歧义、视觉观察与模型能力。只有控制
上下文、预算、源参考和重复试验后仍稳定出现的视觉失败，才有依据讨论模型能力；
单次新增失败不否定整个方法。本轮不默认启用额外调用，不新增播放器验收结论。

证据：`.plan2world-validation/runs/20261102-visual-feedback/`的`report.html`、
`study-summary.json`、`study/`、`default-source-review-comparison.json`、
`default-replay/`、`fresh-nasa/`与`completion.json`。保留原始请求版本、冻结回答、失败日志
及离线源/前/后叠加；本地研究包保留证据，P24播放器仍是最新已验收播放器。

## P26/E27：从地面支撑冲突回看源对象

新增显式scope生成`source-visual-feedback-v2`请求；v1指导文本和默认行为保持。
共享编译器的`furnitureSupportFindings`提供只读结构化结果，原严格校验继续在同一处
以相同错误拒绝首项。复查使用实际地面三角形与精确source-feature所有权，不解析
报错文本、不从`f5`等原生ID猜源序号，也不为找安全点调用模型。

- v2只把**已定位的源标记支撑冲突**加入局部问题，提供原像素点、附近建筑记录与
  中立问题。这说明当前解释有矛盾，不断言对象错或地面错。未完成的编译检查、未能
  唯一映射的对象继续待审；不自动增加视觉请求。不是对所有runtime错误自动重试。
- 回答仍用原decision envelope。候选可增加`furnitureChanges`（最多八项），每项
  是`{path, action: revise|retract, evidence, value?}`。只允许固定的冲突源路径；revise
  需要局部原像素中的完整语义/位置记录，retract需要与原识别相反的视觉证据。未知仍
  选null，不通过挪到最近楼面、删掉可见物体、填地或改变比例来过检。
- 每候选都重新闭合/组装，再用同一编译支撑检查。新增离地源路径、检查未完成或
  所有权不明时保留候选而不自动应用；已有未解决冲突不被伪称通过。候选的完整
  建筑/家具投影独立保存，原家具、撤回记录与原始索引映射进入作者证据；runtime
  仍只读取所选Project。存活源features/Notes映射回原索引，避免中间撤回导致错位。

CLI增加`--scope architecture-and-furnishing`；默认仍`architecture`，没有额外review
batch或provider传输。多区域记录预算优先保留高优先级冲突附近的墙，不让低优先级
大区域按索引顺序挤掉它们；初版包保留，未将这项构造性改进独立计为识图收益。

FOCSA同一冻结建筑/家具与原图、同一助手非盲复查：实际P25架构-only核心复看仍拒绝；
v2普通/结构提示两臂均从原图辨认出`(424,441)`处是SERVICE文字区域，缺乏独立盆体
符号，撤回最初的sink解释。严格编译拒绝→通过；墙49、门7、窗3、区域10与其余四件
设施保持，精确建筑几何不变，原5条建筑待审仍在，原五件家具观察不删改。

这个结果支持“复查范围/证据路由缺口确实存在”，不证明泛化准确率或模型瓶颈。
v2普通/结构臂像素/记录/锚点和回答次数相同，选中几何仍一致。P25与v2实际局部图像
数量不同，是范围、定位和可修订合同的组合试验，不能把改善归给某一提示或声称
跨版本等token。没有独立源参考或外部provider试验；真实token/成本未知。
普通臂同样知道被定位区域与复查合同；两新臂比较的是额外逐项结构问句，不是有无
一切逻辑约束。

证据目录：`.plan2world-validation/runs/20261102-support-feedback/`。另从黑底原图全新
提取建筑、先冻结再提取家具，保持用户的暗门豁免；这是更新Skill的实际原图应用，
不作为前后准确率或整屋漫游证明。完整回归、兼容回放与字节对照见本轮completion。
