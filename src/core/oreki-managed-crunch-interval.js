// ---------------------------------------------------------------------------
// [R96 第三十四轮] 大坍缩「受管节拍」—— Web 侧
//
// 与 Android `OrekiStageAuto.writeManagedCrunchInterval()` 语义**逐条等价**
// （改任一侧必须同步另一侧）：
//   1. 每帧读**实际值**（`player.auto.bigCrunch.time`），按当帧目标算期望值；
//   2. 实际值既不是「MOD 上次写入值」也不是「策略目标值」⇒ 判定玩家手改；
//   3. 玩家手改后**本帧不抢写**，只登记「下一次策略 tick 再恢复」（只登记一次）；
//   4. 到点后按**届时最新**目标写回一次，然后归属交还 MOD；
//   5. 实际值已等于目标 ⇒ 不写、不持久化（避免逐帧抖动）；
//   6. 只覆盖这一项受管参数，不碰模式、不碰其他原版设置、不擅自开自动器。
//
// 归属（§80.2 / §81）：这是**目标驱动型智能自动购买器**的受管参数，
// **不经过** MOD 全局 1～60 秒行动节拍（不包进 `OrekiSmartExecutor.runCycle`）。
// 原版 `Autobuyers.tick()` 仍按自身机制、自身间隔执行购买与坍缩。
//
// 为什么需要它（玩家实测缺口）：
//   旧实现只有「要不要坍缩」的目标判定（`OrekiCrunchPolicy.decide()`），
//   完全没有任何「间隔托管」代码；玩家把间隔手改后既不会被保留记账，
//   也不会按目标恢复，表现为「间隔一旦被动过就长期偏离策略意图」。
// ---------------------------------------------------------------------------

import { OrekiCrunchPolicy } from "./oreki-crunch-policy.js";

/** 与 Android 常量同名同值（PRE_BREAK / POST_BREAK / ETERNITY_GROW / PAUSE）。 */
export const CRUNCH_PRE_BREAK_SECONDS = 60;
export const CRUNCH_POST_BREAK_SECONDS = 5;
export const CRUNCH_ETERNITY_GROW_SECONDS = 30;
export const CRUNCH_PAUSE_SECONDS = 3600;

const STATE = {
  /** MOD 上次写入（或首观测基线）的间隔；NaN = 尚未观测。 */
  written: NaN,
  /** 玩家是否占用中（TRUE 期间 MOD 不写）。 */
  playerOwned: false,
  /** 待恢复时间点（ms）；0 = 无。 */
  restoreAtMs: 0,
  /** 统计：真正写入次数 / 跳过次数。 */
  writes: 0,
  skips: 0,
  /** 最近一次原因，便于面板/日志。 */
  lastReason: "",
  /** 恢复计数（证明「只恢复一次」）。 */
  restores: 0,
};

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function sameInterval(a, b) {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 1e-9;
}

/** 读原版真实间隔；读不到返回 null（fail-closed，不猜）。 */
function readActualInterval() {
  try {
    const data = player && player.auto && player.auto.bigCrunch;
    const t = data && data.time;
    return Number.isFinite(t) ? t : null;
  } catch (e) {
    return null;
  }
}

function writeActualInterval(seconds) {
  player.auto.bigCrunch.time = seconds;
}

/** MOD 全局节拍秒数：**只**用来当「下一次 tick」的时长标尺，绝不读改其语义。 */
function globalIntervalSec() {
  try {
    const v = globalThis.OrekiSmartExecutor && globalThis.OrekiSmartExecutor.intervalSec;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 60 ? n : 10;
  } catch (e) {
    return 10;
  }
}

export class OrekiManagedCrunchInterval {
  /**
   * 每帧调用（配置优化路径，**不要**包进 runCycle）。
   *
   * @param {number} desiredSeconds 当帧策略期望的间隔（秒）
   * @param {string} reason 归因，仅用于日志
   * @returns {boolean} true = 本次真的写了；false = 跳过（相等/被玩家占用/读不到）
   */
  static apply(desiredSeconds, reason) {
    if (!Number.isFinite(desiredSeconds)) return false;
    const actual = readActualInterval();
    if (actual === null) return false;

    // ---- 归属判定（含首观测基线采纳，跨刷新后才认得出玩家改动）----
    if (Number.isNaN(STATE.written)) {
      STATE.written = actual;
    } else if (!sameInterval(actual, STATE.written) && !sameInterval(actual, desiredSeconds)) {
      if (!STATE.playerOwned) {
        STATE.playerOwned = true;
        console.info(
          `[OrekiCrunchInterval] player changed interval actual=${actual} ` +
            `modWrote=${STATE.written} target=${desiredSeconds} -> defer to next strategy tick`
        );
      }
    }

    // ---- 恢复时机 ----
    let restoreDue = false;
    if (STATE.restoreAtMs !== 0 && nowMs() >= STATE.restoreAtMs) {
      STATE.restoreAtMs = 0;
      STATE.playerOwned = false;
      STATE.restores += 1;
      restoreDue = true;
      console.info("[OrekiCrunchInterval] restore due -> apply latest strategy value");
    }

    // ---- 玩家占用中：不抢写，只登记一次恢复时机 ----
    if (STATE.playerOwned) {
      if (STATE.restoreAtMs === 0) {
        STATE.restoreAtMs = nowMs() + globalIntervalSec() * 1000;
        console.info(
          `[OrekiCrunchInterval] defer restore +${globalIntervalSec()}s (actual=${actual})`
        );
      }
      STATE.skips += 1;
      return false;
    }

    // ---- 相等则不写、不持久化 ----
    if (sameInterval(actual, desiredSeconds)) {
      STATE.written = actual;
      STATE.skips += 1;
      return false;
    }

    writeActualInterval(desiredSeconds);
    STATE.written = desiredSeconds;
    STATE.writes += 1;
    STATE.lastReason = reason;
    console.info(
      `[OrekiCrunchInterval] managed interval ${actual} -> ${desiredSeconds} ` +
        `(${reason}${restoreDue ? ", restore" : ""})`
    );
    return true;
  }

  /**
   * 按当帧策略判定算出期望间隔并托管写入。
   *
   * 与 Android `applyCrunchPolicy()` 的分支同序：
   *   不允许坍缩 → 永恒层等待用 30 秒、其余用 1 小时硬暂停；
   *   允许坍缩   → Break 前 60 秒收割、Break 后 5 秒下限。
   */
  static applyFromPolicy() {
    let decision;
    try {
      decision = OrekiCrunchPolicy.decide();
    } catch (e) {
      return false;
    }
    if (!decision) return false;
    if (!decision.allow) {
      const seconds =
        decision.reason === "eternity-grow"
          ? CRUNCH_ETERNITY_GROW_SECONDS
          : CRUNCH_PAUSE_SECONDS;
      return OrekiManagedCrunchInterval.apply(seconds, `pause:${decision.reason}`);
    }
    const seconds =
      typeof player !== "undefined" && player.break
        ? CRUNCH_POST_BREAK_SECONDS
        : CRUNCH_PRE_BREAK_SECONDS;
    return OrekiManagedCrunchInterval.apply(seconds, `resume:${decision.reason}`);
  }

  static describe() {
    return {
      written: STATE.written,
      playerOwned: STATE.playerOwned,
      pendingRestore: STATE.restoreAtMs !== 0,
      writes: STATE.writes,
      skips: STATE.skips,
      restores: STATE.restores,
      lastReason: STATE.lastReason,
    };
  }

  static resetForTest() {
    STATE.written = NaN;
    STATE.playerOwned = false;
    STATE.restoreAtMs = 0;
    STATE.writes = 0;
    STATE.skips = 0;
    STATE.restores = 0;
    STATE.lastReason = "";
  }
}

try {
  globalThis.OrekiManagedCrunchInterval = OrekiManagedCrunchInterval;
} catch (e) {
  // 非浏览器环境忽略
}
