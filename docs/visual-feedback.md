# 有界视觉反馈与对照验证

P25/E26，2026-11-02。“首次观察→结构问题→局部回看→新解释”已接到实际纠错
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
- 只允许请求内局部建筑记录。全局比例、家具、功能种子和native ID不修改；长墙不能
  在未检查区域旋转或消失。可追加至多四墙/四开口，但必须有局部源证据。
- 只应用明确选中、证据为clear且合同/范围有效的候选。候选`validated`仅指源合同/
  范围检查与作者重投影完成，**不表示源准确、无部分导入或严格runtime编译通过**。
  源诊断、严格编译与实际漫游继续独立报告。

## 接口与使用

`reconstructFloorPlanForCorrection(observe, source, options, feedback)`的可选第四参数
为`VisualFeedbackOptions`：`mode`、`actor`、`review(request, source)`、`onAudit`、
`onCandidate`。前三参数的默认路径保持原样。`reprojectSourceObservations`只回放
显式给定的建筑/家具，不请求模型、不自动读取旧检查点。

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
