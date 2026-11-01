> **本仓库是部署副本，不是开发仓库。**
>
> 源码唯一开发地是 `web/AD-Oreki-Edition`（`github.com/OrekiDawson/AD-Oreki-Edition-Web`）。
> 本仓库（`github.com/OrekiDawson/OrekiDawson.github.io`）只承载部署产物，由同步脚本从源码仓库
> 逐文件复制生成，`CNAME` 指向 `oreki.net`。
>
> **禁止在本仓库直接修改功能代码**——下次同步会覆盖，且会让线上与源码悄然脱节。
> 本文件后半部分是面向线上玩家的游戏说明（与源码仓库 README 用途不同），
> 部署与维护细节见 **§8.5**。

# AD: Oreki Edition（反物质维度 · Oreki 改版）

**在线体验：<https://oreki.net>**

基于 *Antimatter Dimensions* 的个人非商业改版，以「**爽玩优先**」为唯一目标：
在保留有意义的手动玩法的前提下，尽可能缩短从新存档到游戏终局的**现实时间**，
消除无意义等待、重复点击和重复刷取。

非官方、非商业，与原作者 Hevipelle（IvarK）及任何发行方无隶属关系。署名与许可见文末。

---

## 1. 这个项目是什么

三个来源组合而成：

| 部分 | 来源 |
| --- | --- |
| 游戏本体 | [IvarK/AntimatterDimensionsSourceCode](https://github.com/IvarK/AntimatterDimensionsSourceCode)（MIT） |
| 简体中文 + 浏览器原生 ESM 重构 | [aquamarine309/ADChinese](https://github.com/aquamarine309/ADChinese)（MIT + MOD-LICENSE） |
| 全局速度因子设计思路 | [WYXkk/ADfaster](https://github.com/WYXkk/ADfaster)（MIT） |

本项目在其上新增：可运行时配置的全局速度倍率、速度设置界面、成就工具、存档工具、
响应式（手机）样式，以及若干「消除死锁与重复劳动」的机制修正。

**核心目标**：从真正的新存档出发，**3 小时现实时间**内完成全游戏通关。
这是**目标，不是已证成的结论** —— 目前尚未完成端到端全流程实测，请勿当作承诺（见 §10）。

---

## 2. 主要功能与当前真实状态

### 已实现

- **全局速度倍率 1× ~ 100000×**，默认 **10000×**，可在「选项 → 游戏玩法」随时切换或输入自定义值。
  - 只在唯一注入点 `src/game.js` 的 `realDiff` 生效：游戏时间按倍率推进，**现实时间类记录（`realTime*`）不放大**。
  - 设置存在 `localStorage`（键名 `oreki-game-speed`），**不写入游戏存档**，换档 / 导档不会互相污染。
  - 离线追赶与批量结算期间倍率被冻结，避免中途改倍率造成时间错乱。
- **简体中文界面**，存档格式版本 `25`。
- **成就工具**（选项 → 游戏玩法 → 成就工具）：按范围与 ID 区间批量解锁，走游戏自身的解锁函数，
  所以自动购买器、缓存等联动会正常触发。**这是作弊功能**，会破坏成就可信度。
- **存档工具**（选项 → 游戏玩法 → 存档工具）：查看存档信息、立即备份 / 恢复、复制 / 下载存档文本、
  导入存档（校验格式与版本）、重置存档。任何覆盖操作前自动备份到 `localStorage`（`oreki-save-backup`）。
- **自动购买器接管修正**：首次大坍缩后，反物质维度与计数频率自动购买器即可运行（原版要求完成对应
  普通挑战或花无限点数购买）。详见 §5。
- **批量购买回退**：整批 10 个买不起时改为买 1 个，避免「重置回反物质 10、维度全 0」时自动购买器
  永远凑不满一批而彻底空转。详见 §5。

### 尚未实现 / 未验证

- **完整新档 3 小时通关实测**：未完成。现有证据只覆盖「首个无限及之后一段」，不是全程结论。
- **真机（物理手机）测试**：只在桌面 Edge 的视口仿真与 Android 模拟器内浏览器做过适配检查，未在真机实测。
- 游戏内 1400 余条滚动彩蛋新闻未翻译（汉化基线本身如此），顶部新闻栏会夹杂英文，不影响机制。

---

## 3. 快速开始

### 3.1 直接在线玩

打开 **<https://oreki.net>** 即可，无需安装。存档保存在浏览器 `localStorage`。

### 3.2 本地运行

`index.html` 用 `<script type="module">` 加载模块，浏览器**不允许**在 `file://` 协议下加载 ES 模块，
所以必须通过 `http://` 访问。

**Windows 一键**：双击 `启动游戏.bat`，脚本会依次尝试 Node.js / Python，起本地服务并打开浏览器。

**手动**：

```bash
# 有 Node.js（任意 LTS 版本）
node serve.mjs 8080

# 或者用 Python
python -m http.server 8080 --bind 127.0.0.1
```

然后访问 `http://127.0.0.1:8080/`。也可以用 VS Code 的 Live Server 插件打开 `index.html`。

### 3.3 手机上玩

把整个目录部署到任意静态托管，用手机浏览器访问该网址；或直接在手机上打开 <https://oreki.net>。

存档在浏览器 `localStorage`，**换设备、换浏览器、清除站点数据都会丢档**。
重要进度请用「选项 → 游戏玩法 → 存档工具 → 下载存档文件」定期导出。

---

## 4. 新手基础操作

打开后先看主导航（桌面端在左侧，窄屏自动收成图标）：
**维度 / 选项 / 统计数据 / 成就 / 自动化 / 挑战**，随进度解锁「无限」「永恒」「现实」「天神」等后续页签。

### 第一个十分钟

1. **手动买第一维度**：初始反物质是 10，第一维度单价正好 10。点一次「买 1 个」或「买至 10」，
   生产才开始。**这一步必须手动完成**（见 §5 的接管时机）。
2. 之后按价格从低到高补齐 8 个反物质维度。
3. 攒够后买**维度提升**（重置反物质与全部维度，换取维度倍率与新维度），
   再往后可以买**反物质星系（AG）**换取更强的产量加成。
4. 解锁**计数频率**后买它，能整体加快所有维度的生产（相当于把每秒的「时刻」变多）。
5. 反物质达到无限目标（`1.8e308`）即可执行**大坍缩**，第一次会获得无限点数并解锁后续内容。

### 选项 → 游戏玩法

- **游戏速度**：×1 / ×10 / ×100 / ×1000 / ×10000 / ×100000 快捷按钮，或输入 1~100000 的整数；
  「恢复默认」一键回到 10000×。
- **成就工具 / 存档工具**：见 §2。默认不启用，必须自己点开、自己确认。

### 快捷键

桌面端在「选项 → 游戏玩法 → 快捷键」可查：数字键买对应维度，`Alt` + 对应键切换自动购买器开关，
`Alt+Shift` 切换反物质维度 / 计数频率自动购买器的购买模式（单个 / 买至 10）。

---

## 5. 自动购买器：接管时机与批量回退

自动购买器在 **自动化 → 自动购买器** 页。

### 5.1 与原版的差异（Mod 定制，不是原版行为）

| 项 | 原版 | 本改版 |
| --- | --- | --- |
| 反物质维度自动购买器解锁 | 完成对应**普通挑战**后自动解锁，或用无限点数购买 | **首次大坍缩后即可运行** |
| 计数频率自动购买器解锁 | 同上 | **首次大坍缩后即可运行** |
| 买至 10 时整批买不起 | 直接放弃，一个都不买 | **退化为买 1 个** |

两条改动都是为了消除死锁：大坍缩会把反物质重置回 10、维度清零，此时整批 10 个永远买不起；
原版靠「自动购买器本来就没解锁」绕开这个坑，本改版让自动器提前接管，就必须同时允许降级为买 1 个。

**这是行为层面的最小修正，没有伪造任何解锁或购买记录**：存档里的 `isUnlocked` / `isBought` 保持原值，
存档里看不到「假解锁」。

### 5.2 首次大坍缩之前

自动购买器**不会接管**。开局的维度购买、维度提升、第一次大坍缩都需要玩家自己完成 ——
这是有意保留的机制体验，也是理解生产链的必要过程。

### 5.3 首次大坍缩之后

8 个反物质维度自动购买器与计数频率自动购买器开始真实购买。此后：

- **仍可随时关闭**：自动化页的组开关、单个开关都能关；关掉后手动购买不受影响。
- **仍可改购买模式**：单个 / 买至 10 可切换（`Alt+Shift` 或界面按钮）。
- 自动购买器**不会**自动执行大坍缩 / 永恒 / 现实等重置，除非你另外打开对应的自动重置项。
- 普通挑战、无限挑战进行中，自动购买器的行为受挑战规则约束，不会绕过挑战限制。

---

## 6. 挑战、重置与阶段推进

- **普通挑战（C1~C12）**：限制某些生产，完成后给永久加成。
- **无限挑战（IC）**、**永恒挑战（EC）**：进入条件、限时与失败判定都基于**游戏内时间**
  （已按倍率剥离），改倍率不会让你「秒过」也不会「秒失败」。
- **大坍缩 / 永恒 / 现实**：三层重置，越往后保留的东西越多。重置是**玩家决策**，不会被无条件触发。
- 挑战的限时判定与成绩记录统一使用游戏内时钟；「现实时间」类记录保持墙钟口径，两者不混用。

---

## 7. 移动端

`index.html` 已带 `<meta name="viewport" content="width=device-width, initial-scale=1">`，
窄屏下导航收成图标，维度行与按钮改为堆叠布局。

**已验证范围**（宿主机 Edge 视口仿真，**不是真机**）：

| 视口宽度 | 检查项 |
| --- | --- |
| 320 / 360 / 390 / 430 / 768 / 1280 CSS px | 横向溢出、关键触控目标尺寸、底部导航可点性 |
| 390 × 844（`isMobile` + `hasTouch`） | 设置页、响应式布局、弹窗、挑战页 |

复跑命令见 §8.4。**未在物理手机上实测**；iOS Safari 的软键盘、滚动回弹、后台挂起行为均属未验证项。

---

## 8. 开发

### 8.1 环境要求

| 项 | 要求 |
| --- | --- |
| Node.js | 22.x（本轮实测 `22.22.2`）—— 只用于本地静态服务器与测试脚本，游戏本身零运行时依赖 |
| 浏览器 | Chromium 79+ / Firefox 78+ / Safari 13.1+（`src/supported-browsers.js` 是正则白名单，不匹配会直接拒绝启动） |
| Python | 可选，用于替代 `serve.mjs` 的静态服务器 |

仓库**没有 `package.json`、没有构建步骤**：浏览器直接加载 `src/` 下的原生 ES 模块，改完刷新即可。

### 8.2 目录结构

```
AD-Oreki-Edition/
├── index.html                    入口（加载 src/main.js）
├── serve.mjs                     零依赖本地静态服务器
├── 启动游戏.bat                  Windows 一键启动
├── src/
│   ├── main.js                   启动入口（速度系统 → 工具 → 游戏）
│   ├── game.js                   主循环；realDiff 是全局倍率的唯一注入点
│   ├── core/
│   │   ├── speed-config.js       全局速度因子（校验 / 持久化 / 模拟期冻结）
│   │   ├── oreki-tools.js        成就工具与存档工具
│   │   ├── autobuyers/           各类自动购买器
│   │   ├── dimensions/           反物质维度、无限维度、时间维度
│   │   ├── secret-formula/       数值表、页签定义、H2P 帮助文本
│   │   └── ...                   游戏本体其余部分
│   └── components/
│       ├── tabs/                 各页签 UI
│       └── modals/               弹窗（含 OrekiAchievementModal / OrekiSaveModal）
├── public/stylesheets/oreki.css  新增 UI 样式
├── docs/                         设计标准、交接与测试记录
├── NOTICE.md                     上游来源与许可
└── LICENSE / MOD-LICENSE
```

### 8.3 本地开发

```bash
node serve.mjs 8080     # 起服务，改完刷新浏览器
```

> ⚠️ **本仓库是部署副本，下列开发资料不在本仓库内**
>
> 本节提到的 `docs/SHARED_GAMEPLAY_STANDARD.md`、`AGENTS.md`、`../_tools/` 均属于
> **完整开发工作区 / 源码仓库**，`OrekiDawson.github.io` 这个仓库里**没有这些文件**。
> 单独克隆本仓库只能运行页面，**不能执行下面的开发与测试命令**。
> 需要它们请转到源码仓库 `github.com/OrekiDawson/AD-Oreki-Edition-Web` 并在完整工作区下操作。

改动游戏行为的任务，动手前先读源码仓库的 `docs/SHARED_GAMEPLAY_STANDARD.md`（最高设计规范）
与 `AGENTS.md`（工程约定）—— 两者都在**源码仓库**，不在本仓库。

### 8.4 测试

> 本节全部命令**只能在完整开发工作区执行**。工作区根目录同时包含 `AD-Oreki-Edition/` 与 `_tools/`，
> 而本 Pages 仓库并不包含 `_tools/`。

测试脚本放在**工作区**而不是本仓库（因为要做 `git worktree` 对照、要保存截图与日志），路径为 `../_tools/`：

```bash
cd ..                        # 工作区根：包含 AD-Oreki-Edition/ 与 _tools/
bash _tools/run-all.sh       # 16 组套件，以退出码 0 判定通过

# 手机视口矩阵（320 / 360 / 390 / 430 / 768 / 1280）
node _tools/verify-viewport-matrix.mjs AD-Oreki-Edition 8300
```

`run-all.sh` 会自己起 `127.0.0.1:8200` 的本地静态服务，只访问本地副本，不触线上环境。
浏览器启动兼容层与必需环境变量由 `run-all.sh` 自行处理（脚本内 `_tools/lib/patch-launch.mjs`）。

**当前已知失败（在最新提交 HEAD 上同样复现，不是本轮引入）**：

| 组 | 症状 | 状态 |
| --- | --- | --- |
| 9 动态倍率 / 离线结算时间语义 | 9 项失败（首帧补齐、离线增量断言） | 已知，未修 |
| 14 `Async.run` 清理契约 | T6 / T7「结算后仍 locked」**时序抖动**，连续运行会时过时不过 | 已知，测试自身等待窗口过紧 |
| 15 自动购买器间隔缩放 UI | 21 / 23 通过 | 已知，未修 |
| 16 计数频率购买器间隔缩放 UI | 20 / 27 通过 | 已知，未修 |

报告测试结果时必须区分**通过 / 失败 / 未执行**；未执行不得写成通过。

### 8.5 部署（GitHub Pages）

线上站点是**独立仓库** `_deploy/site`（`origin = github.com/OrekiDawson/OrekiDawson.github.io`），
不是本仓库的 `gh-pages` 分支。`CNAME` 指向 `oreki.net`。

#### 8.5.1 仓库职责边界

| 项 | 说明 |
| --- | --- |
| 本仓库职责 | 只存放**部署产物**：可直接被静态托管服务的文件快照 |
| 源码唯一源 | `web/AD-Oreki-Edition`（`OrekiDawson/AD-Oreki-Edition-Web`） |
| 是否独立开发分支 | **否**。本仓库不是第二个代码源，不得在此单独开分支改功能 |
| 允许的本地提交 | 仅限部署产物同步、`README.md` 维护、以及**确认会被下次同步覆盖**的临时修正 |

> 任何功能改动只能发生在源码仓库；本仓库的代码修改一律视为可被覆盖的临时状态。

#### 8.5.2 发布流程

1. 源码仓库改完并测试通过；
2. 执行同步：`python web/_deploy/deploy_pages.py`（脚本位于源码工作区 `web/_deploy/`）
   —— 由 `git archive` 导出源码快照，按文件清单逐文件复制到本仓库工作区；
3. 在本仓库 `git status` 核对变更范围，确认只包含本轮预期文件；
4. 提交并推送 `main`；
5. 打开 <https://oreki.net> 实际核对。

**未获授权不提交、不推送、不部署。**

#### 8.5.3 换行符与格式差异（避免假性整文件 diff）

源码仓库与部署副本在不同工具链下可能产生 **CRLF / LF** 差异，直接 `diff` 会显示整文件变更，
把真实改动淹没。处理办法：

```bash
# 比对单文件（行尾归一）
diff <(tr -d '\r' < 源码文件) <(tr -d '\r' < 部署文件)
```

同步脚本本身应保持原换行符，**不要**在同步过程中做格式统一。

#### 8.5.4 线上资源与部署版本核验

不要只看 `git log` 就宣称"线上已是新版"。必须实际取回线上文件并比对哈希：

```bash
# 落盘到仓库内相对路径，不要写 /tmp
curl -sL -m 20 -o reports/_deploy_check/<文件名> https://oreki.net/<路径>
# 去 BOM + 行尾归一后比 SHA-256
sha256sum <(tr -d '\r' < reports/_deploy_check/<文件名>) <(tr -d '\r' < <源码文件>)
```

> **坑**：Git Bash 下 `curl -o /tmp/xxx` 可能静默失败，得到空文件并算出
> 空串 SHA `e3b0c442…`，从而误判"线上未部署"。**必须落到仓库内相对路径**并先确认文件大小非零。

核验通过的标准是三处一致：**线上取回的文件 = 源码仓库文件 = 本仓库副本**。

#### 8.5.5 部署失败与回滚

- 推送失败：先确认是否为网络问题（本机直连 GitHub 常报 `Connection was reset`），
  改用 `git -c http.proxy=http://127.0.0.1:7897 push`；仍失败则**明确标记为未同步，不得谎报成功**。
- 线上异常需要回滚：在本仓库 `git revert <提交>` 后重新推送（**不使用 force push、不 reset --hard**），
  或从源码仓库重新执行一次同步覆盖。
- Pages 构建失败：检查 `CNAME`、仓库 Pages 设置与文件路径大小写，修复后重新推送触发构建。

#### 8.5.6 需要明确授权的操作

以下操作**必须获得用户明确授权**才能执行：提交并推送本仓库、触发 Pages 部署、
修改 `CNAME`、删除线上文件、回滚线上版本。

**README 或任务单的推送 ≠ 部署游戏**，两者必须分开授权。


---

## 9. Linux 和 macOS 使用说明

> **先说清本仓库的性质**：本仓库只包含**静态部署文件**（`index.html`、`src/`、`public/`、`modules/`、`serve.mjs`），
> **不是完整的开发源码仓库**。功能开发、构建、测试都在源码仓库 `AD-Oreki-Edition` 进行，
> 本仓库的代码改动会在下次同步时被覆盖。
>
> **实测范围声明**：以下命令基于仓库实际内容核验（`serve.mjs` 三平台分支已读源码确认），
> 但**编写时仅在 Windows 环境实际运行过**。Linux 与 macOS 部分**未经实机验证**，标注为【未实测】。
> 若你执行时遇到差异，请以实际报错为准并回馈修正。

### 9.1 四种使用场景，别混淆

| 场景 | 去哪做 | 需要什么 |
| --- | --- | --- |
| ① 只是玩 | 浏览器打开 <https://oreki.net> | 无 |
| ② 本地跑起来玩 | 本仓库，`serve.mjs` | Node.js |
| ③ 改游戏功能 | **源码仓库 `AD-Oreki-Edition`** | Node.js + 完整源码 |
| ④ 部署到自己的托管平台 | 本仓库内容上传即可 | 无（产物已是静态文件） |

### 9.2 直接在线玩

浏览器访问 <https://oreki.net> 即可，无需安装任何东西。

**推荐浏览器**：Chrome / Edge / Firefox 最新版。游戏使用 ES 模块（`<script type="module">`）
与较新的 CSS 特性，**IE 与老旧内核浏览器不支持**，页面会显示「你的浏览器不支持」提示。

### 9.3 获取文件

```bash
# 方式一：克隆（含完整历史）
git clone https://github.com/OrekiDawson/OrekiDawson.github.io.git
cd OrekiDawson.github.io

# 方式二：只取最新快照
curl -L -o ad-oreki.tar.gz https://github.com/OrekiDawson/OrekiDawson.github.io/archive/refs/heads/main.tar.gz
tar xzf ad-oreki.tar.gz && cd OrekiDawson.github.io-main
```

> 若只需部署产物、不需要历史，用方式二更小。

### 9.4 本地启动

**不需要 `npm install`**——本仓库没有 `package.json`，`serve.mjs` 只用 Node.js 内置模块
（`node:http` / `node:fs` / `node:path` / `node:url` / `node:child_process`），**零第三方依赖**。

```bash
node serve.mjs          # 默认 8080 端口
node serve.mjs 8200     # 指定端口
```

启动后浏览器会自动打开 `http://127.0.0.1:<端口>/`（脚本按平台选择 `start` / `open` / `xdg-open`）。
若没有自动打开，手动访问该地址即可。停止：`Ctrl + C`。
端口被占用时脚本会提示换端口。

**为什么必须用 http 而不是双击 `index.html`**：页面通过 `<script type="module">` 加载 ES 模块，
浏览器在 `file://` 协议下会拒绝加载，直接双击打开会白屏。

#### 安装 Node.js

| 平台 | 方式 |
| --- | --- |
| **macOS** | 官方安装包：<https://nodejs.org/> 下载 `.pkg`；或 Homebrew：`brew install node`<br>Apple 芯片（M 系列）与 Intel 芯片**安装包不同**，官网会按架构给对应版本；Homebrew 会自动匹配 |
| **Linux（Debian/Ubuntu）** | `sudo apt update && sudo apt install -y nodejs` |
| **Linux（Fedora/RHEL）** | `sudo dnf install -y nodejs` |
| **Linux（Arch）** | `sudo pacman -S nodejs` |
| **任意 Linux** | 或用 nvm：`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh \| bash` 后 `nvm install --lts` |

**版本要求**：`serve.mjs` 使用 `node:` 协议前缀导入内置模块，需要 **Node.js ≥ 14.18**；
建议使用 **18 LTS 或更高**。用 `node --version` 确认。

> 发行版仓库里的 `nodejs` 可能偏旧（例如某些 Ubuntu LTS 自带 12.x）。
> 若报 `Cannot find module 'node:http'`，就是版本过低，改用 nvm 或 NodeSource 源安装。

#### Linux 上自动打开浏览器失败

脚本在 Linux 用 `xdg-open`。若提示找不到命令或没有反应：

```bash
# Debian/Ubuntu
sudo apt install -y xdg-utils
# Fedora
sudo dnf install -y xdg-utils
```

装不上也没关系——**服务本身已经起来了**，手动在浏览器打开 `http://127.0.0.1:<端口>/` 即可。

#### macOS 首次运行被拦截

从网络下载的脚本可能被 Gatekeeper 标记。用 `node serve.mjs` 直接运行**不涉及可执行权限**，
正常不会触发；若遇到，`xattr -d com.apple.quarantine serve.mjs` 解除标记。

### 9.5 本地验证部署效果

本地跑起来就等于验证了部署效果——**本仓库内容本身就是最终部署产物**，没有额外构建步骤。

要严格模拟线上，注意两点：

1. 线上由 GitHub Pages 提供，路径区分大小写；Linux 文件系统**也区分大小写**（macOS 默认不区分），
   所以 **Linux 上测出来的路径问题最接近线上真实情况**
2. 线上根路径是 `/`，本地也是 `http://127.0.0.1:<端口>/`，相对路径行为一致；若资源用了绝对路径 `/xxx`，
   本地一样能暴露问题

### 9.6 部署到自己的静态托管

本仓库产物是纯静态文件，可直接上传到任意静态托管（GitHub Pages / Cloudflare Pages / Netlify / Vercel / 自己的 Nginx）。

注意事项：

- **不要上传** `.git/`、`CNAME`（那是给 `oreki.net` 用的，换了域名要改或删）
- `.nojekyll` 需要保留（否则 GitHub Pages 会走 Jekyll 处理，忽略 `_` 开头的目录）
- 上传后访问根路径即可

> **本仓库不是第二个代码源**。要做功能改动，请在源码仓库 `AD-Oreki-Edition` 修改，
> 再通过同步脚本更新本仓库；直接在本仓库改功能会在下次同步时丢失。

### 9.7 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 打开页面白屏 | 用了 `file://` 双击打开 | 必须走 `node serve.mjs` 的 http 地址 |
| `Cannot find module 'node:http'` | Node.js 版本 < 14.18 | 升级 Node（推荐 18 LTS+） |
| `EADDRINUSE` 端口被占用 | 端口已被其他程序占用 | `node serve.mjs 8200` 换端口 |
| 浏览器没自动打开 | Linux 缺 `xdg-open`，或沙箱环境限制 | 手动访问 `http://127.0.0.1:<端口>/` |
| 提示「你的浏览器不支持」 | 内核过旧 | 换 Chrome / Edge / Firefox 最新版 |
| 改了文件页面没变 | 浏览器缓存 | 强制刷新（`Ctrl+Shift+R` / `Cmd+Shift+R`） |
| 资源 404（大小写） | 线上与 Linux 区分大小写，macOS 默认不区分 | 按仓库实际文件名大小写引用 |

### 9.8 与 Windows 说明的关系

仓库根目录的 `启动游戏.bat` 是 **Windows 专用**，Linux/macOS 不能用。
Linux/macOS 一律使用 `node serve.mjs`。两者最终跑的是同一个服务器脚本，行为一致。

---

## 10. Web 与 Android 的关系

同一产品的两个实现，追求**行为等价**，不要求代码相同：

| | Web（本仓库） | Android |
| --- | --- | --- |
| 代码形态 | 原生 ES 模块（可读源码） | 原版 APK 反编译 + smali 补丁 |
| 加速实现 | `realDiff` 单点注入 | `OrekiSpeed.mult()` + 游戏时间字段缩放 |
| 自动购买器接管 | `isUnlocked` 追加「已发生过无限」 | `OrekiAuto.hasInfinity()` 追加同一条件 |
| 批量回退 | `buyMaxDimension` 整批买不起时买 1 | `AntimatterDimensionState.i()` 同样退化为买 1 |

判定两端是否一致，看**同条件下同一时刻的游戏状态**（资源、购买次数、解锁项、阶段计时），
而不是「代码看起来一样」。

---

## 11. 已知限制与开发状态

1. **3 小时通关未验证**。这是目标，当前没有完整新档全流程实测证据；任何「已达成」的说法都不可信。
2. §8.4 列出的 4 组测试已知失败仍在。
3. 后期内容（天神、Pelle 完整推进、莱特拉、符文长期养成）只做过时间语义与静态代码核查，
   没有从零完整通关验证。
4. 手机端只做过视口仿真与模拟器内浏览器检查，**无真机实测**。
5. 彩蛋新闻未汉化；主题名（Normal / Dark / Metro …）保留英文，因为它是存档字段 `player.options.theme` 的取值。
6. `AGENTS.md` 中提到的 `docs/官方源码基准.md`、`docs/Wiki查证索引.md` 目前不在本仓库内
   （在上一级工作区的 `docs/` 下），引用时请注意路径。

---

## 12. 反馈

个人项目，没有 issue 模板。报告问题时请附上：**提交哈希、倍率设置、复现步骤、浏览器与版本、
存档片段（可脱敏）、控制台报错**。只说「坏了」无法定位。

---

## 13. 来源与许可

| 项目 | 用途 | 许可 |
| --- | --- | --- |
| [IvarK/AntimatterDimensionsSourceCode](https://github.com/IvarK/AntimatterDimensionsSourceCode) | 游戏本体（Hevipelle 等） | MIT |
| [aquamarine309/ADChinese](https://github.com/aquamarine309/ADChinese) | 简体中文译文 + 浏览器原生 ESM 重构 | MIT + MOD-LICENSE |
| [WYXkk/ADfaster](https://github.com/WYXkk/ADfaster) | 全局速度倍率设计与实现思路 | MIT |

本项目整体以 MIT License 分发（`LICENSE`）；上游版权声明与许可条款继续对相应部分生效，不得移除。
完整署名见 `NOTICE.md`。

本项目为个人学习与自用目的的非官方修改版，与上述作者均无隶属关系、未获其背书，请勿用于商业用途。
