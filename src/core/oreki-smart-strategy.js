// [Oreki R40-S1] 智能自动购买器 —— 策略解释器（只读、无副作用）
//
// ── 这个文件是什么、不是什么 ────────────────────────────────────────────
// 是：把 `src/core/oreki-smart-strategy.json`（唯一策略源，与 Android 共读）翻译成
//     「当前阶段 / 当前目标 / 当前策略 / 优先级动作列表 / 阻碍项」的一个**决策对象**。
// 不是：不买任何东西、不点任何按钮、不写任何 player 字段、不改自动购买器开关。
//     执行层（`oreki-smart-executor.js`）才允许调购买 API —— 这是 team-lead 定的
//     「路由层与执行层严格分离」，本文件连 `purchase` 这个词都不出现。
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
// ── 叶子取值（18 个，逐个对到源码）──────────────────────────────────────
// spec 的 `conditionGrammar.leaves` 只登记了名字，没写取值；取值在本文件的
// `LEAVES` 表里，一个名字一行。**新增叶子必须先改 JSON 再改这里**，
// 且 `assertSpecLeaves()` 会在首次求值时双向比对（JSON 多一个、这里多一个都会报）。
// 四个有坑的叶子在表里单独写了注释，别当成一行直读。

import spec from "./oreki-smart-strategy.gen.js";

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

  // 成就 147 一到手就算解锁（teresa.js:11-13），与「真的投过现实机器」不同
  "celestial.teresaUnlocked": () => Teresa.isUnlocked,

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
  return [
    PlayerProgress.infinityUnlocked() ? 1 : 0,
    PlayerProgress.eternityUnlocked() ? 1 : 0,
    PlayerProgress.realityUnlocked() ? 1 : 0,
    NormalChallenge.isRunning ? 1 : 0,
    InfinityChallenge.isRunning ? 1 : 0,
    EternityChallenge.isRunning ? 1 : 0,
    Pelle.isDoomed ? 1 : 0,
    player.break ? 1 : 0,
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
        priority: Array.isArray(strategy.priority) ? strategy.priority.slice() : [],
        guards: Array.isArray(strategy.guards) ? strategy.guards.slice() : [],
      },
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
    lastEvalAgoMs: lastEvalAt ? Date.now() - lastEvalAt : null,
    degradedCount,
    lastError,
    manualHolds: [...manualHolds.entries()].map(([id, until]) => ({ goalId: id, remainMs: until - Date.now() })),
    lastKnownGood: lastKnownGood
      ? { stage: lastKnownGood.stage?.id ?? null, strategy: lastKnownGood.strategy?.id ?? null, at: lastKnownGood.at }
      : null,
  };
}

export const OrekiSmartStrategy = {
  evaluate, noteManualAction, clearManualHolds, debugState, evaluateCondition
};

// 与其它 oreki 模块一致：挂到 globalThis，便于探针/面板读取（本模块不持有任何购买权）
globalThis.OrekiSmartStrategy = OrekiSmartStrategy;
