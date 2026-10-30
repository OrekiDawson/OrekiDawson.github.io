// [Oreki AU6] Break Infinity 升级自动购买
//
// 背景（R5.13 实测）：Break Infinity 之后有一组**廉价**升级（1e4 ~ 1e7 IP），
// 每条都给反物质维度乘数：基于总反物质 / 当前反物质 / 无限次数 / 成就数 / 星系等。
// 定点快照显示停滞点在「反物质 1e885、下一次购买成本 1e886~1e907」，
// 而这类乘数正是把产量抬过下一档成本的唯一通道，玩家却没有任何提示要买。
//
// 设计原则：
// 1. 只买**已经满足购买条件**的（走升级自身的 canBeBought，含价格/已购/解锁判定），不伪造任何状态；
// 2. 受玩家既有的「自动购买器」总开关 player.auto.autobuyersOn 控制，不新增存档字段、不需要迁移；
// 3. 只在 Break 之后尝试（未 Break 时这组升级本就不可购买）；
// 4. 幂等：买不起就什么都不做，不写记录、不影响挑战/Doomed（由升级自身判定把关）。
// 5. 不动 InfinityUpgrade 与 IP Mult 的购买节奏，避免与 AU4b 的坍缩策略互相干扰。

/**
 * 尝试买下所有当前可购买的 Break Infinity 升级。
 * @returns {number} 本次实际买下的条数（用于测试与调试）
 */
export function tryBuyBreakInfinityUpgrades() {
  if (!player.auto.autobuyersOn) return 0;
  if (!player.break) return 0;
  let bought = 0;
  for (const upgrade of BreakInfinityUpgrade.all) {
    try {
      if (!upgrade.canBeBought) continue;
      if (upgrade.purchase()) bought++;
    } catch (e) {
      // 单条升级抛错不应影响主循环与其他升级
    }
  }
  return bought;
}
