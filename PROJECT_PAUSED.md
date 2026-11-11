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

## 重要本地资产（保留在原位置）

| 资产 | 路径 | 说明 |
| --- | --- | --- |
| 部署副本 | `web/_deploy/site/` | 本仓库工作树 |
| 部署脚本 | `web/_deploy/deploy_pages.py` | 现有 Python 部署入口，本次不运行、不迁移 |
| 部署文件清单 | `web/_deploy/filelist.txt` | 部署文件清单与历史备份 |
| 部署校验证据 | `web/_deploy/_web_deploy_check/` | 历史检查输出，保留 |
| 线上域名 | `CNAME` → `oreki.net` | 恢复发布前核对 DNS 与 Pages 设置 |

## 未来恢复方式

1. `git checkout main && git pull --ff-only`
2. 先读 Web 源码仓库的 `README.md`、`AGENTS.md`、`docs/FACTS.md`；本仓库不作为源码入口。
3. 从 Web 源码重新同步部署副本，按 `web/_deploy` 现有流程发布并验证 `https://oreki.net` 可访问。
4. 恢复开发按新 `AGENTS.md` 执行；旧规则只在 `archive/rules-pre-reset-2026-11-11/` 追溯，不自动恢复效力。
5. 本封存提交不代表线上已更新，也不构成稳定版声明。
