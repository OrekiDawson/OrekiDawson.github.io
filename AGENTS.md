# Web 线上静态部署副本 · Agent 工作规则

## 1. 总则与授权

[授权与跨仓继承细则](docs/Agent规则/01-总则与授权.md)
### 1.1 统一规则来源与继承
共性规则以 [Workspace AGENTS.md](https://github.com/OrekiDawson/AD-Oreki-Edition-Workspace/blob/main/AGENTS.md) 为权威；本仓专题细则同为强制约束。开始任务先核对当前授权、远端规则、HEAD、Owner 和任务；操作前阅读涉及的细则，不重复加载无关专题。最新用户授权、平台保护与安全门禁优先。

- 六仓 OPEN PR 合计 ≤5（含 Draft/预留），先收口已有 PR，再开展新增任务；ChatGPT 直接授权 PR 的例外依 Workspace §4.1，不豁免其他门禁。游戏业务优先，不抢其他 Owner。
- Lead 每三分钟真实汇报，Subagent 完成后及时接续安全独立任务。等待 CI/Kody 不等于全局停工；活跃会话按 Workspace 刷新规则和远端状态。

### 1.2 权限、预算与运行状态
- 用户暂停、安全、权限、资源及预算硬门禁优先。全天执行，无峰谷或固定余额停工；周期预算 80% 预警、100% 或下一批超额停止新增收费。不得擅自充值、换账号或 Provider 绕过。
- Coreutils 优先（全局长期强制）：能用标准 Shell、Coreutils、find/grep/sed/awk/jq 可靠完成的任务不使用 Node.js；确需 JS 运行时或生态 API 等例外。PATH 中直接调用命令名，Windows 使用 pwsh，不用 powershell.exe 或冗长绝对可执行路径，除非 PATH 解析或版本冲突。

### 1.3 任务编号与 Goal
- R 编号由 ChatGPT 分配；不添子编号、不改历史编号；活跃 Goal 不重复 /goal 或重置计时。

## 2. Pages 部署边界

[静态部署细则](docs/Agent规则/02-Pages部署边界.md)
### 2.1 静态部署副本技术规则
- 本仓仅为 oreki.net 静态部署副本；业务、GUI、教程先在 Web 源码仓完成并验证。保持 CNAME、.nojekyll、index.html、src/、public/ 及依赖路径；禁止密钥、Cookie、测试存档或第二套游戏实现。
- 明确授权、Web 源码 SHA、文件完整性、CI、回滚路径满足后才能部署。实际核对首页、模块 404、样式、手机视口、存档与关键运行时错误；报告线上 SHA，不能以本地预览冒充线上验收。

## 3. Android 跨仓协作

[Android 跨仓协作细则](docs/Agent规则/03-Android跨仓协作.md)
- 本仓只同步已验证的 Web 受影响部署资产与引用，不执行 Android 源码化、AGP/ABI、包名迁移或 APK 发布。按 Workspace 的五渠道、稳定/预发布隔离与本地交付标准更新相关事实。

## 4. 质量与合并

[GitHub 合并与发布细则](docs/Agent规则/04-质量与合并.md)
### 4.1 GitHub 质量与发布门禁
- Kody 仅 Balanced；付费授权、Provider、预算与并发按 Workspace 核实，按 HEAD/配置去重，不冒充 PASS。仅纯 AGENTS.md 官方确认规则文件 skipped 适用例外，不豁免 Required Checks。
- 按实际分支保护、Required Checks、Review Threads、审批、Owner 和安全门禁合规合并；禁止强推、越权、重复收费或虚构回执。规则 PR 完整继承并回读。

## 5. 工作方式

[执行与文档细则](docs/Agent规则/05-工作方式.md)
- 关键命令完整日志落盘、真实退出码和失败根因优先；定向最小验证，避免重复构建/轮询。主工作树 Clean/WIP 保全、80 GiB 总量及回收遵循 Workspace，不删唯一证据、密钥或他人修改。
- 根 AGENTS.md 目标 ≤100 行、≤8 KiB。新约束按主题修改旧规则；事实、操作手册与当前任务分别放 FACTS、Skill/专项文档、Issue，中文优先。
