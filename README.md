# OrekiDawson.github.io

**在线地址：<https://oreki.net>**

本仓库是 **Oreki Edition 的部署副本**，不是源码开发仓库。它只负责把源码产物发布到 GitHub Pages。

## 仓库职责

| 仓库 | 职责 |
|---|---|
| [`AD-Oreki-Edition-Web`](https://github.com/OrekiDawson/AD-Oreki-Edition-Web) | **源码唯一开发地**：功能、测试、教程数据源、文档 |
| 本仓库（`OrekiDawson.github.io`） | 部署产物副本：只放可从源码重建的文件 |

**禁止在本仓库开发游戏功能。** 任何直接修改都会被下一次同步覆盖，并让线上与源码悄然脱节。

本仓库允许手工修改的只有：

- `README.md`（本文件）
- `NOTICE.md`（上游署名与许可）
- `CNAME`（自定义域名，当前为 `oreki.net`）
- 纯部署配置类文件（如 `.nojekyll`）

其余文件均由源码仓库同步而来。

## 同步流程

从源码仓库根目录执行，把变更文件按**原换行风格**复制到本仓库对应路径：

```bash
# 假设两个仓库是同级目录
SRC=../AD-Oreki-Edition
DST=.

# 逐个文件复制（推荐：只同步本轮实际变更的文件，不做整目录覆盖）
for f in src/game.js src/core/oreki-iu15-sprint.js; do
  cp "$SRC/$f" "$DST/$f"
done
```

注意两点：

1. **不要整目录 `cp -r`**：会把源码仓库的 `docs/`、`scripts/`、`reports/` 一并带进来，让部署仓库重新长出开发文档。
2. **换行风格要跟目标文件一致**：源码用 LF、部署仓库用 CRLF 时直接覆盖会产生整文件 diff。先确认再写入。

## 核对部署产物

推送后等 Pages 构建完成（通常 30~60 秒），回读线上文件与本地逐字节对比：

```bash
curl -sL https://oreki.net/src/core/oreki-iu15-sprint.js -o /tmp/online.js
diff <(tr -d '\r' < /tmp/online.js) <(tr -d '\r' < src/core/oreki-iu15-sprint.js) && echo MATCH
```

至少核对：

- 本轮改动的那几个文件与本地一致
- 首页 `index.html` 返回 200
- 教程数据 `src/core/oreki-tutorial-data.json` 与源码仓库一致

## 回滚

Pages 的发布就是 Git 提交，回滚等于恢复上一个提交：

```bash
git log --oneline -5          # 找到上一个可用提交
git revert <bad-commit>       # 生成一个反向提交
git push origin main
```

优先用 `revert` 而不是 `reset --hard` + 强推：本仓库是公开部署源，强推会让已经拉取过的副本无法快进。

## 提交规范

- 只提交本轮实际同步的文件，不夹带无关改动
- commit message 用简体中文，说明同步了哪个源码提交的哪些内容
- 推送前先 `git fetch` 确认没有远端新提交
- 不创建长期分支，直接在 `main` 上维护

## 文档归属

游戏玩法、开发环境、构建方式、测试规范等说明**全部以源码仓库为准**：

- 玩法与使用：`AD-Oreki-Edition-Web/README.md`
- 开发规则：`AD-Oreki-Edition-Web/docs/AGENTS_GLOBAL.md`
- 事实台账：`AD-Oreki-Edition-Web/docs/FACTS.md`

本仓库不复制这些内容，避免两处维护产生分叉。
