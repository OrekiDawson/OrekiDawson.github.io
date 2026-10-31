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
  // 原版没有「买永恒升级」这个动作：EternityUpgrade 不存在，里程碑自动生效。
  buyEternityUpgrade: { policy: "unsupported", label: "买永恒升级", why: "原版不存在永恒升级商店，里程碑自动生效" },
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
  enabled: true,
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

/** 执行一个 verb。返回 {acted, detail}。只走已注册的阶段模块 / 例程。 */
function invoke(verbId, spec) {
  const now = Date.now();
  try {
    const target = REGISTRY.get(spec.source);
    if (target === undefined) return { acted: false, detail: "未注册" };
    STATE.attemptCount++;
    STATE.lastActionBySource[spec.source] = now;
    if (typeof target === "function") {
      const out = target();
      return { acted: didAct(out), detail: `例程→${out === true ? "已执行" : summarize(out) || String(out)}` };
    }
    const method = target[spec.method];
    if (typeof method !== "function") return { acted: false, detail: "方法不存在" };
    const out = method.call(target);
    return { acted: didAct(out), detail: `${spec.method}()→${summarize(out) || String(out)}` };
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
function describeNoAction(skipped, decision) {
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
  if (ownedCount > 0 && cooling.length === 0 && skipped.waiting.length === ownedCount) return null;

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
  if (!decision || decision.ok !== true) return decision ?? null;

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
    return { ...decision, executor: { acted: false, reason: "manual-hold" } };
  }

  const priority = decision.strategy?.priority ?? [];
  const picked = pickExecutable(priority, now);
  if (!picked.spec) {
    const next = pickNext(priority);
    // null = 只是在等模块让出这一帧（健康）；非 null = 真的无事可做 / 刚试过买不到。
    STATE.noAction = describeNoAction(picked.skipped, decision);
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
  if (outcome.acted) STATE.actionCount++;
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

function setEnabled(value) {
  STATE.enabled = Boolean(value);
  return STATE.enabled;
}

function noteManual(goalId) {
  OrekiSmartStrategy.noteManualAction(goalId ?? STATE.lastDecision?.goal?.id ?? null);
}

/** 面板七项 + 诊断。只读，绝不在这里动手。 */
function debugState() {
  const decision = STATE.lastDecision;
  const now = Date.now();
  const hold = decision?.manualHold && decision.manualHold.untilMs > now
    ? { goalId: decision.manualHold.goalId, remainSec: Math.ceil((decision.manualHold.untilMs - now) / 1000) }
    : null;
  const priority = decision?.strategy?.priority ?? [];
  const next = pickNext(priority);
  const idleSnapshot = {};
  for (const [source, frames] of Object.entries(STATE.idle)) idleSnapshot[source] = frames;
  return {
    enabled: STATE.enabled,
    // ① 阶段 ② 目标 ③ 策略
    stage: decision?.stage ?? null,
    goal: decision ? { ...decision.goal, manualHold: hold } : null,
    strategy: decision?.strategy ?? null,
    degraded: decision?.degraded === true,
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
    takeovers: STATE.takeovers,
    takeoverWhileModuleActed: STATE.takeoverWhileModuleActed,
    lastConflict: STATE.lastConflict,
    threshold: IDLE_FRAMES_BEFORE_ACT,
    registered: [...REGISTRY.keys()],
  };
}

export const OrekiSmartExecutor = {
  tick,
  observe,
  register,
  setEnabled,
  noteManual,
  debugState,
  get enabled() {
    return STATE.enabled;
  },
};

try {
  globalThis.OrekiSmartExecutor = OrekiSmartExecutor;
} catch (e) {
  // 非浏览器环境忽略
}
