import { OREKI_IU15_AM_EXP } from "./secret-formula/reality/imaginary-upgrades.js";

// [Oreki R38-A] IU15「理想之构」冲刺状态机
//
// ── 目标（原版判据的**指数门槛已被缩放**，见下方常量说明）─────────────
// `src/core/secret-formula/reality/imaginary-upgrades.js`
//   IU15  hasFailed:       () => player.requirementChecks.reality.maxID1.gt(0)
//         checkRequirement: () => maxID1.eq(0) && player.antimatter.exponent >= 1.5e12
// 买上之后 `Laitela.isUnlocked` 才为真（laitela.js:11），整条终局链才可能继续。
//
// ── 为什么必须缩放 1.5e12（R38-A 实测数据，不是猜）─────────────────────
// 本档反物质指数是「乘数决定的平衡点」，不是随时间无界增长的量：
//   · `_r38a/exp2.jsonl`（冻结大坍缩+永恒+现实、ID 全禁买）：amE 卡在 4.53e8，
//     25 秒真实时间内**零增长** → 「压住现实慢慢等」的旧假设不成立；
//   · `_r38a/watch1.jsonl`（正常推进，r=80→110）：amE 峰值 **1.76e10** 后**不再上升**
//     （t=91s 峰 1.76e10、t=180s 峰 8.99e9），即指数天花板 ≈ 2e10；
//   · `_r38a/r38a-record-id1-*.jsonl`（真新档 0→r=70）：峰 1.43e9(t=78s) → 1.36e10(t=259s)
//     → 1.74e10(t=389s)，同样在 1e10 量级收敛。
// 反物质指数要 1.5e12，比实测天花板高 **75 倍**——换算成反物质总量是 10^(1.48e12) 倍，
// 任何「多等一会儿 / 多打几个现实」都不可能缩小这个差距。
// ── 门槛：直接复用 `OREKI_IU15_AM_EXP`（secret-formula 里已定档，值 = 1e8）──
// R38-M 用**原版购买锁** `ImaginaryUpgrade(15).setMechanicLock(true)` 实测（`_tools/_r38m/lockexp3/4`）：
// 在 ID1 始终为 0 的前提下 amE 在 **1.216e8** 饱和，原版 1.5e12 高 4 个数量级；
// 1e8 = 饱和值的 82%，是本档可达且仍需真爬的目标。本模块不再自带第二份常量，避免两边漂移。
/** 单次冲刺的最长真实时长（毫秒）。超时即还原并冷却。 */
export const OREKI_IU15_SPRINT_MAX_MS = 10 * 60 * 1000;
/** 失败后的冷却（毫秒） */
export const OREKI_IU15_COOLDOWN_MS = 60 * 1000;
/** 连续失败多少次后永久放弃冲刺（避免整局卡在封锁态） */
export const OREKI_IU15_MAX_FAILS = 3;

// ── 封锁什么、为什么（R38-A 读码 + 活页面取证）──────────────────────
// 1) 8 层无限维度的购买：`InfinityDimension(t).buyMax/buySingle` 是**唯一**两条购买入口
//    （自动购买器 `infinity-dimension-autobuyer.js:46` 调 buyMax(true)、
//      UI「全部购买」`InfinityDimensions.buyMax()` 调 buyMax(false)/buySingle()）。
//    实例由 `DimensionState.createAccessor()` 缓存（dimension.js:47-53），
//    所以替换实例方法是全局生效的。
// 2) **EC7 必须跳过**：`TimeDimensions.tick()` 末尾
//      EternityChallenge(7).reward.applyEffect(p => InfinityDimension(8).amount += p * diff/1000)
//    （time-dimension.js:331-335）会持续生产 ID8，而 `InfinityDimensions.tick()`
//    再把 ID8→ID7→…→ID1 逐层生产（infinity-dimension.js:373-375）。
//    ⇒ 只要 EC7 有完成次数，**ID1 的 amount 一定 > 0**，maxID1 同帧变正，IU15 永久失败。
//    这与「ID2~ID8 会生产 ID1」是同一个死结的两端。实测取证（_r38a/exp2.jsonl）：
//    purchases 全为 0、8 层全 isUnlocked，ID1 仍在现实重置后 6 秒内长到 10^45037。
// 3) 不冻结大坍缩 / 永恒：实测证明冻结后 amE 直接卡死（见上），
//    而指数增长靠的是永恒给的乘数，冻结等于自杀。
// 4) 不压住现实：maxID1 每个现实重置，只要 EC7 一直被跳过，ID1 就永远是 0，
//    现实照常循环反而能让乘数继续涨、指数峰值更高。
//
// ── 纪律 ────────────────────────────────────────────────────────────
// · 只改「按钮/开关」，不写 requirementChecks、不发货币、不改反物质；
// · 幂等：`_phase` 状态机保证每帧只做一次状态迁移，还原只做一次；
// · 任何异常都退回 idle 并还原，不把整局留在封锁态。

export const OrekiIu15Sprint = {
  /** idle | armed | running | cooldown | giveup | done */
  _phase: "idle",
  _startMs: 0,
  _armMs: 0,
  _cooldownUntil: 0,
  _fails: 0,
  _attempts: 0,
  /** 还原快照 */
  _saved: null,
  _lastError: "",
  /** 观测：本次冲刺开始 / 峰值反物质指数 */
  _startAmE: 0,
  _peakAmE: 0,
  _boughtAtMs: 0,
  _boughtAmE: 0,
  _boughtMaxID1: "",
  /**
   * 上一帧自动购买器总开关状态（[R83] 用于检测「刚被关闭」）。
   *
   * 必须是实例字段而不是 localStorage：它只在本次进程内有意义，
   * 重开游戏时初始为 true，第一次 tick 就能正确同步，不会留下持久状态。
   */
  _wasAutobuyersOn: true,

  /** 现实不需要压住（见文件头 4)），保留 getter 供 holdReality 统一读取 */
  get holding() {
    return false;
  },

  /** 冲刺期间禁止进入 EC7（见文件头 2)） */
  get skipEc7() {
    return this._phase === "armed" || this._phase === "running";
  },

  /**
   * 是否应该冻结重置类动作（永恒 / 现实）。
   *
   * [R83 修复] 此前 `oreki-eternity-automation.js` 两处读的是
   * `globalThis.OrekiIu15Sprint?.freezeResets`，但本模块**从未定义**这个 getter
   * —— `undefined === true` 恒 false，等于冻结逻辑从来没生效过。
   *
   * 语义上**不应该**冻结：文件头 3) 已用实测证明「冻结大坍缩/永恒会把反物质
   * 指数卡死」；冲刺靠的正是永恒乘数累积。所以这里显式定义为 false，
   * 并把原因写在代码里，避免下一轮又把它当成漏写的开关去「补上 true」。
   */
  get freezeResets() {
    return false;
  },

  get active() {
    return this._phase === "armed" || this._phase === "running";
  },

  get iu15Bought() {
    try {
      return ImaginaryUpgrade(15).isBought === true;
    } catch (e) {
      return false;
    }
  },

  get canArm() {
    try {
      if (this._phase !== "idle") return false;
      if (this.iu15Bought) return false;
      if (this._fails >= OREKI_IU15_MAX_FAILS) return false;
      if (Date.now() < this._cooldownUntil) return false;
      if (!player.auto.autobuyersOn) return false;
      // R85：智能自动化关闭时不能重新接管；原版购买器开着不代表玩家
      // 仍同意由本模块临时封锁购买与挑战入口。
      if (globalThis.OrekiSmartExecutor?.enabled === false) return false;
      if (Pelle.isDoomed) return false;
      if (NormalChallenge.isRunning || InfinityChallenge.isRunning || EternityChallenge.isRunning) return false;
      if (!MachineHandler.isIMUnlocked) return false;
      // [R83] 移除 V 门：`VUnlocks.vAchievementUnlock.requirement()` 要求六项
      // 主解锁全部达标，其中 realities 需 10000 次、膨胀时间需 1e320 ——
      // 本作 180 分钟目标内结构性不可达（见 secret-formula/celestials/v.js:17-27
      // 的实测记录）。把它当门等于**永久禁用** IU15 冲刺，与「打通终局入口」直接冲突。
      //
      // 真正的安全条件保留在别处：IM 已解锁、IM 上限覆盖成本、非挑战、非毁灭、
      // 干净现实（maxID1==0），这些才是「能不能买 IU15」的真实前置。
      // 攒够 IM 才有意义
      if (!(MachineHandler.currentIMCap >= ImaginaryUpgrade(15).cost)) return false;
      // [R83 关键修复] 必须在**干净现实**里才开始接管。
      //
      // IU15 的硬性要求是 `player.requirementChecks.reality.maxID1 == 0`。
      // 如果本现实已经买过 ID1，那么在等到下一次真实重置之前，无论怎么封锁都
      // 已经注定失败 —— 提前接管只会白白禁掉 8 层 ID 购买、拖慢成长。
      //
      // 原实现只在 armed→running 的迁移里判断 maxID1，导致「脏现实」也会先
      // `_applyLockdown()`，随后在 armed 里干等 10 分钟超时。现在提前到 arm 门槛，
      // 干净现实才接管；脏现实就正常玩，等下一次现实重置后自然满足。
      if (!player.requirementChecks.reality.maxID1.eq(0)) return false;
      return true;
    } catch (e) {
      return false;
    }
  },

  /** 主循环入口，由 `OrekiEarlyAutomation.tick()` 最先调用 */
  tick() {
    try {
      // [R83 关键修复] 玩家关闭自动购买器总开关时必须**立即**解除接管。
      //
      // 原实现把整个 tick 挂在 `OrekiEarlyAutomation.tick()` 里，而那个入口在
      // `autobuyersOn === false` 时**直接 return**（early-automation.js:54-65）
      // ⇒ 本状态机再也收不到 tick ⇒ `_applyLockdown()` 设置的
      // `setMechanicLock(true)`（写进 `player.reality.reqLock.imaginary`，**会存档**）
      // 和 8 层 ID 购买拦截永久留了下来。
      //
      // 现在的规则：只要检测到「上一帧开着、这一帧关了」，无论处于哪个阶段都立刻
      // `_restore()` 并回到 idle；仅在条件仍成立时才会重新 arm。
      const autobuyersOn = (() => {
        try {
          return player.auto.autobuyersOn === true && globalThis.OrekiSmartExecutor?.enabled !== false;
        } catch (e) { return false; }
      })();
      if (this._wasAutobuyersOn && !autobuyersOn) {
        this._restore("autobuyers-off");
        this._phase = "idle";
        this._fails = 0;
        this._cooldownUntil = 0;
        console.log("[R38-IU15] 自动购买器已关闭，临时接管立即解除");
      }
      this._wasAutobuyersOn = autobuyersOn;
      if (!autobuyersOn) return;

      if (this.iu15Bought) {
        if (this.active) this._restore("iu15-bought");
        this._phase = "done";
        return;
      }
      const now = Date.now();
      switch (this._phase) {
        case "idle":
          if (this.canArm) {
            this._applyLockdown();
            this._phase = "armed";
            this._armMs = now;
            this._startMs = now;
            this._peakAmE = 0;
            this._attempts++;
            console.log(`[R38-IU15] 封锁开始（原版要求锁 + ID 全禁买 + 跳过 EC7），` +
              `目标 amE>=${OREKI_IU15_AM_EXP.toExponential(1)} imCap=${MachineHandler.currentIMCap.toExponential(2)}；` +
              `等待下一次现实重置后开始计时`);
          }
          return;
        case "armed": {
          // 等一个真实现实重置：那时 `maxID1` 被换成新对象（player.js resetRequirements），
          // 从这一帧起 ID1 才真正恒为 0，冲刺才有意义。
          if (player.requirementChecks.reality.maxID1.eq(0)) {
            this._phase = "running";
            this._startMs = now;
            this._startAmE = Number(player.antimatter?.exponent ?? 0);
            this._peakAmE = this._startAmE;
            console.log(`[R38-IU15] 干净现实开始：realities=${player.realities} amE=1e${this._startAmE.toExponential(2)}`);
            return;
          }
          if (now - this._armMs > OREKI_IU15_SPRINT_MAX_MS) this._fail("arm-timeout", now);
          return;
        }
        case "running": {
          const amE = Number(player.antimatter?.exponent ?? 0);
          if (amE > this._peakAmE) this._peakAmE = amE;
          const maxID1 = player.requirementChecks.reality.maxID1;
          if (!maxID1.eq(0)) {
            this._fail("maxID1-nonzero", now);
            return;
          }
          if (amE >= OREKI_IU15_AM_EXP) {
            if (this._tryBuy()) {
              this._boughtAmE = amE;
              this._boughtMaxID1 = String(player.requirementChecks.reality.maxID1);
              this._boughtAtMs = now;
              console.log(`[R38-IU15] 冲刺成功：IU15 已买入 amE=1e${amE.toExponential(2)} ` +
                `maxID1=${this._boughtMaxID1} 用时 ${Math.round((now - this._startMs) / 1000)}s`);
              this._restore("bought");
              this._phase = "done";
            }
            return;
          }
          if (now - this._startMs > OREKI_IU15_SPRINT_MAX_MS) {
            this._fail("timeout", now);
          }
          return;
        }
        case "cooldown":
          if (now >= this._cooldownUntil) this._phase = "idle";
          return;
        default:
          return;
      }
    } catch (e) {
      this._lastError = String(e && e.message);
      try { this._restore("exception"); } catch (e2) { /* ignore */ }
      this._phase = "idle";
    }
  },

  _tryBuy() {
    try {
      const upg = ImaginaryUpgrade(15);
      if (upg.isBought) return false;
      if (!upg.isAvailableForPurchase) return false;
      if (!upg.canBeBought) return false;
      upg.purchase();
      return upg.isBought === true;
    } catch (e) {
      this._lastError = String(e && e.message);
      return false;
    }
  },

  _fail(reason, now) {
    console.warn(`[R38-IU15] 冲刺失败(${reason})：峰值 amE=1e${this._peakAmE.toExponential(2)}，` +
      `用时 ${Math.round((now - this._startMs) / 1000)}s，累计失败 ${this._fails + 1}`);
    this._fails++;
    this._restore(reason);
    this._cooldownUntil = now + OREKI_IU15_COOLDOWN_MS;
    this._phase = this._fails >= OREKI_IU15_MAX_FAILS ? "giveup" : "cooldown";
  },

  /** 封锁：原版购买锁 + 8 层 ID 购买 + 8 个 ID 自动购买器；幂等 */
  _applyLockdown() {
    if (this._saved) return;
    const saved = { idBuyMax: [], idBuySingle: [], idAutoFlags: [], idGroupActive: null, lock: null };
    try {
      // ① 原版机制锁：`ImaginaryUpgrade(15).setMechanicLock(true)` 是**游戏自带**的
      //    「要求锁」按钮（imaginary-upgrades.js:44-52），打开后
      //    `InfinityDimensionState.buySingle/buyMax` 都会在开头
      //    `if (ImaginaryUpgrade(15).isLockingMechanics) return false`
      //    （infinity-dimension.js:258-264 / 279-287）——这是最正统、玩家可见的封锁路径。
      saved.lock = ImaginaryUpgrade(15).hasPlayerLock === true;
      ImaginaryUpgrade(15).setMechanicLock(true);
    } catch (e) { this._lastError = String(e && e.message); }
    try {
      for (let t = 1; t <= 8; t++) {
        const d = InfinityDimension(t);
        saved.idBuyMax.push(d.buyMax);
        saved.idBuySingle.push(d.buySingle);
        d.buyMax = () => false;
        d.buySingle = () => false;
      }
      saved.idGroupActive = player.auto.infinityDims.isActive;
      player.auto.infinityDims.isActive = false;
      // 逐层开关也一起记：某些历史版本（R37）只关过 tier1 且没还原，
      // 存档里会留下 `all[i].isActive === false`，冲刺结束后必须能原样还原。
      for (const a of player.auto.infinityDims.all) {
        saved.idAutoFlags.push(a.isActive === true);
        a.isActive = false;
      }
    } catch (e) {
      this._lastError = String(e && e.message);
      this._saved = saved;
      this._restore("apply-failed");
      return;
    }
    this._saved = saved;
    console.log("[R38-IU15] 封锁已生效：原版要求锁 + ID1~ID8 购买禁用 + ID 自动购买器关闭 + EC7 跳过");
  },

  _restore(reason) {
    const s = this._saved;
    if (!s) return;
    this._saved = null;
    try {
      for (let t = 1; t <= 8; t++) {
        const d = InfinityDimension(t);
        if (typeof s.idBuyMax[t - 1] === "function") d.buyMax = s.idBuyMax[t - 1];
        if (typeof s.idBuySingle[t - 1] === "function") d.buySingle = s.idBuySingle[t - 1];
      }
      if (s.idGroupActive !== null) player.auto.infinityDims.isActive = s.idGroupActive;
      if (Array.isArray(s.idAutoFlags) && s.idAutoFlags.length) {
        player.auto.infinityDims.all.forEach((a, i) => { a.isActive = s.idAutoFlags[i] === true; });
      }
      if (s.lock !== null && s.lock !== undefined) ImaginaryUpgrade(15).setMechanicLock(s.lock === true);
      console.log(`[R38-IU15] 封锁已解除（${reason}）`);
    } catch (e) {
      this._lastError = String(e && e.message);
    }
  },

  /**
   * 立即释放（幂等，供 UI 切开关时同步调用）。
   *
   * [R83] 只靠 `tick()` 检测「刚关闭」不够可靠：玩家关掉总开关后，
   * `OrekiEarlyAutomation.active` 立刻为 false，某些路径可能整帧都不再进 tick；
   * 而 `_applyLockdown()` 写的 `setMechanicLock(true)` 是**存进存档**的，
   * 一旦残留就是永久锁。因此在玩家真正拨动开关的地方直接调用本方法兜底。
   *
   * @returns {boolean} 是否确实解除了一次接管
   */
  releaseIfTakenOver() {
    if (!this._saved && !this.active) return false;
    this._restore("manual-off");
    this._phase = "idle";
    this._fails = 0;
    this._cooldownUntil = 0;
    return true;
  },

  /** 只读观测，供探针使用 */
  get debugState() {
    return {
      phase: this._phase,
      fails: this._fails,
      attempts: this._attempts,
      startAmE: this._startAmE,
      peakAmE: this._peakAmE,
      runSec: this._startMs ? Math.round((Date.now() - this._startMs) / 1000) : 0,
      boughtAmE: this._boughtAmE,
      target: OREKI_IU15_AM_EXP,
      error: this._lastError,
    };
  },
};

try {
  globalThis.OrekiIu15Sprint = OrekiIu15Sprint;
} catch (e) {
  // 非浏览器环境忽略
}
