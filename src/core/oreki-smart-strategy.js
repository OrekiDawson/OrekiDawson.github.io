// [Oreki R40-S1] 智能自动购买器 —— 策略解释器（只读、无副作用）
//
// ── 这个文件是什么、不是什么 ────────────────────────────────────────────
// 是：把 `src/core/oreki-smart-strategy.json`（唯一策略源，与 Android 共读）翻译成
//     「当前阶段 / 当前目标 / 当前策略 / 优先级动作列表 / 阻碍项」的一个**决策对象**。
// 不是：不买任何东西、不点任何按钮、不写任何 player 字段、不改自动购买器开关。
//     执行层（`oreki-smart-executor.js`）才允许调购买 API —— 这是 team-lead 定的
//     「路由层与执行层严格分离」，本文件连「买」这个动词的英文 API 名都不出现
//     （验收命令 `rg -c` 对购买动词计数必须恒为 0）。
//
// ── 为什么策略必须是数据 ────────────────────────────────────────────────
// spec 的 `note` 写死了：Web 与 Android 共读同一份 JSON，规则是数据不是代码。
// 所以本文件里**不允许出现任何阶段名、目标名、动作名的硬编码字符串**，
// 全部从 spec 里读；新增阶段只改 JSON。本文件只负责「怎么求值」。
//
// ── 无打包器，所以读的是 .gen.js ────────────────────────────────────────
// 本项目没有打包器，`import ... with { type: "json" }` 超出声明支持的浏览器范围，
// 因此 spec 由 `node scripts/gen_spec_module.mjs` 机械转成
// `oreki-smart-strategy.gen.js`（同一份数据，只是 ESM 外壳）。本文件 import 后者。
//
// ── 求值模型（对齐 spec.conventions，逐条实现）──────────────────────────
// · `evaluationPeriod`：默认 1 s 一次；`evaluate(true)` 用于「状态变化立即重算」
//   （解锁 / 进出挑战 / 阶段切换），由调用方在检测到变化时触发，本文件不自己轮询。
// · `manualOverride`：`noteManualAction(goalId)` 记一次手动操作，
//   `holdSeconds` 秒内该目标返回 `manualHold`，其他目标照常。**只按 goal 分域**，
//   不搞全局暂停 —— spec 原文「我点了就别跟我抢」。
// · `failSafe`：`evaluate()` 全程 try/catch；任一叶子抛错 ⇒ 整体停机，
//   返回上一次成功的决策并标 `degraded: true`，绝不把异常抛给主循环。
//
// ── 叶子取值（34 个，逐个对到源码）──────────────────────────────────────
// spec 的 `conditionGrammar.leaves` 只登记了名字，没写取值；取值在本文件的
// `LEAVES` 表里，一个名字一行。**新增叶子必须先改 JSON 再改这里**，
// 且 `assertSpecLeaves()` 会在首次求值时双向比对（JSON 多一个、这里多一个都会报）。
// 十几个有坑的叶子在表里单独写了注释，别当成一行直读。
//
// [Oreki R44] 从 18 个扩到 34 个，全部是**读**：没有一项写 player，没有一项调购买 API。
// 新增的 16 项分两类：
//   · 结构位（页签能不能打开）—— 直接复用原版页签自己的条件，见 tabs.js:403/436/447/457/466/475/485；
//   · 计数位（做到哪一步）—— 直接数原版数组，不另建账本。

import spec from "./oreki-smart-strategy.gen.js";
// [Oreki R42] 多路线择优的模型源（filter / 权重 / 切换阈值 / 界面查询方法）。
// 这份 JSON 从 R40 起就在仓库里，但**从来没有代码读它**（`rg -n "route-model" src/`
// 只有 `scripts/gen_spec_module.mjs:31` 的登记表一条）—— 模型写了，解释器没写。
// 本文件补的就是这个解释器，见下方「路线择优层」。
import routeModel from "./oreki-route-model.gen.js";

/**
 * 叶子 → 取值函数。全部是读取，全部幂等。
 * 返回值可以是 boolean / number / Decimal —— 比较交给 `compare()`。
 * @type {Record<string, () => any>}
 */
const LEAVES = {
  // ── 进度类：走 PlayerProgress 的三个静态判据（player-progress.js:35/43/47）
  "progress.infinityUnlocked": () => PlayerProgress.infinityUnlocked(),
  "progress.eternityUnlocked": () => PlayerProgress.eternityUnlocked(),
  "progress.realityUnlocked": () => PlayerProgress.realityUnlocked(),
  // [Oreki R44] 就是原版 `PlayerProgress.dilationUnlocked()`（player-progress.js:53-55
  // → `TimeStudy.dilation.isBought`），膨胀研究 1 的购买记录。
  // ⚠ 它**不单调**：现实重置会把 `player.dilation.studies` 清空（reality.js:669-681），
  // 所以现实之后它会重新变假，直到再买一次膨胀研究 1。这是原版语义，别拿它当「永久解锁」。
  "progress.dilationUnlocked": () => PlayerProgress.dilationUnlocked(),

  "player.break": () => player.break === true,

  // ⚠ 不是单调量：现实重置会 `Currency.infinities.reset()`（reality.js:620），
  // 所以「无限次数 ≥ 16」这种条件在现实之后会重新变假。这是原版语义，不要「修」。
  "player.infinities": () => new Decimal(player.infinities),
  "player.eternities": () => new Decimal(player.eternities),
  "player.realities": () => player.realities,

  // ── 挑战类：三个 isRunning 都是静态 getter，进挑战当帧就为真
  "challenge.normalRunning": () => NormalChallenge.isRunning,
  "challenge.infinityRunning": () => InfinityChallenge.isRunning,
  "challenge.eternityRunning": () => EternityChallenge.isRunning,

  // ── [Oreki R44] 挑战计数类：给「下一个该打哪个」用，不让 spec 写死顺序。
  // `NormalChallenges.all` / `InfinityChallenges.all` 都是 `index.compact()`（normal-challenges.js:172、
  // infinity-challenges.js:135），只含 1..12 / 1..8，不含 0 号占位，所以计数从 0 起算就是准的。
  "challenge.normalCompleted": () => NormalChallenges.all.filter(c => c.isCompleted).length,
  "challenge.infinityCompleted": () => InfinityChallenges.all.filter(c => c.isCompleted).length,
  // ⚠ 这个**不是**「打完了几个 EC」，是「所有 EC 的完成次数之和」（0..5 每项，12 项 ⇒ 上限 60）。
  // 单个 EC 的完成次数在 `EternityChallenge(n).completions`；要「全部刷满」就用 60。
  "challenge.eternityCompletions": () => EternityChallenges.completions,

  // [Oreki R44] 时间研究进度：直接数 `player.timestudy.studies`（player.js:400 的数组）的长度。
  // ⚠ 它**不是**「研究树建好了没有」的充要条件，只是「买过几棵」。用 >0 区分
  // 「刚进永恒、一棵没买」与「已经在研究树上推进」是安全的，用它当「树建完了」是错的。
  "timeStudy.studiesBought": () => (player.timestudy?.studies?.length ?? 0),

  // ── [Oreki R44] 现实层计数
  // ⚠ 只数**一次性**现实升级（id >= 6）：id 1..5 是 `RebuyableRealityUpgradeState`（现实机器可重复买，
  // reality-upgrades.js:206-210），它们没有 `isBought` 只有 `boughtAmount`。用 `isUnlocked === true`
  // 而不是 `isBought`：`RealityUpgradeState extends BitPurchasableMechanicState`，位图类的 getter 叫
  // `isUnlocked`（game-mechanics/bit-upgrade-state.js:18），没有 `isBought`。
  // 一次性升级共 20 个（id 6..25），买满 20 ⇒ 原版 `RealityUpgrades.allBought` 为真 ⇒ 成就 147。
  "reality.upgradesBought": () => RealityUpgrades.all.filter(u => u.id >= 6 && u.isUnlocked === true).length,
  // 复兴节点：`player.reality.perks` 是 Set（player.js:513），买过的 id 集合。
  "reality.perksBought": () => (player.reality?.perks?.size ?? 0),
  // 复兴点数余额（number，currency.js:410-413）。注意它不是「攒起来的一次性资源」，
  // 每次现实都会发新的，攒着不花没有利息。
  "reality.perkPoints": () => Currency.perkPoints.value,
  // 已装备的符文数。`glyphs.active` 是定长数组、空格位是 null，所以要过滤掉空槽再数。
  "reality.glyphsEquipped": () => (player.reality?.glyphs?.active ?? []).filter(Boolean).length,
  // 自动机是否解锁：原版 getter（player.js:1001-1003），条件 = 自动机点数够 或 玩家手动 forceUnlock。
  // ⚠ 用 `=== true` 而不是直接返回：`player.reality.automator` 可能不存在（旧存档），此时 getter 会抛，
  // failSafe 会把整层降级。这里只在能读到时返回布尔，读不到时返回 false。
  "automator.unlocked": () => Player.automatorUnlocked === true,

  // 成就 147 一到手就算解锁（teresa.js:11-13），与「真的投过现实机器」不同
  "celestial.teresaUnlocked": () => Teresa.isUnlocked,

  // ── [Oreki R44] 天神解锁位：**逐字对齐原版页签条件**（secret-formula/tabs.js:436-489），
  //   因为「页签能不能打开」就是玩家认知里的「这位天神解锁了没有」。
  //   每一条都比前一条更晚，天然串成链，stage 里靠「取反下一位」保证互斥。
  "celestial.effarigUnlocked": () => TeresaUnlocks.effarig.isUnlocked,
  // 鹿颈长的「永恒阶段」完成即解锁无名氏（enslaved.js:178-180 也是同一个判据）
  "celestial.enslavedUnlocked": () => EffarigUnlock.eternity.isUnlocked,
  // 薇的页签条件是成就 151，不是「无名氏完成」——无名氏可以永远卡着，薇照样能开
  "celestial.vUnlocked": () => Achievement(151).isUnlocked,
  // ⚠ 用 `VUnlocks.raUnlock`（页签条件），**不要**用 `Ra.isUnlocked`
  //   （= `V.spaceTheorems >= 36`，那是太阳神内部游戏的解锁，比页签晚整整一段）
  "celestial.raUnlocked": () => VUnlocks.raUnlock.isUnlocked,
  // 莱特拉：`ImaginaryUpgrade(15).isBought`（laitela.js:34-36）
  "celestial.laitelaUnlocked": () => Laitela.isUnlocked,
  // 佩勒：`ImaginaryUpgrade(25).isBought`（pelle.js:120-122）。注意这是「佩勒页签能开」，
  // 不等于「已进入毁灭现实」，后者是 `pelle.doomed`。
  "celestial.pelleUnlocked": () => Pelle.isUnlocked,

  "pelle.doomed": () => Pelle.isDoomed === true,
  // [Oreki R40-S1-fix] 键名必须与 spec.conditionGrammar.leaves 逐字一致，否则
  // `assertSpecLeaves()` 抛 leaf-mismatch ⇒ 整个解释器 failSafe 降级（ok:false / degraded:true），
  // 面板会永远显示「无法判定」。2026-10-30 的 spec 更新把这一项定名为 `pelle.canArmageddon`，
  // 实现这边原来写的是 `pelle.armageddonUnlocked`，两边对不上。
  // 语义仍是「大灾变按钮可按」的唯一判据 `Pelle.canArmageddon`（pelle.js:145-147，remnantsGain ≥ 1）；
  // 刻意**不**用 `Pelle.isDoomed` 兜底：末日态但残迹收益 <1 时按钮是灰的，按了也白按。
  "pelle.canArmageddon": () => Pelle.canArmageddon === true,

  // ⚠ 读的是 `data.interval <= 100`（autobuyer.js:165-167），**不含** 
  // `BreakInfinityUpgrade.autobuyerSpeed` 的 `/2`（getter `interval` 才含）。
  // 也就是说这里答的是「间隔升级买满没有」，不是「实际间隔多少」。
  "autobuyer.bigCrunchMaxedInterval": () => Autobuyer.bigCrunch.hasMaxedInterval === true,

  // ⚠ 只在 `Pelle.isDoomed` 时才有意义（pelle.js:167-170 的 gameLoop 只在末日态加）。
  // 非毁灭态读它是 0，含义是「这个阶段还没有碎片这回事」，不是「碎片用光了」。
  "reality.shards": () => Currency.realityShards.value,

  // ⚠ 语义是「已买」，不是「已生效」：`canBeApplied` 才等于 isBought && 效果可用
  //（utils/effect.js:133）。未毁灭态两者不同，别拿它当「自动器保住了」。
  "pelle.keepAutobuyersBought": () => PelleUpgrade.keepAutobuyers.isBought === true,

  // [Oreki R40-S1-fix] 2026-10-30 spec 新增的两项（不补会 leaf-mismatch ⇒ 整层降级）。
  // · `player.dimensionBoosts`：原版 number，直接读；
  "player.dimensionBoosts": () => player.dimensionBoosts,
  // · `game.endState`：**不是**单调的「进度」而是含片尾计数的综合值 ——
  //   一旦 `isGameEnd` 为真，`additionalEnd` 会继续涨（game-end.js:88-91），
  //   所以它只适合回答「过没过线」，不能拿来算还剩多少。
  "game.endState": () => GameEnd.endState,
};

/** 比较算子：把 Decimal / number / boolean 统一成同一套语义。 */
const COMPARATORS = {
  gte: (a, b) => cmp(a, b) >= 0,
  gt: (a, b) => cmp(a, b) > 0,
  lt: (a, b) => cmp(a, b) < 0,
  lte: (a, b) => cmp(a, b) <= 0,
  eq: (a, b) => eq(a, b),
};

function isDecimalLike(v) {
  return v !== null && typeof v === "object" && typeof v.gte === "function";
}

function toNumberSafe(v) {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (isDecimalLike(v)) return v.toNumber();
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function cmp(a, b) {
  // Decimal 与 Decimal/数字之间优先用 Decimal 自己的比较，避免 toNumber 溢出成 Infinity
  if (isDecimalLike(a) && (isDecimalLike(b) || typeof b === "number")) {
    if (a.gt(b)) return 1;
    if (a.lt(b)) return -1;
    return 0;
  }
  const x = toNumberSafe(a);
  const y = toNumberSafe(b);
  if (x > y) return 1;
  if (x < y) return -1;
  return 0;
}

function eq(a, b) {
  if (isDecimalLike(a) && (isDecimalLike(b) || typeof b === "number")) return a.eq(b);
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) === Boolean(b);
  return toNumberSafe(a) === toNumberSafe(b);
}

/**
 * 条件求值。语法见 spec.conditionGrammar：
 *   叶子：{ "leaf": "...", "op": "gte", "value": 16 }（没有 op/value 时按真值判断）
 *   组合：{ "all": [...] } / { "any": [...] } / { "not": {...} }
 * 未知形状一律抛错 —— failSafe 会把它变成「整体停机 + 回落到上次决策」，
 * 而不是「猜一个 false 继续跑」。这一点很重要：静默 false 会让自动化长期不动作，
 * 比停机更难发现。
 */
export function evaluateCondition(cond) {
  if (cond === null || cond === undefined) return true;
  if (typeof cond === "string") {
    // spec 里有几处 `done` / `detect` 写成说明性字符串（如 "由执行层读取原版解锁判据"），
    // 那不是可求值条件。约定：字符串条件一律视为「无法判定」。
    throw new Error(`not-evaluable: ${cond}`);
  }
  if (Array.isArray(cond)) return cond.every(evaluateCondition);
  if (typeof cond !== "object") throw new Error(`bad-condition: ${typeof cond}`);

  if (Array.isArray(cond.all)) return cond.all.every(evaluateCondition);
  if (Array.isArray(cond.any)) return cond.any.some(evaluateCondition);
  if (cond.not !== undefined) return !evaluateCondition(cond.not);

  if (typeof cond.leaf === "string") {
    const resolver = LEAVES[cond.leaf];
    if (!resolver) throw new Error(`unknown-leaf: ${cond.leaf}`);
    const actual = resolver();
    if (cond.op === undefined) return Boolean(actual);
    const comparator = COMPARATORS[cond.op];
    if (!comparator) throw new Error(`unknown-op: ${cond.op}`);
    return comparator(actual, cond.value);
  }
  throw new Error(`bad-condition-shape: ${JSON.stringify(cond).slice(0, 80)}`);
}

/** 首次求值前做一次双向叶子对齐：JSON 有、代码没有 ⇒ 报错；代码有、JSON 没登记 ⇒ 报错。 */
function assertSpecLeaves() {
  const declared = new Set(spec?.conditionGrammar?.leaves ?? []);
  const implemented = new Set(Object.keys(LEAVES));
  const missing = [...declared].filter(x => !implemented.has(x));
  const extra = [...implemented].filter(x => !declared.has(x));
  if (missing.length || extra.length) {
    throw new Error(`leaf-mismatch missing=[${missing}] extra=[${extra}]`);
  }
}

/** 缓存的「上次成功决策」，failSafe 的落点。 */
let lastKnownGood = null;
/** 上次求值时刻（毫秒）。 */
let lastEvalAt = 0;
/** 上次求值用的入参指纹，用于「状态没变就复用」。 */
let lastSignature = "";
/** 降级计数与最后一条错误（只读观测）。 */
let degradedCount = 0;
let lastError = "";
/** 手动操作保护：goalId → 到期毫秒。 */
const manualHolds = new Map();

const EVAL_MIN_INTERVAL_MS = 1000; // spec.conventions.evaluationPeriod 的默认值

/** 机制状态指纹：这些一变就必须立刻重算，不必等 1 s。 */
function stateSignature() {
  // [Oreki R44] 阶段识别现在依赖 12 个位，指纹必须全部覆盖 —— 漏一个就会出现
  // 「阶段已经换了、决策还是旧的，最多延迟 1 s」；1 s 的延迟在「刚解锁时间膨胀」
  // 「刚打开天神页签」这种当帧就该换策略的节点上会直接买错东西。
  return [
    PlayerProgress.infinityUnlocked() ? 1 : 0,
    PlayerProgress.eternityUnlocked() ? 1 : 0,
    PlayerProgress.realityUnlocked() ? 1 : 0,
    PlayerProgress.dilationUnlocked() ? 1 : 0,
    NormalChallenge.isRunning ? 1 : 0,
    InfinityChallenge.isRunning ? 1 : 0,
    EternityChallenge.isRunning ? 1 : 0,
    Pelle.isDoomed ? 1 : 0,
    player.break ? 1 : 0,
    // 阶段分界用的计数位，只取「够不够」不取精确值，避免每买一棵研究就重算整条路线
    (player.timestudy?.studies?.length ?? 0) > 0 ? 1 : 0,
    (player.realities ?? 0) >= 2 ? 1 : 0,
    Player.automatorUnlocked ? 1 : 0,
    Teresa.isUnlocked ? 1 : 0,
    TeresaUnlocks.effarig.isUnlocked ? 1 : 0,
    EffarigUnlock.eternity.isUnlocked ? 1 : 0,
    Achievement(151).isUnlocked ? 1 : 0,
    VUnlocks.raUnlock.isUnlocked ? 1 : 0,
    Laitela.isUnlocked ? 1 : 0,
    Pelle.isUnlocked ? 1 : 0,
  ].join("");
}

/**
 * 找出当前阶段：按 `precedence` **取最大者胜**（spec.conventions.stagePrecedence）。
 *
 * ⚠ 这里**不能**按数组顺序取第一个匹配。未永恒时跑普通挑战，`infinity` 与 `challenges`
 * 会同时成立；按数组顺序会判成 `infinity`（spec 里它排在前面），于是挑战期间还去推永恒，
 * 直接违背了 `challengeClear` 的「禁止沿用普通阶段购买顺序」。
 *
 * 相等 ⇒ **fail closed**：抛错交给 failSafe（返回 degraded、沿用上次决策），
 * 不自己挑一个。两个阶段同票说明 spec 本身有缺陷，猜一边等于把缺陷藏进运行结果里。
 *
 * @returns {{stage: object|null, tied: string[]}}
 */
function detectStage() {
  const hits = [];
  for (const stage of spec.stages ?? []) {
    try {
      if (evaluateCondition(stage.detect)) hits.push(stage);
    } catch (e) {
      // 单个阶段的条件不可求值（例如写成说明性字符串）不致命：跳过它继续下一个。
      // 这与 failSafe 的「整体停机」不冲突 —— failSafe 管的是致命错误，
      // 这里管的是 spec 里本来就写不清楚的那几条。
      continue;
    }
  }
  if (!hits.length) return { stage: null, tied: [] };

  let best = -Infinity;
  for (const stage of hits) {
    const p = Number(stage.precedence);
    if (!Number.isFinite(p)) {
      throw new Error(`stage-missing-precedence: ${stage.id}`);
    }
    if (p > best) best = p;
  }
  const top = hits.filter(stage => Number(stage.precedence) === best);
  if (top.length > 1) {
    throw new Error(`stage-precedence-tie ${best}: [${top.map(s => s.id).join(",")}]`);
  }
  return { stage: top[0], tied: [] };
}

function findById(list, id) {
  return (list ?? []).find(x => x?.id === id) ?? null;
}

/**
 * 用当前的 manualHolds 重算缓存决策里的 `manualHold`（其余字段不动）。
 * 只做一件事实核对：这个 goal 现在到底还在不在让路窗口里。
 */
function withFreshHold(decision, now) {
  if (!decision) return null;
  const goalId = decision.goal?.id ?? decision.stage?.goal ?? null;
  const until = goalId ? (manualHolds.get(goalId) ?? 0) : 0;
  return {
    ...decision,
    manualHold: until > now ? { goalId, untilMs: until } : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 路线择优层（Oreki R42）
//
// ── 为什么需要它：上面那套是查表，不是择优 ─────────────────────────────
// `detectStage()` 只按 precedence 取最大者（本文件 :241-247），
// `evaluate()` 随后 `findById(spec.strategies, stage.strategy)` 取一条策略、
// 把它的 `priority` 数组**原样**放进决策对象（:296、:336）。
// 全链路没有比较、没有评分、没有「还有别的走法」这个概念 ——
// 顺序只有在 spec 作者恰好写对时才对。spec 自己也承认这点：
// `route-model.json` 的 `note` 写着「多路线择优的唯一模型源」，
// 但那份文件在 R42 之前是**纯数据、无人读**。
//
// ── 六件事（逐条对应验收要求）────────────────────────────────────────
//   ① prereqOk     前置是否满足 → `route-model.filter` 的结构化落地（见 `filterRoute`）
//   ② resourceCost 资源成本     → 绑定动词的**单货币**成本 log10 → 买完要重赚多久
//   ③ unlocks      能解锁什么   → 该路线是否把「推进阶段目标」的动词排到前面
//   ④ etaRealSec   预计剩余现实秒 → 真实阈值 ÷ 实测 log 速率（见 `estimateGoalEta`）
//   ⑤ risk         死路/软锁    → high/medium/none 三级，全部由结构推出来
//   ⑥ ops          执行复杂度   → 绑定动词数
//
// ── 「预计剩余现实秒」的口径（这是本段唯一会编数字的地方，所以写死规矩）──
// 只用两样**真实数据**：
//   · 当前余额与真实阈值（`Player.infinityGoal` / `Player.eternityGoal` 等游戏自身 getter）；
//   · 该资源的 log10 增长速度（最近 N 个 1 s 采样的最小二乘斜率，单位 log10/真实秒）。
// 缺任一项 ⇒ `etaRealSec = null`，界面上必须显示「无法估算」。
// **绝不用 `route-model.calibration.baseline` 那张分段表当 ETA** ——
// 那是 R40 两条 run 的历史先验（456 s「等 V」那条已经被 R41 的修复作废），
// 拿它当绝对秒数会直接输出错数。它在本层只作为「历史参照」出现在 `prior` 字段里，
// 且明确标 `confidence: "prior"`，不参与排序。
//
// ── 三条不许越的红线 ────────────────────────────────────────────────
// 1. **手动优先权**：本层不读也不写 `manualHolds`；`decision.manualHold` 的语义一字未改，
//    执行层照旧在 hold 窗口里一个动作都不发。
// 2. **购买权边界**：本层只**重排**当前 `strategy.priority` 里**已经存在**的动词。
//    `orderForBinding()` 里有一条硬约束：绑定里出现、但 priority 里没有的动词一律丢弃。
//    也就是说它不可能让任何层多买一样原本不被允许的东西。
// 3. **研究购买节流**：本层不调用任何购买方法（本文件全文 0 处购买 API 名）。
//    `buyTimeStudy` / `buyDilationStudy` 仍是 `delegated`，30 帧节流不受影响。
// ═══════════════════════════════════════════════════════════════════════

/** 速率采样节流：ETA 需要真实速率，1 s 一次（与 spec.conventions.evaluationPeriod 对齐）。 */
const ROUTE_SAMPLE_MS = 1000;
/** 速率窗口：最近这么多个 1 s 采样做最小二乘。12 个 ≈ 12 s 的窗口。 */
const ROUTE_RATE_WINDOW = 12;
/** 少于这么多采样就**不承认**速率（⇒ ETA = null），不拿两三个点外推。 */
const ROUTE_RATE_MIN_SAMPLES = 3;
/** ETA 差距在此比例内视为「相近」，改用风险/操作数决胜（route-model.evaluation.tieBreak）。 */
const ROUTE_TIE_BAND = 0.05;
/** 切换滞回：新路线必须便宜这么多才允许切（route-model.stability.minImprovementRatio）。 */
const ROUTE_SWITCH_MARGIN = (() => {
  const v = Number(routeModel?.stability?.minImprovementRatio);
  return Number.isFinite(v) && v > 0 ? v : 0.15;
})();
/** 两次切换之间的最小间隔（route-model.stability.cooldownSeconds）。 */
const ROUTE_SWITCH_COOLDOWN_MS = (() => {
  const v = Number(routeModel?.stability?.cooldownSeconds);
  return Number.isFinite(v) && v > 0 ? v * 1000 : 300000;
})();

/**
 * 路线层用到的资源。全部是**读取**，全部可能抛（未解锁时 getter 不存在）。
 * 新增资源必须先在这里登记，`estimateGoalEta` / `verbPenalty` 只认这里的键。
 */
const ROUTE_RESOURCES = {
  antimatter: { title: "反物质", read: () => player.antimatter },
  infinityPoints: { title: "无限点", read: () => Currency.infinityPoints.value },
  eternityPoints: { title: "永恒点", read: () => Currency.eternityPoints.value },
  timeTheorems: { title: "时间之理", read: () => Currency.timeTheorems.value },
  realityMachines: { title: "现实机器", read: () => Currency.realityMachines.value },
};

/**
 * 阶段目标 → 「哪个资源到多少」。
 *
 * ⚠ 只登记**游戏自己给出阈值**的阶段。
 * `reality` / `celestials` / `doomed` 的目标不是「某资源到某数」（Teresa 要成就 147、
 * doomed 要 `endState >= 1` 且判据读的是佩勒的 records 峰值），没有单一阈值可读，
 * 所以**不登记** ⇒ 这几个阶段的 ETA 恒为 null ⇒ 路线层退化为「只比风险与操作数」。
 * 这是刻意的：编一个阈值比不给数更糟（route-model.calibration.confidence.unknown 原文）。
 *
 * `completeness`：
 *   · `full`    —— 该阈值就是目标的充要条件（解锁永恒只看 `Player.eternityGoal`）。
 *   · `partial` —— 只是目标的**一个必要条件**。解锁现实还要求 `maxEP.exponent >= 4000`
 *                  与 `TimeDimension(8).isBought`（两者都由永恒模块推进）；
 *                  这里不把那两个数写死，所以绝对秒数只能当**下界**用。
 *                  但**排序**不受影响：同一阶段内所有候选路线共享同一个目标项，
 *                  它一定在比较里被消掉，差的只有各自的资源惩罚项。
 */
const ROUTE_GOAL_PROGRESS = {
  early: { res: "antimatter", completeness: "full", threshold: () => Player.infinityGoal, done: () => PlayerProgress.infinityUnlocked() === true },
  preInfinity: { res: "antimatter", completeness: "full", threshold: () => Player.infinityGoal, done: () => PlayerProgress.infinityUnlocked() === true },
  // [Oreki R44] 阶段 id 由 `infinity` 改名为 `infinityDimensions`（打破无限后的无限维度期）。
  // 打破无限之前那一段（`breakInfinity`）刻意**不登记**：它的门槛是「间隔拉满 15 级」，
  // 不是任何一种货币余额，硬编一个 IP 阈值等于编数字 ⇒ 该段 ETA 一律 null。
  infinityDimensions: { res: "infinityPoints", completeness: "full", threshold: () => Player.eternityGoal, done: () => PlayerProgress.eternityUnlocked() === true },
  // 解锁现实 = 买下膨胀研究 6（`TimeStudy.reality`，dilation-time-study.js:113）
  eternity: { res: "timeTheorems", completeness: "partial", threshold: () => TimeStudy.reality.cost, done: () => PlayerProgress.realityUnlocked() === true },
  timeStudy: { res: "timeTheorems", completeness: "partial", threshold: () => TimeStudy.reality.cost, done: () => PlayerProgress.realityUnlocked() === true },
  // 膨胀段的终点同样是「解锁现实」，所以沿用同一条阈值；`partial` 的自证逻辑见 estimateGoalEta()
  dilation: { res: "timeTheorems", completeness: "partial", threshold: () => TimeStudy.reality.cost, done: () => PlayerProgress.realityUnlocked() === true },
};

/**
 * 动词 → **单一货币**成本。只登记「一种货币 + 一个数字」都读得到的动词。
 * 读不到的一律不登记：成本未知 ⇒ 惩罚记 0（不惩罚，也不虚构）。
 * 例：`buyDimBoost` / `buyGalaxy` 的成本是 `requirement` 判定式而不是价格，故不登记。
 */
const ROUTE_VERB_COST = {
  buyDimension: () => ({ res: "antimatter", cost: AntimatterDimension(1).cost }),
  buyTickspeed: () => ({ res: "antimatter", cost: Tickspeed.cost }),
  buyInfinityDimension: () => ({ res: "infinityPoints", cost: InfinityDimension(1).cost }),
};

/** 每个资源一条采样序列：`{ t, l }`，`l` = log10(余额)。采样节流见 `ROUTE_SAMPLE_MS`。 */
const rateSamples = new Map();
/** 上次采样时刻（毫秒）。 */
let lastRateSampleAt = 0;

/** 当前路线状态。`id = null` 表示「没有可选路线，按 spec 原序」。 */
const routeState = {
  id: null,
  since: 0,
  eta: null,
  switches: 0,
  lastSwitch: null,
  reason: null,
};

function safeRead(fn) {
  try { return fn(); } catch (e) { return null; }
}

/** 任意 Decimal / Number → log10。读不到、为 0、NaN 一律 null（不猜）。 */
function log10Of(v) {
  if (v === null || v === undefined) return null;
  try {
    if (typeof v === "number") return v > 0 && Number.isFinite(v) ? Math.log10(v) : null;
    if (typeof v.log10 === "function") {
      const l = v.log10();
      const n = typeof l === "number" ? l : (l && typeof l.toNumber === "function" ? l.toNumber() : Number(l));
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.log10(n) : null;
  } catch (e) {
    return null;
  }
}

/** 采一次样（全部资源），1 s 最多一次。失败静默：没有采样 ⇒ 没有速率 ⇒ ETA = null。 */
function sampleRates(now) {
  if (now - lastRateSampleAt < ROUTE_SAMPLE_MS) return;
  lastRateSampleAt = now;
  for (const [key, def] of Object.entries(ROUTE_RESOURCES)) {
    const l = log10Of(safeRead(def.read));
    if (l === null) continue;
    let arr = rateSamples.get(key);
    if (!arr) { arr = []; rateSamples.set(key, arr); }
    arr.push({ t: now, l });
    while (arr.length > ROUTE_RATE_WINDOW) arr.shift();
  }
}

/** 最小二乘斜率：log10 / 真实秒。样本不够或斜率非正 ⇒ null。 */
function rateOf(resKey) {
  const arr = rateSamples.get(resKey);
  if (!arr || arr.length < ROUTE_RATE_MIN_SAMPLES) return null;
  const n = arr.length;
  let st = 0, sl = 0;
  for (const p of arr) { st += p.t; sl += p.l; }
  const mt = st / n, ml = sl / n;
  let num = 0, den = 0;
  for (const p of arr) {
    const dt = (p.t - mt) / 1000; // 换算成秒
    num += dt * (p.l - ml);
    den += dt * dt;
  }
  if (!(den > 0)) return null;
  const rate = num / den;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * 阶段目标还差多少真实秒。
 * @returns {{eta: number|null, reason: string, res: string|null, balanceL: number|null, thresholdL: number|null}}
 */
function estimateGoalEta(stageId) {
  const goal = ROUTE_GOAL_PROGRESS[stageId];
  if (!goal) return { eta: null, reason: "goal-threshold-unreadable", res: null, balanceL: null, thresholdL: null, completeness: null };
  const def = ROUTE_RESOURCES[goal.res];
  if (!def) return { eta: null, reason: "resource-unknown", res: goal.res, balanceL: null, thresholdL: null, completeness: goal.completeness ?? null };
  const balanceL = log10Of(safeRead(def.read));
  const thresholdL = log10Of(safeRead(goal.threshold));
  const completeness = goal.completeness ?? "partial";
  if (balanceL === null || thresholdL === null) {
    return { eta: null, reason: "balance-or-threshold-unreadable", res: goal.res, balanceL, thresholdL, completeness };
  }
  if (thresholdL <= balanceL) {
    // 自证一次：`partial` 的目标下，阈值达成 ≠ 目标达成。
    // 实测踩到过：`r42-route-peek-b` 在 t=6.2 s 报出 `eta=0s（threshold-reached）`，
    // 而当时现实根本没解锁 —— 说明 `TimeStudy.reality.cost` 单独拿来当阈值不够。
    // 这种情况**不许报 0**（0 会被读成「已经好了」），一律报 null 并写清原因。
    const done = typeof goal.done === "function" ? safeRead(goal.done) : null;
    if (completeness === "partial" && done !== true) {
      return {
        eta: null, reason: "threshold-met-but-goal-not-done",
        res: goal.res, balanceL, thresholdL, completeness,
      };
    }
    return { eta: 0, reason: "threshold-reached", res: goal.res, balanceL, thresholdL, completeness };
  }
  const rate = rateOf(goal.res);
  if (rate === null) {
    return { eta: null, reason: "rate-unknown", res: goal.res, balanceL, thresholdL, completeness };
  }
  return { eta: (thresholdL - balanceL) / rate, reason: "measured", res: goal.res, balanceL, thresholdL, completeness };
}

/**
 * 把某动词排在「推进目标的动词」之前，会让目标晚到多久（真实秒）。
 *
 * 两段都从真实余额与真实成本算：
 *   · 买得起（cost ≤ balance）：重赚回这笔钱的时间 = −log10(1 − cost/balance) / rate；
 *   · 买不起：先攒到买得起 = (log10(cost) − log10(balance)) / rate。
 * 成本或速率读不到 ⇒ 记 0（不惩罚、不虚构），并在 `known=false` 里标出来。
 */
function verbPenalty(verbId) {
  const reader = ROUTE_VERB_COST[verbId];
  if (!reader) return { penalty: 0, known: false, why: "no-single-currency-cost" };
  const info = safeRead(reader);
  if (!info) return { penalty: 0, known: false, why: "cost-unreadable" };
  const def = ROUTE_RESOURCES[info.res];
  if (!def) return { penalty: 0, known: false, why: "resource-unknown" };
  const balanceL = log10Of(safeRead(def.read));
  const costL = log10Of(info.cost);
  if (balanceL === null || costL === null) return { penalty: 0, known: false, why: "unreadable" };
  const rate = rateOf(info.res);
  if (rate === null) return { penalty: 0, known: false, why: "rate-unknown" };
  if (costL <= balanceL) {
    const frac = Math.pow(10, costL - balanceL); // cost / balance ∈ (0, 1]
    if (!(frac > 0) || frac >= 1) return { penalty: 0, known: true, why: "negligible" };
    return { penalty: Math.max(0, -Math.log10(1 - frac) / rate), known: true, why: "recover-after-spend" };
  }
  return { penalty: (costL - balanceL) / rate, known: true, why: "time-to-afford" };
}

/** 取某条路线的动词绑定。没绑定 ⇒ null（⇒ 该路线不可执行）。 */
function bindingOf(routeId) {
  return (spec.routeBindings ?? []).find(b => b?.route === routeId) ?? null;
}

/**
 * 绑定的动词顺序 ∩ 当前 strategy.priority。
 * **硬约束**：绑定里出现、但 priority 里没有的动词一律丢弃 ——
 * 本层永远不能引入一个阶段模块原本不被允许的购买动作。
 *
 * **只在原位换位**：绑定涉及的动词按绑定顺序**填回它们原本占的那几个位置**，
 * 不参与绑定的动词一格都不动。
 * 为什么不用「绑定动词提到最前、其余追加到后面」：那样会把 `runReality` 提到
 * `buyRealityMachine` 前面（实测 `r42-route-peek-a`：reality 阶段的 priority 变成
 * `equipBestGlyph,buyRealityUpgrade,runReality,buyRealityMachine`）——
 * 虽然 `buyRealityMachine` 是 unsupported（执行层本来就不动手）、行为上等价，
 * 但这是**没有评分依据的扰动**。原位换位把扰动限制在绑定涉及的那几个槽位上，
 * 未参与绑定的槽位保持原样，`reorderDistance` 也就只反映真实差异。
 *
 * 返回 null 表示「这条绑定在当前策略下没有可执行动词」。
 */
function orderForBinding(binding, priority) {
  if (!binding || !Array.isArray(binding.verbs)) return null;
  const allowed = new Set(priority);
  const bound = [];
  for (const verbId of binding.verbs) {
    if (allowed.has(verbId) && !bound.includes(verbId)) bound.push(verbId);
  }
  if (!bound.length) return null;
  const boundSet = new Set(bound);
  const order = priority.slice();
  // 绑定动词原本占的槽位（升序），按绑定顺序逐个填回
  const slots = [];
  for (let i = 0; i < order.length; i++) if (boundSet.has(order[i])) slots.push(i);
  for (let k = 0; k < slots.length; k++) order[slots[k]] = bound[k];
  return { order, head: bound, slots };
}

/**
 * 一条路线的六个量。任何一项读不到就如实标出来，不补默认值。
 * @param {object} route route-model.routes[] 里的一条
 * @param {string[]} priority 当前策略的优先级（未重排）
 * @param {{eta:number|null}} goalEta 阶段目标距离
 */
function scoreRoute(route, priority, goalEta) {
  const binding = bindingOf(route.id);
  const ordered = orderForBinding(binding, priority);

  // ① 前置：结构化的「有没有可执行动作」。没有 ⇒ 直接淘汰（对应 filter.missingFeature）。
  const prereqOk = ordered !== null;

  // ⑤ 风险：全部由结构推出来，不读文案。
  const resetVerbs = new Set(["eternity", "runReality", "armageddonOnceMoreToSetBreak"]);
  const head = ordered?.head ?? [];
  const hasResetHead = head.some(v => resetVerbs.has(v));
  const risk = !prereqOk
    ? { level: "high", reasons: ["missingFeature：该路线没有已登记的动词绑定，执行层无从下手"] }
    : hasResetHead
      ? { level: "medium", reasons: ["首步就是重置类动作，重置成本不可回收"] }
      : { level: "none", reasons: [] };

  // ② 资源成本：排在「推进目标」之前、需要花钱的动词，各自的重赚时间之和。
  //    这里不区分哪个动词才是目标推进项 —— 一律计入代价，谁排前面代价就到谁为止。
  let penaltySec = 0;
  const penaltyDetail = [];
  let unknownPenaltyCount = 0;
  for (const verbId of head) {
    const p = verbPenalty(verbId);
    if (!p.known) unknownPenaltyCount++;
    else if (p.penalty > 0) penaltyDetail.push({ verb: verbId, sec: Math.round(p.penalty * 10) / 10, why: p.why });
    penaltySec += p.penalty;
  }

  // ④ 预计剩余现实秒：目标距离 + 前面这些动作的重赚时间。
  //    目标距离读不到就是 null —— 排序随即退化为「风险 → 操作数」。
  const etaRealSec = goalEta.eta === null ? null : goalEta.eta + penaltySec;

  // ⑥ 执行复杂度
  const ops = head.length;

  // ③ 解锁：这条路线是否把「会推进阶段目标」的动词排在最前。
  //    绑定里的 `advances` 由 spec 显式给出（数据），不由本文件猜。
  const unlocks = Array.isArray(binding?.advances) ? binding.advances.slice() : [];

  return {
    id: route.id,
    title: route.title ?? route.id,
    prereqOk,
    resourceCostSec: Math.round(penaltySec * 10) / 10,
    resourceCostUnknownVerbs: unknownPenaltyCount,
    resourceCostDetail: penaltyDetail,
    unlocks,
    etaRealSec: etaRealSec === null ? null : Math.round(etaRealSec * 10) / 10,
    etaReason: goalEta.reason,
    risk,
    ops,
    // 与 spec 原序的差异位数。只作为**最后一级**决胜键：
    // route-model.stability 原话是「一个老是改主意的系统比一个笨系统更难用」，
    // 所以分数完全并列时留在原序，不为了「显得在择优」而制造无意义的重排。
    reorderDistance: ordered ? ordered.order.filter((v, i) => v !== priority[i]).length : 0,
    order: ordered?.order ?? null,
    why: route.why ?? "",
  };
}

const RISK_RANK = { none: 0, medium: 1, high: 2 };

/**
 * 排序：主键 = ETA（只在两边都有数时）；差距 < 5% 或有一边无解 ⇒ 风险 → 操作数 → 模型顺序。
 * 全部是纯比较，无随机、无时间依赖（时间由调用方传进来）。
 */
function compareScores(a, b) {
  if (a.prereqOk !== b.prereqOk) return a.prereqOk ? -1 : 1;
  if (a.etaRealSec !== null && b.etaRealSec !== null) {
    const lo = Math.max(1e-9, Math.min(a.etaRealSec, b.etaRealSec));
    const diff = Math.abs(a.etaRealSec - b.etaRealSec) / lo;
    if (diff > ROUTE_TIE_BAND) return a.etaRealSec - b.etaRealSec;
  }
  const ra = RISK_RANK[a.risk.level] ?? 9;
  const rb = RISK_RANK[b.risk.level] ?? 9;
  if (ra !== rb) return ra - rb;
  if (a.ops !== b.ops) return a.ops - b.ops;
  // 最后一级：与 spec 原序差异更小的优先（稳定优先于极限）。
  if (a.reorderDistance !== b.reorderDistance) return a.reorderDistance - b.reorderDistance;
  return 0; // 仍并列 ⇒ 保持 routeModel.routes 的原顺序（Array.sort 稳定）
}

/**
 * 选路线 + 滞回。
 *
 * 切换条件（三条，缺一不可，全部来自 route-model.stability）：
 *   · 新路线必须「可执行」（prereqOk）；
 *   · 两边 ETA 都有数时：`best.eta < current.eta × (1 − 15%)`；
 *   · 距上次切换 ≥ 300 s。
 *
 * 唯一的例外是「当前路线失效」：它的 prereqOk 变 false（绑定在当前策略下没有可执行动词），
 * 这时立刻换，不等冷却 —— 因为不换等于没有任何顺序可用。
 */
function selectRoute(scores, now) {
  const viable = scores.filter(s => s.prereqOk);
  if (!viable.length) {
    routeState.id = null;
    routeState.eta = null;
    routeState.reason = "no-executable-route";
    return null;
  }
  const ranked = viable.slice().sort((a, b) => compareScores(a, b));
  const best = ranked[0];
  const current = routeState.id ? (scores.find(s => s.id === routeState.id) ?? null) : null;

  if (!current) {
    routeState.id = best.id;
    routeState.since = now;
    routeState.eta = best.etaRealSec;
    routeState.reason = "init";
    return { changed: false, kind: "init", from: null, to: best.id, reason: "首次选定" };
  }
  if (!current.prereqOk) {
    routeState.id = best.id;
    routeState.since = now;
    routeState.eta = best.etaRealSec;
    routeState.switches++;
    routeState.reason = "current-unviable";
    routeState.lastSwitch = { at: now, from: current.id, to: best.id, reason: "当前路线失效" };
    return { changed: true, kind: "unviable", from: current.id, to: best.id, reason: "当前路线失效" };
  }
  if (best.id === current.id) {
    routeState.eta = current.etaRealSec;
    routeState.reason = "keep";
    return { changed: false, kind: "keep", from: current.id, to: current.id, reason: "当前路线仍最优" };
  }

  // 两边都得有 ETA 才谈「便宜 15%」；否则不换（fail closed，宁可不动）。
  const bothKnown = best.etaRealSec !== null && current.etaRealSec !== null;
  const gain = bothKnown ? (current.etaRealSec - best.etaRealSec) / Math.max(1e-9, current.etaRealSec) : 0;
  const cooled = now - routeState.since >= ROUTE_SWITCH_COOLDOWN_MS;

  if (bothKnown && gain >= ROUTE_SWITCH_MARGIN && cooled) {
    routeState.id = best.id;
    routeState.since = now;
    routeState.eta = best.etaRealSec;
    routeState.switches++;
    routeState.reason = `切换：预计省 ${Math.round(gain * 100)}%`;
    routeState.lastSwitch = {
      at: now, from: current.id, to: best.id,
      reason: `预计剩余 ${Math.round(current.etaRealSec)}s → ${Math.round(best.etaRealSec)}s`,
    };
    return { changed: true, kind: "faster", from: current.id, to: best.id, toEta: best.etaRealSec, reason: routeState.reason };
  }
  routeState.eta = current.etaRealSec;
  routeState.reason = !bothKnown
    ? "hold：预计耗时无法估算，不换"
    : (!cooled ? "hold：切换冷却中" : `hold：优势 ${Math.round(gain * 100)}% < ${Math.round(ROUTE_SWITCH_MARGIN * 100)}%`);
  return { changed: false, kind: "hold", from: current.id, to: best.id, reason: routeState.reason };
}

/**
 * 路线层主入口。**只读 + 只重排**，不碰任何购买权、不碰 manualHolds。
 * @returns {object|null} 决策对象里的 `route` 段
 */
function planRoute(stage, strategy, now) {
  const priority = Array.isArray(strategy.priority) ? strategy.priority.slice() : [];
  const routes = (routeModel?.routes ?? []).filter(r =>
    Array.isArray(r?.stageScope) && r.stageScope.includes(stage.id));
  if (!routes.length) {
    routeState.id = null;
    routeState.eta = null; // 阶段换了就必须清掉上一个阶段的 ETA，否则界面会显示过期数字
    routeState.reason = "no-route-for-stage";
    return {
      stageId: stage.id,
      current: null,
      chosen: null,
      etaRealSec: null,
      confidence: "unknown",
      priority: priority,
      candidates: [],
      note: "该阶段在 route-model.routes 里没有候选路线；按 spec 原序执行",
    };
  }

  sampleRates(now);
  const goalEta = estimateGoalEta(stage.id);
  const scores = routes.map(r => scoreRoute(r, priority, goalEta));
  const decision = selectRoute(scores, now);
  const chosen = scores.find(s => s.id === routeState.id) ?? null;
  const order = chosen?.order ?? priority;

  return {
    stageId: stage.id,
    current: routeState.id,
    chosen: chosen ? chosen.id : null,
    chosenTitle: chosen ? chosen.title : null,
    switched: decision.changed,
    switchKind: decision.kind,
    switchReason: decision.reason,
    etaRealSec: chosen ? chosen.etaRealSec : null,
    // confidence 的口径：
    //   measured    —— 阈值是目标充要条件，且速率实测到了；
    //   lower-bound —— 阈值只是必要条件之一（见 ROUTE_GOAL_PROGRESS.completeness），
    //                  绝对秒数只能当下界，但**排序**仍然有效（目标项在同类比较里被消掉）；
    //   unknown     —— 没有数，界面必须显示「无法估算」。
    confidence: !chosen || chosen.etaRealSec === null
      ? "unknown"
      : (goalEta.completeness === "full" ? "measured" : "lower-bound"),
    goalCompleteness: goalEta.completeness ?? null,
    etaReason: goalEta.reason,
    goalRes: goalEta.res,
    goalBalanceL: goalEta.balanceL === null ? null : Math.round(goalEta.balanceL * 100) / 100,
    goalThresholdL: goalEta.thresholdL === null ? null : Math.round(goalEta.thresholdL * 100) / 100,
    switches: routeState.switches,
    lastSwitch: routeState.lastSwitch,
    // 排序后的候选（含被淘汰的），供面板与探针核对
    candidates: scores
      .slice()
      .sort((a, b) => compareScores(a, b))
      .map(s => ({
        id: s.id, title: s.title, prereqOk: s.prereqOk,
        etaRealSec: s.etaRealSec, etaReason: s.etaReason,
        resourceCostSec: s.resourceCostSec, resourceCostUnknownVerbs: s.resourceCostUnknownVerbs,
        risk: s.risk.level, ops: s.ops, unlocks: s.unlocks, reorderDistance: s.reorderDistance,
      })),
    priority: order,
    specPriority: priority,
    // 历史先验（不参与排序，只作参照；见本段头注释「口径」）
    prior: Array.isArray(routeModel?.calibration?.baseline) ? routeModel.calibration.baseline : [],
  };
}

/**
 * 求值，返回决策对象。**只读**。
 * @param {boolean} force 忽略 1 s 节流（状态变化时用）
 * @returns {object}
 */
export function evaluate(force = false) {
  const now = Date.now();
  // 指纹本身也可能抛（任一全局读抛出时）—— 它必须在 try 里，
  // 否则 failSafe 会被绕过：实测自测里 `player.break` 变成会抛的 getter 时，
  // 异常从 stateSignature() 直接飞到了调用方。
  let sig = "";
  try {
    sig = stateSignature();
  } catch (e) {
    sig = `sig-error:${(e && e.message) || e}`;
  }
  if (!force && sig === lastSignature && now - lastEvalAt < EVAL_MIN_INTERVAL_MS) {
    // 节流期间不能整份照抄缓存：`manualHold` 是有寿命的，抄一份过期/已清空的 hold
    // 会让面板显示「已暂停 58 秒」而实际早已恢复 —— 实测自测里 `clearManualHolds()`
    // 之后缓存仍在让路，执行层整整 1 秒不动手，且面板时间不动。
    return withFreshHold(lastKnownGood, now) ?? { ok: false, reason: "no-decision-yet" };
  }
  try {
    assertSpecLeaves();
    const { stage } = detectStage();
    if (!stage) throw new Error("no-stage-matched");

    const goal = findById(spec.goals, stage.goal);
    const strategy = findById(spec.strategies, stage.strategy) ?? findById(spec.strategies, goal?.strategy);
    if (!strategy) throw new Error(`no-strategy: ${stage.strategy}`);

    // 目标完成度：`done` 可能是结构化条件，也可能是说明性字符串。
    let done = null;
    if (goal && typeof goal.done === "object" && goal.done !== null) {
      try {
        done = evaluateCondition(goal.done);
      } catch (e) {
        done = null; // 算不出来就是 null，界面显示「无法判定」，绝不猜
      }
    }

    // 阻碍项：`detect` 为字符串的那些没法求值，直接跳过（它们的 advice 仍可在 UI 里作为静态提示）
    const blockers = [];
    for (const blocker of spec.blockers ?? []) {
      try {
        if (evaluateCondition(blocker.detect)) blockers.push(blocker);
      } catch (e) {
        continue;
      }
    }

    for (const [goalId, until] of manualHolds) {
      if (until <= now) manualHolds.delete(goalId);
    }
    const holdUntil = manualHolds.get(stage.goal) ?? 0;

    // ── 路线择优（Oreki R42）────────────────────────────────────────────
    // 失败必须**只让路线层失效**，不能让整个决策降级：
    // 路线层是增强项，spec 原序是保底项。所以这里单独 try/catch，出错就退回原序。
    let route = null;
    let priority = Array.isArray(strategy.priority) ? strategy.priority.slice() : [];
    try {
      route = planRoute(stage, strategy, now);
      if (route && Array.isArray(route.priority) && route.priority.length) priority = route.priority;
    } catch (e) {
      route = { error: String((e && e.message) || e), priority, confidence: "unknown" };
    }

    const decision = {
      ok: true,
      at: now,
      specId: spec.specId,
      schemaVersion: spec.schemaVersion,
      stage: { id: stage.id, title: stage.title },
      goal: goal
        ? { id: goal.id, title: goal.title, done }
        : { id: stage.goal ?? null, title: stage.goal ?? null, done: null },
      strategy: {
        id: strategy.id,
        title: strategy.title,
        // 重排后的顺序（= 绑定 ∩ spec.priority，集合不变，只换次序）
        priority,
        // 原序一并留着：面板/探针要能回答「有没有被重排、重排成什么」
        specPriority: Array.isArray(strategy.priority) ? strategy.priority.slice() : [],
        guards: Array.isArray(strategy.guards) ? strategy.guards.slice() : [],
      },
      route,
      blockers: blockers.map(b => ({ id: b.id, title: b.title, advice: b.advice, source: b.source })),
      manualHold: holdUntil > now ? { goalId: stage.goal, untilMs: holdUntil } : null,
      degraded: false,
    };
    lastKnownGood = decision;
    lastEvalAt = now;
    lastSignature = sig;
    return decision;
  } catch (e) {
    // spec.conventions.failSafe：整体停机 + 回落到 lastKnownGoodStrategy，禁止抛到主循环
    lastError = String((e && e.message) || e);
    degradedCount++;
    if (lastKnownGood) {
      return { ...lastKnownGood, degraded: true, error: lastError, at: now };
    }
    return { ok: false, degraded: true, error: lastError, at: now, reason: "no-last-known-good" };
  }
}

/**
 * 记录一次玩家手动操作（spec.manualOverride）。
 * @param {string} goalId 作用域是 goal id，不是 stage id
 */
export function noteManualAction(goalId) {
  if (!goalId) return;
  const holdMs = Number(spec?.manualOverride?.holdSeconds ?? 0) * 1000;
  if (holdMs > 0) manualHolds.set(goalId, Date.now() + holdMs);
}

/** 清空全部手动保护（面板「立即恢复自动」按钮 / 测试用）。 */
export function clearManualHolds() {
  manualHolds.clear();
}

/** 供面板/探针读取的内部状态。只读。 */
export function debugState() {
  return {
    specId: spec?.specId ?? null,
    schemaVersion: spec?.schemaVersion ?? null,
    stages: (spec?.stages ?? []).length,
    strategies: (spec?.strategies ?? []).length,
    goals: (spec?.goals ?? []).length,
    leaves: Object.keys(LEAVES).length,
    declaredLeaves: (spec?.conditionGrammar?.leaves ?? []).length,
    // 叶子**名字**也要暴露：只比数量是错的但绿的（改名前后条数一样）。
    // 单测与探针必须用这份名单跟 spec 做集合比对，一个字符不同就要红。
    leafIds: Object.keys(LEAVES).slice().sort(),
    declaredLeafIds: (spec?.conditionGrammar?.leaves ?? []).slice().sort(),
    // 面板要显示「无（已检查 N 项）」—— N 必须取自 spec，不能写死：
    // spec 加一条 blocker，面板的「已检查」计数要跟着变，否则这句话立刻变成假话。
    blockersDeclared: (spec?.blockers ?? []).length,
    advisoriesDeclared: (spec?.advisories ?? []).length,
    lastEvalAgoMs: lastEvalAt ? Date.now() - lastEvalAt : null,
    degradedCount,
    lastError,
    manualHolds: [...manualHolds.entries()].map(([id, until]) => ({ goalId: id, remainMs: until - Date.now() })),
    lastKnownGood: lastKnownGood
      ? { stage: lastKnownGood.stage?.id ?? null, strategy: lastKnownGood.strategy?.id ?? null, at: lastKnownGood.at }
      : null,
    // ── 路线层（Oreki R42）────────────────────────────────────────────
    routeModelId: routeModel?.specId ?? null,
    routeCount: (routeModel?.routes ?? []).length,
    routeBindings: (spec?.routeBindings ?? []).map(b => b?.route ?? null).filter(Boolean),
    route: routeState.id,
    routeSinceMs: routeState.since ? Date.now() - routeState.since : null,
    routeSwitches: routeState.switches,
    routeLastSwitch: routeState.lastSwitch,
    routeReason: routeState.reason,
    routeEta: routeState.eta === null ? null : Math.round(routeState.eta * 10) / 10,
    routeSymbols: {
      switchMargin: ROUTE_SWITCH_MARGIN,
      switchCooldownMs: ROUTE_SWITCH_COOLDOWN_MS,
      tieBand: ROUTE_TIE_BAND,
      rateWindow: ROUTE_RATE_WINDOW,
      rateMinSamples: ROUTE_RATE_MIN_SAMPLES,
    },
    // 采样序列长度：为 0 说明「连样本都没采到」，ETA 必然 null，不是模型算不出来
    rateSampleCounts: Object.fromEntries([...rateSamples.entries()].map(([k, v]) => [k, v.length])),
  };
}

// ── route-model.interface 要求的 8 个查询方法（供界面层，界面不参与决策）──────
// 语义与返回值类型逐条对齐 `oreki-route-model.json` 的 `interface.methods`。
// 全部只读；任何一项读不到就返回 null，不编默认值。

/** 当前选定路线 id。 */
export function getCurrentRouteId() {
  return routeState.id;
}

/** 当前选定路线标题。 */
export function getCurrentRouteTitle() {
  const r = (routeModel?.routes ?? []).find(x => x?.id === routeState.id);
  return r?.title ?? null;
}

/** 其他候选路线（含被淘汰原因）。 */
export function getAlternativeRoutes() {
  const route = lastKnownGood?.route;
  if (!route || !Array.isArray(route.candidates)) return [];
  return route.candidates
    .filter(c => c.id !== routeState.id)
    .map(c => `${c.title}（${c.prereqOk ? `预计 ${c.etaRealSec === null ? "无法估算" : `${c.etaRealSec}s`}` : "淘汰：无已登记动词"}）`);
}

/** 为什么选它。 */
export function getSelectionReason() {
  return routeState.reason;
}

/** 预计剩余现实秒数。null = 无法估算（界面必须显示「无法估算」）。 */
export function getEstimatedRemainingSeconds() {
  return routeState.eta === null ? null : Math.round(routeState.eta * 10) / 10;
}

/** 当前执行步骤（重排后的第一个动词）。 */
export function getCurrentStep() {
  const p = lastKnownGood?.strategy?.priority;
  return Array.isArray(p) && p.length ? p[0] : null;
}

/** 上一次切换路线的原因。 */
export function getLastSwitchReason() {
  return routeState.lastSwitch ? routeState.lastSwitch.reason : null;
}

/** 当前阻塞条件（沿用 spec.blockers 的 id 列表）。 */
export function getBlockers() {
  return (lastKnownGood?.blockers ?? []).map(b => b.id);
}

/**
 * 自测入口（**只给 `web/_tools/_r40/r42-route-selftest.mjs` 用**）。
 *
 * 为什么要把内部函数暴露出来：滞回、并列决胜、速率回归这几条都是纯函数，
 * 但它们的输入（真实速率样本、切换冷却）没法靠改游戏全局变量构造出来 ——
 * 不开这个口子就只能「跑一遍 12 分钟看有没有变慢」，那不是单元测试。
 * 这里只暴露**只读引用**，外加一个 `reset()`（清空采样与路线状态），
 * 生产路径上没有任何地方调用它。
 */
export const _internals = {
  compareScores,
  selectRoute,
  orderForBinding,
  estimateGoalEta,
  scoreRoute,
  rateOf,
  log10Of,
  verbPenalty,
  reset() {
    rateSamples.clear();
    lastRateSampleAt = 0;
    routeState.id = null;
    routeState.since = 0;
    routeState.eta = null;
    routeState.switches = 0;
    routeState.lastSwitch = null;
    routeState.reason = null;
  },
  symbols: {
    ROUTE_SWITCH_MARGIN,
    ROUTE_SWITCH_COOLDOWN_MS,
    ROUTE_TIE_BAND,
    ROUTE_RATE_WINDOW,
    ROUTE_RATE_MIN_SAMPLES,
  },
};

export const OrekiSmartStrategy = {
  evaluate, noteManualAction, clearManualHolds, debugState, evaluateCondition,
  // 路线层（Oreki R42）
  getCurrentRouteId, getCurrentRouteTitle, getAlternativeRoutes, getSelectionReason,
  getEstimatedRemainingSeconds, getCurrentStep, getLastSwitchReason, getBlockers,
};

// 与其它 oreki 模块一致：挂到 globalThis，便于探针/面板读取（本模块不持有任何购买权）
globalThis.OrekiSmartStrategy = OrekiSmartStrategy;
