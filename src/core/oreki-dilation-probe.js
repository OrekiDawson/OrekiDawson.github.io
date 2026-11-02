/**
 * [Oreki R36-D] 膨胀时间（dilatedTime）链路 —— **只读**运行探针。
 *
 * ── 这个探针要回答什么 ────────────────────────────────────────────────
 * V 的六项 mainUnlock 里，`dilatedTime` 项读的是
 * `player.records.thisReality.maxDT`（`secret-formula/celestials/v.js:74-82`），
 * 判据是 `emphasizeEnd(maxDT.pLog10() / 30) >= 1` ⇒ **`maxDT` 必须真的到 1e30 量级**。
 *
 * 前几轮（R35-S1 / R35-A2 / R34-B）的结论互相矛盾：
 *   · R35-S1：「DS1 从未被买上，`dilationUnlocked()` 恒 false」；
 *   · R36-A 实测（本仓 `oreki-eternity-automation.js` 已修 EC9 前置之后）：
 *     DS1 **确实买上了**（t=73s），`maxDT` 也真的涨到 **1e11.6**，
 *     但 t=162.9s 的一次现实把 `maxDT` 与 DS1 一起清零 ⇒ 归零。
 * 所以「dilatedTime 恒 0」的真实断点需要逐环实测：
 *
 *   ① DS1 买上了吗？（TT 够吗？EC11/EC12 5/5 了吗？231~234 买了吗？）
 *   ② 买上之后 `player.dilation.studies` 多久被清空一次？（实测秒数）
 *   ③ `startDilatedEternity` 有没有被调用过？（`dilStarts`）
 *   ④ `tickDilation()` 的 `gHold` / `gDilStarts` 为什么不动？（门禁计数）
 *   ⑤ `maxDT` 的**真实增速**是多少？（从 1e30 还差多少个数量级）
 *
 * 本模块提供这些读数，**严格只读**：不写 player / Currency / GameCache / 存档字段，
 * 不改任何倍率、门槛、解锁标志位。
 *
 * ── 怎么用（不在生产启动路径里）──────────────────────────────────────
 *   const m = await import("/src/core/oreki-dilation-probe.js");
 *   m.installOrekiDilatedProbe({ intervalMs: 1000 });
 *
 * 安装后：
 *   · `window.__orekiDilatedProbe` —— 采样数组（每条一个对象，序列化后即一行 JSON）
 *   · `window.__orekiDilatedProbeConfig` —— 改 `{ intervalMs }` 改采样间隔
 *   · console 输出一行 `[OREKI_DIL_PROBE] {json}`，便于外部按前缀收集
 */

/** 默认采样间隔（毫秒）。可由 window.__orekiDilatedProbeConfig.intervalMs 覆盖。 */
const DEFAULT_INTERVAL_MS = 1000;

/** 已经在页面里安装过（避免重复 import 时装两份）。 */
const INSTALL_FLAG = "__orekiDilatedProbeInstalled";

/**
 * 安全取一个 Decimal / number 的 log10。
 *
 * ⚠️ 不能先 `toNumber()` 再 `Math.log10()`：`maxDT` / `maxEP` 这类量级可以到
 * 1e1e6 以上，`toNumber()` 会溢出成 Infinity（这正是历次报告里
 * 「缺 maxDT 读数」的原因）。Decimal 自带 `log10()`，对任意量级都精确。
 *
 * 值为 0 时 log10 无穷（JSON 无法表示），统一返回 null。
 * @param {*} v
 * @returns {number|null}
 */
function safeLog10(v) {
  try {
    if (v === null || v === undefined) return null;
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
 * V 的六项 mainUnlock：`progress()` 原始值 + 对应的资源量。
 *
 * ⚠️ 注意：`emphasizeEnd(f) = f^10`，所以除 `realities` 之外，
 * 其余五项的 `progress()` 是「比值的 10 次方」，读数不是百分比。
 * 这里同时给出 `progress()`（判据用）与 `frac`（比值本身，便于人读）。
 */
function readVProgress() {
  const main = pick(() => GameDatabase.celestials.v.mainUnlock);
  if (!main) return null;
  const out = {};
  for (const key of Object.keys(main)) {
    const e = main[key];
    const p = pick(() => e.progress());
    const req = pick(() => e.requirement);
    const res = pick(() => e.resource());
    out[key] = {
      p: typeof p === "number" ? p : null,
      frac: pick(() => {
        // 反推比值：emphasizeEnd(f)=f^10 ⇒ f = p^(1/10)
        if (typeof p !== "number" || p <= 0) return null;
        return Math.pow(p, 0.1);
      }),
      reqL: safeLog10(req),
      resL: safeLog10(res),
      resRaw: safeStr(res),
    };
  }
  return out;
}

/**
 * DS1（膨胀研究 1）的购买条件三拆。
 * 源码：`secret-formula/eternity/time-studies/dilation-time-studies.js:6-18`
 *   · tsRequirement  = [231,232,233,234].some(isBought)
 *   · ecRequirement  = EC11.isFullyCompleted && EC12.isFullyCompleted
 *   · ttRequirement  = Currency.timeTheorems.max >= 12900
 */
function readDs1Gates() {
  const ds1 = pick(() => DilationTimeStudyState.studies[1]);
  return {
    tsBought: pick(() => [231, 232, 233, 234].filter(id => TimeStudy(id).isBought)),
    ec1112: pick(() => [EternityChallenge(11).completions, EternityChallenge(12).completions]),
    ecFull: pick(() => [EternityChallenge(11).isFullyCompleted === true,
      EternityChallenge(12).isFullyCompleted === true]),
    ttMaxL: pick(() => safeLog10(Currency.timeTheorems.max)),
    ttNeed: pick(() => TimeStudy.dilation.totalTimeTheoremRequirement),
    perkBypass: pick(() => Perk.bypassECDilation.canBeApplied === true),
    raAuto: pick(() => Ra.unlocks.autoUnlockDilation.canBeApplied === true),
    isBought: pick(() => ds1 ? ds1.isBought === true : null),
    canBeBought: pick(() => ds1 ? ds1.canBeBought === true : null),
    cost: pick(() => ds1 ? ds1.cost : null),
  };
}

/**
 * 采一条完整快照。
 * @param {object} ctx 探针运行时上下文
 * @returns {object}
 */
function sample(ctx) {
  const now = performance.now();
  const sec = (now - ctx.t0) / 1000;

  // ── 膨胀研究 / DS1 ──────────────────────────────────────────────────
  const studies = pick(() => Array.isArray(player.dilation.studies) ? player.dilation.studies.slice() : null);
  const maxDT = pick(() => player.records.thisReality.maxDT);

  // ── 膨胀状态机内部计数器 ────────────────────────────────────────────
  const deep = pick(() => globalThis.OrekiDilationAutomation?.debugState);
  const cel = pick(() => globalThis.OrekiCelestialAutomation?.debugState);

  // ── 现实节奏 ────────────────────────────────────────────────────────
  const realities = pick(() => player.realities);
  if (typeof realities === "number" && realities !== ctx.lastRealities) {
    ctx.lastRealities = realities;
    ctx.lastRealityAt = now;
  }

  return {
    // 时间轴（现实墙钟秒）
    t: Math.round(sec * 100) / 100,

    // ── 膨胀研究（DS1 是否在位）─────────────────────────────────────
    dilStudies: studies,
    dilStudiesLen: studies ? studies.length : null,
    dilUnlocked: pick(() => PlayerProgress.dilationUnlocked() === true),
    dilActive: pick(() => player.dilation.active === true),
    ds1: readDs1Gates(),

    // ── 膨胀时间（关键量）────────────────────────────────────────────
    maxDT: safeStr(maxDT),
    maxDTL: safeLog10(maxDT),
    dtL: pick(() => safeLog10(Currency.dilatedTime.value)),
    dtRateL: pick(() => safeLog10(getDilationGainPerSecond())),
    tpL: pick(() => safeLog10(Currency.tachyonParticles.value)),
    dtUpgRebuy: pick(() => JSON.parse(JSON.stringify(player.dilation.rebuyables || {}))),
    dtUpgSet: pick(() => JSON.parse(JSON.stringify(Array.from(player.dilation.upgrades || [])))),

    // ── DT 速率的乘子分解（回答「速率由什么决定」）────────────────────
    rate: {
      // 速子粒子（TP）是 DT 速率的**主项**（dilation.js:126）
      tpL: pick(() => safeLog10(Currency.tachyonParticles.value)),
      // tpGain = getTP(maxAM, true)：TP 是「本次永恒最大反物质」的函数
      tpGainL: pick(() => safeLog10(getTP(player.records.thisEternity.maxAM, true))),
      baseTpL: pick(() => safeLog10(getBaseTP(player.records.thisEternity.maxAM, true))),
      tachyonGainMultL: pick(() => safeLog10(tachyonGainMultiplier())),
      // 各倍率项的 log10
      dtGainL: pick(() => safeLog10(DilationUpgrade.dtGain.effectValue)),
      ach132L: pick(() => safeLog10(Achievement(132).effectOrDefault(1))),
      ach137L: pick(() => safeLog10(Achievement(137).effectOrDefault(1))),
      ru1L: pick(() => safeLog10(RealityUpgrade(1).effectOrDefault(1))),
      ru1Bought: pick(() => player.reality.rebuyables?.[1] ?? null),
      ru4Bought: pick(() => player.reality.rebuyables?.[4] ?? null),
      ru8Bought: pick(() => player.reality.rebuyables?.[8] ?? null),
      glyphDtL: pick(() => safeLog10(getAdjustedGlyphEffect("dilationDT"))),
      replFactorL: pick(() => safeLog10(Math.clampMin(
        Decimal.log10(Replicanti.amount) * getAdjustedGlyphEffect("replicationdtgain"), 1))),
      replAmountL: pick(() => safeLog10(Replicanti.amount)),
      achPowerL: pick(() => safeLog10(Achievements.power)),
      galaxies: pick(() => player.galaxies),
      // 膨胀升级的已买集合（ndMultDT=6 / ipMultDT=7 是正反馈的关键）
      ndMultDT: pick(() => DilationUpgrade.ndMultDT.isBought === true),
      ipMultDT: pick(() => DilationUpgrade.ipMultDT.isBought === true),
      dtGainBought: pick(() => player.dilation.rebuyables?.[1] ?? null),
      tachyonGainBought: pick(() => player.dilation.rebuyables?.[3] ?? null),
      // 各膨胀升级是否买得起（真实 cost，不买）
      canNdMult: pick(() => Currency.dilatedTime.gte(DilationUpgrade.ndMultDT.cost)),
      canIpMult: pick(() => Currency.dilatedTime.gte(DilationUpgrade.ipMultDT.cost)),
      canDtGain: pick(() => Currency.dilatedTime.gte(DilationUpgrade.dtGain.cost)),
      canTachyonGain: pick(() => Currency.dilatedTime.gte(DilationUpgrade.tachyonGain.cost)),
    },

    // ── 状态机内部计数器（gates / 起步次数）──────────────────────────
    gates: pick(() => JSON.parse(JSON.stringify(cel?.gates || {}))),
    dilStarts: pick(() => cel?.dilationStarts ?? null),
    dilTpSeeds: pick(() => cel?.dilationTpSeeds ?? null),
    holdV: pick(() => cel?.holdRealityForV === true),
    holdDeep: pick(() => cel?.holdRealityForDeepChallenge === true),
    vEligible: pick(() => cel?.vFinishEligible === true),
    vGraceSince: pick(() => cel?.vGraceSince ?? null),
    deepState: deep ? {
      phase: deep.phase,
      holdActive: deep.holdActive,
      holdForMs: deep.holdForMs,
      targetEc: deep.targetEc,
      actions: deep.actions,
      releases: deep.releases,
      lastRelease: deep.lastRelease,
      lastStart: deep.lastStart,
      earlyAttempts: deep.earlyAttempts,
      step: deep.step,
      lastError: deep.lastError,
    } : null,

    // ── EC 链 ────────────────────────────────────────────────────────
    ecDone: readEcDone(),
    ecUnlocked: pick(() => player.challenge.eternity.unlocked),
    ecCurrent: pick(() => player.challenge.eternity.current),
    ecRunning: pick(() => EternityChallenge.isRunning === true),

    // ── 现实节奏 ──────────────────────────────────────────────────────
    realities,
    sinceRealitySec: ctx.lastRealityAt ? Math.round((now - ctx.lastRealityAt) / 100) / 100 : null,

    // ── 资源（用于判定 DT 增速是否够）────────────────────────────────
    ttMaxL: pick(() => safeLog10(Currency.timeTheorems.max)),
    ttL: pick(() => safeLog10(Currency.timeTheorems.value)),
    epL: pick(() => safeLog10(Currency.eternityPoints.value)),
    maxEtAmL: pick(() => safeLog10(player.records.thisEternity.maxAM)),
    amL: pick(() => safeLog10(Currency.antimatter.value)),
    infTotalL: pick(() => safeLog10(Currency.infinitiesTotal.value)),
    ipL: pick(() => safeLog10(Currency.infinityPoints.value)),
    rmL: pick(() => safeLog10(Currency.realityMachines.value)),
    repL: pick(() => safeLog10(Replicanti.amount)),
    maxRepL: pick(() => safeLog10(player.records.thisReality.maxReplicanti)),
    canEternity: pick(() => Player.canEternity === true),

    // ── V 六项 ────────────────────────────────────────────────────────
    v: readVProgress(),
    vUnlocked: pick(() => VUnlocks.vAchievementUnlock.isUnlocked === true),
    vCanUnlock: pick(() => V.canUnlockCelestial === true),

    // ── 其它 ──────────────────────────────────────────────────────────
    speed: pick(() => getGlobalSpeedFactor()),
    lastUpdate: pick(() => player.lastUpdate),
  };
}

/**
 * 安装探针。
 * @param {{intervalMs?: number}} [options]
 * @returns {object} 探针句柄（便于测试脚本 stop）
 */
export function installOrekiDilatedProbe(options = {}) {
  const w = window;
  if (w[INSTALL_FLAG]) return w[INSTALL_FLAG].handle;

  const cfg = Object.assign({ intervalMs: DEFAULT_INTERVAL_MS }, options);
  w.__orekiDilatedProbeConfig = Object.assign(w.__orekiDilatedProbeConfig || {}, cfg);
  w.__orekiDilatedProbe = w.__orekiDilatedProbe || [];

  const ctx = {
    t0: performance.now(),
    lastRealities: pick(() => player.realities),
    lastRealityAt: performance.now(),
    lastSampleAt: 0,
  };

  const handle = { context: ctx };

  const tick = () => {
    try {
      const interval = Math.max(50, Number(w.__orekiDilatedProbeConfig?.intervalMs) || DEFAULT_INTERVAL_MS);
      const now = performance.now();
      if (now - ctx.lastSampleAt < interval) return;
      ctx.lastSampleAt = now;
      const snap = sample(ctx);
      w.__orekiDilatedProbe.push(snap);
      console.log(`[OREKI_DIL_PROBE] ${JSON.stringify(snap)}`);
    } catch (e) {
      console.warn("[OREKI_DIL_PROBE] 采样异常：", e && e.message);
    }
  };

  EventHub.logic.on(GAME_EVENT.GAME_TICK_AFTER, tick, handle);

  handle.stop = () => {
    try {
      EventHub.logic.offAll(handle);
    } catch (e) { /* ignore */ }
    w.__orekiDilatedProbeInstalled = undefined;
  };
  w[INSTALL_FLAG] = { handle };
  console.log(`[OREKI_DIL_PROBE] 已安装，采样间隔 ${cfg.intervalMs} ms`);
  return handle;
}

export default installOrekiDilatedProbe;
