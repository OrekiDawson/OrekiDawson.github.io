// ---------------------------------------------------------------------------
// [R97] 目标驱动型智能自动购买器 —— 受托管原版自动器「启用状态」统一管理（Web）
//
// 与 Android `OrekiStageAuto.applyManagedAutobuyerStates()` / `OrekiPlayerIntent`
// 的受管启用状态机**逐条等价**（改任一侧必须同步另一侧）：
//   1. 每帧读每项的**真实** isActive 与当前阶段策略期望；
//   2. 策略要求开、玩家刚关 → **本帧只登记**，不抢写；
//   3. **下一次策略 tick**（严格 `now > recordedAt`）才按最新目标恢复一次，
//      消费即清除登记，绝不在同一登记上重复写；
//   4. 两个总开关（MOD 总开关 / 原版自动购买器总开关）任一关闭 →
//      **整体不接管**：不写、不登记、也不消费已有登记；
//   5. 策略要求保持关闭（如策略暂停期的坍缩）→ 清登记、绝不强行开启；
//      未解锁 / 取不到的项 → 跳过（fail-closed）；
//   6. 已在期望状态 → 不写、不持久化（幂等，避免逐帧抖动与重复写盘）；
//   7. 覆盖项：反物质维度 ×8、计数频率、维度提升、星系、献祭、
//      自动大坍缩（受 `wantCrunch` 控制）、无限点数倍率（恒 true）；
//   8. **一套**按键索引状态机服务所有受托管项，不为每项复制一套；
//   9. 本模块只在原版自动购买器配置优化路径上调用，**不经过**
//      MOD 全局 1～60 秒行动节拍（不包进 `OrekiSmartExecutor.runCycle` / `allow()`），
//      原版 `Autobuyers.tick()` 仍按自身机制与间隔执行购买。
//
// 为什么 Web 需要它（R97 实测缺口）：
//   Web 端此前**完全没有**受管自动器启用状态管理 —— 玩家手动关掉任何一项后
//   没有任何恢复链路；也没有统一归属记账，任何后续模块想「顺手打开」都只能
//   各自写一套，必然重演 Android 上「IP 倍率立即重开 / 其余永不恢复」的分裂。
//   本模块是唯一写入口：除 IU15 冲刺的临时封锁外，MOD 不再从别处写这些 isActive。
// ---------------------------------------------------------------------------

const TAG = "OREKI_MANAGED_AUTO";

/** 受托管项的固定键序（仅用于自检/面板展示；读写仍按实际枚举）。 */
export const MANAGED_KEYS = Object.freeze([
  "dim1", "dim2", "dim3", "dim4", "dim5", "dim6", "dim7", "dim8",
  "tickspeed", "dimboost", "galaxy", "sacrifice", "crunch", "ipmult",
]);

const STATE = {
  /** key → 登记时刻（单调时钟毫秒）。同一 key 只保留一条，重复登记不刷新时间点。 */
  pending: new Map(),
  /** 统计：登记次数 / 恢复次数 / 真正写入次数 / 驱动帧数 / 跳过项数。 */
  defers: 0,
  restores: 0,
  writes: 0,
  ticks: 0,
  skips: 0,
  lastTickAt: 0,
};

/** 单调时钟毫秒；只用于比较先后，不写存档、不影响游戏时间。 */
function monotonicNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/** 日志里的时间统一保留 1 位小数，避免不同浏览器打印位数不一致。 */
function fmtMs(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : "NaN";
}

/** 日志统一出口：每条都带 key 与 nowMs（缺任一项会被日志去重/看不清时序）。 */
function logLine(message) {
  try {
    console.info(`[${TAG}] ${message}`);
  } catch (e) {
    // 非浏览器环境忽略
  }
}

/**
 * 登记「策略要求开、但玩家把该项关掉了」。
 *
 * 同一 key 已登记时**不刷新时间点**（防止玩家连续微调导致永远等不到恢复），
 * 返回 false 表示本次没有新增登记。
 *
 * @param {string} key 受托管键（dim1..dim8 / tickspeed / dimboost / galaxy / sacrifice / crunch / ipmult）
 * @param {number} [nowMs] 登记时刻；测试可注入
 * @returns {boolean} true = 本次真的登记了
 */
export function noteManagedActiveDisabled(key, nowMs = monotonicNow()) {
  if (!key) return false;
  if (STATE.pending.has(key)) return false;
  STATE.pending.set(key, nowMs);
  STATE.defers += 1;
  logLine(`key=${key} nowMs=${fmtMs(nowMs)} event=player-disable-recorded`);
  return true;
}

/**
 * 是否到恢复时机：严格晚于登记时刻（`nowMs <= at` 一律 false），到点只返回一次。
 * 消费即删除登记，保证「只恢复一次」。
 *
 * @param {string} key 受托管键
 * @param {number} [nowMs] 当前时刻；测试可注入
 * @returns {boolean} true = 本次应当恢复一次
 */
export function consumeManagedActiveRestoreDue(key, nowMs = monotonicNow()) {
  const at = STATE.pending.get(key);
  if (at === undefined) return false;
  if (nowMs <= at) return false;
  STATE.pending.delete(key);
  STATE.restores += 1;
  logLine(`key=${key} nowMs=${fmtMs(nowMs)} event=restore-due`);
  return true;
}

/**
 * 清空登记。策略要求关闭、或已处于期望状态时调用，绝不残留成「稍后强行开启」。
 *
 * @param {string} key 受托管键
 * @param {number} [nowMs] 仅用于日志时序
 * @returns {boolean} true = 确实清掉了一条登记
 */
export function clearManagedActivePending(key, nowMs = monotonicNow()) {
  if (!STATE.pending.has(key)) return false;
  STATE.pending.delete(key);
  logLine(`key=${key} nowMs=${fmtMs(nowMs)} event=pending-cleared`);
  return true;
}

/** 当前是否有待恢复登记（只读）。 */
export function isManagedActivePending(key) {
  return STATE.pending.has(key);
}

/** 面板/日志用摘要（与 Android `describeManagedActive()` 同格式）。 */
export function describeManagedActive() {
  return `pending=[${Array.from(STATE.pending.keys()).join(",")}] ` +
    `defers=${STATE.defers} restores=${STATE.restores} writes=${STATE.writes}`;
}

/** 结构化只读状态，便于控制台验收。 */
export function debugState() {
  return {
    pending: Array.from(STATE.pending.entries()).map(([key, at]) => ({ key, at })),
    defers: STATE.defers,
    restores: STATE.restores,
    writes: STATE.writes,
    ticks: STATE.ticks,
    skips: STATE.skips,
    lastTickAt: STATE.lastTickAt,
  };
}

/**
 * 单项对账：读真实状态 → 记录 / 恢复 / 不动。
 *
 * @param {string} key 受托管键
 * @param {boolean} isActive 真实 isActive
 * @param {boolean} wantOn 策略期望是否开启
 * @param {(value: boolean) => void} setActive 唯一写入口
 * @param {number} [nowMs] 当前时刻
 * @returns {boolean} true = 本次真的写了一次
 */
export function reconcile(key, isActive, wantOn, setActive, nowMs = monotonicNow()) {
  if (!key || typeof setActive !== "function") return false;
  // 策略要求关闭、或已在期望状态：只清登记，绝不写（用户第 5/6 条）。
  if (!wantOn || isActive === true) {
    clearManagedActivePending(key, nowMs);
    return false;
  }
  // 到这里：策略要求开、但实际是关的。
  if (consumeManagedActiveRestoreDue(key, nowMs)) {
    try {
      setActive(true);
    } catch (e) {
      logLine(`key=${key} nowMs=${fmtMs(nowMs)} event=write-failed error=${e && e.name ? e.name : "unknown"}`);
      return false;
    }
    STATE.writes += 1;
    logLine(`key=${key} nowMs=${fmtMs(nowMs)} event=isActive-reenabled`);
    return true;
  }
  // 本帧只登记；下一次策略 tick 才写入（用户第 2/3 条）。
  noteManagedActiveDisabled(key, nowMs);
  return false;
}

/** 取自动器注册表：优先调用方注入（便于纯逻辑自检），其次全局。 */
function resolveAutobuyers(explicit) {
  if (explicit) return explicit;
  return globalThis.Autobuyer || null;
}

/**
 * IU15「理想之构」冲刺期间，冲刺模块会主动关闭 ID1~ID8 的自动器来锁住购买入口。
 * 本模块**必须让路**：否则每两帧就把开关抢回去，冲刺直接失效（多模块抢写，用户第 9 条）。
 */
function isIu15SprintLocking() {
  try {
    return globalThis.OrekiIu15Sprint && globalThis.OrekiIu15Sprint.active === true;
  } catch (e) {
    return false;
  }
}

/** 佩勒毁灭态里终局模块**有意**关闭大坍缩自动器（保持反物质单调增长），本模块不得重开。 */
function isPelleDoomed() {
  try {
    return typeof Pelle !== "undefined" && Pelle && Pelle.isDoomed === true;
  } catch (e) {
    return false;
  }
}


/**
 * 每帧驱动：枚举全部受托管项，按真实状态与期望状态统一对账。
 *
 * **必须**在 `OrekiSmartExecutor.runCycle()` 之外调用；本函数不产生游戏动作，
 * 只维护原版自动器的启用开关。两个总开关任一关闭时直接返回，**不消费登记**。
 *
 * @param {object} [options]
 * @param {boolean} [options.wantCrunch] 当前阶段策略是否要求大坍缩运行（`OrekiCrunchPolicy.decide().allow`）
 * @param {object} [options.autobuyers] 自动器注册表（默认 `globalThis.Autobuyer`）
 * @param {number} [options.nowMs] 当前时刻；测试可注入
 * @returns {{applied: boolean, reason: string, checked: number, wrote: number, skipped: number}}
 */
export function applyAll({ wantCrunch = false, autobuyers = null, nowMs = monotonicNow() } = {}) {
  STATE.ticks += 1;
  STATE.lastTickAt = nowMs;

  // 闸门一：MOD 总开关。取不到执行层也按关闭处理（fail-closed）。
  const executor = globalThis.OrekiSmartExecutor;
  if (!executor || executor.enabled === false) {
    return { applied: false, reason: "mod-off", checked: 0, wrote: 0, skipped: 0 };
  }
  // 闸门二：原版自动购买器总开关。必须严格为 true。
  let vanillaOn = false;
  try {
    vanillaOn = typeof player !== "undefined" && player && player.auto &&
      player.auto.autobuyersOn === true;
  } catch (e) {
    vanillaOn = false;
  }
  if (!vanillaOn) {
    return { applied: false, reason: "vanilla-off", checked: 0, wrote: 0, skipped: 0 };
  }

  const root = resolveAutobuyers(autobuyers);
  if (!root) return { applied: false, reason: "no-registry", checked: 0, wrote: 0, skipped: 0 };

  // 与其它模块的主动封锁协调：冲刺期间整体让路，同样不消费登记。
  if (isIu15SprintLocking()) {
    return { applied: false, reason: "iu15-sprint", checked: 0, wrote: 0, skipped: 0 };
  }
  // 毁灭态里大坍缩自动器由终局模块有意关闭，本模块对它保持“策略要求关闭”。
  const wantCrunchNow = wantCrunch === true && !isPelleDoomed();

  let checked = 0;
  let wrote = 0;
  let skipped = 0;

  /** 单项：取不到 / 未解锁 → 跳过，且不碰登记（fail-closed）。 */
  /**
   * 单项对账。`group` 非空时，启用状态读写的**唯一真值**是组级开关（反物质维度
   * 8 个自动器共用 `Autobuyer.antimatterDimension.isActive` 一个 checkbox）。
   */
  const each = (key, item, wantOn, group = null) => {
    checked += 1;
    try {
      if (!item) {
        skipped += 1;
        return;
      }
      const unlocked = item.isUnlocked === true || item.isBought === true;
      if (!unlocked) {
        skipped += 1;
        return;
      }
      const active = group ? group.read() : item.isActive === true;
      const didWrite = reconcile(key, active, wantOn, value => {
        if (group) group.write(value);
        else item.isActive = value;
      }, nowMs);
      if (didWrite) wrote += 1;
    } catch (e) {
      skipped += 1;
      STATE.skips += 1;
      logLine(`key=${key} nowMs=${fmtMs(nowMs)} event=reconcile-failed error=${e && e.name ? e.name : "unknown"}`);
    }
  };

  // 反物质维度 ×8。
  //
  // [R97 修复·真语义缺口] Web 原版给 8 个反物质维度自动器**没有各自可见的开关**：
  // UI 的组复选框与 `AutobuyerState.canTick` 的组闸门读的都是
  // `Autobuyer.antimatterDimension.isActive`（accessor 静态口 →
  // `player.auto.antimatterDims.isActive`），而每一层的 `data.isActive` 只是内部字段。
  // 玩家点「反物质维度」那一个 checkbox 时，8 个 `data.isActive` 完全不变；
  // 若按每层 isActive 判断，模块会误判「还开着」→ 永远不登记、不恢复，
  // 正好复现本模块要消灭的「玩家关掉后再也回不来」。
  // 所以 8 个 dim 键共用**组级**读写口，键数仍是 14（便于与 Android 逐项核对）。
  const dims = root.antimatterDimension;
  const dimsGroup = (() => {
    try {
      // 只有真实 accessor（defineProperties 定义的布尔 getter）才走组级口；
      // 测试替身/旧结构没有该属性时退回每层，行为与旧版一致。
      if (dims && typeof dims.isActive === "boolean") {
        return {
          read: () => dims.isActive === true,
          write: value => { dims.isActive = value; },
        };
      }
    } catch (e) {
      // 读不到就退回每层（fail-open 到旧行为，不会写坏存档）
    }
    return null;
  })();
  for (let tier = 1; tier <= 8; tier += 1) {
    let dim = null;
    try {
      dim = typeof dims === "function" ? dims(tier) : (dims && (dims[tier - 1] || dims[tier])) || null;
    } catch (e) {
      dim = null;
    }
    each(`dim${tier}`, dim, true, dimsGroup);
  }

  each("tickspeed", root.tickspeed, true);
  each("dimboost", root.dimboost, true);
  each("galaxy", root.galaxy, true);
  each("sacrifice", root.sacrifice, true);
  each("crunch", root.bigCrunch, wantCrunchNow);
  // 无限点数倍率与其它项共用同一套延迟状态机（用户第 5 条）。
  each("ipmult", root.ipMult, true);

  return { applied: true, reason: "ok", checked, wrote, skipped };
}

/** 仅供自检/测试复位。 */
export function resetForTest() {
  STATE.pending.clear();
  STATE.defers = 0;
  STATE.restores = 0;
  STATE.writes = 0;
  STATE.ticks = 0;
  STATE.skips = 0;
  STATE.lastTickAt = 0;
}

try {
  globalThis.OrekiManagedAutobuyerState = {
    MANAGED_KEYS,
    noteManagedActiveDisabled,
    consumeManagedActiveRestoreDue,
    clearManagedActivePending,
    isManagedActivePending,
    describeManagedActive,
    debugState,
    reconcile,
    applyAll,
    resetForTest,
  };
} catch (e) {
  // 非浏览器环境忽略
}
