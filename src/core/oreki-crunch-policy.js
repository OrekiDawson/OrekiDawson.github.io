// ---------------------------------------------------------------------------
// [R96] 智能大坍缩决策（Web 侧，与 Android OrekiCrunchPolicy 语义等价）
//
// 玩家反馈：自动大坍缩在大部分时间里只是打断成长。这里把「要不要坍缩」从
// 固定节奏改成目标驱动；所有判据来自原版真实状态（挑战 / ID 解锁门槛 /
// 永恒前判据 / 已 Break），不写游戏内时间点、不以重置次数作为性能依据。
//
// 规则优先级（与 Android OrekiCrunchPolicy 逐条同序，改顺序必须双端同步）：
//   1. 挑战运行中             → 放行 challenge-running（挑战结算不能被收益策略拦截）
//   2. 尚未完成首次无限        → 放行 pre-infinity（坍缩是进入无限层的唯一入口）
//   3. 未 Break               → 放行 pre-break-ip（坍缩是攒 IP 的唯一入口）
//   4. 已进入永恒层（首次永恒后、膨胀前）→ **收益驱动 + 周期结算**：
//      a. 一次坍缩至少让 IP 涨 10 倍 → 放行 eternity-ip-jump
//      b. 距上次结算满 30 秒墙钟      → 放行 eternity-cycle（保证 IP→ID 购买链不断）
//      c. 其余                       → 等待 eternity-grow（10 分钟上限，超时放行一次）
//      **刻意不用 canEternity 放行**：永恒层里 maxIP 长期 ≥ 1.797e308、canEternity
//      几乎恒真，用它放行等价于回到无条件坍缩（实测 maxIP 平台 1e593 依旧）；
//      能否结算永恒由 `OrekiEternity` 自己的收益门槛判断，与坍缩无关。
//      **为什么要周期结算**：纯等待（只剩 10 分钟上限）时 maxAM 指数只有 ~87/min
//      —— 因为坍缩产出的 IP 是「无限维度」购买链的燃料，完全按住会让 ID 等级停摆；
//      持续结算时实测 327~755/min。30 秒一次既保留「不要每帧坍缩」的初衷，又不断链。
//      **为什么不能再无条件放行**：实测（bigE=3、EP=2.16）无条件 allow ⇒ 坍缩按
//      TIME 节奏持续重置维度，高倍速下几乎每帧一次（infinities 达 1e7.85）⇒
//      第八维度的「数量」永远长不起来 ⇒ 星系/维度提升这些「按维度数量递增」的
//      门槛永远达不到 ⇒ 生产乘数停滞：maxIP 平台 1e593、maxAM 平台 1e124044、
//      星系 111 与维度提升 1253 十分钟零增长、首个永恒升级买不起。
//   5. 首次永恒前：本永恒 maxIP 已达永恒门槛（canEternity）→ 放行 eternity-ready
//   6. 一次坍缩至少让 IP 涨 10 倍 → 放行 ip-jump
//      **必须排在「等 ID 峰值」之前**：ID6→ID7 的峰值窗口实测要 1.7 小时，
//      等峰值等于放弃这期间全部 IP 增长；而 ≥10 倍收益的循环约 4~10 分钟一轮。
//   7. 下一个未解锁无限维度（tier 1..8）：
//      a. 反物质峰值已达标   → 放行 id-peak-reached（解锁不会被坍缩破坏）
//      b. IP 已够、只差峰值  → 等待 id-peak-wait（15 分钟上限，超时放行一次）
//      c. 其余               → 放行 id-ip-farm（IP 还不够，坍缩是攒 IP 的唯一入口）
//   8. 8 个维度全部解锁且收益不足 → 等待 gain-wait（3 分钟上限，超时放行一次）
//   9. 任何判据读取异常 → fail-closed 阻止（reason 以 `exception:` 开头）
//
// 「永恒层」判定与 Android 的 `OrekiStageAuto.eternitiesZero()` 同口径（见
// `isInEternityLayer()` 注释），不能用 `PlayerProgress.eternityUnlocked()`：
// 后者在现实重置后仍恒为 true，而现实会把 EP / 永恒次数 / 已购永恒升级全部清零
// —— 那时玩家实际是在重爬首次永恒，必须继续走「首次永恒前」分支。
//
// 为什么等待必须带上限：目标驱动策略在「等峰值 / 等收益」时会暂停坍缩，
// 判据一旦误判（门槛读错、阶段判断错），无限等待会把通关永久卡死
// （R96 实测 Android 端 IP 冻结 46 分钟）。上限用真实墙钟累计，不用帧数或
// 游戏内时间（帧率与倍速都会变）。数值与 Android 一致：15 / 10 / 3 分钟，另加
// 永恒层 30 秒周期结算（只用于「保证 IP→ID 购买链不断」，不是放宽等待上限）。
//
// 只读，不修改玩家设置、不写存档字段；节奏仍由原版自动器执行。
// ---------------------------------------------------------------------------

const TAG = "OREKI_CRUNCH_DEC";

/** ID 峰值等待上限：15 分钟（与 Android `PEAK_WAIT_LIMIT_NS` 的 900000 ms 一致）。 */
const PEAK_WAIT_LIMIT_MS = 900000;

/** 收益等待上限：3 分钟（与 Android `GAIN_WAIT_LIMIT_NS` 的 180000 ms 一致）。 */
const GAIN_WAIT_LIMIT_MS = 180000;

/**
 * 永恒层「让维度长起来」的等待上限：10 分钟
 * （与 Android `ETERNITY_GROW_WAIT_LIMIT_NS` 的 600000 ms 一致）。
 * 到点仍放行一次，避免判据误判或真的卡住时把 IP / EP 循环永久按住。
 */
const ETERNITY_GROW_WAIT_LIMIT_MS = 600000;

/**
 * 永恒层周期结算间隔：30 秒
 * （与 Android `ETERNITY_CYCLE_NS` 的 30000 ms 一致）。
 * 坍缩产出 IP 是无限维度购买链的燃料；完全按住会让 ID 等级停摆、maxAM 增长
 * 从持续结算的 327~755 指数/分钟掉到 ~87 指数/分钟。每 30 秒强制结算一次。
 */
const ETERNITY_CYCLE_MS = 30000;

/** 上一次打印的决策（只用于节流日志：状态翻转才打印）。 */
let lastKey = null;

/** 当前连续等待的开始时刻（单调时钟毫秒）；null 表示没有在等待。 */
let waitStartedAt = null;

/** 永恒层上一次「周期结算」的时刻（单调时钟毫秒）；null 表示本周期尚未起算。 */
let lastEternityCycleAt = null;

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
    // 2) 尚未完成首次无限（原版 hasInfinity 口径）：坍缩是进入无限层的唯一入口。
    if (!PlayerProgress.infinityUnlocked()) return { allow: true, reason: "pre-infinity" };
    // 3) 首次 Break 之前：坍缩是攒 IP 的唯一入口。
    if (!player.break) return { allow: true, reason: "pre-break-ip" };
    // 4) [R96 第四轮] 永恒层（首次永恒后、膨胀前）**不再无条件放行**：
    //    只按「这一次坍缩值不值得」判断：收益 ≥ 10× 当前 IP 才结算，否则按住让
    //    维度 / 星系长起来。
    //
    //    **刻意不在这里用 canEternity 放行**（Android 实机 A/B 教训）：永恒层里
    //    maxIP 早已 ≥ 1.797e308，canEternity 长期为真，用它放行等于又回到无条件
    //    坍缩（实测日志第一帧就是 `allow=true reason=eternity-ready`，maxIP 平台
    //    1e593 依旧、galaxies/dimensionBoosts 依旧不涨）。真正决定能否结算永恒的是
    //    `OrekiEternity` 的「gainedEP ≥ 10×EP」门槛，与坍缩无关，交给它自己判断。
    if (this.isInEternityLayer()) {
      const leapEternity = this.gainVersusIp();
      if (leapEternity !== null && leapEternity >= 1) {
        // 收益够一个数量级：立刻结算，并把周期计时重新起算（与 Android 同序）。
        lastEternityCycleAt = monotonicNowMs();
        return { allow: true, reason: "eternity-ip-jump" };
      }
      // 周期结算：每 30 秒墙钟放行一次。
      // 实测对比（同一存档）：纯等待时 maxAM 指数只有 ~87/min，而持续结算时
      // 327~755/min —— 坍缩产出的 IP 是「无限维度」购买链的燃料，完全按住会让
      // ID 等级停摆。30 秒一次既保留「不要每帧坍缩」的初衷，又保证 IP→ID 链不断。
      const now = monotonicNowMs();
      if (lastEternityCycleAt === null) lastEternityCycleAt = now;
      if (now - lastEternityCycleAt >= ETERNITY_CYCLE_MS) {
        lastEternityCycleAt = now;
        return { allow: true, reason: "eternity-cycle" };
      }
      return this.waitWithin("eternity-grow", ETERNITY_GROW_WAIT_LIMIT_MS);
    }

    // 5) 首次永恒前：本永恒 maxIP 已达到 `Player.eternityGoal`（= Player.canEternity）
    //    → 立刻放行，让原版 canEternity + 自动永恒结算接手。
    if (Player.canEternity) return { allow: true, reason: "eternity-ready" };

    // 6) 一次坍缩至少让 IP 涨一个数量级 → 立刻结算，保持 IP 增长循环。
    //    **必须排在「等 ID 峰值」之前**（与 Android 同序）：ID6→ID7 的反物质峰值窗口
    //    实测要 1.7 小时（AM 增长约 1.3 指数/秒），等峰值会把 IP 增长掐死在窗口里；
    //    而「收益 ≥ 10 倍 IP」循环约 4~10 分钟就能让 IP 涨一个量级。
    const leap = this.gainVersusIp();
    if (leap !== null && leap >= 1) return { allow: true, reason: "ip-jump" };

    // 7) 下一个未解锁的无限维度：按「峰值 → IP → 生长」排序。
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

    // 8) 8 个维度全部解锁、收益还不够：让反物质继续成长（带上限）。
    return this.waitWithin("gain-wait", GAIN_WAIT_LIMIT_MS);
  }

  /**
   * 是否已进入永恒层（= Android `OrekiStageAuto.eternitiesZero()` 取反同口径）。
   *
   * Android 的 `eternitiesZero()`（R94 起）判的是「永恒点数 == 0 且已购永恒升级 == 0
   * 且大永恒 == 0」，三项全零才算「还在首次永恒前」。这里逐项同口径：
   *   · `player.eternities`      —— 大永恒次数（现实重置会清零）
   *   · `player.eternityPoints`  —— 当前 EP（现实重置会清零）
   *   · `player.eternityUpgrades` —— 已购永恒升级（现实重置会 clear）
   *
   * 不能用 `PlayerProgress.eternityUnlocked()`：它把 `realities > 0` 也算「已解锁」，
   * 现实重置后恒为 true，会让玩家在重爬首次永恒时错误进入永恒层分支（Android 不会）。
   * 任一项读取异常按 fail-closed 交给 decide() 的异常分支处理。
   */
  static isInEternityLayer() {
    if (player.eternities.gt(0)) return true;
    if (player.eternityPoints.gt(0)) return true;
    return player.eternityUpgrades.size > 0;
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
