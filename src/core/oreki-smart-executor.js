// [Oreki R40-S2] 智能自动购买器 —— 执行层（唯一允许动手的地方）
//
// ── 三条铁律（team-lead 2026-10-31 定，改动前先读这里）────────────────────
// 1. 只读 `.gen.js`：策略数据的唯一来源是 `oreki-smart-strategy.json`，由
//    `scripts/gen_spec_module.mjs` 机械转成 `oreki-smart-strategy.gen.js`。
//    本文件**不写回 JSON、不 import JSON、不新增任何阶段/目标/动作名**；
//    所有 id 都从决策对象里取。
// 2. 只走原版购买入口：本文件**不出现任何 `player.xxx = ...` 赋值**。
//    动手方式只有两种：调用原版 API（经由各阶段模块已有的方法），
//    或者调用 `game.js` 注册进来的、同样只调原版 API 的例程。
//    特别是 `player.break`：FACTS C.31 已定案——直接置真是**死锁不是修法**，
//    正确路径是「先买 keepAutobuyers 与间隔、再末日一次」由 `reality.js:750` 置真。
// 3. 不碰教程侧：不 import `oreki-tutorial*`、不改 `scripts/validate_tutorial.mjs`。
//
// ── 购买权边界（三选一，本文件选 B，理由写在下面）────────────────────────
//  A. 各阶段模块让权给执行层（模块不再自己买）
//  B. 执行层只在「该阶段模块本帧判定无动作」时才动手 ← **选这个**
//  C. 两层并行，各买各的
//
//  为什么选 B：
//  · 现有 6 个阶段模块是**实测能通关的**（`_tools/_r40/r40s1-full.jsonl`：708.1 s，
//    `totAML 958.248 → 1032.015`、`gameEnd` 首真在 t=708.1；
//    另一次同链路跑是 783.1 s，原始数据 `r40a5-arm2.jsonl`。两次数都留着，别只引一个。
//    `isGameEnd` 每次都只由 false 翻 true 一次，见 `_tools/_r40/R40A5-佩勒破无限.md`），
//    选 A 等于把刚验证过的购买逻辑整体下线，用一份新代码替换 —— 风险与收益完全不成比例。
//  · 选 C 会让两层在同一帧抢同一笔资源（典型：IP 既买 ID 又买 IU），冲突不可观测。
//  · 选 B 时「谁动的手」永远是确定的：模块先判，模块不动执行层才补一手，
//    且执行层调的是**同一个模块自己的方法**（同一条购买路径、同样的成本检查、同样的幂等性），
//    不是另一套购买实现。冲突在面板上可见（「正在执行」一栏会写清是谁动的）。
//
// ── 「本帧无动作」怎么判 ────────────────────────────────────────────────
// 各阶段模块的 `tick()` 都返回一个动作摘要（`{ids, upgrades}` / `{dims, tt, studies...}` /
// `{reality, upgrades, glyphs}` ...），`game.js` 把摘要原样喂给本文件（`observe()`）。
// 摘要里只要有任一项为真/大于 0，就算「本帧有动作」，`idle` 计数清零；
// 连续 `IDLE_FRAMES_BEFORE_ACT` 帧都没有动作，才认为这个模块这一帧「没事干」。
// 这是**保守**的判据：宁可晚 3 帧，也不要和模块抢同一笔钱。
//
// ── 手动优先（spec.manualOverride）──────────────────────────────────────
// 原版没有「这笔是谁买的」审计，所以只能以**点击**为信号：
// 监听 `#ui` 上的 `click`/`pointerdown`（capture），命中购买区且不在设置/教程覆盖层里，
// 就算一次手动操作 → `OrekiSmartStrategy.noteManualAction(goalId)`，
// 该 goal 在 `manualOverride.holdSeconds`（60 s）内不受本层驱动。
// 这是**启发式**，不是精确归因：范围放大只会让自动层多等 60 秒（安全方向），
// 不会让它在玩家正在操作时抢买（危险方向）。
// 暂停原因与剩余秒数必须在面板上写出来（`debugState().manualHold`），不许静默暂停。
//
// ── 本层刻意不做的事 ────────────────────────────────────────────────────
// · 不做 Pelle 终局循环（`pelleEndgame` 的 5 个 verb 全部 `delegated`）：
//   `OrekiEndgameAutomation.driveDoomed()` 的相位机与末日间隔是实测调出来的
//   （20 s 冷却、残迹收益停滞判据、先买后末日顺序），执行层再插一手只会打乱相位。
// · 不做挑战内购买顺序（`challengeSpecificOrder` 等）：挑战规则由
//   `oreki-eternity-automation.js` 与 `oreki-instant-challenges.js` 按挑战逐条处理。
// · 不做天神（`celestialSpecificOrder` 等）：`OrekiCelestialAutomation.tick()` 内部按天神分派，
//   这里再调一次等于递归。
//
// ── 实测贡献（别把它当救命稻草）─────────────────────────────────────────
// 因为选 B 且调的是同一批幂等方法，本层在正常推进时的**额外购买量接近于 0**；
// 真值在于：① 把「现在处于哪个阶段 / 该做什么 / 被什么卡住」变成可观测的七项；
// ② 模块异常静默（`tick()` 全 false）时兜一手重试；③ 玩家手动操作后立刻让路。

import { OrekiSmartStrategy } from "./oreki-smart-strategy.js";

/** 连续多少帧「模块无动作」才由执行层接管。3 帧 ≈ 3 s 游戏内，远大于模块节流间隔。 */
const IDLE_FRAMES_BEFORE_ACT = 3;
/** 同一 source 两次接管之间的最小墙钟间隔，防止模块长期无动作时每帧空转调用。 */
const ACTION_MIN_INTERVAL_MS = 250;
/**
 * 某个 verb 试了但**没买到**，就冷却这么久，让 priority 里后面的动作有机会上。
 * 没有这条会饿死：`realityPush` 的第一个 owned 是 `equipBestGlyph`，
 * 而符文槽满时它恒定返回 0 —— 实测 409 次尝试里 370 次都花在它身上，
 * `buyRealityUpgrade` / `runReality` 一次都没轮到（`r40s2-smoke2.jsonl`）。
 */
const NOOP_COOLDOWN_MS = 2000;
/**
 * [Oreki R45·4] 连续多久挑不出动作，就不再算「健康等待」，必须报成阻塞。
 *
 * 3 帧（≈ 数百毫秒）内等模块让帧是设计，但**等 1 分钟以上就已经不是让帧了**。
 * 验收实测：`celestialsEnslaved` 起 `attemptCount` 冻结在 235，一路到 1200 s 超时，
 * 期间 `blockers` 恒为 `[]` —— 因为 `describeNoAction()` 把「所有可代劳动作都在等
 * source 就绪」一律判成健康等待并返回 null。60 s 是留足余量的阈值：任何一个
 * 正常阶段都不会连续 60 s 一条动作都发不出去。
 */
const STALL_REPORT_MS = 60000;

// ── [Oreki R50 web · 九修] 用户可配的统一调度节拍 ─────────────────────────────
//
// 用户令（2026-11-01）：所有由 mod 主动发起的自动操作必须经过**同一个调度器**，
// 任意两次「实际执行」之间至少要隔用户配置的秒数（1~60，默认 3），
// 开关可独立关闭且必须持久化。原版 tick 与原版自带自动购买器不在限制范围内。
//
// 为什么做在 execute 层而不是新开一个 scheduler：本文件已经是全仓唯一的
// 「谁动手」执行层（VERBS + pickExecutable + noop 冷却 + 时间戳），
// 再建第二套节拍会立刻违反用户令第 2 条（不同模块不许各自计时）。
//
// 键名与 Android 端逐字一致，便于双端核对；**不要改名**。
const AUTOMATION_ENABLED_KEY = "oreki.automation.enabled";
const AUTOMATION_INTERVAL_KEY = "oreki.automation.intervalSec";
/**
 * [Oreki R50 web · 九修·三次] 严格模式（全局串行）开关。
 * 默认 false = 「单任务间隔」语义；true = 「全局任意两次执行之间」语义。
 * 键名与 Android 端逐字一致，**不要改名**。
 */
const AUTOMATION_STRICT_KEY = "oreki.automation.strictGlobal";
const INTERVAL_MIN_SEC = 1;
const INTERVAL_MAX_SEC = 60;
// R85：双端新存档默认 10 秒；已有合法配置必须保留。
const INTERVAL_DEFAULT_SEC = 10;
/** 间隔钳制：非数字 / NaN / 越界一律落到边界值，绝不接受 0 或 Infinity */
function clampIntervalSec(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return INTERVAL_DEFAULT_SEC;
  return Math.min(INTERVAL_MAX_SEC, Math.max(INTERVAL_MIN_SEC, n));
}
function readStoredAutomation() {
  const out = { enabled: true, intervalSec: INTERVAL_DEFAULT_SEC, strictGlobal: false };
  try {
    if (typeof localStorage === "undefined") return out;
    const en = localStorage.getItem(AUTOMATION_ENABLED_KEY);
    // 只有明确的 "0"/"false" 才算关闭；键不存在时保持默认开启（用户令：默认启用）
    if (en === "0" || en === "false") out.enabled = false;
    const iv = localStorage.getItem(AUTOMATION_INTERVAL_KEY);
    if (iv !== null) {
      const stored = Number(iv);
      // 持久化值只有在完整落入 1～60 秒时才视为合法；损坏或越界值回退新存档默认值。
      if (Number.isInteger(stored) && stored >= INTERVAL_MIN_SEC && stored <= INTERVAL_MAX_SEC) {
        out.intervalSec = stored;
      }
    }
    const st = localStorage.getItem(AUTOMATION_STRICT_KEY);
    if (st === "1" || st === "true") out.strictGlobal = true;
  } catch (e) { /* 隐私模式等：退回内存默认值 */ }
  return out;
}
function writeStoredAutomation(enabled, intervalSec, strictGlobal) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(AUTOMATION_ENABLED_KEY, enabled ? "1" : "0");
    localStorage.setItem(AUTOMATION_INTERVAL_KEY, String(intervalSec));
    localStorage.setItem(AUTOMATION_STRICT_KEY, strictGlobal ? "1" : "0");
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * verb → 动作。`policy` 三态：
 *   owned        执行层可代劳（调的是阶段模块自己的公开方法 / game.js 注册的例程）
 *   delegated    归阶段模块独占，执行层只显示、不动手
 *   unsupported  本项目没有对应入口（面板显示原因，不编动作）
 * `source` 与 `observed` 里的键一一对应；`routine` 由 game.js 注册。
 */
const VERBS = {
  // ── 无限前（tryOrekiEarlyRoutine，game.js 注册）──
  buyDimension: { policy: "owned", source: "routine", label: "买反物质维度" },
  buyTickspeed: { policy: "owned", source: "routine", label: "买计数频率" },
  buyDimBoost: { policy: "owned", source: "routine", label: "维度提升" },
  buyGalaxy: { policy: "owned", source: "routine", label: "反物质星系" },
  sacrifice: { policy: "owned", source: "routine", label: "献祭" },
  buyRestart: { policy: "owned", source: "routine", label: "重置维度重开" },
  // [Oreki R45] `buyUpgrade` 原来映射到 `routine`，但 `tryOrekiEarlyRoutine()` **一行升级都不买**
  // （它只做：计数频率 / 维度提升 / 星系 / 献祭 / 买维度 / 首坍缩）。原版在「永恒之前」
  // 唯一的升级商店就是无限升级（`InfinityUpgrade.all[i].purchase()`），
  // 真实入口在 `OrekiEarlyAutomation.buyInfinityUpgrades()` —— 与 `buyInfinityUpgrade`
  // 是同一个方法，这里只是把「声明了 owned 却没有真实动作」的这一条改成能真的动手。
  buyUpgrade: { policy: "owned", source: "early", method: "buyInfinityUpgrades", label: "买升级" },
  crunch: { policy: "owned", source: "routine", label: "大坍缩" },

  // ── 无限（OrekiEarlyAutomation）──
  buyInfinityDimension: { policy: "owned", source: "early", method: "buyInfinityDimensions", label: "买无限维度" },
  buyInfinityUpgrade: { policy: "owned", source: "early", method: "buyInfinityUpgrades", label: "买无限升级" },

  // [Oreki R44] 打破无限期的间隔升级。**刻意不代劳**：这条路径由
  // `oreki-break-infinity-gate.js` 独占（它同时负责「一次性把 IP 补足到 32767」的相位判定），
  // 执行层再插一手会和它的 `grantedThisSession` 相位打架。
  buyBigCrunchInterval: {
    policy: "delegated", label: "拉满大坍缩间隔",
    why: "OrekiBreakInfinityGate 独占（间隔升级 + 一次性 IP 补足是同一相位，拆开会出现「发钱→被别的购买吃掉」）"
  },

  // ── 永恒（OrekiEternityAutomation）──
  buyTimeTheorem: { policy: "owned", source: "eternity", method: "buyTimeTheorems", label: "买时间之理" },
  // ⚠ 这两个**刻意不代劳**：模块把研究购买节流在 `_frame % 30`（STUDY_TICK_INTERVAL），
  // 方法本身没有内置节流。执行层按「本帧无动作就补一手」去调，等于把 30 帧节流换成 250 ms，
  // 购买节奏会偏离 R40-A5/R40-S1 实测通关的那条路径（那两次跑的都是 30 帧节流）。
  // 收益只有「早买几百毫秒」，风险是让已验证的通关路径失效 —— 不值。
  buyTimeStudy: {
    policy: "delegated", source: "eternity", label: "买时间研究",
    why: "模块内置 30 帧节流（oreki-eternity-automation.js:735），代劳会绕过节流、偏离已验证节奏"
  },
  buyDilationStudy: {
    policy: "delegated", source: "eternity", label: "买膨胀研究",
    why: "同上（与时间研究同一段节流）"
  },
  eternity: { policy: "owned", source: "eternity", method: "tickEternity", label: "永恒重置" },

  // [Oreki R44] 时间膨胀段的两个动词。膨胀的启动与升级都由
  // `OrekiCelestialAutomation.tickDilation()` / `OrekiDilationAutomation` 独占（它们共用一个 `hold` 门禁，
  // 见 oreki-dilation-automation.js:28/153），执行层代劳会绕过那道门禁。
  startDilation: {
    policy: "delegated", label: "启动时间膨胀",
    why: "OrekiCelestialAutomation.tickDilation() 独占（与 hold 门禁共用，绕过会提前压现实）"
  },
  buyDilationUpgrade: {
    policy: "delegated", label: "买膨胀升级",
    why: "OrekiDilationAutomation 独占（速子粒子播种与升级顺序耦合）"
  },
  // R81：原版确有六项一次性永恒升级；复用永恒模块入口，不能把商店误当成自动里程碑。
  buyEternityUpgrade: {
    policy: "owned", source: "eternity", method: "buyEternityUpgrades", label: "买永恒升级"
  },
  runChallengeIfRewardBlocks: {
    policy: "delegated", source: "eternity", label: "按需打挑战",
    why: "由 OrekiEternityAutomation.buyEcStudiesAndStart 与 oreki-instant-challenges.js 判定"
  },

  // ── 现实（OrekiRealityAutomation）──
  buyRealityUpgrade: { policy: "owned", source: "reality", method: "buyRealityUpgrades", label: "买现实升级" },
  equipBestGlyph: { policy: "owned", source: "reality", method: "equipGlyphs", label: "装备最优符文" },
  runReality: { policy: "owned", source: "reality", method: "tryReality", label: "现实重置" },
  // 现实机器（RM）不是买来的：由现实重置按公式产出，没有购买入口。
  buyRealityMachine: { policy: "unsupported", label: "买现实机器", why: "RM 由现实重置产出，原版无购买入口" },
  // [Oreki R44] 复兴节点。原版有 `Perk(id).purchase()`（perks.js:40 的
  // SetPurchasableMechanicState），扣 `Currency.perkPoints`、连通性由
  // `isAvailableForPurchase`（perks.js:36-38）自己判。
  // R44 之前这里写 unsupported，理由是「没有经过验证的购买顺序」——
  // 现在这条理由由 `oreki-perk-automation.js` 消掉：它按当前已买集合做 BFS，
  // 买「通往 automatorPoints 节点最短路」的第一步，不是固定 id 序列。
  // 本层只代劳「模块本帧没买」的情况（同一个方法 `buyPerks()`，同一条购买路径）。
  buyRealityPerk: { policy: "owned", source: "perk", method: "buyPerks", label: "买复兴节点" },

  // ── 挑战（归阶段模块）──
  // [Oreki R45] 原来这三条写的是「由 oreki-instant-challenges.js / OrekiEternityAutomation
  // 按挑战规则处理」，说得比实际宽。真实情况分两种，逐条写清：
  //   · NC / IC：进挑战的当帧就被 `oreki-instant-challenges.js` 用原版结算出口
  //     （`challenge.complete()` + 原版收益函数）做完并退出，**根本不进入战斗期**，
  //     所以「挑战内购买顺序 / 只买允许项 / 完成后坍缩」在 Web 端不需要动作；
  //     挑战期间照常跑的只有原版自己的维度/计数频率自动购买器。
  //   · EC：入口与挑战内购买由 `OrekiEternityAutomation`（`buyEcStudiesAndStart`）
  //     与 `OrekiDilationAutomation` 按挑战逐条处理。
  challengeSpecificOrder: {
    policy: "delegated", label: "挑战专项顺序",
    why: "NC/IC 由 oreki-instant-challenges.js 当帧按原版出口结算、无战斗期；EC 内顺序由 OrekiEternityAutomation / OrekiDilationAutomation 处理"
  },
  buyAllowedOnly: {
    policy: "delegated", label: "只买挑战允许项",
    why: "同上；挑战期间只有原版维度/计数频率自动购买器在跑，它们自己就受挑战规则限制"
  },
  crunchWhenDone: {
    policy: "delegated", label: "完成后坍缩",
    why: "同上；NC/IC 的完成不走坍缩（当帧结算），EC 的退出由 eternity 模块的真实 eternity() 完成"
  },

  // ── 天神（归 OrekiCelestialAutomation）──
  celestialSpecificOrder: { policy: "delegated", label: "天神专项顺序", why: "OrekiCelestialAutomation.tick() 内部按天神分派，这里再调等于递归" },
  spendUnlockResource: { policy: "delegated", label: "花解锁资源", why: "同上" },
  advanceCelestialNav: { policy: "delegated", label: "推进天神导航", why: "同上" },

  // [Oreki R45·4] 莱特拉段唯一的**真动作**。
  //
  // 为什么必须有一条 owned：`celestial` 策略的三条动词全是 delegated，于是
  // `celestialsTeresa/Effarig/Enslaved/V/Ra/laitela` 六段执行层**一条都挑不出来** ——
  // 活性探针实测 `owned=0 delegated=3`，`attemptCount` 从进段起永久冻结、`blockers=[]`，
  // 面板还挂着上一阶段的 `runReality`。验收跑里 laitela 段就是这样静默了 700 秒。
  //
  // 为什么指向 `driveLaitelaVerb` 而不是新造一套：`oreki-celestial-automation.js` 的
  // `_canEnter/_enterRun` 只有 teresa/effarig/enslaved/v 四个 case，**没有莱特拉分支**；
  // 真正推进莱特拉的代码只有 `OrekiEndgameAutomation.driveLaitela()`（刷 tier、压现实、
  // 临门卸符文、买 IU25）。方法名带 `Verb` 是因为 `driveLaitela()` 本身不返回购买数
  // （`undefined` ⇒ `didAct()` 恒 false），而 `driveLaitelaVerb()` 只在 tier / run / IU25
  // 真的变化时回 `{acted:true}`，其余帧回 `{acted:false}` 并把原因交给 `noopReason()`。
  driveLaitela: { policy: "owned", source: "endgame", method: "driveLaitelaVerb", label: "推进莱特拉" },

  // ── 佩勒终局（归 OrekiEndgameAutomation，实测 708.1 s / 783.1 s 两次通关的那套相位机）──
  armageddonLoopForShards: { policy: "delegated", label: "末日循环攒碎片", why: "OrekiEndgameAutomation.driveDoomed 相位机独占" },
  buyPelleKeepAutobuyers: { policy: "delegated", label: "买 keepAutobuyers", why: "同上" },
  maxBigCrunchIntervalWithRealIP: { policy: "delegated", label: "拉满大坍缩间隔", why: "同上" },
  armageddonOnceMoreToSetBreak: { policy: "delegated", label: "再末日一次置 break", why: "同上（player.break 只能由原版 reality.js:750 置真）" },
  growAntimatterTo1e1000: { policy: "delegated", label: "把反物质推到 1e1000", why: "同上" },
};

/**
 * source → 阶段模块实例（或函数）。**由 game.js 注册**，本文件不 import 那些模块。
 * 两个理由：① 那些模块 import 链依赖 `window`，直接 import 会让本文件无法在 node 里单测；
 * ② 执行层只应认识「一个带方法的对象」，不该依赖模块内部结构。
 */
const REGISTRY = new Map();

const STATE = {
  /**
   * [Oreki R67] 因策略层降级而整体停手的次数。
   *
   * 语义与 `beatSkips` 类似：只统计「本来可以动、但因为决策不可信而没动」的帧，
   * 用于区分「玩家关掉了」与「策略层自我降级」。不参与任何判定。
   */
  degradedStops: 0,
  enabled: readStoredAutomation().enabled,
  /**
   * [Oreki R50 web · 九修] 用户可配的调度间隔（秒，1~60，默认 3）。
   * 语义：**任意两次实际执行之间**至少隔这么久；只在「真的发出动作」时推进节拍，
   * 没有动作的帧不消耗间隔（否则会白等一拍）。
   */
  intervalSec: readStoredAutomation().intervalSec,
  /**
   * [九修·三次] 严格模式：true = 全局串行（任意两次执行之间 ≥ intervalSec）；
   * false（默认）= 单任务间隔（每个自动任务自身两次执行 ≥ intervalSec）。
   * 两种模式都共用同一个 intervalSec 值、同一张 execLog、同一帧最多一个动作。
   */
  strictGlobal: readStoredAutomation().strictGlobal,
  /**
   * 共享节拍时钟：最近一次**实际执行**的单调时钟时刻。
   * 所有 mod 主动动作（阶段模块 tick + 执行层 verb）共用这一个时钟，
   * 不存在「各模块自己计时」的第二套节拍。
   */
  lastBeatAt: 0,
  /**
   * [R78] 本帧是否已有一次真执行。同帧最多一个受控动作。
   * 由 `beginFrame()` 在每帧开头清，`markExecuted()` 置位。
   */
  frameActed: false,
  /**
   * [R82] 阶段优先提示：当前阶段唯一值得插队的任务 id，空串表示无提示。
   *
   * 只影响 `runCycle` 的尝试顺序，不绕过任何闸门（间隔 / 同帧单动作 / 关闭即停
   * 全部照旧）。用于「首次永恒前 ID1 收购窗口」这类只有一个入口能把资源
   * 转成成长的阶段，避免被固定调用顺序长期压住。
   */
  priorityHint: "",
  /**
   * [R91] 上一拍真正动手的任务 id。
   *
   * 为什么需要：`priorityHint` 只回答「先问谁」，如果被提示的任务每拍都有动作，
   * 它会**连续霸占**唯一名额，把本该并行推进的其它任务饿死。
   * 首次无限→首次永恒这一段就是典型：`early`（无限维度/无限升级）与
   * `routine`（反物质维度/星系）都必须持续拿节拍，谁独占都会让另一条链停摆。
   *
   * 语义：被提示的任务**不能连续两拍**优先；它上一拍已经动过手，这一拍就回到
   * 自己原本的 priority，让其它任务先试。下一拍若还没轮到它，提示重新生效。
   * 只影响尝试顺序，不放宽间隔 / 同帧单动作 / 关闭即停。
   */
  lastBeatTask: "",
  /** taskId → 最近一次实际执行的单调时钟时刻（验证间隔合规用） */
  taskLastAct: Object.create(null),
  /** taskId → 被服务次数（公平轮转用，防止一个话痨任务饿死后面的任务） */
  served: Object.create(null),
  /** 最近 N 条执记录（taskId, at, gapMs），探针与面板都能读 */
  execLog: [],
  /** 本次「拍子」被跳过的任务数（诊断：节拍是否在限制） */
  beatSkips: 0,
  idle: Object.create(null),       // source → 连续无动作帧数
  lastResult: Object.create(null), // source → 上一次摘要（只读展示用）
  lastAction: null,                // { at, verb, label, source, acted, detail }
  lastActionBySource: Object.create(null),
  /** verbId → 冷却到期毫秒（试过但没买到就压一会儿，避免第一个 verb 饿死后面的） */
  noopUntil: Object.create(null),
  /**
   * [Oreki R45] verbId → **连续没买到**的次数。
   *
   * 为什么必须在这里计数：`attemptCount` 与 `actionCount` 的比值（验收实测 79 : 4）
   * 只能说明「在空转」，说明不了「为什么空转」。空转超过 2 次就把原因写进
   * `debugState().blockers`（见 `runtimeBlockers()`），面板与探针都能直接看到
   * 「哪一条动作、连续几次、模块自述的原因」，而不是 `blockers=[]` 静默。
   */
  noopStreak: Object.create(null),
  /** 最近一次「没买到」的模块自述原因（中文一行）；空串 = 模块也不知道 */
  lastNoopReason: "",
  /** 最近一次「没买到」的冷却来源（用于诊断为什么这条 verb 抢不到机会） */
  lastNoopAt: 0,
  /**
   * [Oreki R45] 本帧「一条动作都挑不出来」的原因快照；`null` = 本帧有动作，或只是在等模块让帧。
   *
   * 这条与 `noopStreak` 是两个不同的空白：
   * · `noopStreak` 解释的是「调了、买了 0 个」；
   * · 本条解释的是「**根本没调**」——验收实测里 `celestial` 阶段连续 120 秒
   *   `attemptCount` 冻结、`blockers=[]`、`lastAction` 还挂着上一阶段的 `runReality`，
   *   正是这个空白。它的全部 3 条动作都是 `delegated`，执行层结构上无事可做，
   *   所以必须如实说出来，而不是让面板显示一条陈旧动作。
   */
  noAction: null,
  /**
   * [Oreki R45·4] 本帧挑不出动作的**起始时刻**；一旦真的发出一手就清零。
   *
   * 为什么还要这个：`noAction` 只是本帧快照，会被下一帧覆盖或清空，
   * 所以「已经连续多少秒没动作」在快照里读不出来 —— 而这恰好是验收跑
   * `attemptCount` 从 t≈191 s 冻结到 1200 s 超时、`blockers` 全程为 `[]` 的那段时间里
   * 唯一有意义的量。有它才能把「等了 1 帧」和「等了 16 分钟」区分开。
   */
  noActionSince: 0,
  /** 最近一次真的调用过动作（`invoke()`）的墙钟时刻。0 = 本次加载还没发过动作。 */
  lastExecAt: 0,
  /** 本帧被模块自述为「已完成」而跳过的动词：verbId → { label, why }。见 `verbDoneReason()`。 */
  doneActions: Object.create(null),
  actionCount: 0,
  attemptCount: 0,
  /**
   * 「同帧不抢」的运行时证据（team-lead 验收要求，不是装饰）：
   * · `takeovers`：执行层真正接管并调用方法的次数
   * · `takeoverWhileModuleActed`：接管时**同一帧该 source 的摘要却非空**的次数 ⇒ 这就是抢了
   * 判据来源就是 `game.js` 每帧传进来的 `observed`，不额外假设。
   */
  takeovers: 0,
  takeoverWhileModuleActed: 0,
  lastConflict: null,
  lastSwitch: null,                // { at, from, to, kind }
  lastDecision: null,
  manualClickAt: 0,
  manualClickCount: 0,
  watchInstalled: false,
  lastError: "",
};

/** 摘要里有没有「动作」。泛化处理四种返回形态，避免每个模块写一份适配。 */
function didAct(result) {
  if (result === null || result === undefined) return false;
  if (typeof result === "boolean") return result;
  if (typeof result === "number") return result > 0;
  if (Array.isArray(result)) return result.length > 0;
  if (typeof result !== "object") return false;
  for (const value of Object.values(result)) {
    if (value === true) return true;
    if (typeof value === "number" && value > 0) return true;
    if (Array.isArray(value) && value.length > 0) return true;
  }
  return false;
}

/** 摘要压成一行文字（面板「正在执行」用），不做数值解释，避免编含义。 */
function summarize(result) {
  if (result === null || result === undefined) return "";
  if (typeof result !== "object") return String(result);
  const parts = [];
  for (const [key, value] of Object.entries(result)) {
    if (value === true) parts.push(key);
    else if (typeof value === "number" && value !== 0) parts.push(`${key}=${value}`);
    else if (Array.isArray(value) && value.length) parts.push(`${key}=${value.length}`);
  }
  return parts.join(" ");
}

/**
 * 注册一个 source 的执行目标。由 `game.js` 调用一次。
 * @param {string} source "routine"（函数）或 "early"/"eternity"/"reality"（模块对象）
 * @param {Function|object} target 函数直接调用；对象则按 verb 表里的 `method` 调其方法
 */
function register(source, target) {
  if (typeof source !== "string") return false;
  if (typeof target !== "function" && (typeof target !== "object" || target === null)) return false;
  REGISTRY.set(source, target);
  return true;
}

/** 记录一次观察：某个阶段模块本帧的动作摘要。返回是否算「有动作」。 */
function observe(source, result) {
  const acted = didAct(result);
  STATE.idle[source] = acted ? 0 : (STATE.idle[source] ?? 0) + 1;
  STATE.lastResult[source] = summarize(result);
  return acted;
}

/**
 * [R97 P0 阶段越界] 永恒层阶段门禁：**必须先完成首次无限，再真正 Break Infinity**。
 *
 * 与 Android `OrekiStageAuto.onAutoBuyerTick()` 的两道前置逐条等价
 * （提交 4bf947f）：
 *   ```
 *   if (!GameApi.hasInfinity()) { enableEarly(); return }   // ① 还没首次无限
 *   if (!GameApi.isBroken()) return                          // ② 首次无限后、Break 未完成
 *   ```
 * 本函数同时承担这两条：`PlayerProgress.infinityUnlocked()` 对应 `hasInfinity()`，
 * `player.break === true` 对应 `GameApi.isBroken()`（同一来源：原版真实存档字段
 * `player.break`，不是自造标志、不写任何存档）。
 *
 * 为什么 Web 端必须在这里也守一道（而不是只守 `game.js` 的任务队列）：
 * 任务队列被门禁挡住时，`runCycle()` 会把 `eternity` 记成 no-op 喂给 `observe()`，
 * 连续 3 帧后 `sourceReady("eternity")` 成立，本文件下面 `invoke()` 的兜底路径就会
 * 「替模块动手」—— 直接调 `buyEternityUpgrades` / `tickEternity` / `buyTimeTheorems`。
 * 只守队列等于给兜底留了一条绕过门禁的路。这里与 Android 给 `OrekiEcAutomation.runOnce()`
 * 加同源保护是同一个思路：纵深防御，不依赖调用方守规矩。
 *
 * 极性（双向验证见 `scripts/check_stage_gate.mjs`）：
 *   · 未首次无限（hasInfinity=false）→ false，任何永恒动作都不许发；
 *   · 已首次无限、Break=false（含永恒/现实重置后原版把 break 置回 false 的正常路径）→ false；
 *   · 已首次无限、Break=true → true，原路径照常，**不反向阻断首次永恒**
 *     （首次永恒本来就以 Break 完成为前提：`Player.canEternity` 要求 IP ≥ 1.797e308，
 *      而 Break 前每次坍缩只能拿固定小额 IP）。
 *
 * @returns {boolean} true = 允许驱动永恒层自动化
 */
function eternityStageAllowed() {
  try {
    if (typeof player === "undefined" || !player) return false;
    if (typeof PlayerProgress === "undefined" || !PlayerProgress) return false;
    if (typeof PlayerProgress.infinityUnlocked !== "function") return false;
    return PlayerProgress.infinityUnlocked() === true && player.break === true;
  } catch (e) {
    // 判据取不到一律按「不许动」处理（fail-closed），并把原因留给面板
    STATE.lastError = `eternityStageAllowed: ${(e && e.message) || e}`;
    return false;
  }
}

/** 执行一个 verb。返回 {acted, detail}。只走已注册的阶段模块 / 例程。 */
function invoke(verbId, spec) {
  const now = Date.now();
  try {
    const target = REGISTRY.get(spec.source);
    if (target === undefined) return { acted: false, detail: "未注册" };
    // [R97 P0] 永恒层动作（买永恒升级 / 买时间之理 / 永恒重置）统一过阶段门禁。
    if (spec.source === "eternity" && !eternityStageAllowed()) {
      return { acted: false, detail: "阶段门禁：尚未完成 Break Infinity" };
    }
    STATE.attemptCount++;
    STATE.lastActionBySource[spec.source] = now;
    if (typeof target === "function") {
      const out = target();
      return { acted: didAct(out), detail: `例程→${out === true ? "已执行" : summarize(out) || String(out)}` };
    }
    const method = target[spec.method];
    if (typeof method !== "function") return { acted: false, detail: "方法不存在" };
    const out = method.call(target);
    // 方法返回「什么都没做」的对象时 `summarize()` 必然是空串，此时不能再 `String(out)` ——
    // 那会把面板写成 `driveLaitelaVerb()→[object Object]`。对象一律记「无变化」，只读字符串照旧。
    const summary = summarize(out)
      || (out !== null && typeof out === "object" ? "无变化" : String(out));
    return { acted: didAct(out), detail: `${spec.method}()→${summary}` };
  } catch (e) {
    STATE.lastError = `invoke ${verbId}: ${(e && e.message) || e}`;
    return { acted: false, detail: "抛错（已吞）" };
  }
}

/** 该 source 是否允许动手：模块连续无动作够久 + 同 source 未超频。 */
function sourceReady(source, now) {
  if ((STATE.idle[source] ?? 0) < IDLE_FRAMES_BEFORE_ACT) return false;
  const last = STATE.lastActionBySource[source] ?? 0;
  return now - last >= ACTION_MIN_INTERVAL_MS;
}

/**
 * [Oreki R45] 问阶段模块「这一次为什么没买到」。
 *
 * 只问一个方法：`target.noopReason(verbId)`。它是**只读**的，返回中文一行，
 * 说不清就返回空串（绝不编原因）。模块知道自己的阻塞形态（RM 不够 / 前置没解锁 /
 * 槽位已满），执行层只认识 verb 名，所以解释权必须留在模块里。
 *
 * 这正是验收实测 `attemptCount=79 / actionCount=4` 时缺的那一环：
 * 79 次调用里有 75 次什么都没买到，而 `blockers=[]` 一个字都不说。
 */
function explainNoop(verbId, spec) {
  try {
    const target = REGISTRY.get(spec?.source);
    if (!target || typeof target.noopReason !== "function") return "";
    const out = target.noopReason(verbId);
    return typeof out === "string" ? out : "";
  } catch (e) {
    STATE.lastError = `noopReason ${verbId}: ${(e && e.message) || e}`;
    return "";
  }
}

/**
 * [Oreki R45] 问阶段模块「这条动作在本阶段是不是已经没意义了」。
 *
 * 与 `explainNoop()` 的分工：`noopReason()` 解释**这一次为什么买不动**；
 * `verbDone()` 回答**以后都不用再调了**（例如「一次性现实升级已全部买齐」）。
 * 返回非空字符串即视为已完成（字符串就是给玩家看的理由），返回空串/undefined = 还要调。
 *
 * 为什么需要：验收实测 `buyRealityUpgrade` 被调了 25 次，末段每次都是 `→0`，
 * 而这 25 次里大部分发生在「20 个一次性 RU 已买齐」之后 —— 那不是阻塞，
 * 是重复发起，每 250 ms 白烧一次调用。跳过它并在 `advisories` 里说明「已买齐」，
 * 才算把「→0」讲清楚。
 */
function verbDoneReason(verbId, spec) {
  try {
    const target = REGISTRY.get(spec?.source);
    if (!target || typeof target.verbDone !== "function") return "";
    const out = target.verbDone(verbId);
    return typeof out === "string" ? out : "";
  } catch (e) {
    STATE.lastError = `verbDone ${verbId}: ${(e && e.message) || e}`;
    return "";
  }
}

/**
 * [Oreki R45] 把「这一帧一条动作都挑不出来」翻译成人话。
 *
 * 三档，只有前两档算阻塞：
 *   · 全是 `delegated` / `unsupported` ⇒ **本阶段执行层无事可做**，如实说在等谁；
 *   · 有 owned 但在退避中 ⇒ **刚刚真的试过且买了 0 个**，附模块自述原因；
 *   · 只是 owned 的 source 还没闲够 3 帧 ⇒ **健康等待**，返回 null，不报阻塞。
 * 第三种绝不能报：模块正在干活时执行层本来就该等（那是「同帧不抢」的设计）。
 */
/**
 * [Oreki R45·4] 「已经很久挑不出动作」的统一说明。
 *
 * 单独抽出来是因为它有**两个入口**：`describeNoAction()` 的健康等待分支，
 * 以及 `tickUnsafe()` 的兜底（当 `describeNoAction()` 返回 null 但停滞确实超阈值时）。
 * 后者不是多余：验收跑在 `laitela` 阶段实测到 `noAction=null` + `blockers=[]`
 * 与「3 条动作全是 delegated」不自洽，无论这个不自洽来自哪一层，**长时间静默
 * 都不允许发生**，所以宁可再从外面兜一次。
 */
function stuckNoAction(skipped, decision, stalledMs) {
  const owned = skipped.cooling.length + skipped.waiting.length + skipped.done.length;
  const waiting = skipped.waiting.map(({ spec }) => `${spec.label}←${spec.source}`);
  const delegated = skipped.delegated.map(({ spec }) => `${spec.label}（${spec.why ?? "归阶段模块"}）`);
  const unsupported = skipped.unsupported.map(({ spec }) => `${spec.label}（${spec.why ?? "原版无入口"}）`);
  const sources = [...new Set(skipped.waiting.map(({ spec }) => spec.source))];
  const idleText = sources.length
    ? sources.map(src => `${src}(idle=${STATE.idle[src] ?? 0}/${IDLE_FRAMES_BEFORE_ACT})`).join(" ")
    : "";
  const parts = [
    waiting.length ? `等所属模块让出这一帧：${waiting.join("；")}` : "",
    // 一条可代劳项都没有时，必须点名「在等哪个模块」，否则面板等于没说
    owned === 0 && delegated.length ? `本阶段动作全部归阶段模块：${delegated.join("；")}` : "",
    unsupported.length ? `原版无入口：${unsupported.join("；")}` : "",
    idleText ? `相关 source 的连续无动作帧数：${idleText}（要满 ${IDLE_FRAMES_BEFORE_ACT} 帧才轮到执行层）` : "",
  ].filter(Boolean);
  return {
    at: Date.now(),
    stage: decision?.stage?.id ?? null,
    goal: decision?.goal?.id ?? null,
    title:
      `执行层已 ${Math.round(stalledMs / 1000)} 秒发不出任何动作`
      + `（owned=${owned} delegated=${delegated.length} unsupported=${unsupported.length}）`,
    advice: parts.join("。"),
    detail:
      `stalled=${Math.round(stalledMs / 1000)}s owned=${owned} `
      + `waiting=${skipped.waiting.length} delegated=${delegated.length} unsupported=${unsupported.length}`,
    stalled: true,
  };
}

function describeNoAction(skipped, decision, stalledMs = 0) {
  const delegated = skipped.delegated.map(({ spec }) => `${spec.label}${spec.why ? `（${spec.why}）` : ""}`);
  const unsupported = skipped.unsupported.map(({ spec }) => `${spec.label}（${spec.why ?? "原版无入口"}）`);
  const cooling = skipped.cooling.map(
    ({ spec, remainMs }) => `${spec.label} 退避 ${Math.ceil(remainMs / 100) / 10}s`
  );
  const done = skipped.done.map(({ spec, why }) => `${spec.label}（${why}）`);
  const ownedCount = skipped.cooling.length + skipped.waiting.length + skipped.done.length;
  const total = ownedCount + delegated.length + unsupported.length + skipped.unknown.length;

  // 健康等待：**全部**可代劳动作都只是「source 还没闲够 3 帧」。
  // `ownedCount === 0` 不算健康 —— 那是「本阶段执行层根本没有可代劳项」，
  // 正是验收里 120 秒静默的那种状态，必须报出来。
  if (ownedCount > 0 && cooling.length === 0 && skipped.waiting.length === ownedCount) {
    // [Oreki R45·4] 但「等让帧」只在**短时间**内是健康的。连续 60 s 还是同一批动作在等
    // 同一批 source，说明那个 source 长期自称有动作而目标一动不动 —— 这不是设计，
    // 是活性坏了。此前这里一律 `return null`，于是 `blockers` 空了 16 分钟没人知道。
    if (stalledMs < STALL_REPORT_MS) return null;
    return stuckNoAction(skipped, decision, stalledMs);
  }

  let title;
  let advice;
  if (ownedCount === 0) {
    title = total === 0
      ? `本阶段策略里没有登记任何动作（stage=${decision?.stage?.id ?? "?"}）`
      : `本阶段 ${total} 个动作全部归阶段模块，执行层无可代劳项`;
    advice = [delegated.length ? `等所属模块推进：${delegated.join("；")}` : "",
      unsupported.length ? `原版无入口：${unsupported.join("；")}` : "",
      skipped.unknown.length ? `spec 里有本层未登记的动作：${skipped.unknown.join("、")}` : ""]
      .filter(Boolean).join("。");
  } else if (cooling.length > 0) {
    title = `可代劳动作都在退避中（${cooling.length}/${ownedCount} 条，最近一次买了 0 个）`;
    advice = [
      cooling.join("；"),
      STATE.lastNoopReason ? `最近原因：${STATE.lastNoopReason}` : "模块没有给出原因",
      done.length ? `已完成：${done.join("；")}` : "",
    ].filter(Boolean).join("。");
  } else {
    title = `本阶段动作全部不可执行（${done.length} 条已完成，其余 ${delegated.length + unsupported.length} 条归阶段模块）`;
    advice = [done.join("；"), delegated.join("；"), unsupported.join("；")].filter(Boolean).join("。");
  }
  return {
    at: Date.now(),
    stage: decision?.stage?.id ?? null,
    goal: decision?.goal?.id ?? null,
    title,
    advice,
    detail: `owned=${ownedCount} delegated=${delegated.length} unsupported=${unsupported.length} cooling=${cooling.length} waiting=${skipped.waiting.length}`,
  };
}

/**
 * [Oreki R45] 把「连续没买到」变成**可解释的阻塞**，追加在 spec 声明的 blockers 之后。
 *
 * 与 spec blockers 的区别写在字段里：`kind: "runtime"`。
 * spec 的 `conventions.blockerDetection` 要求声明式 blockers「能由叶子机器判定」——
 * 那是给解释器的；这里是**运行时事实**（这一帧真的调了、真的买了 0 个），
 * 不可能用叶子表达，所以单独标 kind，不混进 `decision.blockers`。
 */
function runtimeBlockers(decision) {
  const out = [];
  const la = STATE.lastAction;
  const na = STATE.noAction;
  // 策略判定失败时，下面两条都不会有内容（本帧根本没走到挑动作那一步），
  // 于是又会静默成 blockers=[]。这里先把它说清楚。
  if (decision && decision.ok !== true) {
    out.push({
      id: "decisionFailed",
      kind: "runtime",
      stage: decision.stage?.id ?? null,
      goalId: decision.goal?.id ?? null,
      title: "策略判定失败，本帧没有可用决策",
      advice: decision.error
        ? `解释器报错：${decision.error}`
        : `解释器返回 ok=${String(decision.ok)}${decision.reason ? `（${decision.reason}）` : ""}`,
      detail: decision.reason ?? "",
    });
    return out;
  }
  // 「根本没调」优先于「调了但买了 0 个」：阶段刚切换时 lastAction 已被清空，
  // 此时唯一能解释当前状态的就是 noAction。
  if (na && (!la || na.at >= la.at)) {
    out.push({
      id: `noActionAvailable:${na.stage ?? "?"}`,
      kind: "runtime",
      stage: na.stage,
      goalId: na.goal,
      title: na.title,
      advice: na.advice,
      detail: na.detail,
      goalDone: decision?.goal?.done === true,
    });
    return out;
  }
  if (!la) return out;
  const streak = STATE.noopStreak[la.verb] ?? 0;
  // 只失败一次不算阻塞（可能是本帧刚被别的模块花掉了钱）；连续 2 次才报。
  if (la.acted || streak < 2) return out;
  const goalDone = decision?.goal?.done === true;
  const reason = STATE.lastNoopReason || "模块没有给出原因";
  out.push({
    id: `noAction:${la.verb}`,
    kind: "runtime",
    verb: la.verb,
    source: la.source,
    title: goalDone
      ? `目标「${decision.goal.title}」已完成，但「${la.label}」还在被调用且买不到`
      : `「${la.label}」连续 ${streak} 次调用都没买到`,
    advice: `${reason}（模块返回：${la.detail}）`,
    detail: la.detail,
    goalDone,
  });
  return out;
}

/** 「已完成 / 不必再调」的说明，与 blockers 分开显示（`advisories`）。 */
function doneAdvisories() {
  return Object.entries(STATE.doneActions).map(([verbId, info]) => ({
    id: `actionDone:${verbId}`,
    kind: "advisory",
    verb: verbId,
    title: `「${info.label}」已完成，本层不再重复发起`,
    advice: info.why,
  }));
}

/**
 * 装点击监听：玩家一点、当前 goal 就静默 60 s。
 * 只监 `#ui`，且排除设置面板（`.l-options-grid`）与教程覆盖层（`.c-oreki-tutorial`）——
 * 那两处的点击不是「我在玩游戏」，不该触发让路。
 */
function installManualWatch() {
  if (STATE.watchInstalled) return;
  if (typeof document === "undefined" || !document.addEventListener) return;
  const onPointer = event => {
    try {
      const target = event.target;
      if (!target || typeof target.closest !== "function") return;
      if (!target.closest("#ui")) return;
      if (target.closest(".l-options-grid") || target.closest(".c-oreki-tutorial")) return;
      STATE.manualClickAt = Date.now();
      STATE.manualClickCount++;
      const goalId = STATE.lastDecision?.goal?.id;
      if (goalId) OrekiSmartStrategy.noteManualAction(goalId);
    } catch (e) {
      // 监听器里的异常绝不能影响主循环
    }
  };
  document.addEventListener("click", onPointer, true);
  document.addEventListener("pointerdown", onPointer, true);
  STATE.watchInstalled = true;
}

/**
 * 挑一个可执行的 verb：按 priority 顺序取第一个 owned、source 就绪、且不在冷却里的。
 * 顺便把**没被挑中的每一条**为什么没被挑中分类带出去（`skipped`），
 * 供 `describeNoAction()` 与 `doneAdvisories()` 使用 —— 这样「一条都没挑到」时
 * 不需要再遍历一次 priority，也不会出现两处逻辑不同步。
 */
function pickExecutable(priority, now) {
  const skipped = { delegated: [], unsupported: [], unknown: [], done: [], cooling: [], waiting: [] };
  STATE.doneActions = Object.create(null);
  for (const verbId of priority) {
    const spec = VERBS[verbId];
    if (!spec) { skipped.unknown.push(verbId); continue; }
    if (spec.policy === "delegated") { skipped.delegated.push({ verbId, spec }); continue; }
    if (spec.policy === "unsupported") { skipped.unsupported.push({ verbId, spec }); continue; }
    if (spec.policy !== "owned") { skipped.unknown.push(verbId); continue; }
    const doneWhy = verbDoneReason(verbId, spec);
    if (doneWhy) {
      STATE.doneActions[verbId] = { label: spec.label, why: doneWhy };
      skipped.done.push({ verbId, spec, why: doneWhy });
      continue;
    }
    if ((STATE.noopUntil[verbId] ?? 0) > now) {
      skipped.cooling.push({ verbId, spec, remainMs: (STATE.noopUntil[verbId] ?? 0) - now });
      continue;
    }
    if (!sourceReady(spec.source, now)) { skipped.waiting.push({ verbId, spec }); continue; }
    return { verbId, spec, skipped };
  }
  return { verbId: null, spec: null, skipped };
}

/** priority 里第一个还没法执行的动作（面板「下一步」用；只说名字不做承诺）。 */
function pickNext(priority) {
  for (const verbId of priority) {
    const spec = VERBS[verbId];
    if (!spec) return { verbId, label: verbId, policy: "unknown", why: "spec 里的动作本层未登记" };
    // 已完成的不算「下一步」：它不会再被本层发起。
    if (STATE.doneActions[verbId]) continue;
    if (spec.policy === "owned") return { verbId, label: spec.label, policy: "owned" };
  }
  const first = priority.map(id => VERBS[id]).find(Boolean);
  return first
    ? { verbId: priority[0], label: first.label, policy: first.policy, why: first.why ?? "" }
    : null;
}

/**
 * [R78] 单调时钟：间隔判定必须用 `performance.now()`，不能用 `Date.now()`。
 *
 * 为什么：`Date.now()` 受系统时间调整影响（NTP 校时、用户改时区/时间），
 * 一次回拨就能让「距上次动作」变成负数或突增，间隔判定随之失真。
 * `performance.now()` 是自页面加载起的单调毫秒数，永不回退。
 *
 * 极老浏览器无 performance 时退回 Date.now()（可接受：那种环境连
 * 好一点的定时器都没有，此处不是瓶颈）。
 */
function nowMs() {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
  } catch (_e) {
    /* fall through */
  }
  return Date.now();
}

/**
 * [R78] 某个任务此刻是否已过自己的间隔闸（共用 `STATE.intervalSec`）。
 *
 * 注意：R78 起这条闸只是**第二道保险**。第一道永远是全局节拍 `beatGateFree()`，
 * 见 `runCycle`。保留它是因为：即便全局时钟因异常被清零，同一任务也不会被连点。
 */
function taskGateFree(taskId, now) {
  const last = STATE.taskLastAct[taskId] ?? 0;
  return !last || now - last >= STATE.intervalSec * 1000;
}

/**
 * [Oreki R50 web · 九修·二次] **全局**节拍闸：距离上一次「真执行」是否已够间隔。
 * 全系统只有这一个时钟（`STATE.lastBeatAt`），任何模块都不豁免。
 */
function globalGateFree(now) {
  if (!STATE.lastBeatAt) return true;
  return now - STATE.lastBeatAt >= STATE.intervalSec * 1000;
}

/**
 * [R78] 本帧是否还允许放行一个动作。
 *
 * 与 `globalGateFree` 的区别：本函数额外检查 `frameActed` ——
 * 同一帧最多一个受控动作。这是「启动瞬间多任务同时放行」的直接防线。
 */
function frameGateFree() {
  return !STATE.frameActed;
}

/** 记录一次实际执行：推进共享节拍 + 记账。 */
function markExecuted(taskId, now) {
  const gap = STATE.lastBeatAt ? now - STATE.lastBeatAt : null;
  // [九修·四次] 同时记录「同一任务」的相邻间隔：默认档（单任务间隔）验的就是这个值，
  // 严格档再额外看全局 gapMs。混在一起会得出「958 对 < 3000 ms」的假阴性。
  const prevSame = STATE.taskLastAct[taskId] ?? 0;
  const taskGapMs = prevSame ? now - prevSame : null;
  STATE.lastBeatAt = now;
  STATE.taskLastAct[taskId] = now;
  // [R91] 记住上一拍是谁动的手，供 `runCycle` 的优先提示做「不得连续两拍」判定。
  STATE.lastBeatTask = taskId;
  // [R78] 封掉本帧名额：同一帧不再放行第二个受控动作。
  STATE.frameActed = true;
  STATE.served[taskId] = (STATE.served[taskId] ?? 0) + 1;
  STATE.execLog.push({ task: taskId, at: now, gapMs: gap, taskGapMs });
  if (STATE.execLog.length > 64) STATE.execLog.shift();
}

/**
 * 统一调度一次：把「本帧所有由 mod 主动发起的自动动作」交给同一个节拍。
 *
 * 规则（对应用户令）：
 *  1. 任意两次**实际执行**之间 ≥ `intervalSec`（`taskGateFree` + `markExecuted`，每个任务各自的闸，共用同一个 intervalSec）；
 *  2. 所有任务共用这一个节拍，且每拍最多只有一个任务能真正动手 —— 不会同一时刻一起执行；
 *  3. 优先级：先按「被服务次数」升序（公平，防饿死），同次数再按 priority 数值升序（高优先在前）；
 *  4. 关闭开关：直接返回空结果，一个任务都不跑（队列即「本帧待跑任务」，无残留）；
 *  5. 时间戳：`taskLastAct` / `execLog` 逐条记录，验证间隔用；
 *  6. 空转不无限重试：任务返回「没动作」不消耗节拍，下一拍继续按顺序试，
 *     但真正失败的那条由本文件既有的 `noopUntil` 冷却兜住（阶段模块自己的 noop 也是幂等返回）。
 *
 * @param {Array<[string, number, Function]>} tasks [taskId, priority, fn]
 * @returns {Record<string, any>} 本帧真正被执行到的任务结果（供 `tick(observed)` 使用）
 */
function runCycle(tasks) {
  const out = Object.create(null);
  if (!Array.isArray(tasks) || tasks.length === 0) return out;
  // 4) 关闭：立即停，且不留待执行队列
  if (!STATE.enabled) return out;
  // [R78] 开帧：清掉「本帧已有一个真动作」的名额。
  // 必须放在 enabled 检查之后 —— 关闭时不该留下任何待执行状态。
  STATE.frameActed = false;
  const now = nowMs();

  // ── [Oreki R50 web · 九修·二次] 全局串行 + no-op 不占节拍（主 Agent 2026-11-01 裁决）──
  //
  // 用户执行令第 1 条：任意两次**实际执行**之间必须满足用户配置的间隔；
  // 第 2 条：不同模块共用同一调度规则，不能各自独立计时后同时执行。
  //
  // 上一版为了不掉速，把 `routine/early/eternity/eternityReset` 列为 critical 类
  // **不受间隔限制**。主 Agent 判定这是真偏离（4 个模块独立于用户配置在跑），已删除。
  //
  // 正确语义（本函数现在的行为）：
  //   · 全局节拍：`STATE.lastExecAt` 是全系统**唯一**的时钟，命中后整帧不再放行任何动作；
  //   · 只有 `didAct(result) === true`（真的改变了游戏状态）才推进节拍；
  //   · **no-op 不占节拍**：没买到 / 条件不满足 / 无变化的候选立即把机会让给下一个候选，
  //     同一帧可以连续跳过任意多个 no-op，直到找到第一个真执行或全部跳过；
  //   · 顺序 = 优先级（`game.js` 里传入的数字，越小越先），**不再按"被服务次数"轮转** ——
  //     上一版轮转把 `celestial` 排到 `routine` 前面，导致反物质维度每 6 秒才买一次而停摆
  //     （`_r50/r50-sched1.out`：120 s 仍在 preInfinity）。
  //   · 无豁免：没有任何任务能绕过 intervalSec。
  //
  // 与用户令第 6 条一致：空转本来就不该被算成一次"执行"，它只影响该任务自己的 noop 冷却
  // （`noopUntil` / `noopStreak`，由执行层 verb 使用；阶段模块自身是幂等返回）。
  // 排序在下方统一进行（[R82] 需要叠加阶段优先提示，见 `priorityHint`）。

  // ── [R78] 统一全局节拍：所有任务同一队列，无任何旁路 ──────────────────────
  //
  // 用户令（2026-11-04）：自动操作采用全局统一节拍，不能让每个自动购买器
  // 各自计时；任意两次真执行之间 ≥ 设定间隔；同一时间最多一个受控操作。
  //
  // 与 R50「九修」的差别（这是一次**语义收紧**，不是回退）：
  //   · 删除了 `cls === "cont"` 的连续型豁免。那 4 条（routine/early/eternity/
  //     eternityReset）原本在闸门之前直接执行，既不过间隔也不占名额 ——
  //     这正是「多任务同帧连买」的机制来源之一。
  //   · 默认档不再只靠单任务计时：第一道闸恒为全局 `lastBeatAt`。
  //   · 新增 `frameActed`：同一帧最多一个真执行。
  //
  // 历史教训与本次取舍：
  //   R50 实测「3 秒间隔让新档 146 秒仍 preInfinity」，当时的结论是「连续购买
  //   路径不能限流」。但那次的问题是**把原版自动购买器等价物塞进了 1~60 秒限流**；
  //   本次的做法是：**原版 tick 与原版自带自动购买器完全不经过本函数**，
  //   本函数只管辖 Oreki 主动发起的策略动作。用户把间隔设成 1 秒时，
  //   每分钟最多 60 个策略动作 —— 对通关速度的影响远小于「同帧 8 连买」的失控。
  //
  // 关闭语义：`STATE.enabled === false` 已在函数开头直接返回，队列里不会残留任务。
  //
  // [R82] 阶段优先提示：`priorityHint` 让调用方在当前阶段把某个任务临时提到最前。
  // 历史教训是「纯轮询会拖慢前期」（见上），所以这里**不恢复轮询**：只在
  // 「首次永恒前 ID1 收购窗口」等明确阶段提升单条任务的尝试顺序，窗口一结束即回落。
  // 它只决定「先问谁」，不放宽任何闸门：被拒绝的任务照旧让位给下一个候选，
  // 仍满足「同帧最多一个真动作」与「两次真执行 ≥ 设定间隔」。
  const hint = typeof STATE.priorityHint === "string" ? STATE.priorityHint : "";
  // [R91] 被提示的任务不得**连续两拍**优先：它上一拍已经动过手就退回原 priority，
  // 让其它任务（典型是 `routine`）拿到这一拍，避免提示变成独占。见 `STATE.lastBeatTask`。
  const priorityOf = task => (hint && task.id === hint && STATE.lastBeatTask !== hint
    ? Number.NEGATIVE_INFINITY
    : task.priority);
  const ordered = tasks
    .map(t => ({ id: t[0], priority: Number(t[1]) || 0, fn: t[2], cls: t[3] || "" }))
    .filter(t => typeof t.fn === "function")
    .sort((a, b) => priorityOf(a) - priorityOf(b));

  for (const task of ordered) {
    // 第一道：本帧名额（同帧最多 1 个真动作）
    if (!frameGateFree()) break;

    // 第二道：全局节拍（与档位无关，所有任务一律受约束）
    const gateNow = nowMs();
    if (!globalGateFree(gateNow)) break;

    // 第三道：默认档的单任务二次闸（严格档的全局闸已蕴含）
    if (!STATE.strictGlobal && !taskGateFree(task.id, gateNow)) continue;

    let result;
    try {
      result = task.fn();
    } catch (e) {
      STATE.lastError = `runCycle ${task.id}: ${(e && e.message) || e}`;
      continue;
    }
    out[task.id] = result;
    if (didAct(result)) {
      markExecuted(task.id, nowMs());
      break;              // 真执行 ⇒ 吃掉这一拍（markExecuted 已置 frameActed）
    }
    // no-op ⇒ 不推进节拍，继续试下一个候选
    STATE.noopSkips = (STATE.noopSkips ?? 0) + 1;
  }
  return out;
}

/**
 * 主入口。在 `game.js` 的所有阶段模块之后调用一次。
 * @param {Record<string, any>} observed source → 该模块本帧 tick() 的返回值
 * @returns {object|null} 本帧决策（只读快照）
 *
 * [Oreki R45] 本函数是**主循环里唯一没有上层 try/catch 的调用点**
 * （`game.js` 的 gameLoop 直接调它），所以这里必须自己兜底：
 * 任何意外异常都只记进 `lastError`（面板「⑥ 阻塞」/降级提示会显示），
 * 返回 null，绝不让异常穿到 gameLoop 触发全局崩溃弹窗。
 */
function tick(observed) {
  try {
    return tickUnsafe(observed);
  } catch (e) {
    STATE.lastError = `tick: ${(e && e.message) || e}`;
    return null;
  }
}

function tickUnsafe(observed) {
  try {
    if (observed && typeof observed === "object") {
      for (const [source, result] of Object.entries(observed)) observe(source, result);
    }
  } catch (e) {
    STATE.lastError = `observe: ${(e && e.message) || e}`;
  }

  if (!STATE.enabled) return null;
  if (typeof player === "undefined" || !player?.auto?.autobuyersOn) return null;

  installManualWatch();

  const decision = OrekiSmartStrategy.evaluate();
  STATE.lastDecision = decision;
  if (!decision || decision.ok !== true) {
    // [Oreki R67] 只统计「真的因为降级而停手」的帧：启动瞬间还没决策时不算。
    if (decision && decision.degraded === true) STATE.degradedStops += 1;
    return decision ?? null;
  }

  // 阶段/策略切换留痕（面板「最近切换」）
  const now = Date.now();
  const signature = `${decision.stage?.id ?? "?"}/${decision.strategy?.id ?? "?"}`;
  if (!STATE.lastSwitch) STATE.lastSwitch = { at: now, from: null, to: signature, kind: "init" };
  else if (STATE.lastSwitch.to !== signature) {
    STATE.lastSwitch = { at: now, from: STATE.lastSwitch.to, to: signature, kind: "switch" };
    // 阶段/策略一换，旧动作的「连续没买到」就不再是当前阻塞了：
    // 不清掉会让面板一直挂着上一个阶段的原因（详见 runtimeBlockers）。
    STATE.noopStreak = Object.create(null);
    STATE.lastNoopReason = "";
    // [Oreki R45] 旧动作必须一起清掉：验收实测 `celestialsEnslaved` 阶段连续 120 秒
    // 展示的仍是上一阶段 `realityTree` 的 `runReality`（`action.stage` 对不上当前 stage），
    // 面板于是看起来「在忙」而其实一条新动作都没发。
    STATE.lastAction = null;
    STATE.noAction = null;
  }

  // 手动优先：本 goal 处于保护窗口 → 一个动作都不发
  if (decision.manualHold && decision.manualHold.untilMs > now) {
    // 让路是玩家主动造成的，不能算「执行层卡住」，所以把停滞计时一直推到当前。
    STATE.noActionSince = now;
    return { ...decision, executor: { acted: false, reason: "manual-hold" } };
  }

  const priority = decision.strategy?.priority ?? [];
  // [Oreki R50 web · 九修] 执行层自己也是一个受间隔约束的任务（与阶段模块同一个 intervalSec、
  // 同一个记录表 taskLastAct），语义与 runCycle 一致：本层两次实际执行之间 ≥ 间隔。
  // 放在策略求值之后，是为了让面板的「①~⑦」在等待期间仍然刷新（只读，不违反用户令）。
  // R88：调度判定只使用单调时钟；Date.now() 仍仅服务手动保护、面板与冷却等纪元时间语义。
  // executor 与阶段队列必须经过同一组 frame/global gate，不能在 runCycle 已动作后同帧再补一手。
  const scheduleNow = nowMs();
  const execLast = STATE.taskLastAct.executor ?? 0;
  const frameBlocked = !frameGateFree();
  const globalBlocked = !globalGateFree(scheduleNow);
  const taskBlocked = !STATE.strictGlobal && !taskGateFree("executor", scheduleNow);
  if (frameBlocked || globalBlocked || taskBlocked) {
    const globalWaitMs = STATE.lastBeatAt
      ? STATE.intervalSec * 1000 - (scheduleNow - STATE.lastBeatAt)
      : 0;
    const taskWaitMs = execLast
      ? STATE.intervalSec * 1000 - (scheduleNow - execLast)
      : 0;
    STATE.beatSkips++;
    return {
      ...decision,
      executor: {
        acted: false,
        reason: "interval-wait",
        waitMs: Math.max(0, globalWaitMs, STATE.strictGlobal ? 0 : taskWaitMs),
      },
    };
  }
  const picked = pickExecutable(priority, now);
  if (!picked.spec) {
    // [Oreki R45·4] 停滞计时：只在**真的发出动作**时归零，阶段切换不清零。
    // 阶段抖动是已知现象（见 §R45 阶段翻面），如果这里跟着清，抖动就能把
    // 「连续 16 分钟零动作」洗成「每帧都刚卡住」，又变回静默。
    if (!STATE.noActionSince) STATE.noActionSince = now;
    const stalledMs = now - STATE.noActionSince;
    const next = pickNext(priority);
    // null = 只是在等模块让出这一帧（健康）；非 null = 真的无事可做 / 刚试过买不到 / 已经卡太久。
    let na = describeNoAction(picked.skipped, decision, stalledMs);
    // 兜底：不管上面因为哪个分支返回了 null，只要「挑不出动作」已超过阈值就必须说出来。
    // 这一条是结构性的，不依赖 describeNoAction 的内部分支是否判断正确。
    if (!na && stalledMs >= STALL_REPORT_MS) na = stuckNoAction(picked.skipped, decision, stalledMs);
    STATE.noAction = na;
    return {
      ...decision,
      executor: {
        acted: false,
        reason: "no-owned-verb-ready",
        next: next ? `${next.label}${next.policy === "owned" ? "" : `（${next.policy}）`}` : null,
        blocked: STATE.noAction?.title ?? null,
      },
    };
  }
  const pick = picked;
  STATE.noAction = null;
  // 这一帧真的发出动作了 ⇒ 停滞计时归零（下一段「发不出去」从这一刻重新算）
  STATE.noActionSince = 0;
  STATE.lastExecAt = now;

  const outcome = invoke(pick.verbId, pick.spec);
  STATE.takeovers++;
  // 「同帧不抢」的实测判据：接管这一刻，这一帧该 source 的摘要必须为空。
  // 结构上它不可能非空（摘要非空 ⇒ observe 已把 idle 清零 ⇒ sourceReady 不成立），
  // 但这里**真的查一遍**并把违例计数记下来 —— 结构推理出错时，这个数会变成非 0。
  const sameFrame = observed?.[pick.spec.source];
  if (sameFrame !== undefined && didAct(sameFrame)) {
    STATE.takeoverWhileModuleActed++;
    STATE.lastConflict = { at: Date.now(), verb: pick.verbId, source: pick.spec.source, summary: summarize(sameFrame) };
  }
  // actionCount 只算**真的买到了**；空转尝试记在 attemptCount。两者分开，
  // 否则面板上的「执行次数」会把每 250 ms 一次的空调用也算成动作，看着像在干活其实没有。
  if (outcome.acted) {
    // R88：空转只算尝试，不得占用共享节拍、任务间隔或本帧唯一动作名额。
    markExecuted("executor", nowMs());
    STATE.actionCount++;
  }
  // 没买到就压 2 秒，把机会让给 priority 里后面的 verb（见 NOOP_COOLDOWN_MS 注释）
  if (outcome.acted) {
    delete STATE.noopUntil[pick.verbId];
    STATE.noopStreak[pick.verbId] = 0;
    STATE.lastNoopReason = "";
  } else {
    STATE.noopUntil[pick.verbId] = Date.now() + NOOP_COOLDOWN_MS;
    // [Oreki R45] 空转必须留下**原因**：连续次数 + 模块自述。见 `runtimeBlockers()`。
    STATE.noopStreak[pick.verbId] = (STATE.noopStreak[pick.verbId] ?? 0) + 1;
    STATE.lastNoopAt = Date.now();
    STATE.lastNoopReason = explainNoop(pick.verbId, pick.spec);
  }
  STATE.lastAction = {
    at: Date.now(),
    verb: pick.verbId,
    label: pick.spec.label,
    source: pick.spec.source,
    acted: outcome.acted,
    detail: outcome.detail,
    stage: decision.stage?.id ?? null,
  };
  return { ...decision, executor: { acted: outcome.acted, verb: pick.verbId, detail: outcome.detail } };
}

/**
 * [R82] 设置本拍的阶段优先任务。
 *
 * 只影响「先问谁」，不改变任何闸门语义：传空串即恢复默认优先级顺序。
 * 关闭自动化时由 `setEnabled(false)` 清空，避免重开后继承旧窗口。
 */
function setPriorityHint(taskId) {
  STATE.priorityHint = typeof taskId === "string" ? taskId : "";
}

function setEnabled(value) {  STATE.enabled = Boolean(value);
  // [九修·六次] 关闭即清场 —— 但**绝不能清时间戳**。
  //
  // 清 `lastBeatAt` 会开出一条绕过间隔的口子：关一下再开，节拍被重置为 0，
  // 下一次调度立刻放行，等于「想跳过 3 秒间隔，拨一下开关就行」。
  // 这与用户令「任意两次实际执行之间必须满足间隔」直接冲突，
  // 也属于执行令禁止的「为缩短通关时间绕过用户配置的操作间隔」。
  //
  // 保留时间戳才是正确语义：关一小时再开，`now - lastBeatAt` 早已远超间隔，
  // 第一次执行本来就该立刻放行 —— 那是**真的满足间隔**，不是漏洞。
  // 清掉的只有「待执行状态」：冷却 / 每任务失败计数 / 公平轮转计数 / 阶段名额。
  // （Android 侧 `OrekiAutomationScheduler` 同语义：只清 failUntil/streak/帧名额，时间戳全保留。）
  if (!STATE.enabled) {
    STATE.noopUntil = Object.create(null);
    STATE.noopStreak = Object.create(null);
    STATE.served = Object.create(null);
    STATE.lastNoopReason = "";
    // [R82] 关闭即清掉阶段优先提示：重新开启后不得带着旧窗口的插队状态恢复。
    STATE.priorityHint = "";
    // R85：智能开关与原版总开关都必须释放临时接管。只清调度队列不会
    // 恢复 IU15 对购买入口的封锁；同步释放且不改用户节拍时间戳。
    globalThis.OrekiIu15Sprint?.releaseIfTakenOver?.();
    // ⚠️ 刻意不清：STATE.lastBeatAt / STATE.taskLastAct（间隔判定的唯一依据）
  }
  writeStoredAutomation(STATE.enabled, STATE.intervalSec, STATE.strictGlobal);
  return STATE.enabled;
}

/**
 * 设置调度间隔（秒）。边界钳制 1~60；**立即生效**（不做延迟应用）：
 * 下一次 `taskGateFree()` 读的就是新值，不需要等旧节拍走完。
 */
function setIntervalSec(value) {
  const next = clampIntervalSec(value);
  const clamped = Number(value) !== next;
  STATE.intervalSec = next;
  writeStoredAutomation(STATE.enabled, next, STATE.strictGlobal);
  return { intervalSec: next, clamped };
}

/**
 * [九修·三次] 严格模式开关。默认关闭（单任务间隔）。
 * 打开后全系统任意两次自动操作之间都至少间隔 intervalSec —— 这会让游戏推进显著变慢，
 * 是给"我要绝对串行"的用户准备的，不作为默认值。
 */
function setStrictGlobal(value) {
  STATE.strictGlobal = Boolean(value);
  writeStoredAutomation(STATE.enabled, STATE.intervalSec, STATE.strictGlobal);
  return STATE.strictGlobal;
}

function noteManual(goalId) {
  OrekiSmartStrategy.noteManualAction(goalId ?? STATE.lastDecision?.goal?.id ?? null);
}

/** 面板七项 + 诊断。只读，绝不在这里动手。 */
function debugState() {
  const decision = STATE.lastDecision;
  const now = Date.now();
  // 节拍时间戳来自 performance.now()；面板的节拍倒计时必须沿用同一时钟域。
  const scheduleNow = nowMs();
  const hold = decision?.manualHold && decision.manualHold.untilMs > now
    ? { goalId: decision.manualHold.goalId, remainSec: Math.ceil((decision.manualHold.untilMs - now) / 1000) }
    : null;
  const priority = decision?.strategy?.priority ?? [];
  const next = pickNext(priority);
  const idleSnapshot = {};
  for (const [source, frames] of Object.entries(STATE.idle)) idleSnapshot[source] = frames;
  return {
    enabled: STATE.enabled,
    // [Oreki R50 web · 九修] 调度节拍（面板与探针都读这里，不另算一遍）
    intervalSec: STATE.intervalSec,
    strictGlobal: STATE.strictGlobal,
    beat: {
      lastAt: STATE.lastBeatAt,
      nextInMs: STATE.lastBeatAt
        ? Math.max(0, STATE.intervalSec * 1000 - (scheduleNow - STATE.lastBeatAt))
        : 0,
      skips: STATE.beatSkips,
      served: { ...STATE.served },
      log: STATE.execLog.slice(-12),
    },
    // ① 阶段 ② 目标 ③ 策略
    stage: decision?.stage ?? null,
    goal: decision ? { ...decision.goal, manualHold: hold } : null,
    strategy: decision?.strategy ?? null,
    degraded: decision?.degraded === true,
    /**
     * [Oreki R67] 降级必须能自我解释。
     *
     * `tick()` 在 `decision.ok !== true` 时**一条动作都不发**（fail-closed），
     * 但面板此前只能看到一个 degraded=true，看不出「为什么不动、动了多少次」。
     * 这里把累计次数与停手原因一并暴露，避免把「策略层降级」误读成「自动化坏了」。
     */
    degradedCount: OrekiSmartStrategy.debugState?.().degradedCount ?? 0,
    degradedStops: decision?.ok === true ? 0 : STATE.degradedStops,
    error: decision?.error ?? STATE.lastError,
    // ④ 正在执行 ⑤ 下一步 ⑥ 阻塞 ⑦ 最近切换
    action: STATE.lastAction,
    next,
    // [Oreki R45] spec 声明的阻塞（叶子可求值）+ 运行时阻塞（这一帧真的买了 0 个）。
    // 后者带 `kind: "runtime"`，见 `runtimeBlockers()` —— 空转不再静默成 blockers=[]。
    blockers: [...(decision?.blockers ?? []), ...runtimeBlockers(decision)],
    /**
     * [Oreki R45] 「不用再调了」的说明（不是阻塞）：模块自述已买齐 / 已完成。
     * 与 blockers 分开，因为它们不该被当成故障计数（验收口径：阻塞 = 目标未完成却动不了）。
     */
    advisories: doneAdvisories(),
    /** 本帧「一条动作都挑不出来」的原因快照；null = 有动作或在健康等待 */
    noAction: STATE.noAction,
    lastSwitch: STATE.lastSwitch,
    // 让路状态：必须显示，不许静默
    manualHold: hold,
    manualClickCount: STATE.manualClickCount,
    // 诊断
    idle: idleSnapshot,
    lastResult: { ...STATE.lastResult },
    noopUntil: Object.fromEntries(
      Object.entries(STATE.noopUntil).map(([id, until]) => [id, Math.max(0, until - now)])
    ),
    /** verbId → 连续没买到次数（>0 且 lastAction.acted=false 时就是当前阻塞的那个动作） */
    noopStreak: { ...STATE.noopStreak },
    lastNoopReason: STATE.lastNoopReason,
    actionCount: STATE.actionCount,
    attemptCount: STATE.attemptCount,
    /**
     * [Oreki R45·4] 活性指标：距离上一次**真的发出动作**过去多少秒；
     * 以及当前这一轮「发不出动作」已经持续多少秒（0 = 本帧正常）。
     * 验收里最能说明问题的两个数，过去只能靠 `attemptCount` 冻结去反推。
     */
    lastExecAgoSec: STATE.lastExecAt ? Math.round((now - STATE.lastExecAt) / 1000) : null,
    stalledSec: STATE.noActionSince ? Math.round((now - STATE.noActionSince) / 1000) : 0,
    stallThresholdSec: Math.round(STALL_REPORT_MS / 1000),
    takeovers: STATE.takeovers,
    takeoverWhileModuleActed: STATE.takeoverWhileModuleActed,
    lastConflict: STATE.lastConflict,
    threshold: IDLE_FRAMES_BEFORE_ACT,
    registered: [...REGISTRY.keys()],
    /**
     * [R97 P0] 永恒层阶段门禁当前值（只读，供面板/探针核对）。
     * 写面板时不要把 false 解释成「卡住」：未 Break 时它本来就该是 false。
     */
    eternityStageAllowed: eternityStageAllowed(),
  };
}

export const OrekiSmartExecutor = {
  tick,
  observe,
  register,
  setEnabled,
  setPriorityHint,
  setIntervalSec,
  setStrictGlobal,
  noteManual,
  debugState,
  /** [Oreki R50 web · 九修] 统一调度入口：阶段模块的动作排同一条队 */
  runCycle,
  /**
   * [R97 P0] 阶段门禁判据（唯一实现）。`game.js` 的任务队列与 `invoke()` 兜底路径
   * 共用它，避免两处各写一份 `player.break` 判断而漂移。
   */
  eternityStageAllowed,
  get enabled() {
    return STATE.enabled;
  },
  get intervalSec() {
    return STATE.intervalSec;
  },
  get strictGlobal() {
    return STATE.strictGlobal;
  },
};

try {
  globalThis.OrekiSmartExecutor = OrekiSmartExecutor;
} catch (e) {
  // 非浏览器环境忽略
}
