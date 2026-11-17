# PROJECT PAUSED — OrekiDawson.github.io

- 暂停日期：2026-11-11（Asia/Hong_Kong）
- 项目状态：PAUSED（随 AD Mod 项目一并暂停；本仓库是 Web 部署副本，不是源码源）
- 当前轮次：R101（未宣称完成）
- 封存前 HEAD：bdb9db030861beb62209fbb1fa62e95a82cdf63d
- 封存提交：`251d7d6d71050295736268b96ecf91cc3dfaa810`（2026-11-11 首次封存）；本文件已在同日规则重建提交中更新。
- 分支 / 远程：main → <https://github.com/OrekiDawson/OrekiDawson.github.io.git>

## 当前开发状态

- 本仓库承载 <https://oreki.net> 的 GitHub Pages 部署内容，源码在 `AD-Oreki-Edition-Web` 仓库。
- 工作区中的 `.gitignore`、`Ads.txt`、`CNAME`、`README.md`、`src/core/oreki-tutorial-data.json` 与新增 `.editorconfig` 已原样封存；其中部分差异只是 CRLF→LF 统一，内容未改。
- 本次未发布新稳定版，也未重新部署 Pages。

## 已知阻碍（未验收）

- 与 Web / Android 共用同一 P0：MOD 存档导入原版后出现异常永恒次数。
- 后期真实通关与 180 分钟真实墙钟目标尚未完成最终验收；性能门禁未伪造 PASS。
- 部署仓库不能替代源码验证；恢复发布前必须先同步 Web 源码并重新验收。

## 重要本地资产

> 2026-11-17 路径核对：工作区已迁移至 `AD-Oreki-Edition/`（旧目录 `AD-Oreki-Unified/` 不再存在）。下表已更新为当前有效路径；历史封存记录（暂停日期、封存 HEAD、封存提交）保持不变。

| 资产 | 路径 | 说明 |
| --- | --- | --- |
| 部署副本 | 本仓库 `main` 工作树；本地检出为工作区 `site/` | 本仓库自身即 oreki.net 静态部署副本 |
| 唯一生产部署入口 | `.github/workflows/deploy-approved-web.yml` | 以获批准 Web `main` SHA + 对应成功 CI Run 触发，在 `github-pages` 环境保护策略约束下部署 |
| 本地旧部署工具（历史） | 工作区 `web/_deploy/` | 旧 Python 本地同步流程；其 `site/` 输出目录已不存在（当前部署副本为工作区 `site/`），不再作为生产入口 |
| 部署校验证据（历史） | 工作区 `web/_deploy/_web_deploy_check/` | 历史检查输出，保留 |
| 线上域名 | `CNAME` → `oreki.net` | 恢复发布前核对 DNS 与 Pages 设置 |

## 未来恢复方式

1. `git checkout main && git pull --ff-only`
2. 先读 Web 源码仓库的 `README.md`、`AGENTS.md`、`docs/FACTS.md`；本仓库不作为源码入口。
3. 需要发布时，按 `.github/workflows/deploy-approved-web.yml` 输入已批准 Web `main` SHA 与对应 CI Run ID，部署后核对 `https://oreki.net/deployment.json`；不要使用已失效的本地 `web/_deploy` 流程，也不直接推送本仓库 `main` 覆盖线上。
4. 恢复开发按新 `AGENTS.md` 执行；旧规则只在 `archive/rules-pre-reset-2026-11-11/` 追溯，不自动恢复效力。
5. 本封存提交不代表线上已更新，也不构成稳定版声明。
