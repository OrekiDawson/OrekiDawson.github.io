# Web 线上静态部署副本 · Agent 工作规则

> 跨仓共性规则以 [Workspace AGENTS.md](https://github.com/OrekiDawson/AD-Oreki-Edition-Workspace/blob/main/AGENTS.md) 为唯一权威。启动先读该入口、本文件、当前任务与必要事实；涉及对应事项必须先读以下细则适用章节，不默认全文加载所有细则。共享重复条款不作为另一权威来源，最新用户授权与 Workspace 口径优先；根入口的按需加载及 PATH 约定覆盖旧措辞，不降低安全、预算、审查、CI、验收或发布门禁。根 AGENTS.md 目标 100 行、8 KiB，复杂例外说明；规则按主题编号、避免重复，临时任务进 Issue、事实进 FACTS、可机器检查约束进 CI。

## 1. 总则与授权

- 继承 Workspace 权威规则，不重复跨仓约束。真实授权、预算、Owner、任务编号及 Goal 按 Workspace 执行。
- 详细口径：[执行细则 1](docs/agent-policy/执行细则-01.md)。

### 1.1 统一规则来源与继承
- 详见[执行细则 1](docs/agent-policy/执行细则-01.md)对应章节。

### 1.2 权限、预算与运行状态
- 详见[执行细则 1](docs/agent-policy/执行细则-01.md)对应章节。

### 1.3 任务编号与 Goal
- 详见[执行细则 1](docs/agent-policy/执行细则-01.md)对应章节。

## 2. Pages 部署边界

- 仅为 oreki.net 已验证 Web 源码的静态部署副本，不实现游戏业务；游戏改动先在 Web 源仓完成。保留 CNAME、.nojekyll、入口及资源路径；禁止秘密、个人存档、重复实现。仅在授权、源 SHA、静态完整性、CI/Ruleset 与回滚路径核验通过后部署；线上检查模块 404、移动端、存档、阶段界面与关键错误，不以本地预览冒充线上验收。
- 详细口径：[执行细则 2](docs/agent-policy/执行细则-02.md)。

### 2.1 静态部署副本技术规则
- 详见[执行细则 2](docs/agent-policy/执行细则-02.md)对应章节。

## 3. Android 跨仓协作

- 仅同步 Android 工程、ABI、包名迁移实际影响的部署引用，不承担 Android 本机任务或无关业务开发。
- 详细口径：[执行细则 3](docs/agent-policy/执行细则-03.md)。

### 3.1 P1 全量 Smali/DEX 清零
- 详见[执行细则 3](docs/agent-policy/执行细则-03.md)对应章节。

### 3.2 P1 工程目录治理
- 详见[执行细则 3](docs/agent-policy/执行细则-03.md)对应章节。

### 3.3 P1 64 位 ABI 与测试设备
- 详见[执行细则 3](docs/agent-policy/执行细则-03.md)对应章节。

### 3.4 P0 包名变更的 Pages 协作
- 详见[执行细则 3](docs/agent-policy/执行细则-03.md)对应章节。

## 4. 质量与合并

- 当前 HEAD Required Checks、线程、适用 Kody/Ruleset、Owner 和预算按 Workspace 与本仓细则执行；纯 AGENTS.md 官方 skipped 例外不适用于包含细则的 PR。
- 详细口径：[执行细则 4](docs/agent-policy/执行细则-04.md)。

### 4.1 GitHub 质量与发布门禁
- 详见[执行细则 4](docs/agent-policy/执行细则-04.md)对应章节。

## 5. 工作方式

- Coreutils/Shell 优先，PATH 命令名（Windows pwsh），按范围最小必要验证。保护 WIP、关键日志落盘、失败先读根因，事实与长期规则分离。
- 详细口径：[执行细则 5](docs/agent-policy/执行细则-05.md)。

### 5.1 交付与文档维护
- 详见[执行细则 5](docs/agent-policy/执行细则-05.md)对应章节。
