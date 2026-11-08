// ---------------------------------------------------------------------------
// [R96] 智能大坍缩决策（Web 侧，与 Android OrekiCrunchPolicy 语义等价）
//
// 玩家反馈：自动大坍缩在大部分时间里只是打断成长。这里把「要不要坍缩」从
// 固定节奏改成目标驱动；所有判据来自原版真实状态（挑战 / ID 解锁门槛 /
// 永恒前判据 / 已 Break），不写游戏内时间点、不以重置次数作为性能依据。
//
// 规则优先级（与 Android OrekiCrunchPolicy 完全一致）：
//   1. 挑战运行中             → 放行（挑战结算不能被普通收益策略拦截）
//   2. 未 Break               → 放行（首次无限前 break 同样为 false，坍缩是攒 IP 的唯一入口）
//   3. 已进入永恒层           → 放行（节奏交给阶段自动化）
//   4. 本永恒 maxIP 已达永恒门槛（canEternity）→ 放行，让原版立刻结算永恒
//   5. 下一个未解锁无限维度（tier 1..8）：
//      a. 反物质峰值已达标   → 放行（解锁不会被坍缩破坏）
//      b. IP 已够、只差峰值  → 等待（15 分钟上限，超时放行一次）
//      c. 其余               → 放行（IP 还不够，坍缩是攒 IP 的唯一入口）
//   6. 8 个维度全部解锁：一次坍缩至少让 IP 涨 10 倍 → 放行；
//      否则等待反物质成长（3 分钟上限，超时放行一次）
//   7. 任何判据读取异常 → fail-closed 阻止（reason 以 `exception:` 开头）
//
// 为什么等待必须带上限：目标驱动策略在「等峰值 / 等收益」时会暂停坍缩，
// 判据一旦误判（门槛读错、阶段判断错），无限等待会把通关永久卡死
// （R96 实测 Android 端 IP 冻结 46 分钟）。上限用真实墙钟累计，不用帧数或
// 游戏内时间（帧率与倍速都会变）。数值与 Android 一致：15 分钟 / 3 分钟。
//
// 只读，不修改玩家设置、不写存档字段；节奏仍由原版自动器执行。
// ---------------------------------------------------------------------------

const TAG = "OREKI_CRUNCH_DEC";

/** ID 峰值等待上限：15 分钟（与 Android `PEAK_WAIT_LIMIT_NS` 的 900000 ms 一致）。 */
const PEAK_WAIT_LIMIT_MS = 900000;

/** 收益等待上限：3 分钟（与 Android `GAIN_WAIT_LIMIT_NS` 的 180000 ms 一致）。 */
const GAIN_WAIT_LIMIT_MS = 180000;

/** 上一次打印的决策（只用于节流日志：状态翻转才打印）。 */
let lastKey = null;

/** 当前连续等待的开始时刻（单调时钟毫秒）；null 表示没有在等待。 */
let waitStartedAt = null;

function throttleLog(decision) {
  const key = `${decision.allow}:${decision.reason}`;
  if (key === lastKey) return;
  lastKey = key;
  console.info(`[${TAG}] allow=${decision.allow} reason=${decision.reason}`);
}

/**
 * 单调时钟毫秒：优先 `performance.now()`（不受系统时间跳变影响），
 * 没有 performance 时退化到 `Date.now()`（Node 测试环境同样可用）。
 */
function monotonicNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export class OrekiCrunchPolicy {
  static decide() {
    let decision;
    try {
      decision = this.evaluate();
    } catch (e) {
      decision = { allow: false, reason: `exception:${e && e.name ? e.name : "unknown"}` };
    }
    // 只要放行，就结束本轮连续等待（与 Android 各放行分支的 waitStartedAt = 0 同义）。
    if (decision.allow) waitStartedAt = null;
    throttleLog(decision);
    return decision;
  }

  static evaluate() {
    // 1) 挑战结算优先：挑战里坍缩是完成的唯一手段。
    if (NormalChallenge.isRunning || InfinityChallenge.isRunning) {
      return { allow: true, reason: "challenge-running" };
    }
    // 2) 首次 Break 之前（含首次无限之前）：坍缩是攒 IP 的唯一入口。
    if (!player.break) return { allow: true, reason: "pre-break-ip" };
    // 3) 已进入永恒层：节奏交给阶段自动化，本策略不再拦截。
    if (PlayerProgress.eternityUnlocked()) return { allow: true, reason: "post-eternity" };

    // 4) 首次永恒前：本永恒 maxIP 已达到 `Player.eternityGoal`（= Player.canEternity）
    //    → 立刻放行，让原版 canEternity + 自动永恒结算接手。
    if (Player.canEternity) return { allow: true, reason: "eternity-ready" };

    // 5) 下一个未解锁的无限维度：按「峰值 → IP → 生长」排序。
    const pending = this.nextLockedDimension();
    if (pending !== null) {
      const maxAM = player.records.thisEternity.maxAM;
      // a. 峰值达标：解锁不会被坍缩破坏，随时可以坍缩。
      if (maxAM.gte(pending.peakRequirement)) {
        return { allow: true, reason: "id-peak-reached" };
      }
      // b. IP 已够、只差反物质峰值：此刻坍缩会重置反物质、推迟解锁窗口（带上限）。
      if (Currency.infinityPoints.value.gte(pending.ipRequirement)) {
        return this.waitWithin("id-peak-wait", PEAK_WAIT_LIMIT_MS);
      }
      // c. IP 还不够：坍缩是攒 IP 的唯一入口。
      return { allow: true, reason: "id-ip-farm" };
    }

    // 6) 8 个维度全部解锁：只在这拍坍缩至少让 IP 涨一个数量级时结算。
    const leap = this.gainVersusIp();
    if (leap !== null && leap >= 1) return { allow: true, reason: "ip-jump" };
    return this.waitWithin("gain-wait", GAIN_WAIT_LIMIT_MS);
  }

  /**
   * 连续等待 + 上限：等待超过 `limitMs` 后放行一次（`stall-<reason>`），
   * 避免判据误判导致永久停摆。与 Android `waitWithin` 同语义；计时用单调时钟。
   */
  static waitWithin(reason, limitMs) {
    const now = monotonicNowMs();
    if (waitStartedAt === null) {
      waitStartedAt = now;
    } else if (now - waitStartedAt >= limitMs) {
      waitStartedAt = null;
      return { allow: true, reason: `stall-${reason}` };
    }
    return { allow: false, reason };
  }

  /**
   * `log10(gainedInfinityPoints) - log10(当前 IP)`：本次坍缩相对现有余额的数量级差。
   * 读不到返回 null（调用方按「收益不够」处理，等上限兜底）。
   *
   * 数值口径与 Android `gainVersusIp` 一致（原版 `BigDouble.log10()`）。
   *
   * 取值路径：`gainedInfinityPoints` 是 `game.js` 的导出，由 `merge-globals.js`
   * 挂到全局（与本文件其它原版全局同一条路；`big-crunch-autobuyer.js` 原版代码本来
   * 就是这样直接调用它的），所以这里直接调用全局函数、不 `import` game.js —— 避免
   * `game.js → autobuyers → big-crunch-autobuyer → 本模块 → game.js` 的 ESM 循环依赖。
   * 同一函数对象、同一公式，不另写一份换算。
   */
  static gainVersusIp() {
    if (typeof gainedInfinityPoints !== "function") return null;
    const gained = gainedInfinityPoints();
    const ip = Currency.infinityPoints.value;
    if (gained === null || gained === undefined || ip === null || ip === undefined) return null;
    return gained.log10() - ip.log10();
  }

  /**
   * 找出「下一个未解锁的无限维度」及其门槛。
   * 峰值门槛取原版 `amRequirement`（原版 `canUnlock` / `antimatterRequirementReached` 判的就是它，
   * Android 侧对应 `ID.k()`），IP 门槛取原版 `ipRequirement`。
   */
  static nextLockedDimension() {
    for (let tier = 1; tier <= 8; tier++) {
      const id = InfinityDimension(tier);
      if (id.isUnlocked) continue;
      return { tier, peakRequirement: id.amRequirement, ipRequirement: id.ipRequirement };
    }
    return null;
  }
}
