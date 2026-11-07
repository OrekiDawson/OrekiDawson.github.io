# OrekiDawson.github.io

**线上地址：<https://oreki.net>**

本仓库是 **Oreki Edition 的部署副本**，不是源码开发仓库。它只做一件事：把 Web 源码仓库的产物发布到 GitHub Pages。

**目标读者**：访问仓库想找游戏入口的普通用户 → 需要确认"线上跑的是哪一版"的维护者 → 需要同步或回滚部署内容的开发者。

---

## 仓库职责

| 仓库 | 职责 | 谁改 |
|---|---|---|
| [`AD-Oreki-Edition-Web`](https://github.com/OrekiDawson/AD-Oreki-Edition-Web) | **源码唯一开发来源**：功能、测试、教程数据源、开发文档 | 开发时改这里 |
| 本仓库（`OrekiDawson.github.io`） | **部署产物副本**：只放可从源码重建的文件 | 只由同步脚本写入 |

**禁止在本仓库开发游戏功能。** 任何直接修改都会被下一次同步覆盖，并让线上与源码悄然脱节。

### 我想……

| 诉求 | 去哪里 |
|---|---|
| 在线玩这个游戏 | <https://oreki.net> |
| 看玩法说明、存档管理、常见问题 | [Web 源码仓库 README](https://github.com/OrekiDawson/AD-Oreki-Edition-Web#readme) |
| 报 bug / 提建议 | [Web 源码仓库 Issues](https://github.com/OrekiDawson/AD-Oreki-Edition-Web/issues) |
| 改游戏逻辑或界面 | [Web 源码仓库](https://github.com/OrekiDawson/AD-Oreki-Edition-Web)，**不要在这里改** |
| 发一版新的线上版本 | 见本文「同步与发布流程」 |
| 把线上退回上一版 | 见本文「回滚」 |

**本仓库不复制**产品说明、开发规则、测试文档与玩法介绍 —— 那些内容只在源码仓库维护，避免两处分叉。

## 与 Web 源码仓库的关系

```
AD-Oreki-Edition-Web（源码仓库，main）
        │  git archive HEAD（只取已提交内容）
        ▼
    按 filelist.txt 逐文件同步
        │
        ▼
本仓库（部署副本，main）──push──▶ GitHub Pages ──▶ https://oreki.net
```

三条硬规则：

1. **单向流动**：源码 → 部署副本。反向合并（把这里的改动搬回源码）不允许。
2. **只发布已提交内容**：同步从 `git archive HEAD` 生成，工作区未提交改动**不会**进线上。
3. **同一份清单**：同步范围由 `web/_deploy/filelist.txt` 决定，不整目录覆盖。

## 部署产物的来源

| 项 | 值 |
|---|---|
| 源仓库 | `OrekiDawson/AD-Oreki-Edition-Web`，分支 `main` |
| 同步清单 | `web/_deploy/filelist.txt`（864 项） |
| 同步脚本 | `web/_deploy/deploy_pages.py`（按已提交快照生成）或 `web/sync_deploy.py`（按工作区生成） |
| 目标 | 本仓库 `main` 分支根目录 |
| 托管 | GitHub Pages（`.nojekyll` 关闭 Jekyll 处理） |
| 域名 | `oreki.net`（`CNAME` 文件，仓库内手工维护，不由同步覆盖） |

同步进来的内容：`index.html`、`src/`（707 个清单条目）、`public/`（124 个）、`modules/`（26 个）、`LICENSE`、`MOD-LICENSE`、`NOTICE.md`、`serve.mjs`、`启动游戏.bat`。

> `src/` 下当前实际有 712 个文件，比清单多 5 个（`oreki-dilation-probe.js`、`oreki-ec-probe.js`、`oreki-route-model.json`、`oreki-smart-strategy.json`、`oreki-tutorial-data.json`）。这 5 个是历史同步留下的**残留**，不在清单内、不被任何模块 import，加 `--prune` 才会删除。它们不影响站点运行，但**不应被当作"线上一定有的文件"**。

**不进同步的**：`README.md`（本文件）、`CNAME`、`Ads.txt`、`.nojekyll`、`.gitignore`。这些属于部署仓库自身，由维护者手工维护。

> `deploy_pages.py` 里有显式的 `DEPLOY_OWN_FILES = {"README.md"}`，即使 `filelist.txt` 列了 `README.md` 也会跳过。
> 但 `sync_deploy.py` **没有**这条排除 —— 用它会用源码仓库的 README 覆盖本文件。**维护本仓库文档时只用 `deploy_pages.py`。**

### ⚠ 已知风险：两个同步脚本的换行行为不一致

两个脚本都声明「二进制复制、不做行尾转换」，但**源与目标的换行基线本身不同**：

| 文件类别 | 源码仓库工作区 | 本仓库索引 | 直接同步的后果 |
|---|---|---|---|
| `src/**/*.js` 多数 | CRLF | CRLF | 一致 |
| 部分 `src/**` 与 `index.html` | LF | LF | 一致 |
| 少数文件（如 `src/game.js`） | CRLF（`.gitattributes` 的 `text=auto` 导致检出为 CRLF） | LF | **整文件 diff** |

**实测（2026-11-06）**：在工作区对 `deploy_pages.py` 跑一次不做任何提交的同步，本仓库出现 **47 个文件的整文件 diff**（`src/game.js` 单文件 3108 行全变、`src/core/reality.js` 1688 行全变），全部是换行差异、无实质内容变化。已用 `git checkout -- index.html public src/` 完整还原，未提交。

**同步前必做**：先 `python deploy_pages.py` 生成，再 `git diff --stat` 看一眼。如果出现成百上千行的整文件 diff，**先停下**，不要 `git add`。正确做法是逐文件按目标文件的现有换行写回，而不是整目录覆盖。

这条风险属**部署工具缺陷**，本轮只如实登记，未修改脚本（改脚本属部署流程变更，需单独授权）。

## 同步与发布流程概览

在**工作区**（而不是本仓库）里执行。设 `SRC` = 源码仓库路径，`SITE` = 本仓库路径。

### 1. 确认源码状态

```bash
cd "$SRC"
git rev-parse --abbrev-ref HEAD    # 必须是 main
git rev-parse --short HEAD         # 记下这次发布的是哪个 commit
git status --porcelain             # 有未提交改动会列出来（不影响发布，但不会进线上）
```

`deploy_pages.py` 会打印 `[1] web 仓库 branch=... HEAD=...` 与未提交改动清单，可确认发布基线。

### 2. 生成部署副本

```bash
cd <工作区>/web/_deploy
python deploy_pages.py            # 生成 + 检查，不提交
python deploy_pages.py --prune    # 额外删除 site/src 下不在清单里的陈旧残留
```

脚本会依次：导出 `HEAD` 快照 → 按 `filelist.txt` 逐文件复制 → 反向检查 `site/src` 残留 → 跑 import 闭包检查 → 打印本仓库的变更状态。

**必须看输出里的三项**：

- `[4] 已同步 N 个文件；快照中缺失 M 个` —— M 应为 0
- `[5] site/src 下不在清单里的残留：K 个` —— K 应为 0（或确认后加 `--prune`）
- `[6] import 闭包检查` —— 必须通过

### 3. 核对差异

```bash
cd "$SITE"
git status --porcelain
git diff --stat
```

**只应该有本轮实际变更的文件**。出现大量无关文件的整文件 diff，几乎一定是换行符问题（见下节）。

### 4. 提交并推送

```bash
git add <逐个文件>      # 不要 git add -A
git commit -m "同步 Web 源 <短 SHA>：<一句话说明>"
git push origin main
```

提交信息用简体中文，写明同步的是哪个源码 commit、改了哪些内容。

### 5. 核验部署结果

推送后等 Pages 构建完成（通常 30~60 秒），**回读线上文件做逐字节比对**：

```bash
curl -sL https://oreki.net/src/core/oreki-iu15-sprint.js -o /tmp/online.js
diff <(tr -d '\r' < /tmp/online.js) <(tr -d '\r' < src/core/oreki-iu15-sprint.js) && echo MATCH
```

至少核对：

- [ ] 本轮改动的那几个文件与本地一致
- [ ] 首页 `index.html` 返回 200
- [ ] `index.html` 里引用的入口模块能正常 fetch（不是 404）
- [ ] 教程数据 `src/core/oreki-tutorial-data.gen.js` 与源码仓库一致

### 换行符：最容易踩的坑

**本仓库的文件换行风格是逐文件不同的**（例如 `serve.mjs` 是 CRLF，`index.html` 与 `src/**` 是 LF）。同步脚本只用 `rb`/`wb` 做二进制复制，不做任何行尾转换。

- 不要用编辑器"另存为"或带 `autocrlf` 的工具改这些文件
- 比对线上与本地时，**第一步是归一化行尾**，不是直接比。不归一化会得到"全部文件都不一样"的假警报

## 部署结果核验

判断"线上跑的是哪一版"，不能只看首页能不能打开。推荐流程：

1. **取源码 HEAD 的完整文件清单**（`src/**` + `index.html`）
2. **逐个从线上抓下来算 SHA-256**，与本地对比
3. **先去掉 `\r` 再比哈希**（线上可能是 CRLF）
4. 把差异分成三类：真实差异 / 线上 404（源码有线上无）/ 只在线上有

只有"真实差异为 0"才算部署一致。历史上出现过两种误判：不归一化行尾导致误判"全站不同"，以及只看首页 200 就断定部署成功。

## 回滚

Pages 的发布就是 Git 提交，回滚等于恢复上一个可用提交。

```bash
git log --oneline -10          # 找到上一个可用提交
git revert <bad-commit>        # 生成一个反向提交
git push origin main
```

**优先用 `revert`，不要用 `reset --hard` + 强推**：本仓库是公开部署源，强推会让已经拉取过的副本无法快进。

回滚只影响部署副本。**如果问题出在源码**，正确做法是修源码 → 重新同步 → 部署，而不是在这里长期打补丁。

## 允许修改与禁止修改的文件范围

### 允许手工修改（本仓库自身文件）

| 文件 | 用途 |
|---|---|
| `README.md` | 本文件 |
| `CNAME` | 自定义域名（当前 `oreki.net`） |
| `Ads.txt` | 广告系统验证文件 |
| `.nojekyll` | 关闭 Jekyll（Pages 直接按静态文件服务） |
| `.gitignore` | 本仓库忽略规则 |

### 禁止手工修改（同步覆盖范围）

`index.html`、`src/**`、`public/**`、`modules/**`、`LICENSE`、`MOD-LICENSE`、`NOTICE.md`、`serve.mjs`、`启动游戏.bat`。

这些文件**下一次同步就会被覆盖**。需要改它们时，改源码仓库，然后重新同步。

## 相关仓库入口

| 仓库 | 说明 |
|---|---|
| [AD-Oreki-Edition-Web](https://github.com/OrekiDawson/AD-Oreki-Edition-Web) | Web 源码（**游戏功能的唯一开发来源**） |
| [AD-Oreki-Edition-Android](https://github.com/OrekiDawson/AD-Oreki-Edition-Android) | Android 版源码与构建脚本 |
| [frame-observer](https://github.com/OrekiDawson/frame-observer) | Android 画面与事件观测工具（测试基础设施） |
| **本仓库** | 部署副本 → <https://oreki.net> |

游戏玩法、存档、开发环境、构建方式、测试规范等说明**全部以源码仓库为准**：

- 玩法与使用：[`AD-Oreki-Edition-Web` 的 README](https://github.com/OrekiDawson/AD-Oreki-Edition-Web/blob/main/README.md)
- 开发规则：[`AD-Oreki-Edition-Web` 的 AGENTS_GLOBAL](https://github.com/OrekiDawson/AD-Oreki-Edition-Web/blob/main/docs/AGENTS_GLOBAL.md)
- 事实台账：[`AD-Oreki-Edition-Web` 的 FACTS](https://github.com/OrekiDawson/AD-Oreki-Edition-Web/blob/main/docs/FACTS.md)

## 许可

本仓库分发的游戏产物沿用上游许可：MIT（见 `LICENSE`）；汉化与 ESM 重构部分的著作权声明见 `MOD-LICENSE`；完整上游署名见 `NOTICE.md`。

原版游戏 **Antimatter Dimensions** 版权归 Hevipelle（IvarK）所有。本仓库为个人非商业修改版的部署副本，与原作者无隶属关系。

## 规则与文档标准

本 README 的编写与维护遵循工作区长期规则 **R-README-01~10**，权威源见 [Web 源码仓库的 AGENTS_GLOBAL](https://github.com/OrekiDawson/AD-Oreki-Edition-Web/blob/main/docs/AGENTS_GLOBAL.md) §6.2.3.7（工作区根 `AGENTS.md`）。本仓库不复制规则正文。
