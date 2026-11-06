// [Oreki AU6 · R65 重写] Break Infinity 升级自动购买
//
// [Oreki R87] 引入 `OrekiEarlyAutomation` 的同一份 ID1 预留判据（见下方「二·补」）。
// 该模块由 `game.js` 同时加载，不构成循环依赖。
import { OrekiEarlyAutomation } from "./oreki-early-automation.js";
//
// ── 一、R64 之前的事实（为什么这一轮必须重写）────────────────────────────
// 旧版本这里是「遍历 → canBeBought → purchase，能买的全买」。函数本身没错，
// 但两个问题让它实际上推不动进度：
//   1) **一次节拍买光所有能买的**：`runCycle` 的语义是「一拍最多一个真动作」，
//      一次买 N 条等于把 N 个决策压成 1 拍 —— 与其说是限流，不如说是失控；
//      更糟的是它无法表达「先买哪条」，只能按 `BreakInfinityUpgrade.all` 的数组序。
//   2) **没有预算概念**：数组序里靠后的 5e11 / 1e15 两条一旦买得起就会被买掉，
//      而 ID1 的解锁门槛（`InfinityDimension(1).ipRequirement`，当前版本为 1e8）
//      要求余额留在门槛之上。把余额砸进 5e11 的升级，
//      等于把关键成长节点往后推几十分钟。
//
// ── 二、现在的策略（与 Android `OrekiBreakShop` 逐条等价）────────────────
//   · 候选 = `canBeBought` 为真 **且** `2 × 价格 ≤ 当前 IP`
//   · 在候选里取**价格最低**的一条，一次调用只买一条
//   · `2 × 价格 ≤ IP` 保证任何单笔购买都不会让 IP 腰斩：便宜的先吃完，
//     贵的等余额涨上来自然进入候选。不写死价格表，版本更新后也不会失效。
//
// ── 二·补（R87）ID1 收购窗口的资金预留 ───────────────────────────────
// `2 × 价格 ≤ IP` 只保证「不腰斩」，**不能保证余额仍在 ID1 的 ipRequirement 之上**：
// IP 刚好是 1e8 时，一笔 1e4 的升级就会把余额压到 9.999e7 —— 已低于门槛。
//
// 这不是小事：首次永恒前，`BigCrunchAutobuyer.waitingForId1Peak`
// （src/core/autobuyers/big-crunch-autobuyer.js:170-186）靠 `IP ≥ 1e8` 维持
// 「暂停坍缩、把 thisEternity.maxAM 攒到 1e1100」的 HOLD 窗口。余额一旦被这组升级
// 买到门槛以下，HOLD 立刻解除 → 下一次自动坍缩把反物质清零 → 峰值重新爬，
// ID1 的反物质门槛因此反复被打断。R82 只给 `InfinityUpgrade` 加了预留，漏了这里。
//
// 修法：窗口内（首次永恒前 + ID1 未解锁 + IP 已达到原版 `ipRequirement`）跳过
// 任何「买完会跌破门槛」的条目，其余照常买；ID1 解锁或首次永恒之后自动恢复。
// 判据直接复用 `OrekiEarlyAutomation` 的同一份实现（单一来源，不复制门槛、不写死 1e8），
// 仍走原版 `purchase()` 真实扣费 —— 这里只决定「本拍动不动手」。
//
// ── 三、边界 ─────────────────────────────────────────────────────────
//   · `player.auto.autobuyersOn` 关 → 一律不动（玩家意愿优先，与 Android 调度器同语义）；
//   · 未 Break → 直接返回 0（这组升级在 Break 之前本来就不存在）；
//   · 买不起 / 已买完 / 会吃掉 ID1 预留 → 返回 0，`runCycle` 视为 no-op，**不占节拍**，
//     后面的 `breakGate` / `eternity` 等候选仍能在同一帧拿到机会；
//   · 单条升级抛错只影响它自己（外层 for 内 try/catch），不会中断整个循环。
//
// 返回值：1 = 本拍真的买下一条（IP 已按原版成本扣除、位图已置）；
//         0 = 没有任何真实动作。

/**
 * 尝试买下一条 Break Infinity 升级（最便宜且不伤预算的那条）。
 * @returns {number} 1 = 真的买下了一条；0 = 没有动作
 */
export function tryBuyBreakInfinityUpgrades() {
  if (!player.auto.autobuyersOn) return 0;
  // R85：与 Android 调度器一致，关闭 Oreki 智能开关后不再接管 Break 商店。
  if (globalThis.OrekiSmartExecutor?.enabled === false) return 0;
  if (!player.break) return 0;

  // R87：ID1 收购窗口的资金预留。判据与 `OrekiEarlyAutomation.buyInfinityUpgrades()`
  // 共用同一份实现（首次永恒前 + ID1 未解锁 + IP 已达原版 ipRequirement）。
  const reserveId1Ip = OrekiEarlyAutomation.shouldReserveIpForId1();
  const ip = Currency.infinityPoints.value;
  let best = null;
  let bestCost = null;

  for (const upgrade of BreakInfinityUpgrade.all) {
    try {
      // 原版综合判定：未购买 && 买得起 && 未封顶（可重复升级另有上限）
      if (!upgrade.canBeBought) continue;
      // 成本类型两端不一致：一次性升级的 config.cost 是**普通 number**（1e4 …），
      // 可重复升级走 RebuyableMechanicState 的 `config.cost()` 返回 **Decimal**。
      // 直接 `.times()` 会在 number 上抛 TypeError（R65 实测踩到），必须先归一。
      const raw = upgrade.cost;
      const cost = raw && typeof raw.times === "function" ? raw : new Decimal(raw);
      // 单笔不超过当前 IP 的一半 —— 只保证「不腰斩」，不负责 ID1 门槛（见二·补）。
      if (cost.times(2).gt(ip)) continue;
      // R87：会吃掉 ID1 预留的升级，本拍跳过，等 ID1 解锁/首次永恒后再买（价格与顺序都不变）。
      if (reserveId1Ip && !OrekiEarlyAutomation.leavesId1Reserve(cost)) continue;
      if (!bestCost || cost.lt(bestCost)) {
        best = upgrade;
        bestCost = cost;
      }
    } catch (e) {
      // 单条升级的成本函数抛错不应影响其他条目
    }
  }

  if (!best) return 0;
  try {
    // 走升级自身的 purchase()：内部再判一次 canBeBought → 扣 IP → 置已购 → onPurchased()
    return best.purchase() ? 1 : 0;
  } catch (e) {
    return 0;
  }
}
