// [Oreki AD6] 首次永恒前的阶段自动化：补上「无限维度 / 无限升级」的自动化缺口
//
// ── 事实（源码逐行核对 + R19 真新档 92 s 实测）──────────────────────
// 1. 无限维度**没有任何自动化**：
//    `src/core/autobuyers/infinity-dimension-autobuyer.js` 的 `isUnlocked` 是
//        EternityMilestone[`autobuyerID${tier}`].isReached
//    —— 也就是「永恒里程碑」，**首次永恒之前永远不可用**。
//    `InfinityDimensions.buyMax()` 的源码注释直接写着
//        // Called from "Max All" UI buttons and nowhere else
//    `InfinityDimensions.tryAutoUnlock()` 同样要求 `EternityMilestone.autoUnlockID.isReached`。
// 2. 无限升级的自动器同样锁在永恒里程碑之后：
//    `prestige-currency-multiplier-autobuyer.js` 的 `IPMultAutobuyerState.isUnlocked`
//    要求 `EternityMilestone.autobuyerIPMult.isReached`。
//    其余无限升级**完全没有任何自动购买**。
// 3. 于是首次永恒前的真实流程是：每轮无限之后玩家必须手点「Max All」买无限维度、
//    手点买无限升级。R19 的 92 s 数据是**测试脚本手工驱动**才得到的
//    （见 `web/_tools/verify-real-newgame-to-eternity.mjs` 第 62-103 行的 step()），
//    真实玩家在 10000× 速度下根本跟不上这个点击节奏 → 进度立刻停滞。
// 4. IP 增长链的真实形态：单次坍缩收益 = 10^(thisInfinity.maxAM.log10()/308 - 0.75) × totalIPMult。
//    要摸到首次永恒门槛 1.7976931348623157e308，需要 `thisInfinity.maxAM` 涨到约 1e94000；
//    而把 maxAM 推上去的乘数几乎全部来自**无限维度产出的无限力量**。
//    → 不自动买 ID，IP 就永远停在 1e29 量级（R19 实测末态）。
//
// ── 本模块做什么（都可逆）────────────────────────────────────────────
// A) 自动解锁并购买无限维度：直接调 `InfinityDimensions.buyMax()`，
//    与「Max All」按钮**走同一条购买路径**（内含 unlock + 按真实成本扣 IP），
//    不伪造成本、不伪造解锁字段、不写存档字段。
// B) 自动购买无限升级：每帧最多买 1 个（单次 `purchase()`），
//    避免一次性把 IP 花光、把 IP 从「买 ID」的用途上抢走。
//    `InfinityUpgrade.ipMult` 故意**不**用 buyMax：
//    它单次 ×2 IP 但只把永恒门槛平移 308×log10(2) ≈ 93 个反物质指数，
//    对首次永恒几乎无贡献，却会瞬间吃光 IP。
//
// ── 边界 ─────────────────────────────────────────────────────────────
// · 只在「已达成过第一次无限 / 还没解锁永恒」窗口内生效；
// · 受玩家既有的「自动购买器」总开关 `player.auto.autobuyersOn` 控制，关掉即完全停止；
// · 任意挑战中、毁灭现实中一律不生效；
// · 不碰 `gainedInfinityPoints`、不改 `div`、不改 `totalIPMult`、不改 `Player.canEternity`；
// · 不写任何新存档字段。

// [Oreki R38-A] IU15 冲刺状态机必须**被 import 才会执行**（纯 globalThis 引用不会加载模块）
import { OrekiIu15Sprint } from "./oreki-iu15-sprint.js";

/** 每帧最多买几个无限升级（单次购买，不是 buyMax） */
export const UPGRADES_PER_TICK = 1;

export const OrekiEarlyAutomation = {
  /**
   * 是否处于「首次永恒前」的自动化窗口。只读判断，无副作用。
   */
  get active() {
    try {
      // 注意：这里**不能**用「未解锁永恒」当窗口。实测首次永恒之后
      // `player.infinities` 被 resetInfinityRuns() 清零，无限维度自动器
      // （依赖 EternityMilestone.autobuyerID*）与 IP 倍率自动器都还没解锁，
      // 若此时停掉本模块，进度会立刻停住（实测卡在 et=5、inf=0、ID 全锁）。
      // 因此只在「自动购买器总开关」和挑战/毁灭现实上设门。
      if (!player.auto.autobuyersOn) return false;
      if (NormalChallenge.isRunning || InfinityChallenge.isRunning || EternityChallenge.isRunning) return false;
      if (Pelle.isDoomed) return false;
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * 买无限维度（含 unlock）。走 Max All 的同一条路径。
   * @returns {number} 本次实际买到的维度层数（用于诊断）
   */
  buyInfinityDimensions() {
    try {
      if (!InfinityDimensions.canBuy()) return 0;
      let bought = 0;
      for (const dimension of InfinityDimensions.all) {
        if (dimension.isUnlocked && dimension.isAvailableForPurchase) bought++;
      }
      InfinityDimensions.buyMax();
      return bought;
    } catch (e) {
      return 0;
    }
  },

  /**
   * 买无限升级：每帧最多 UPGRADES_PER_TICK 个，单次购买。
   * @returns {boolean} 本次是否买到
   */
  buyInfinityUpgrades() {
    try {
      let bought = 0;
      for (const upgrade of InfinityUpgrade.all) {
        if (bought >= UPGRADES_PER_TICK) break;
        if (!upgrade.isAvailableForPurchase) continue;
        if (!upgrade.canBeBought) continue;
        upgrade.purchase();
        bought++;
      }
      return bought > 0;
    } catch (e) {
      return false;
    }
  },

  /**
   * [Oreki R45] 只读自述：「这条动作为什么买了 0 个」。
   * 由 `oreki-smart-executor.js::explainNoop()` 调用；只读、不改状态、说不清返回空串。
   */
  noopReason(verbId) {
    try {
      if (verbId === "buyInfinityDimension") {
        if (!InfinityDimensions.canBuy()) return "无限维度买不动：未解锁或 IP 不够（`InfinityDimensions.canBuy()` 为假）";
        const buyable = InfinityDimensions.all.filter(d => d.isUnlocked && d.isAvailableForPurchase).length;
        if (buyable === 0) return "所有已解锁的无限维度都买不动（IP 不足一次购买）";
        return "";
      }
      if (verbId === "buyInfinityUpgrade" || verbId === "buyUpgrade") {
        const all = InfinityUpgrade.all;
        const left = all.filter(u => !u.isBought);
        if (left.length === 0) return "无限升级已全部买齐";
        const buyable = left.filter(u => u.isAvailableForPurchase && u.canBeBought).length;
        if (buyable === 0) return `还剩 ${left.length} 条无限升级没买，但都不可买（前置未达成或 IP 不足）`;
        return "";
      }
      return "";
    } catch (e) {
      return "";
    }
  },

  /**
   * 主循环入口。
   * @returns {{ids: number, upgrades: boolean}} 本次动作摘要
   */
  tick() {
    if (!this.active) return { ids: 0, upgrades: false };
    // 【R38-A】IU15 冲刺状态机（新模块 oreki-iu15-sprint.js）。
    // 为什么放在最前面：它必须在**任何 ID 购买之前**把 8 层无限维度的 buyMax/buySingle
    // 换成 no-op。晚一帧都不行 —— ID2~ID8 会 produceDimensions 到 ID1
    // （infinity-dimension.js:377-379），只要有一层被买过，maxID1 立刻 > 0，IU15 永久失败。
    try {
      OrekiIu15Sprint.tick();
    } catch (e) { /* 状态机异常不影响其它自动化 */ }
    // 【R38-A】把 R36/R37 的旧「冲刺判定」降级为只读委托：
    // 真正的封锁/冻结/购买全部由 OrekiIu15Sprint 负责，这里只决定「还要不要买 ID」。
    const sprint = this.isIu15SprintActive();
    if (sprint) {
      const upgrades = this.buyInfinityUpgrades();
      return { ids: 0, upgrades, iu15Sprint: true };
    }
    const ids = this.buyInfinityDimensions();
    const upgrades = this.buyInfinityUpgrades();
    return { ids, upgrades };
  },

  /**
   * 【R36 · IU15 冲刺模式】是否应当暂停购买无限维度。
   *
   * ── 死锁链（全部已核实行号）────────────────────────────────────────
   * 1. `InfinityDimensions.buyMax()`（src/core/dimensions/infinity-dimension.js:398-410）
   *    会 `unlockedDimensions.forEach(d => d.buyMax(false))` ⇒ **会买 ID1**。
   * 2. `src/core/dimensions/infinity-dimension.js:385`
   *    `player.requirementChecks.reality.maxID1 = maxID1.clampMin(InfinityDimension(1).amount)`
   *    ⇒ 只要买过 ID1，**maxID1 > 0**。
   * 3. IU15「理想之构」（src/core/secret-formula/reality/imaginary-upgrades.js:161-162）
   *    `hasFailed: () => player.requirementChecks.reality.maxID1.gt(0)`
   *    `checkRequirement: () => maxID1.eq(0) && player.antimatter.exponent >= 1.5e12`
   * 4. `src/core/imaginary-upgrades.js:72` `get isPossible() { return !hasFailed(); }`
   * 5. `src/core/secret-formula/celestials/navigation.js:1430`
   *    `if (player.requirementChecks.reality.maxID1.neq(0)) return 0.5;`
   *    ⇒ 莱特拉进度被砍到 **50%**，永远开不了。
   *
   * ── 为什么可以按现实分阶段处理 ─────────────────────────────────────
   * `player.requirementChecks.reality.maxID1` **每个现实会重置**：
   * `src/core/player.js:1005-1020` 的 `Player.resetRequirements("reality")`
   * 把整个 `requirementChecks.reality` 换成新对象，`maxID1: DC.D0`。
   * ⇒ 只要**某一个现实内**从头到尾不买 ID1，IU15 就有机会解锁。
   *
   * ── 触发条件（必须严格，宁可晚触发也不能误触发）────────────────────
   * 只有当以下全部满足才进入冲刺模式：
   *  · 虚幻机器已解锁（`MachineHandler.isIMUnlocked`）—— 否则 IU15 根本不在候选列表里；
   *  · IU15 还没买到（`!ImaginaryUpgrade(15).isAvailableForPurchase`）；
   *  · **本现实尚未买过 ID1**（`maxID1.eq(0)`）—— 一旦为真就说明这个现实已经废了，
   *    此时再停买 ID 也没用（还得多等一个现实），不如照常推进；
   *  · 反物质指数已接近门槛（`antimatter.exponent >= 1.5e12 * 0.01`）——
   *    太早冲刺没有意义（要停买 ID 很久才攒得到反物质）。
   *
   * 反物质怎么来？**现实机器（RM）**：
   * `src/core/dimensions/antimatter-dimension.js:48`
   * `multiplier = multiplier.times(Currency.realityMachines.value.powEffectOf(AlchemyResource.force))`
   * ⇒ RM 数量直接乘进反物质维度产出。这正是原版为「不买 ID1 也能堆反物质」准备的路线。
   * RM 上限 `MachineHandler.baseRMCap = DC.E1000`（src/core/machines.js:11），
   * 而 V 的 realityMachines 门槛只要 1e60 ⇒ 量级绰绰有余。
   *
   * ── 纪律 ─────────────────────────────────────────────────────────
   * · 只**暂停买 ID**，不写 `maxID1`、不伪造反物质、不改任何存档字段；
   * · 冲刺期间仍然买无限升级（IP 倍率对反物质与无限次数都有用）；
   * · 一旦 IU15 真的解锁（`isAvailableForPurchase` 变 true），冲刺自动结束，
   *   下一帧恢复买 ID（此时 `maxID1` 已经被 IU15 记录在案，不再影响解锁）。
   */
  /**
   * 【R38-A】是否应当暂停购买无限维度。**只读委托**，真正的状态机在
   * `src/core/oreki-iu15-sprint.js`（OrekiIu15Sprint）。
   *
   * 历史：R36/R37 在这里自己写了一套触发条件，但两版都从未触发过 ——
   * 关键是「只挡 ID1」在物理上无效：ID2~ID8 会 produceDimensions 到 ID1
   * （infinity-dimension.js:377-379），必须把 8 层全部锁死；
   * 且反物质会被大坍缩/永恒清零，必须同时冻结二者（见新模块顶部注释）。
   */
  isIu15SprintActive() {
    try {
      return OrekiIu15Sprint.active === true;
    } catch (e) {
      return false;
    }
  },
};

// [Oreki R37-A] 与其它 oreki 模块一致：挂到 globalThis，供 `holdReality` 读取冲刺状态
// （避免 celestial-automation ↔ early-automation 直接 import 成环）。
try {
  globalThis.OrekiEarlyAutomation = OrekiEarlyAutomation;
} catch (e) {
  // 非浏览器环境忽略
}
