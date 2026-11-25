# Web 线上静态部署副本 · Agent 工作规则

> **AGENTS.md 章节规范（长期强制）**：文件名与根标题保持标准；正文只使用连续的 `## 1. ...`、`### 1.1 ...`、`#### 1.1.1 ...` 等层级编号。新增规则必须归入所属主题，不得无编号插入文件最前端、叠加第二套目录或为每轮创建重复章；修改编号时同步修复本文及跨仓 `§` 引用。跨仓共性规则以 Workspace 为权威；纯目录重排不改变权限、预算、验收或发布门禁。

## 1. 总则与授权

### 1.1 统一规则来源与继承

- **单一权威来源**：[Workspace 最新 AGENTS.md](https://github.com/OrekiDawson/AD-Oreki-Edition-Workspace/blob/main/AGENTS.md) 是 ChatGPT/Agent 分工、任务编号与 `/goal`、费用/审查、游戏真实性与五阶段 180 分钟目标、Subagent 调度、GitHub/CI/CD、中文规范及交付的**全项目长期规则**。本仓继承其中适用条款；本仓 `AGENTS.md` 仅补充本平台技术和运行约束，**不得以内容未在本文件逐字重复为由忽略跨仓规则**。
- **每三分钟主动汇报（长期强制）**：执行中的主 Agent/Lead 必须按真实墙钟每 3 分钟至少向用户可见的会话或授权渠道反馈一次当前任务、可核实进展、当前动作、阻断及下一步；Subagent 同频向 Lead 汇报，由 Lead 汇总。长构建、测试及等待期间仍应反馈，无新增成果时如实说明。重要阻断、安全风险和任务结束立即反馈；反馈后继续执行，不视为停止或结束 Goal。不得为汇报重复轮询、付费调用或中断运行中的进程；工具无法支持时如实记录限制及超时。暂停或任务结束后停止空心跳。完整口径见 [Workspace AGENTS.md §1.1](https://github.com/OrekiDawson/AD-Oreki-Edition-Workspace/blob/main/AGENTS.md)。
- **Android 五渠道发布协作（长期强制）**：遵循 [Workspace AGENTS.md](https://github.com/OrekiDawson/AD-Oreki-Edition-Workspace/blob/main/AGENTS.md)，Stable Release 与 Pre-release 均使用 GitHub Releases、OneDrive、Google Drive、小米云盘、本地 SSH/SFTP 五渠道，复用同一签名 APK/SHA-256 及签名要求的配套 idsig/SHA-256；Windows 三家云盘使用官方客户端，不以 rclone 为交付依赖。逐渠道核实 GitHub 上传、各本地路径/哈希及客户端状态，部分成功不得宣称五渠道完成；预发布独立路径，不覆盖稳定 latest。Android 为发行责任仓，其他仓仅维护适用引用和证据，不自动取得发布权限。旧四渠道规则以此为准。
- **Android 滚动发布协作（长期强制）**：依 Workspace 最新规则，GitHub Releases 保留各版本 Tag/资产作为历史归档；OneDrive、Google Drive、小米云盘、本地 SSH/SFTP 使用固定路径/文件名，按类型滚动替换而非追加，各仅保留最新 Stable 和最新 Pre-release APK 及其必要配套 idsig。两类不得互相覆盖。验证新包、旧版可恢复性、本地交付路径、客户端状态、APK 与 idsig 配对及 SHA-256 后安全回收被替代的项目冗余副本和旧目录；失败保留/恢复上个可用版本并记 BLOCKED，不删除唯一成果、有效回滚点、历史证据、密钥或存档。禁止按 release-id 永久累积云盘/SSH 版本，不改变现有发布权限与门禁。
- **发布验收以本地交付为准（2026-11-25 用户授权）**：遵循 Workspace 最新五渠道验收口径。GitHub Releases 核实真实上传及资产信息；OneDrive、Google Drive、小米云盘仅核对官方客户端实际同步路径、文件大小、SHA-256、必要 idsig 及登录/可用状态，无已知同步失败即 `PASS（本地交付）`。不强制云端回读、远端下载、二次哈希、云端对象 ID、上传完成日志或内部接口；已知 401/登录失效/同步失败仍 `BLOCKED`，不虚称远端已核验。SSH/SFTP 核对约定本机分发目录及文件哈希、SSH 服务状态，不要求远程回拉或 SFTP 子系统实测；远程传输能力单列。此条覆盖旧远端回读要求，不改变五渠道同一 APK、滚动替换、签名与发行门禁。
- **业务优先（长期强制）**：遵循 [Workspace AGENTS.md §1.1](https://github.com/OrekiDawson/AD-Oreki-Edition-Workspace/blob/main/AGENTS.md) 的 P0 游戏业务优先规则。全量反编译、全 APK 源码化、Smali 退役及非阻断 AGP/R8/旧构建链迁移为 P1；普通目录和工具链治理为 P2。仅直接阻断 P0 业务、构建、真实验收或安全交付的最小工程闭包临时升 P0。保留 Kotlin-only、源码化长期终局和全部安全、签名、存档、发布门禁，不以源码覆盖率冒充游戏进度。本条覆盖旧轮次相反优先级和一次性迁移时限，不授权接管其他仓库或本机任务。
- **先读取再执行**：启动、恢复、跨仓交接和关键合并/部署前，按照 Workspace 生效规则核验最新 `origin/main:AGENTS.md`（云端用 GitHub API 可替代只读刷新）、本仓规则、事实、任务书、实际 PR/CI 与运行证据；遵守已有 60 分钟常规刷新和关键动作前的短间隔刷新。读取失败或未证实最新版本时记录 `STALE/BLOCKED`，不能声称已同步。本仓更细的合法技术约束继续有效；**用户最新授权与安全/预算硬限制优先，其他冲突以 Workspace 跨仓规则为准**，发现不可兼容之处只作最小修复并报告，不静默放宽门禁。
- **运行方式**：当前已启动轮次仅续做，不重新发 `/goal` 或改编号；Agent 输出、人工注释/文档和有意义的 Commit 使用简体中文、LF；按风险做最小必要真实验证，结果如实为 `PASS / FAIL / BLOCKED / NOT RUN`；保护未提交文件、唯一构建/测试证据及 Git worktree，避免重复工具安装和无限临时工作树。不得把文档/CI/规则 PASS 冒充真实游戏、上线或正式发布 PASS。

- **Pages 专属继承重点**：本仓仅作 `oreki.net` 已验证 Web 源码的静态部署副本，不复制 Android/Web 业务逻辑，不以 Workspace 目标自动授予部署权限。严格按 Web 源 SHA、CI/Ruleset、文件完整性、回滚、HTTPS 和移动端线上实际行为验收；不得发布未验证候选、覆盖旧稳定资源或无授权恢复独立开发。

### 1.2 权限、预算与运行状态

- **授权范围优先**：不从历史暂停状态推断当前全面停工或全面复工。只有用户明确授权范围内、经 Web 源仓验证的正常部署可按现行 CI/Pages/回滚门禁执行；独立功能开发、新 Goal、持续 Agent、收费审查、自动发布与定时更新仍需各自现行授权。产生真实人民币费用时必须先确认预算、期限、Provider 实际可用性，缺失即不付费。用户单独授权文档/仓库动作不自动开放其他项目工作。
- **付费门禁（最新授权）**：遵循 Workspace 权威规则：取消 DeepSeek 固定余额和余额未知的停工/付费前置门禁，余额仅供参考；实际 Provider 拒绝请求时仅阻断对应付费路径，不暂停无关已授权任务。周期预算 80% 预警、100% 或预计超额停止新增收费任务，保留真实授权、有效凭据、安全、Kody 额度及适用峰谷限制；不得自行充值、重建密钥或切换账号/Provider 绕限。
- **费用归因**：区分 DeepSeek Harness **账号登录态**、API Key 与 Kodus BYOK；依据真实账单记录金额、调用与有效修复，不把某个 Key 的全部费用武断归给 Kody。规则文件不是云端扣费上限，云端 Provider/订阅/自动审查需在平台侧独立停用。
- **价格时间窗**：复工后先重新核验官方现行峰谷规则；若仍为工作日北京时间 09:00–12:00、14:00–18:00 高峰，则按既有计划全员停止，峰前十分钟安全收尾。不得为了“连续工作”违反用户暂停或预算。未完成 Goal 保持真实 paused/blocked，不能伪记 complete。

### 1.3 任务编号与 Goal

- ChatGPT 是所有项目任务编号的唯一分配者。
- Lead 只能使用 ChatGPT 已明确分配的编号；Subagent 继承当前编号；Codex、DeepSeek、其他 Agent、调度器和 GitHub Actions 不得自行创建、推算、递增或生成编号。
- 新任务只用单层 `R整数`；禁止新增子编号。用户说继续时沿用当前编号。
- `R121-01` 是早期历史兼容编号，原任务、提交和证据保持原样；不代表当前仍处于该轮，也不能成为新增子编号的依据。
- 所有历史编号、提交和证据保持原样；下一轮编号只由 ChatGPT 明确分配。

## 2. Pages 部署边界

### 2.1 静态部署副本技术规则

- 本仓仅是 `https://oreki.net` 的静态部署副本，**不是游戏源码入口**；任何游戏业务、教程或 GUI 修改先在 `AD-Oreki-Edition-Web` 完成并验证。
- 保持 `CNAME`、`.nojekyll`、`index.html`、`src/`、`public/` 及依赖路径正确；不保存个人密钥、OAuth、Cookie 或测试存档，不加入第二套游戏实现。
- 只有获得明确授权、且 Web 源码 SHA、静态文件完整性、CI/受保护部署门禁与回滚路径核验通过后，才能同步并部署。禁止手动覆盖生产资源、未经验证回滚或以本地预览替代线上验收。
- 正式部署核对首页、模块 404、样式、移动浏览器、存档出入、阶段界面和关键运行时错误，报告实际线上 SHA 与 `PASS/FAIL/BLOCKED/NOT RUN`。
- 源码侧权威约束参见 [Web AGENTS.md](https://github.com/OrekiDawson/AD-Oreki-Edition-Web/blob/main/AGENTS.md)。

## 3. Android 跨仓协作

### 3.1 P1 全量 Smali/DEX 清零

- **权威目标（P1）**：Android 按业务需求增量恢复生产 Smali/DEX 为经 AGP 标准源码编译与运行验证的过渡 Java/Kotlin，最终清零生产 Smali 补丁、手工 DEX 注入、`build_mod.py` 依赖及 APK 二次打包。JADX/REA 只是恢复分析工具，反编译输出不等于编译/语义 PASS；新增、修复和实质修改的 Android 业务必须 Kotlin。仅直接阻断 P0 的最小闭包临时升 P0；不再要求 R126 单一窗口一次性恢复。CI/Kody/发布门禁不变。
- **本仓职责（Web Pages 静态部署副本）**：仅跟踪/修复实际受 Android 迁移影响的共享接口、跨端存档兼容、发布/下载链接、官方构建指令或文档引用；Android 源码/工具链的唯一 Owner 仍在 Android 仓。没有受影响的引用就记录“无需改业务”，不以 Android 工程迁移擅自调整 Web 游戏、Wiki 正文、Pages 部署、签名或本地环境。
- **验收**：要求 Android 权威 Issue 的 `PRODUCTION_SMALI_FILES=0`、`PRODUCTION_SMALI_DEPENDENCIES=0`、`MANUAL_DEX_INJECTION_PATHS=0`、`BUILDMOD_PRODUCTION_DEPENDENCIES=0`、`LEGACY_APK_REPACK_PATHS=0` 与 AGP 全游戏、Tick、存档、关键运行 PASS 真实证据；缺失时保持 OPEN/BLOCKED，不能在本仓宣称迁移成功。用户数据、安全、真实玩家 P0 优先。权威入口：[Android #52](https://github.com/OrekiDawson/AD-Oreki-Edition-Android/issues/52)、[#61](https://github.com/OrekiDawson/AD-Oreki-Edition-Android/issues/61)、[#25](https://github.com/OrekiDawson/AD-Oreki-Edition-Android/issues/25)、[Workspace #47](https://github.com/OrekiDawson/AD-Oreki-Edition-Workspace/issues/47)、[#20](https://github.com/OrekiDawson/AD-Oreki-Edition-Workspace/issues/20)。

### 3.2 P1 工程目录治理

- Android [#61](https://github.com/OrekiDawson/AD-Oreki-Edition-Android/issues/61) 根目录标准化按 **P1 工程迁移（普通目录整理 P2）** 执行，与 [#52](https://github.com/OrekiDawson/AD-Oreki-Edition-Android/issues/52) `build_mod.py` 彻底退役的「迁移即清理」规则协同。仅当本站部署流程、文档链接或真实共享文件受影响时，按 Workspace 跨仓规则配合修复并保留证据。
- 本仓是 Web 静态部署副本，不因此获得修改 Android 本地工具链、独立游戏功能开发或额外自动部署权限；既有 Web 源 SHA、CI/Ruleset、回滚、线上验收不变。规则合并后按安全流程同步本机，并区分远端合并与本机验证状态。


> **历史状态：2026-11-17 曾暂停独立开发。** 此事实保留供追溯，不构成覆盖后来逐项授权的永久禁止令。当前可执行范围以用户最新明确授权、Web 源仓验收、有效 PR/部署门禁与实际平台状态为准；R124 已授权的 Web 合格版本交付可在独立核验后按受保护流程同步至本部署仓，但不等于恢复本仓独立开发、自动收费或放宽发布要求。
>
> 本文优先于旧轮次说明、旧版 AGENTS 快照和交接文件中的冲突措辞。详细事实按需查阅源码与专题文档；[优化前规则原文](docs/agent-policy/LEGACY_2026-11-17.md) 仅供历史追溯，**不会自动继承为当前指令**。

### 3.3 P1 64 位 ABI 与测试设备

- **Android 正式支持**仅 `arm64-v8a`、`x86_64`；停止 `armeabi-v7a`、`x86` 32 位兼容。实施归 Android [#285](https://github.com/OrekiDawson/AD-Oreki-Edition-Android/issues/285)，协同 #52 生产 Smali 全量清零/#61 根级 AGP；生产 `.so`、AGP ABI 过滤、包内 JNI、启动/Tick/存档、发布必须真实验证。原版历史 ABI/DEX/研究/存档不因移除 32 位 JNI 而抹除。未获得 ARM64 原生库/实机证据时如实保留 BLOCKED 或 NOT RUN，不得伪造完成。
- **日常设备策略**：优先使用 x86_64 Linux 电脑的唯一 API37 AVD 作为日常开发与大多数定向回归机；用户 Android ARM64 真机仅在可用、授权时偶尔做抽样安装、JNI、存档、冷启动与性能验证。**不要求每个普通 PR 跑手机**；本次 ABI 全面退役需单独提供 ARM64 真机证据或明确 NOT RUN。
- **本仓协作（Pages 静态部署副本）**：仅修复确有影响的共享发布元数据、下载/安装指南、ABI 支持说明、CI/交叉引用及跨端存档说明，不因此触碰 Android 构建脚本、改变 Web 业务、Wiki 独立写作或 Pages 部署门禁。继续当前 R126，不新 `/goal`。权威任务：[Android #285](https://github.com/OrekiDawson/AD-Oreki-Edition-Android/issues/285)、[Workspace #47](https://github.com/OrekiDawson/AD-Oreki-Edition-Workspace/issues/47)、[#20](https://github.com/OrekiDawson/AD-Oreki-Edition-Workspace/issues/20)。

### 3.4 P0 包名变更的 Pages 协作

- Android P0 决定：最终正式 APK 的 `applicationId = "net.oreki.antimatterdimensions"`，Debug 为 `net.oreki.antimatterdimensions.debug`，基于自有域名 `oreki.net`。旧 `com.oreki.antimatterdimensions` 与新包**不能覆盖升级**，不能自动继承旧应用私有存档；须以真实 Android 构建/存档导出导入证据为准（Android #52/#61/#17、PR #276；Workspace #20）。
- 本仓只是已验证 Web 源码的静态部署副本：**仅在确实存在 Android APK 下载、应用包名、安装/迁移指南、深链或发布链接引用时**，在获得正常 Web 源仓和受保护发布授权后修复，不允许独立修改 Android APK、自动部署未验证包或改变 Web 正式 URL/存档身份。保持现有 Pages/CI/回滚/HTTPS 与原有用户授权门禁。
- 本规则 PR 真实合并后立即交接本机安全同步，读回证实前 `LOCAL_SYNC_BLOCKED`；不把远端规则合并或 Android 身份目标误报为正式包已上线。

## 4. 质量与合并

### 4.1 GitHub 质量与发布门禁

- 先读相关源码/配置/事实，按风险做**最小必要修改与验证**。构建成功、CI 绿色、截图、模型自评都不能代替真实游戏/功能验收；未运行写 `NOT RUN`，失败写 `FAIL`，受阻写 `BLOCKED`，仅有证据才写 `PASS`。文档单改不机械做游戏长跑。
- 使用受保护分支、PR、Required Checks、签名/发布审批。不得强推、关闭 Ruleset、跳过 CI/人工审批或伪造验证。真实 Critical/P0/P1、阻塞性 Medium 必须修复或证据充分地判定误报；非阻塞意见记录合理处置。
- **审查信息读取**：合并前同时检查 PR 普通评论、Reviews、Review Threads、最新 HEAD SHA、Checks；所有需解决的线程归零。Kody 无可用 Provider 出现 `Skipped` / `BYOK Configuration Required` 表示 **KODY NOT RUN**，不是 PASS；不因缺密钥自行重接 Provider，也不制造空 Commit 或重复触发收费审查。
- 原有要求 Kody 覆盖最终 HEAD 的业务 PR 保持 `BLOCKED` 直到门禁满足。用户**明确逐次授权**的纯文档维护可以按该次批准范围处理审查缺失，但必须保留记录、确保 GitHub 平台 Required Checks 与权限允许；不得推广成任何业务/生产 PR 的常规豁免。
- 只有授权开发会话内才主动处理 Issues/PR；不轮询空任务、不启用未经批准的持续监控或夜间 Agent。Kody 如需重启仅限已批准预算下的 Balanced/最少必要审查，不使用 Heavy。

## 5. 工作方式

### 5.1 交付与文档维护

- 尽量复用已有任务、索引、证据与历史失败记录；不要无意义全量反编译、跨仓同步、重复大上下文调用、重复构建或等待轮询。并行 Agent 严格隔离文件与独占资源，使用实际可用的交接机制，不假设后台自动运行。
- 中文为默认文档、PR/Issue 正文及有意义代码注释语言；标识符、API、协议、路径、原文错误消息保留准确拼写。只解释必要的意图/边界，不为中文化重写第三方或生成代码。
- README 供读者使用，`AGENTS.md` 只保留常驻执行约束；专题技术手册、历史决策、日记、临时轮次放入 `docs/`。新增常驻规则前先合并/替换旧条款，避免重复和矛盾；建议根规则保持 **12 KiB 以下**。
- 历史任务编号、提交、原始证据和已发布产物不因规则优化而重写；本文件与相应专题文档冲突时遵循最新用户授权、冻结/预算/安全门禁及本文件的明确状态优先级。
