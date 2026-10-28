# Plan2World 开发交接

本页是新对话的当前开发入口，不是完成所有产品验收的声明。先读本页与
[`AGENTS.md`](../AGENTS.md)，检查下列当前分支与GitHub发布状态；保留历史本地提交及验收证据。

## 2026-10-28 P14：GitHub发布核对与剩余问题（当前入口）

用户已明确授权：总结剩余问题、可继续清理无效文件，没有严重问题即推送GitHub并合并。
本轮发布范围包含此前未发表的原生门叶、完整占地支撑/局部更新、可取消布置、灯光/墙饰、
源标记纠错、分类修改和P13铺地/空气墙/门窗预览，并保留main已发布的识图恢复。

- 发布分支`release/native-authoring-integration`从已验收`b7a9dcd`继续，合入远端main `e948c58`；
  祖先整合`eb8d9a1`的完整tree与`b7a9dcd`逐字节一致。四处冲突仅为指引/文档，保留当前策略及真实结果。
  后续只补当前问题与发布指引，生产代码哈希继续匹配P13验收，仓库CI对实际PR头另行执行。
- 当前剩余问题见[精简问题清单](current-issues.md)：原图标记/局部外挑构件表达、其他样本入口与f5支撑、
  其他房间/户型实走、Windows硬件/真实输入、复杂构件编辑范围和可选桌面ChatGPT登录。
  没有把用户明确不需要的Undo/Redo当待办，也不追补豁免暗门。
- 清理了失效的根目录浏览器报告/test-results及旧Vite临时加载目录；唯一报告逐项SHA核对后
  保留在本轮`retired-browser-report.zip`。原图、观察、工程、负例及当前播放器/正式交付包不删。
- 本地P13：1,822单测、类型0/0、构建、Linux18组、黑底24检查/17路线及6门通过；四图
  旧新核心工程字节/拒绝相同。此前Skill修改的新黑底观察验收保留为P10/E17，不冒充本轮新识图。
- 发布沿用正常PR与核心/audit/Linux/Windows/汇总检查，不跳过失败检查；最终PR、合并与
  main三浏览器/benchmark状态以GitHub及本轮`completion.json`为准，历史“未推送”描述只适用于当时。

本轮证据：`.plan2world-validation/runs/20261028-native-github-publication/`。

## 2026-10-28 P13：外沿空气墙、俯视铺地/门窗预览与改墙限制（已完成本地验收）

用户明确：地面最外沿默认空气墙，开放区域也封闭；Godot俯视可铺地；补齐门窗操作；
不要Undo/Redo，尽量少改墙，手工改墙应在俯视标记并限制；先清旧文件后继续验收。
当前分支`feat/ground-and-opening-placement`，从`e94f62b`继续，仅本地提交，不push/PR/merge。

- 清理先行：4,265个旧浏览器报告/截图/负例逐文件SHA核对后归档，移除散落副本，净释放
  328,150,057字节（约313MiB）；删除两个无效Python缓存。原图/观察/Project保留。
  `/workspace/plan2world-deliveries/archived-validation/20261028-old-browser-evidence.zip`含全部原证据及清单。
  最终交付后另清可重建的旧player/core及搬移副本，见本轮`post-delivery-cleanup.json`。
- 共享编译器按实际已接受地面并集计算暴露外沿：分割交叉/共线重叠，无邻接/重叠内部空气墙，
  不取凸包、不补原图墙、不填楼板孔。新增静态box `purpose:perimeter`仅阻挡玩家，独立于真实门扇
  阻挡；Godot层8/玩家mask1|8，原有建筑air墙仍是原碰撞。无空气墙展示实体，俯视青虚线。
- `Build… → Pave ground`使用同一Godot世界，点角点/预览/确认或取消；当前候选可删末角，
  勾选调角点后可拖；已有多边形地面可调整。保存为原生`Room.boundary`，不是第二场景模型。
  已有曲线/依附墙面的显式地面保持只读，防止采样展平。控制卡固定右侧，并为相机保留空间。
- `Build… → Add door/window`共用修改图鉴；实际点宿主墙，拖中心/端点宽度、改高度/窗台，
  共享核心计算精确投影/检查洞口。`Size / position…`进入同一预览；不改变已有材质/开向/身份。
  确认再严格编译，取消不改Project，切换楼层/工具取消旧预览。结构确认重建派生世界；外观交换仍保留状态。
- 高级改墙默认关闭。显式开启后，实际改变的现存墙（含移动接点的邻墙、拆分后的两段）保留
  `authorModified`，俯视琥珀色标记；重复修改须另开`Also allow marked walls`，共享命令也检查。
  仅当前标记，没有操作历史/Undo/Redo。门窗操作不触发墙标记，不追溯猜测旧工程的手工改墙。
- 黑底实图：复用P12作者工程，正常控件只增加一块沿退台铺设的消防通道地面；墙/门窗/家具/
  背景/原始观察/全部9标记逐项相同。保存退出进程后独立真实窗口重开，24项检查、17段实际行走通过：
  原套房与两侧卫浴、南门→消防通道→西侧空气墙阻挡→返回室内，实际E操作，无传送/重定位。
  精确交付PCK另复核同路线；独立机械6/6门完整开合、重复导出字节稳定。通用validator保留
  `review_required`及未跑范围`not_run`，真实交互/渲染/路线另列。暗门仍豁免，其他办公室未全屋验收。
- 其余四图：历史观察兼容性重放，没有新识图。原生纠错窗口打开/保存/重开及源标记/几何保持通过；
  同一输入旧P12/新P13核心逐一对照，canonical Project原始字节及严格结果完全一致，无新增拒绝。
  YJ215/海德/曲墙仍需明确入口，大户型f5完整支撑仍待纠错，未报为漫游通过。海德旧轮没有家具观察，
  本轮显式空家具只测建筑容错，不计漏家具成功。没有追加模型调用，识图准确率不作提升声明。
- 1,822单测/212文件、类型0错误0警告、生产构建通过；独立Linux搬移18组门控及release启动通过。
  新原生端到端含真实中心/宽度手柄输入、非法洞口拒绝、取消/保存/重开/外沿物理；实际Mesa窗口复核。
  Windows交叉包生成、ZIP及共用core字节核对，尚无Windows硬件执行。
- 负例完整保留：首轮新测试错误断言/投影浮点比值、旧demo快照、误写script路径、漏等异步纠错、
  私有脚本括号、菜单漏焦点保护及底部卡遮挡角点触发引擎崩溃、未等待视图过渡、测试角点落到可视区外
  导致三角形而非四边形。产品焦点/遮挡修复和测试驱动修复分列，不改保存输入迎合路线。

证据：`.plan2world-validation/runs/20261028-ground-opening-acceptance/`：`black-pave-sixth/`为明确铺地作者版本，
`black-walk-first/`为真实窗口24项/17路线，`packed-black-reopen/`、`black-mechanical/`、
`paired-native-regression.json`、`corpus-native/report.json`、`evaluation.json`、`RESULTS.md`、`delivery.json`。
交付目录`/workspace/plan2world-deliveries/20261028-ground-opening/`；最终提交身份以Git和`delivery.json`为准。

## 2026-10-27 P12：黑底实图原生使用闭环（上一阶段本地工作）

用户同意优先验证“标记→原生修改→保存退出→独立重开→实际通行”。当前分支
`feat/black-native-usage`，从`fa4fb4d`继续；仅本地实现/提交，没有push/PR/merge。

- 复用E17冻结黑底Project进行作者验收，没有重新识图。原图、全部原始观察和9条标记保留；
  明确手工修改的工程另存。E17的19个冻结产物、本轮4项输入哈希复核不变，新增模型调用0。
- 实图复现并修正：无拖动点击墙端点取整、尺寸表单小数取整、未保存纠错关闭程序无保护、
  修改浮层挡住邻近门、语义方块代理挡路，以及非法开口仅警告却可能漏画宿主墙。
  无效/重叠开口仍可保存待改Project，共享runtime编译拒绝应用，保留原世界。
- 补齐已有门铰链/开向修改。仅`imported_object + renderStyle:block + 无customModelId`语义标记
  不生成碰撞；真实替代家具和旧普通未知物体继续有碰撞。没有在引擎中移门或移除碰撞来通过验收。
- 正常原生控件拆分w21且不改轮廓；明确选择已有d5为测试入口。通过UI调整d4/d6铰链/位置及d5
  宽度/位置/高度，修正默认门扇与转角净空。这是作者修改，不是算法恢复或新增原图证据。
  确认床替换、取消椅子替换、修改门材质/窗型后保存；清单和前后值单独冻结。
- 编辑保存后整个进程退出，另起进程重开。真实Compatibility/Mesa窗口18项检查、12段行走通过：
  中央套房→西上卫生间→返回→东马桶间→返回入口；关门阻挡、E瞄准门扇开合、全程落地且未传送。
  精确交付PCK另做同路径复核；无界面仅以旋转模拟鼠标转向，图形输入证据以真实窗口为准。
- 独立机械验证：重复CLI导出/ZIP字节稳定，结构及6/6现有门完整开合通过。通用validator仍保留
  sourceReview等`not_run`和overall=`review_required`，实际保存/界面/路线证据另列，不回写原报告。
  暗门继续用户豁免，开放消防通道仍无确认地面，办公室/暗门区域不作全屋通行声明。
- 1,812单测/211文件、类型0错误0警告、生产构建通过；Linux搬移17组门控/release启动通过。
  Windows交叉包生成，未做Windows实机验收。所有负例保留，包括原始误改/直接退出、首轮嵌入窗口
  坐标、旧方块碰撞/门受阻、79cm超过78.75cm宿主，以及脚本瞄准铰链/假定节点名和无界面鼠标捕获。
  验收脚本问题与产品缺陷分开，没有改冻结工程迎合路线。

证据：`.plan2world-validation/runs/20261027-black-native-usage/`；`native-edit-fourth/`为明确作者修改，
`native-walk-rendered-v2/`为实际窗口路线，`packed-real-reopen/`为精确PCK复核，
`mechanical-authored-v2/`、`deliberate-user-edits.json`、`RESULTS.md`、`delivery.json`记录范围和交付。
后续优先补开放区域地面范围的原生编辑、门窗游戏式放置预览；Windows实机验证仍待具备环境。

## 2026-10-27 P11：旧文件清理与游戏式选中修改（上一阶段本地工作）

用户要求先清旧文件，并让家具（含门窗）修改走“选中→小型Modify入口→分类图鉴→确认”的流程。
当前分支`feat/contextual-object-editing`，从`47aded0`继续；仅本地提交，不push/PR/merge。

- 首先清理两轮验证中34处可重建core、解压播放器和过时中间包，共5,063,228,834字节（约4.7GiB）。
  原图、冻结观察、Project、负例日志/截图、上一版正式下载包和代码备份保留；清单与哈希见`cleanup.json`。
- 俯视选中家具/门/窗后，只显示随对象位置的小型`Modify M`；家具旋转/删除/灯光收进修改图鉴。
  添加与修改共用分类/搜索/缩略图组件，默认选当前款；各自保留筛选，换选中对象会取消旧替换目标。
- 门窗不再从全屋ID列表寻找：门选三种材质卡片，窗选窗型卡片，最后Apply才改Project。
  窗框由共享编译器生成简化展示，洞口/所有物理体不变；没有新增窗动画。尺寸/宿主进入当前门窗纠错，
  复杂门叶配置仅显示选中门。旧`door_materials.gd`被通用`object_editor.gd`取代。
- 漫游看向目标显示Modify提示，M进入该对象图鉴。家具换款进入原俯视放置预览，可取消；
  门材质保持开启状态，窗型只换建筑展示，世界、玩家、物理体保持。保存重开可恢复选择。
- 1,808单测/210文件、类型0错误0警告、生产构建通过。最终Linux独立包搬移后17组门控、离线核心及
  release启动全部通过；实际Compatibility/Mesa窗口验证了分类、选中按钮、门窗确认、800×540布局、
  漫游家具换款和取消。Windows交叉包已生成，未做Windows实机验证。
- 实际窗口发现并修正旧材质交换在俯视下恢复上层楼板遮挡的回归，新增楼层可见性断言。
  保留首次脚本类型推断、测试相对路径/资源回调、暂停模态下相机等待超时，以及旧灯光测试把所有
  pick area视为家具的失败。新门窗拾取同样必须受Ceiling层过滤，未放宽物理/支撑断言。

证据：`.plan2world-validation/runs/20261027-object-editing/`中的`RESULTS.md`、`delivery.json`、
`cleanup.json`、`delivery-verified.log`和`rendered-complete/`。没有改Skill/识图算法、追加模型观察或
声称准确率提升；前轮新黑底的19项冻结产物重新复核。本轮包/代码以同目录交付记录为准。

## 2026-10-27 P10/E17：标记源问题、Godot纠错与门材质（上一阶段本地工作）

用户改变优先级：源问题先保留标记，随后在Godot手动改墙和门窗；不优先追加LLM确认。
木门/玻璃门/金属防盗门外观与开启方式分开。当前分支`feat/native-architecture-correction`，
从`d315b05`继续，保留六项原生本地功能及已发布的E16。此阶段只授权本地工作，未push/PR/merge。

- 桌面与便携Skill保留建筑/家具各一次观察。源预检失败可继续原来的家具观察，使用
  `correct-plan2world-source.mjs`交付带`architectureReview`的canonical Project；没有模型修复请求。
  原始观察和工作图哈希随Project备份保留，未能应用的门窗留源位置标记，不虚构宿主。
  原严格API继续保留；账户、网络、图片身份和文件错误不是可忽略的源标记。
- Godot增加对照原图的原生纠错窗口：Walls/Openings/Notes；画墙、拖端点、改尺寸、拆分、删除，
  添加/重挂门窗、选择大门朝内侧、人工确认标记及保存。墙已有独立native ID，无需先切碎GLB。
  共享TS核心拥有几何、引用和分房；Godot仅提交明确作者命令，不从展示网格猜几何。
- 不完整Project也可编辑保存；正常编译仍检查楼板/支撑/入口/碰撞。纠错必须明确入口后才能应用，
  原世界在显式Apply前保留。删除依附墙、切过门窗/壁挂物时拒绝该作者操作，不静默删除依附对象。
- 漫游按M/菜单Door appearance切换wood/glass/steel；保存并导出真实材质资产，保持原门扇体、
  碰撞、开启状态和玩家。旧多叶/pocket配置兼容，常用开启方式与材质分开。
- 全量1,805单测/209文件、类型0错误0警告、生产构建/catalog通过。新原生端到端及真实
  Compatibility/Mesa窗口已验证画墙、保存重开和开门状态下换材质。最终Linux包搬移后16组门控、
  离线共享核心及release启动全部通过；Windows交叉包已生成，未做Windows实机执行。
- 黑底冻结E16输入另做程序重放：序列化draft原始字节不变，手动拆墙后门实体和9区域保持；
  E16的163项源冻结哈希未变。这不是新观察。Skill变更另从原图新观察建筑/家具各一次，
  直接Codex/非盲：37native墙、6门、1窗、8区域、7家具、9条标记；5/5接受功能区支持不是准确率。
  原暗门继续用户豁免，无户型特例。没有黑底实图人物路线验收或付费provider质量结论。
- 保留首轮类型/新测试错误、渲染测试漏传core路径、首个包新窗口未隐藏导致输入拦截、
  旧工程打开失败时误弹纠错窗口影响恢复的回归；已定位并修正，原日志不删除。新增测试首轮
  用模拟时间计超时，在无界面加速模式提前终止；改真实时钟后通过，未放宽产品断言。

文档：[原生纠错](native-architecture-correction.md)、[中文用户手册](user-guide.zh-CN.md)。
证据：`.plan2world-validation/runs/20261027-native-architecture-correction/`，其中`fresh-black/`
为新Skill样本，`black-replay-2/`为历史输入重放，两者不得混作识图提升。
本轮版本与最终包/检查以同目录`delivery.json`、`RESULTS.md`及Git当前提交为准。

## 2026-10-27 E16：拒绝恢复实现与黑底验证（已发布历史阶段）

**已发布**：[PR #82](https://github.com/6jingyong/plan2world/pull/82)，候选头`830d9ac`，
main squash `e948c58`。PR必需CI和main核心检查全通过，main三浏览器/benchmark最终状态
另见本轮`completion.json`。以下1,767项检查针对窄发布候选，不是六项原生功能的重新整体验收。

用户要求实现失败复核、仅测黑底，并明确本图暗门本身画错，不再作为合并阻断；
其他新增异常仍须检查。本轮只从原始999×1280黑底JPEG新观察一份建筑/家具，未读旧候选或人工参考。
暗门矛盾保留为不确定和本图评价豁免，没有写入通用程序特例，也未强补暗门。

功能实现`5b2357c`在窄候选`feat/reconstruction-context-and-pointrefs`，包含此前共享点/上下文工具；
新增显式恢复投影、一次全局预算的局部LLM/人工确认、共享识图API与CLI/本地确认页。
严格parser/预检/宿主/冻结组装未放宽，默认浏览器/桌面仍两次观察，无自动付费重试。
详见[恢复机制](source-recovery.md)。同一实现已cherry-pick到原生开发分支以保留集成，
但发布候选仍基于main 0b917b7，不混六项未发表原生提交。

- 精确共线重叠墙做覆盖并集；零面积直线墙边回折可消去；已有sliding类型的wire别名可规范化。
  保留原始证据/变换，不移动坐标、扩大吸附、删通口或取凸包。
- 接受门洞的两侧唯一且精确共线墙端可派生洞口基线；转角/缺证据先待确认。
  复核答复绑定原图、输入和失败stage，限制局部源记录，保留“无法判断”；全程最多一次。
- 新黑底正常输入严格生成，恢复零变更、draft原始字节相同。受控加入重复墙/回折后原流程拒绝，
  算法恢复后draft字节相同；受控漏北门宿主后算法恢复，实际几何相同，均零额外复核。
- 受控漏南逃生门宿主，右端为转角，程序正确保留待确认；一次实际局部Codex确认净框后，
  仅补洞口宿主，严格生成且实际几何与无故障输入相同。记录为模型源复核1次、外部provider/付费API0次。
  三个回放是程序故障注入，不是模型真实新错误，不计识图准确率提升。
- 所有成功输出9区域、9/9接受功能区支持、7家具、0几何错误，3个共有短墙提醒。
  9/9和连通采样不作源准确率/真实人物路线证明；没有其他实图或新黑底Godot验收。
- 1,767单测/202文件、类型0错误0警告、生产构建、catalog检查通过。原始失败/初版类型错误保留。
  163项产物冻结复核；首清单误纳入未结束stdout，只有诊断日志末尾打印改变，所有源/数据未变，
  原清单和独立说明保留。正常/消冗余字节一致；恢复宿主可改变native ID/注册锚点，物理几何一致。

证据目录`.plan2world-validation/runs/20261027-source-recovery-black-only/`：
`index.html` / `RESULTS.md` / `evaluation.json`、`geometry-equivalence.json`、`verified-artifact-freeze.json`；
`one-review-pending/`保留原拒绝/初始stage/确认页，`local-model-decision.json`是唯一实际源确认，
`one-review-confirmed/project.json`保留原图。发布/CI/合并结果保存在同目录交付记录并以GitHub/main为准。
本地未见非豁免新增异常，已按用户授权经必需CI后合并；原生开发提交仍仅保留在本地。
PR #82首轮CI为1,766/1,767：共享点CLI的覆盖保护测试5秒超时，Linux/Windows Godot与audit通过。
后续仅将CLI独占输出目录检查提前到图片解码/Vite加载前，既有目录立即拒绝；不改识图或几何。
原失败保留，修正后重新执行检查，实际远端状态以本轮交付记录和PR为准。
修正后1,767单测、类型及构建再次通过；新黑底共享点展开字节未变，原163项冻结哈希仍一致。

## 2026-10-27 E15新旧观察对照（历史失败，暗门阻断已被用户豁免）

用户授权清理后重做四图旧/新流程、无新增才合并。本轮在全新空目录只复制原图，
历史结果另存且不作为重建输入。四图各重新观察两组建筑，先后顺序交替；两份建筑
冻结后才观察本轮共用家具以控制闭合变量。直接Codex已知历史，非盲，无外部provider/付费调用。

**新增阻断在黑底图西衣柜/套房的门框转折。**旧组接受x320,y555..719柜侧边，新组将
该边拒绝、改为接受x344,y555..1002整段宿主，门洞却仍放在北侧y555横边。
原像素局部可见门框/开启区域和转折，新增宿主在应有净洞处无配套开口，进入native后
变成新增实墙。功能区支持7/9→9/9不能计为改善。旧组也不是金标准；保留原暗门歧义约定，
不是仅以通行率扣分。同一B观察由真实旧/新程序重放stage/draft字节相同，归属源观察，
不是引用转换、宿主程序或裁图像素改变。**条件不满足，没有push、PR或merge。**

公共记录辅助脚本另有滑门格式错误：kind写成slidingDoor，原契约只收door/window。
三图两组原始记录均被拒并保留；单独格式重放只把已有doorType=sliding的10处kind映射成door，
坐标、证据、判断及其他字段逐项不变。它不是新识图或原始成功，不隐藏首次失败。
每组原始严格完成1/4，格式重放后2/4；不是准确率。后续执行须先修公共记录方式，
不得改生产parser迁就辅助脚本，也不得改写E15原记录。

- 海德：格式重放后，两组同一服务南边/卧5北边重叠，均预检停止；无家具/正式工程。
- 曲墙：格式重放后，两组同一西北湿区顶边/外沿重叠，均预检停止；无家具/正式工程。
- 黑底：两组原本即可严格生成；新组出现上述新增门墙异常。其22.5cm短墙提醒对应东南退台，
  已核对源支持，保留提醒，不把警告数量直接当退化；无几何错误。
- 凹形大户型：仅格式重放后，两组严格生成、均16/18功能区受支持、0几何错误/提醒；
  卫D东边宿主遗漏和公区合并共同保留，不用共同错误阻断合并。

202项源/失败/产物在评估前冻结并复核；24张上下文PNG与原图逐像素一致。
没有改生成几何、扩大吸附或在本轮插入额外LLM修复。候选功能代码仍b314e1b，
此前1,747单测/200文件、类型/构建通过属于工具代码检查，本轮无生产代码变化，未重复跑。
没有新Godot或完整runtime验收；远端main已只读核实仍0b917b7。

证据：`.plan2world-validation/runs/20261027-fresh-paired-workflows/`的`index.html`、
`RESULTS.md`、`evaluation.json`、`source-review.json`、`final-freeze.json`、`posthoc-proof.json`；
`black-boundary-review.png`是蓝旧/粉新的原像素局部叠图。只有黑底/大户型在serializer-replay下有Project。
`RECOVERY-DESIGN.md`和`recovery-review-proposal.json`为一次局部选择题复核的具体提案，
尚未实现、未作答、未应用，不能记成LLM/人工确认。建议单独试验失败分支，保留“都不对/不确定”，
确认后新建源版本再校验；不以闭合数选择墙线，不把复核后通过回填成E15无新增。

## 2026-10-27 E14判据更正（历史阶段，后续结论见E15）

用户澄清只看两项改动新增的问题。E13记录的是当前源观察错误，不能据此判断它们是
新流程引入，也不能要求先修完历史识图问题才合并。此前“因源错误而未达门槛”的说法过强，
现改为：**程序对照未发现退化；空间上下文的观察质量差分尚未建立，待补齐后判断合并。**

E14在实际改动前代码`0b917b7`与窄候选`c6d1935`重放同一冻结E13观察：海德同一解析拒绝，
大户型同一严格组装拒绝，其余两个严格草稿及大户型诊断草稿字节相同；三份stage字节相同。
既有默认裁图四图共40张PNG、manifest/HTML均逐字节相同；34张上下文视图均为原图精确像素裁剪。
既有几何/默认provider提示/runtime源文件未改变。这里只排除传输与确定性代码引入差异，
**不证明那些源观察错误在旧识图流程中也会出现，也不等于四图完整新旧观察A/B已经做过。**
首轮旧工作区缺`.svelte-kit/tsconfig.json`的启动错误保留；本地sync后重放通过，未改源码。
E13的59项冻结文件前后均未变。证据：
`.plan2world-validation/runs/20261027-old-new-regression-audit/`的`RESULTS.md`、`evaluation.json`。

下一步按同一批原图补齐旧/新观察流程对照，固定程序、几何政策和家具范围；逐项标记
新增/双方都有/改善/无法比较。只对新增退化设置合并阻断，原有问题另列；不把反复重跑直到
全部通过当验证。直接Codex已知E13问题，必须披露非盲及顺序偏差；尚未开始这一新识图轮次。
条件授权仍有效，核对满足后不再求确认。目前没有push、PR或merge。

## 2026-10-27 E13四图绝对检查结果（判据以上文更正为准）

用户已条件授权把共享坐标与空间上下文/证据分类一起合并，但本轮未建立“无新增问题”的差分证据，
**没有push、开PR或合并**。此前缺图的等待状态已结束；4张新JPEG已收到并保存在新证据目录，
不要再要求用户重传。它们与旧1536px记录指纹/分辨率不同，不假定是同一像素输入。

独立候选在`/workspace/plan2world-recognition-merge`、`feat/reconstruction-context-and-pointrefs`，
基于main `0b917b7`，功能代码仍`b314e1b`（原`5dade34`、`52f46c8`），后续仅文档变更。
六项未发表原生开发仍在`experiment/spatial-context-and-evidence`，未混入候选。
候选1,747单测/200文件、类型0错误0警告、生产构建通过，功能代码没有变化，不重复借用为实图准确率。

E13四图新执行（源观察→冻结→预检→家具→程序→冻结叠加→事后审查；失败按阶段停止）：

- 海德公园图：服务区轮廓(650,560)回到(644,560)形成6px回折，解析器拒绝；无家具/草稿/工程。
- 曲墙图：严格生成，17/20功能区受支持；阳台B短黑墙及书房北边西段遗漏，交通区源轮廓也有错。
  0几何错误/3提示、室内采样13/17，并非完整源接受。
- 黑底图：严格生成，8/8接受功能区受支持、0错误/提示；暗门/操作歧义和消防通道西端保留。
  6/8室内采样不单独扣分，未补猜暗门；不作实际Godot路线声明。
- 凹形大户型：接受的小卫D门漏了宿主，严格组装拒绝；只有诊断草稿，功能区17/19。
  不能把诊断草稿或0几何错误当严格成功。

同一冻结观察的引用/内联机械对照：海德同一解析拒绝；曲墙/黑底stage与严格draft原始字节相同；
大户型同一严格拒绝、诊断draft字节相同。未发现传输引入几何差异，但这不足以满足实图质量门槛。
本轮59项输入/产物与34幅源视图哈希复核；没有改生成JSON、扩大吸附、第三次建筑调用或付费API。
三个已生成草稿的案例才在冻结后读取部分历史墙线参考；没有完整门窗金标准，不输出准确率；
海德无完整草稿，未读取其人工参考。所有新工程/诊断均未做Godot完整运行时验收。

当前证据：`.plan2world-validation/runs/20261027-four-originals-context-pointrefs/`，
`index.html` / `RESULTS.md` / `evaluation.json`、`source-review.json`、`format-equivalence.json`、
`post-observation-freeze.json`；仅曲墙/黑底有`assembled/project.json`。同目录私有ZIP和Git bundle保留全部源图/失败。
旧准备目录`20261027-four-plan-merge-gate/`保留候选检查及JSON/token核对：字节+586（1.9%），
cl100k文本+1.21%、o200k文本−0.92%，只计JSON，不计图像/提示/推理或账单，详见M2。

上述源问题保留为质量待办，先按页首判据补齐对照，不要求先全部修好。任何后续识图必须
在新目录从原图完整执行；不得删错点、移种子、补宿主后伪装E13成功。

## 2026-10-27 当前分支：空间上下文与证据分类试点（现E12，原报告E11）

当前分支 `experiment/spatial-context-and-evidence`，包含下述原生及E11全部未推送提交，
再加通用视图工具/可选Skill说明 `52f46c8` 及本次结果交接提交，基线仍为main `0b917b7`。
本轮只做本地实现、验证和提交；勿只恢复main或旧分支而丢失新工作。

- 当时用户保留共享点工具，token尚未实测；后补M2离线计数。本轮只试空间上下文与证据限制分类，
  不加入同图符号字典或户型专用规则。新增 `tooling/plan2world-context-views.mjs`，
  显式focus/context选择→原像素视图/坐标平移/哈希，拒绝覆写；没有自动邻接推断。
  说明见 [可选工作流](../skills/reconstruct-plan2world/references/spatial-context-review.md)。
- E12从同一原图新观察：建筑与源限制侧记冻结→新家具→既有闭合/组装→冻结后审查。
  主卧阈值由上下框端和开启叶/弧支持，候选在家具前接受；程序分离主卧/公区，功能区
  从历史11/13变为13/13。新工程52墙、12门/通口、10窗、13native区域、54个新家具标记。
  源图净框仍需独立复核；13/13是程序支持指标，不是人工准确率或全屋通行。
- 北卫仍无确认入口，室内网格到达9/10；几何0错误/7提示集中在同一4px接头。
  可见凸台/飘窗平面外投影与退距仍未完整表达，单列建模缺口；高度、剖面、移门配置
  未建立，不能混成图里没有平面信息。侧记不作为几何输入，不自动补门/修墙。
- 两项辅助同时变化，执行者知历史且看过旧观察脚本文本，无独立人工标注；新家具也不同，
  62→54不计识别收益。只有一图的局部候选改善，无通用准确率或token/成本结论。
  默认provider提示、parser、normalizer、闭合、宿主及runtime未变，没有第三次建筑调用。
- 1,770单测/205文件、类型0错误0警告、生产构建通过；类型注释首轮失败保留。
  新16项/历史20项冻结产物与11幅源视图哈希复核通过。没有新Godot案例/完整运行时验收。
  原图已恢复，旧私有保存Project仍缺，不借历史8门通过/3门受阻宣称新工程通过。

新证据目录 `.plan2world-validation/runs/20261027-spatial-context-evidence-yj215/`：
`index.html` / `RESULTS.md` / `evaluation.json`、`source-limit-review.json`、
`assembled/project.json`（待审查、保留原图背景）。同目录 `case-evidence.zip` 为私有案例备份，
`implementation.bundle` 覆盖基线后全部原生/E11/E12本地提交，恢复命令为：

```sh
git fetch /path/to/implementation.bundle \
  refs/heads/experiment/spatial-context-and-evidence:refs/heads/experiment/spatial-context-and-evidence
git switch experiment/spatial-context-and-evidence
```

当前保持可选，不切换默认流程。后续重点是独立核对新门框、补足凸台表达和跨画风实图验证；
旧作者Project恢复后的三处阳台门复验仍属独立任务。详细结论与局限见账本E12。

## 2026-10-27 共享点试点（E11，保留历史范围）

该轮工作区 `/workspace/plan2world`，分支 `experiment/shared-source-points`，
包含下述原生分支截至 `ddefa9c` 的全部六个本地提交，以及共享原图点工具 `5dade34`
和本次结果交接提交。基线仍为 main `0b917b7`；只在本地实现、验证和提交，未push/PR/合并。
勿切回main后丢失未发表的原生与识图工作。

- 用户重新提供YJ215原图，1280×855，SHA256
  `de827282bce49c497eb5568efcd1283932346f1025ca770afa982f6adbc26013`，与历史原图一致。
  **原图已恢复，旧私有保存Project及运行时证据仍未恢复。**本轮两份新重建Project
  不是旧作者配置版本，不能据此宣称三处阳台门或旧8/3逐门案例已复验。
- 新增可选 `source-architecture-pointrefs-v1` 观察传输与本地展开CLI，共享点名仅属于
  本次像素观察；无损转回既有格式，不修几何、不产生native ID。默认浏览器/provider格式、
  v23提示及闭合/宿主/组装代码未变；使用说明见
  [可选引用协议](../skills/reconstruct-plan2world/references/source-point-references.md)。
- E11各从原图新观察一组内联/引用建筑，建筑冻结后共用一次新家具观察作为控制。
  两组都能严格组装，但功能区均11/13，主卧/公区仍合并、北卫无确认入口，
  室内网格到达8/9；外挑窗台轮廓/退距/台面仍有表达缺口，不能称完整还原。
  坐标书写198→104（少47.5%），同一内容JSON却大1.9%；仅证明表示机制，无识图收益结论。
  一图非盲试点、源端点有约1.41px观察差异、无独立人工标注，不作因果准确率比较。
- 同一引用观察展开前后stage/draft原始字节相同，20项源层/产物冻结哈希复核未变。
  1,768单测/204文件、类型0错误0警告、生产构建通过。默认UI/runtime未变，
  本轮未重跑完整浏览器矩阵或Godot案例验收；下述原生检查仍属于原生轮次。
  无外部provider/付费调用。保留首版事后房间ID关联失误及最终修正报告，未改源观察。

试点证据在 `.plan2world-validation/runs/20261026-shared-source-points-yj215/`：
`index.html` / `RESULTS.md` / `evaluation.json` 是阅读入口；两组 `assembled/project.json`
均保留原图背景，是**待审查**的可编辑工程。`case-evidence.zip` 保存私有案例，
`implementation.bundle` 覆盖基线后的原生和试点全部本地提交，不把住宅图片/Project放入Git。
在拥有基线 `0b917b7` 的clone中恢复：

```sh
git fetch /path/to/implementation.bundle \
  refs/heads/experiment/shared-source-points:refs/heads/experiment/shared-source-points
git switch experiment/shared-source-points
```

结论账本见E11；当前保持默认流程及可选工具。下一识图重点是关键净门框、主卧分隔和
凸台的源证据/构件表达，不自动补门、补分隔或扩大吸附。旧原生Project恢复后的门型复验
仍是独立任务，下文的历史缺口按此理解。

## 2026-10-26 原生本地实现（保留历史范围）

该轮工作区 `/workspace/plan2world`，分支
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
当时旧 YJ215 原图/Project/证据未随 clone 带来；原图现已重新上传，旧Project仍缺。
该原生轮次没有运行识图或付费 API。复盘见 P5–P9。

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
