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
   * 主循环入口。
   * @returns {{ids: number, upgrades: boolean}} 本次动作摘要
   */
  tick() {
    if (!this.active) return { ids: 0, upgrades: false };
    const ids = this.buyInfinityDimensions();
    const upgrades = this.buyInfinityUpgrades();
    return { ids, upgrades };
  },
};
