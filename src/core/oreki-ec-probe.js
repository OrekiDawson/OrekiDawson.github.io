/**
 * [Oreki R36-A] EC9「无限之力」墙 —— 只读运行探针。
 *
 * ── 这个探针要回答什么 ────────────────────────────────────────────────
 * R35-S3 报告把 EC9 判定为「唯一真正的墙」，理由是：
 *   · EC9 的入口资源是 `Currency.infinityPower`（无限之力）；
 *   · 无限之力**每次大坍缩**（`big-crunch.js:162` → `InfinityDimensions.resetAmount()`）
 *     和**每次永恒**（`eternity.js:133`）都会被清零；
 *   · 所以「1e17498 的无限之力」必须在**两次清零之间**攒出来。
 * 但 R35 报告里「攒不攒得到」始终是【推导】/【未知】，没有一次运行期读数。
 *
 * 本模块提供那一次缺失的读数：按固定间隔把运行期真实状态推到
 * `window.__orekiEcProbe`（一行一条 JSON）并 `console.log`，
 * 由 `web/_tools/_r36a/` 下的采集脚本收走。
 *
 * ── 严格只读（重要）───────────────────────────────────────────────────
 * 本模块**不写任何游戏状态**：不写 player / Currency / GameCache / 存档字段，
 * 不改任何倍率、门槛、解锁标志位。
 *
 * 唯一一处「看起来像写」的地方是读 `requirementCurrent`：
 * 该 getter 内部做的是 `cachedCurrentRequirement = max(缓存, 当前无限之力)`
 * ——这是**游戏自己在每次门槛判定时都会做**的事，单调不减、幂等，
 * 不伪造任何完成/解锁状态。**额外**先纯读一次 `cachedCurrentRequirement`
 * 字段，把「游戏自己缓存的峰值」与「本探针读到的当前峰值」分开记录，
 * 便于交叉验证。探针不调用 `canBeBought` / `isEntryGoalMet`
 * （这两个会走完整的判定链，且会因 `wasRequirementPreviouslyMet`
 *  直接返回 true，读出来的意义不大）。
 *
 * ── 怎么用 ────────────────────────────────────────────────────────────
 * 本模块**不在生产启动路径里**（不 import 进 main.js / game.js），
 * 由采集脚本在页面里动态 import 并安装，避免改动其它 Agent 拥有的文件：
 *
 *   const m = await import("/src/core/oreki-ec-probe.js");
 *   m.installOrekiEcProbe({ intervalMs: 1000 });
 *
 * 安装后：
 *   · `window.__orekiEcProbe` —— 采样数组，每条是一个对象（序列化后即一行 JSON）
 *   · `window.__orekiEcProbeConfig` —— 可随时改 `{ intervalMs }` 改采样间隔
 *   · console 输出一行 `[OREKI_EC_PROBE] {json}`，便于外部按前缀收集
 */

/** 默认采样间隔（毫秒）。可由 window.__orekiEcProbeConfig.intervalMs 覆盖。 */
const DEFAULT_INTERVAL_MS = 1000;

/** 已经在页面里安装过（避免重复 import 时装两份）。 */
const INSTALL_FLAG = "__orekiEcProbeInstalled";

/**
 * 安全取一个 Decimal / number 的 log10。
 *
 * 注意：**不能**先 `toNumber()` 再 `Math.log10()` —— 无限之力的量级是 1e17500 以上，
 * `toNumber()` 会直接溢出成 Infinity，读数就变成 null（这正是 R35 报告里
 * 「缺 Currency.infinityPower 读数」的原因）。
 * break_infinity 的 Decimal 自带 `log10()`（`this.e + Math.log10(this.m)`），
 * 对任意量级都精确，直接用它。
 *
 * 值为 0 时 log10 无穷（JSON 无法表示），统一返回 null。
 * @param {*} v
 * @returns {number|null}
 */
function safeLog10(v) {
  try {
    if (v === null || v === undefined) return null;
    // Decimal 优先走自带 log10（能处理 1e17500 这种超 IEEE754 范围的值）
    if (typeof v.log10 === "function") {
      const l = v.log10();
      return Number.isFinite(l) ? l : null;
    }
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    const l = Math.log10(n);
    return Number.isFinite(l) ? l : null;
  } catch (e) {
    return null;
  }
}

/**
 * 尽力取一个值，异常时返回 null 而不是让整个采样挂掉。
 * @param {Function} fn
 */
function pick(fn) {
  try {
    return fn();
  } catch (e) {
    return null;
  }
}

/**
 * 把可能是 Decimal 的值转成可 JSON 化的字符串（超大数不会被转成 Infinity）。
 * @param {*} v
 * @returns {string|null}
 */
function safeStr(v) {
  try {
    if (v === null || v === undefined) return null;
    return String(v);
  } catch (e) {
    return null;
  }
}

/**
 * 取 12 关 EC 的完成次数。
 * @returns {number[]}
 */
function readEcDone() {
  const out = [];
  for (let i = 1; i <= 12; i++) {
    out.push(pick(() => EternityChallenge(i).completions) ?? 0);
  }
  return out;
}

/**
 * 采一条完整快照。
 * @param {object} ctx 探针运行时上下文
 * @returns {object}
 */
function sample(ctx) {
  const now = performance.now();
  const sec = (now - ctx.t0) / 1000;

  // ── 无限之力（本轮的核心量）────────────────────────────────────────
  const infPower = pick(() => Currency.infinityPower.value);
  const infPowerL = safeLog10(infPower);

  // 探针自己跟踪的「自上次清零以来观测到的无限之力峰值」。
  // 游戏侧的真值是 ECTimeStudyState.cachedCurrentRequirement（见下方 ec9ReqCurCachedL）。
  if (infPowerL !== null && (ctx.peakInfPowerL === null || infPowerL > ctx.peakInfPowerL)) {
    ctx.peakInfPowerL = infPowerL;
  }

  // ── 第 1~8 无限维度数量（无限之力的唯一来源是 ID1 的产出）────────────
  const idAmtL = [];
  for (let i = 1; i <= 8; i++) {
    idAmtL.push(pick(() => safeLog10(InfinityDimension(i).amount)));
  }

  // ── EC9 的入口门槛读数 ───────────────────────────────────────────
  // requirementCurrent / requirementTotal 挂在 **EC 的时间研究**上
  // （ECTimeStudyState），不是挂在 EternityChallenge 上。
  const ec9Study = pick(() => TimeStudy.eternityChallenge(9));
  // ① 先纯读字段：游戏自己持有的「本窗口内观测到的最高无限之力」。
  //    在游戏自己还没读过 requirementCurrent 之前它是 undefined。
  const ecReqCached9 = pick(() => (ec9Study ? ec9Study.cachedCurrentRequirement : null));
  // ② 再读 requirementTotal（纯 getter，只算不存）。
  const ecReqTot9 = pick(() => (ec9Study ? ec9Study.requirementTotal : null));
  // ③ 最后读 requirementCurrent。
  //    【为什么这一条不是「写状态」】该 getter 的行为是
  //       cachedCurrentRequirement = max(cachedCurrentRequirement, 当前无限之力)
  //    也就是**游戏自己在任何一次门槛判定时都会做的事**，而且单调不减、
  //    幂等（同值再读不产生变化）。它不伪造任何完成/解锁状态，
  //    只是让「本窗口内观测到的峰值」这个缓存值保持与游戏一致。
  //    不读它反而会拿到 undefined 的假读数。
  const ecReqCur9 = pick(() => (ec9Study ? ec9Study.requirementCurrent : null));

  return {
    // 时间轴（现实墙钟秒）
    t: Math.round(sec * 100) / 100,

    // ── 核心：无限之力 ──────────────────────────────────────────────
    infPowerL,
    infPowerRaw: safeStr(infPower),
    peakInfPowerL: ctx.peakInfPowerL,

    // ── 无限维度 1~8 数量 log10 ─────────────────────────────────────
    idAmtL,

    // ── EC9 门槛 ─────────────────────────────────────────────────────
    ecReqCur9L: safeLog10(ecReqCur9),
    ecReqTot9L: safeLog10(ecReqTot9),
    ecReqCur9Raw: safeStr(ecReqCur9),
    ecReqTot9Raw: safeStr(ecReqTot9),
    // 游戏自己缓存的峰值（纯读字段，未被本探针写过）。
    ecReqCached9L: safeLog10(ecReqCached9),
    // EC9 研究是否已买下（requirementBits 位 9）。这一位一旦置上，
    // isEntryGoalMet 会直接返回 true（门槛只判一次）。
    ec9BitSet: pick(() => (player.challenge.eternity.requirementBits & (1 << 9)) !== 0),
    ec9StudyBought: pick(() => (ec9Study ? ec9Study.isBought === true : null)),

    // ── 资源与进度 ──────────────────────────────────────────────────
    epL: pick(() => safeLog10(Currency.eternityPoints.value)),
    ipL: pick(() => safeLog10(Currency.infinityPoints.value)),
    dtL: pick(() => safeLog10(Currency.dilatedTime.value)),
    amL: pick(() => safeLog10(Currency.antimatter.value)),

    // ── 计数器 ──────────────────────────────────────────────────────
    bigCrunches: ctx.crunches,
    eternities: pick(() => Currency.eternities.value.toNumber()),
    infinities: pick(() => Currency.infinitiesTotal.value.toNumber()),
    realities: pick(() => player.realities),
    sinceCrunchSec: ctx.crunches > 0 ? Math.round((now - ctx.lastCrunchAt) / 100) / 100 : null,
    sinceEternitySec: ctx.eternities > 0 ? Math.round((now - ctx.lastEternityAt) / 100) / 100 : null,

    // ── 膨胀链 ──────────────────────────────────────────────────────
    dilationStudies: pick(() => player.dilation.studies.length),
    dilationUnlocked: pick(() => PlayerProgress.dilationUnlocked() === true),
    maxDT: safeStr(pick(() => player.records.thisReality.maxDT)),
    maxDTL: pick(() => safeLog10(player.records.thisReality.maxDT)),

    // ── EC 链 ───────────────────────────────────────────────────────
    ecDone: readEcDone(),
    ec9Completions: pick(() => EternityChallenge(9).completions),
    ecUnlocked: pick(() => player.challenge.eternity.unlocked),
    ecRunning: pick(() => EternityChallenge.isRunning === true),

    // ── EC 前置普通时间研究的购买状态（R36 关键中间态）──────────────
    // ECTimeStudyState.canBeBought（src/core/time-studies/ec-time-study.js:83）
    //   `if (!this.config.requirement.some(s => TimeStudy(s).isBought)) return false;`
    // ⇒ EC9 的 requirement=[151] 未买 ⇒ 恒 false ⇒ EC9 永远买不上。
    // 逐个记录，便于定位「卡在哪一条前置」。
    study141Bought: pick(() => TimeStudy(141).isBought === true),
    study142Bought: pick(() => TimeStudy(142).isBought === true),
    study143Bought: pick(() => TimeStudy(143).isBought === true),
    study151Bought: pick(() => TimeStudy(151).isBought === true),
    study161Bought: pick(() => TimeStudy(161).isBought === true),
    study162Bought: pick(() => TimeStudy(162).isBought === true),
    study171Bought: pick(() => TimeStudy(171).isBought === true),
    study181Bought: pick(() => TimeStudy(181).isBought === true),
    study231Bought: pick(() => TimeStudy(231).isBought === true),
    study232Bought: pick(() => TimeStudy(232).isBought === true),
    study233Bought: pick(() => TimeStudy(233).isBought === true),
    study234Bought: pick(() => TimeStudy(234).isBought === true),
    // EC 研究本身是否已买（EC9~12）
    ec9StudyBoughtNow: pick(() => TimeStudy.eternityChallenge(9).isBought === true),
    ec10StudyBought: pick(() => TimeStudy.eternityChallenge(10).isBought === true),
    ec11StudyBought: pick(() => TimeStudy.eternityChallenge(11).isBought === true),
    ec12StudyBought: pick(() => TimeStudy.eternityChallenge(12).isBought === true),
    // EC9 研究当前的可购买性（只读 getter，不改状态）
    ec9CanBeBought: pick(() => TimeStudy.eternityChallenge(9).canBeBought === true),
    ec9IsAffordable: pick(() => TimeStudy.eternityChallenge(9).isAffordable === true),

    // ── 时间研究点（买 151 需 8 TT、EC9 需 415 TT）───────────────────
    ttL: pick(() => safeLog10(Currency.timeTheorems.value)),
    ttRaw: safeStr(pick(() => Currency.timeTheorems.value)),

    // ── 其它（交叉验证用，不参与 EC9 判定）─────────────────────────
    bootstrapRun: pick(() => isOrekiBootstrapRunSafe()),
    lastUpdate: pick(() => player.lastUpdate),
  };
}

/**
 * `isOrekiBootstrapRun` 在 core/oreki-bootstrap.js 里，本探针不 import 它
 * （保持探针零依赖），改成从全局探测。
 * @returns {boolean|null}
 */
function isOrekiBootstrapRunSafe() {
  try {
    if (typeof PlayerProgress === "undefined") return null;
    if (!PlayerProgress.realityUnlocked()) return true;
    if (typeof TimeStudy === "undefined") return null;
    const s = TimeStudy.reality;
    if (!s) return true;
    return s.isBought !== true;
  } catch (e) {
    return null;
  }
}

/**
 * 安装探针。
 * @param {{intervalMs?: number}} [options]
 * @returns {object} 探针句柄（便于测试脚本 stop）
 */
export function installOrekiEcProbe(options = {}) {
  const w = window;
  if (w[INSTALL_FLAG]) return w[INSTALL_FLAG].handle;

  const cfg = Object.assign({ intervalMs: DEFAULT_INTERVAL_MS }, options);
  w.__orekiEcProbeConfig = Object.assign(w.__orekiEcProbeConfig || {}, cfg);
  w.__orekiEcProbe = w.__orekiEcProbe || [];

  const ctx = {
    t0: performance.now(),
    crunches: 0,
    eternities: 0,
    lastCrunchAt: performance.now(),
    lastEternityAt: performance.now(),
    lastSampleAt: 0,
    peakInfPowerL: null,
  };

  const handle = { context: ctx };

  // ── 重置事件计数（用来测「清零周期」）──────────────────────────────
  const onCrunch = () => {
    ctx.crunches++;
    ctx.lastCrunchAt = performance.now();
    ctx.peakInfPowerL = null;
  };
  const onEternity = () => {
    ctx.eternities++;
    ctx.lastEternityAt = performance.now();
    ctx.peakInfPowerL = null;
  };

  let installed = false;
  try {
    EventHub.logic.on(GAME_EVENT.BIG_CRUNCH_AFTER, onCrunch, handle);
    EventHub.logic.on(GAME_EVENT.ETERNITY_RESET_AFTER, onEternity, handle);
    installed = true;
  } catch (e) {
    // 事件钩子装不上也不影响采样本身（只是少了两个计数器）
    console.warn("[OREKI_EC_PROBE] 事件钩子安装失败：", e && e.message);
  }

  const tick = () => {
    try {
      const interval = Math.max(50, Number(w.__orekiEcProbeConfig?.intervalMs) || DEFAULT_INTERVAL_MS);
      const now = performance.now();
      if (now - ctx.lastSampleAt < interval) return;
      ctx.lastSampleAt = now;
      const snap = sample(ctx);
      w.__orekiEcProbe.push(snap);
      console.log(`[OREKI_EC_PROBE] ${JSON.stringify(snap)}`);
    } catch (e) {
      console.warn("[OREKI_EC_PROBE] 采样异常：", e && e.message);
    }
  };

  EventHub.logic.on(GAME_EVENT.GAME_TICK_AFTER, tick, handle);

  handle.stop = () => {
    try {
      EventHub.logic.offAll(handle);
    } catch (e) { /* ignore */ }
    w.__orekiEcProbeInstalled = undefined;
  };
  w[INSTALL_FLAG] = { handle, eventsInstalled: installed };
  console.log(`[OREKI_EC_PROBE] 已安装，采样间隔 ${cfg.intervalMs} ms`);
  return handle;
}

export default installOrekiEcProbe;
