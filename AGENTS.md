# Web 线上静态部署副本 · Agent 工作规则

## 1. 总则与授权
> 启动/恢复读取本文件和 [Workspace AGENTS.md](https://github.com/OrekiDawson/AD-Oreki-Edition-Workspace/blob/main/AGENTS.md)，按当前任务加载对应专项细则。跨仓统一规则由 Workspace 唯一维护，不重复全文加载；本仓细则仍有强制性。最新用户授权、平台门禁及安全优先。

- 现有 PR 实质收口优先，六仓 OPEN PR 合计上限 5（含 Draft），ChatGPT 直接授权例外按 Workspace；不绕过 Kody、CI、Ruleset 与线程门禁。
- Coreutils 优先，能用可靠 Shell 工具完成不用 Node.js；确需 JS 业务/生态除外。PATH 工具直接用命令名；Windows 用 pwsh，不用绝对可执行路径或 powershell.exe，解析/版本冲突等必要场景例外。
- 完整日志落盘、失败先读根因、最小必要验证。每 3 分钟真实反馈，Lead 核验 Subagent 后接续独立任务，不争抢 Owner/资源；当前 Goal 不重开、不改编号、不重置计时。
- 根 AGENTS.md 目标 ≤100 行且 ≤8 KiB，连续章节编号；新增规则先合并旧条，事实归 FACTS、任务归 Issue、流程归专项/Skill、机器约束归 CI，README 面向读者。

### 1.1 统一规则来源与继承
- [本仓授权及继承细则](docs/agent-policy/01-授权与继承.md)。

## 2. Pages 部署边界

### 2.1 静态部署副本技术规则
- 本仓仅部署 oreki.net 的已验证 Web 静态副本，不是业务源码；游戏、教程和 GUI 变更先在 AD-Oreki-Edition-Web 完成。
- 保持 CNAME、.nojekyll、index.html、src/、public/、依赖路径；不存放个人密钥、OAuth、Cookie、测试存档，不做第二套游戏实现。
- 仅在授权、真实源 SHA、文件完整性、CI/保护及回滚门禁满足后同步部署；不得直接覆盖生产或以预览冒充线上验收。
- 实测首页、模块 404、样式、移动浏览器、存档、阶段界面及相关运行时错误，报告线上 SHA 与真实状态。
- [部署与 Android 跨仓协作细则](docs/agent-policy/02-部署与协作.md)。

## 3. Android 跨仓协作
- Android 源码化、AGP、64 位 ABI、包名迁移由 Android 主责；仅修复实际影响部署副本的链接、元数据或兼容说明，不扩张业务/设备权限。

## 4. 质量与合并

### 4.1 GitHub 质量与发布门禁
- 当前 HEAD 必需 CI、审查线程、Ruleset 和适用 Kody 门禁通过；纯 AGENTS.md 官方 skipped 例外按 Workspace，不扩大到多文件。
- [审查及执行细则](docs/agent-policy/03-质量与执行.md)。

## 5. 工作方式
- 源仓权威，部署前刷新真实 Owner、HEAD、授权与证据；保全 WIP、回滚点，不做无关游戏长跑。
