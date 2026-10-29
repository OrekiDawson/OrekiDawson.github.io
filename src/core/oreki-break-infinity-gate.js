// [Oreki AD5] Break Infinity 闸门：间隔升级自动化 + 一次性阶段奖励
//
// ── 事实（R19 真新档 601 s 实测 + 源码逐行核对）──────────────────────
// 1. `breakInfinity()`（src/game.js:77）第一行就是
//        if (!Autobuyer.bigCrunch.hasMaxedInterval) return;
//    即 **「把大坍缩自动器间隔拉到 ≤100」是 Break 的前置，不是后果**。
// 2. 间隔从 150000 起，每级 `×0.6`、价格 `×2`
//    （src/core/autobuyers/autobuyer.js:169-177 `upgradeInterval`）
//    → 需要 15 级，成本序列 1,2,4,…,16384，**累计 32767 IP**。
// 3. `upgradeInterval()` **没有任何 `canBeUpgraded` 门控**（与其它自动器不同），
//    唯一门槛是 IP 余额；且全仓库**只有 UI 按钮调用它**
//    （src/components/tabs/autobuyers/AutobuyerIntervalButton.js:34），
//    **没有任何自动购买器会升级它** → 玩家必须手点 15 次。
// 4. 未 Break 时每次坍缩固定给 1 IP（src/game.js:103-105，div=308 → 308/308=1）。
// 5. R19 实测：AD4 修好 canCrunch 死锁后，首次无限 @91 s；
//    但 601 s 内只发生 25 次坍缩，IP 停在 1e0.7。
//    → 按 1 IP/次、约 24 s/次的外推，攒满 32767 IP 需要 **约 9 天**。
//    这就是**第二道时间墙**，而且它的本质是「自动化缺口 + 阶段奖励缺口」，
//    不是数值平衡问题。
//
// ── 本模块做什么（两件事，都可逆）────────────────────────────────────
// A) **间隔升级自动化**：只要玩家开了自动购买器、且 IP 余额够，
//    就自动购买大坍缩自动器的间隔升级（走游戏自身的 `upgradeInterval(false)`，
//    不伪造 interval、不绕过成本）。这消除「必须手点 15 次」的自动化缺口。
//
// B) **一次性阶段奖励**：在满足 Break 的前置条件（已达成过第一次无限、
//    自动购买器已开、非挑战、非毁灭现实、间隔尚未拉满）时，
//    **一次性**把 IP 补足到 32767（= 15 级间隔升级的完整成本）。
//    与 AD3 的形态完全一致（AD3 也是一次性阶段奖励：把 IP 兜底到 1e8 以解锁 ID1）。
//
// ── 边界 ─────────────────────────────────────────────────────────────
// · 只在 `!player.break` 时生效；Break 之后一律不再发放。
// · `grantedThisSession` 保证**每次会话最多发放一次**，
//   且 A) 与 B) 在同一次调用里完成 → 间隔拉满后 `hasMaxedInterval` 变 true，
//   下一帧直接返回，不存在「发钱→花钱→再发钱」的循环。
// · 不写任何新的存档字段（用会话内状态 + 存档里本来就有的 interval）。
// · 不改 `gainedInfinityPoints`、不改 `div`、不改 `-0.75`、不改 `totalIPMult`。
// · 受玩家既有的「自动购买器」总开关 `player.auto.autobuyersOn` 控制。
//
// ── 为什么 32767 这个数字是「最小可逆」────────────────────────────────
// 它恰好等于把间隔从 150000 拉到 100 所需的**全部**成本，
// 不多给一分；发放后立刻被间隔升级消耗完，玩家余额回到原处。

import { PlayerProgress } from "./player-progress.js";

/**
 * 把间隔从 150000 拉到 100 所需的完整成本。
 * 逐级核算：interval ← max(interval × 0.6, 100)，cost ← cost × 2，
 * 起始 interval=150000 / cost=1，需要 15 级 → 1+2+4+…+16384 = 32767。
 */
export const BREAK_INTERVAL_TOTAL_COST = 32767;

export const OrekiBreakInfinityGate = {
  /**
   * 会话内标记：保证一次性阶段奖励每次会话只发一次。
   */
  grantedThisSession: false,

  /**
   * 是否处于「Break 闸门」窗口（只读判断，无副作用）。
   */
  active() {
    try {
      if (player.break) return false;
      if (!player.auto.autobuyersOn) return false;
      if (!PlayerProgress.infinityUnlocked()) return false;
      if (NormalChallenge.isRunning || InfinityChallenge.isRunning || EternityChallenge.isRunning) return false;
      if (Pelle.isDoomed) return false;
      if (Autobuyer.bigCrunch.hasMaxedInterval) return false;
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * 打开 Break 闸门：必要时发放一次性阶段奖励，并自动升级间隔。
   * @returns {boolean} 本次是否发放了阶段奖励
   */
  tryOpen() {
    try {
      if (!this.active()) return false;

      // B) 一次性阶段奖励：把 IP 补足到「拉满间隔的全部成本」
      let granted = false;
      if (!this.grantedThisSession) {
        const need = Decimal.subtract(new Decimal(BREAK_INTERVAL_TOTAL_COST), Currency.infinityPoints.value);
        if (need.gt(0)) {
          Currency.infinityPoints.add(need);
          granted = true;
        }
        this.grantedThisSession = true;
      }

      // A) 间隔升级自动化：余额够就买，走游戏自身的购买路径
      const bc = Autobuyer.bigCrunch;
      let guard = 0;
      while (!bc.hasMaxedInterval && guard < 64) {
        guard++;
        if (Currency.infinityPoints.value.lt(bc.cost)) break;
        const before = bc.interval;
        bc.upgradeInterval(false);
        if (bc.interval === before) break; // 买不动了，退出，避免死循环
      }

      return granted;
    } catch (e) {
      return false;
    }
  },
};
