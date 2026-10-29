/**
 * AD: Oreki Edition — 挑战进入即完成
 *
 * 目标：C / IC / EC 一旦成功进入，就在下一次游戏循环里按「正常结算路径」立即完成，
 * 省掉刷挑战的现实时间。不是伪装 UI，也不是直接改存档位域：
 *   - C/IC：复用 big-crunch.js 里 bigCrunchGiveRewards() + handleChallengeCompletion() 的动作
 *           （发 IP / 无限次数 → challenge.complete() + challenge.updateChallengeTime()）；
 *   - EC  ：复用 eternity.js 里 giveEternityRewards() 的动作
 *           （addCompletion 补满 → Currency.eternityPoints.add(gainedEternityPoints()) → 退出挑战）。
 *
 * 为什么不做「模拟一次无限/永恒重置」：
 *   - C/IC 的真实结算是玩家在挑战里打满反物质后手动 Infinity，那次 Infinity 会给 IP / 无限次数，
 *     并顺带把整轮进度清零（bigCrunchReset → bigCrunchResetValues）。进入即完成如果再走一遍
 *     全量重置，会把刚被自动化推上去的反物质/维度/无限维度全部打回起点，
 *     在 180 分钟预算里等于每完成一个挑战就倒退一段进度。
 *   - 所以这里只复刻「奖励结算」这一段：收益仍由**原版** gainedInfinityPoints() /
 *     gainedInfinities() / gainedEternityPoints() 计算，写入仍走**原版** Currency 通道，
 *     但不调用 bigCrunchReset() / eternity()，因而不清进度。
 *   - 不采用「手写数字」：所有 IP / 无限次数 / EP 都是原版函数的返回值。
 *
 * 奖励基线（为什么不能直接拿当前数字去算）：
 *   进入即完成是在挑战开始的下一帧结算的，此时
 *   - C/IC：start() 里的 bigCrunchReset(true, true) 已把 thisInfinity.maxAM 归零
 *           （normal-challenges.js:85 / infinity-challenges.js:53 → secondSoftReset）；
 *   - EC  ：start() 里的 eternity() → Currency.infinityPoints.reset() 已把
 *           thisEternity.maxIP 归零（currency.js:295）。
 *   而原版收益函数全部以这两个记录为输入，直接调用只会得到 0（见各函数内注释）。
 *   真实完成那一刻的等价值是确定的：C/IC 必须 maxAM >= challenge.goal
 *   （player.js:954-958 的 Player.canCrunch），EC 必须 maxIP >= currentGoal
 *   （eternity-challenge.js:150）。因此结算时把记录临时抬到这个门槛，交给原版函数换算。
 *
 * 幂等与安全性：
 *   - 只在 player.challenge.*.current 非 0（也就是 start() 真的成功）时才动作；
 *   - C/IC 已经完成过的挑战不会再调 complete()，也不再结算奖励；
 *   - EC 只在本帧真的新增了完成次数（gained > 0）时结算，重进已满级的 EC 不会重复发奖；
 *   - 结算后立刻把 current 清零，所以下一次循环不会重复结算；
 *   - 临时抬高的 maxAM / maxIP 在 finally 里还原：既保证记录不伪造，
 *     也避免 maxAM 停在高位导致 Player.canCrunch 恒为 true、自动坍缩下一帧再发一次奖励；
 *   - 不修改解锁条件（Tab.challenges.isUnlocked / lockedAt / hasUnlocked 一律不动），
 *     不新增任何存档字段。
 */

import { inGameTimeOf } from "./time.js";

const OrekiInstantChallenge = {
  get isActive() {
    return player.challenge.normal.current !== 0 ||
      player.challenge.infinity.current !== 0 ||
      player.challenge.eternity.current !== 0;
  },

  /**
   * 每个游戏循环调用一次。返回本次各类型是否真的产生了「新完成」。
   * @returns {{ normal: boolean, infinity: boolean, eternity: boolean }}
   */
  tryComplete() {
    const result = { normal: false, infinity: false, eternity: false };
    const antimatter = this._completeAntimatterChallenge();
    result.normal = antimatter.normal;
    result.infinity = antimatter.infinity;
    result.eternity = this._completeEternityChallenge();
    return result;
  },

  // ---------------------------------------------------------------- C / IC
  // 对应 big-crunch.js::bigCrunchGiveRewards() + handleChallengeCompletion()：
  //   Currency.infinityPoints.add(gainedInfinityPoints())
  //   Currency.infinities.add(gainedInfinities().round())
  //   challenge.complete() -> challenge.updateChallengeTime() -> 清空 current
  // 差别只有一处：不执行 bigCrunchResetValues()，因此不清反物质/维度/无限维度，
  // 只保留奖励与完成记录。
  _completeAntimatterChallenge() {
    const out = { normal: false, infinity: false };
    const normalId = player.challenge.normal.current;
    const infinityId = player.challenge.infinity.current;
    if (!normalId && !infinityId) return out;

    const challenge = Player.antimatterChallenge;
    if (!challenge) {
      // 状态不一致时只清场，绝不记账
      player.challenge.normal.current = 0;
      player.challenge.infinity.current = 0;
      return out;
    }

    const alreadyCompleted = challenge.isCompleted;
    if (!alreadyCompleted) {
      // IC 首次完成时清掉「IC 已解锁」的提示，与正常结算保持一致
      if (infinityId && !InfinityChallenge.current.isCompleted) TabNotification.ICUnlock.clearTrigger();
      // 与原版顺序一致：先结算奖励（bigCrunchGiveRewards），再记完成（handleChallengeCompletion）
      this._giveAntimatterChallengeRewards(challenge);
      challenge.complete();
      challenge.updateChallengeTime();
    }

    player.challenge.normal.current = 0;
    player.challenge.infinity.current = 0;

    if (infinityId) out.infinity = !alreadyCompleted;
    else out.normal = !alreadyCompleted;
    return out;
  },

  /**
   * 发放 C / IC 完成时应得的 IP 与无限次数，并更新最速无限记录。
   *
   * 为什么必须临时抬高 maxAM：`Player.canCrunch` 判的是
   * `player.records.thisInfinity.maxAM.gte(challenge.goal)`（player.js:954-958），
   * 也就是「真实完成」的那一刻 maxAM 必然 >= challenge.goal。而进入即完成结算时 maxAM 只有 1e1 量级
   * （挑战 start() 刚做过 secondSoftReset），直接调原版函数会算出 0 IP。
   * 这里把 maxAM 抬到 challenge.goal 再交给原版公式，等价于「玩家真的打到了完成门槛」。
   *
   * 为什么结算后必须还原：
   *   1) 不伪造记录 —— 本次无限运行的真实峰值确实很低；
   *   2) 防重复发奖 —— maxAM 若留在门槛以上，Player.canCrunch 会一直为 true，
   *      自动坍缩在下一帧再结算一次完全相同的奖励。
   * @param {AntimatterChallengeState|InfinityChallengeState} challenge
   */
  _giveAntimatterChallengeRewards(challenge) {
    const records = player.records.thisInfinity;
    const goal = challenge.goal;
    const savedMaxAM = records.maxAM;
    if (savedMaxAM.lt(goal)) records.maxAM = goal;
    try {
      // 原版收益函数：game.js:117 gainedInfinityPoints / game.js:496 gainedInfinities
      Currency.infinityPoints.add(gainedInfinityPoints());
      Currency.infinities.add(gainedInfinities().round());

      // 与 big-crunch.js::bigCrunchUpdateStatistics() 的最速无限记录同源同口径
      const gameTime = inGameTimeOf(records);
      if (gameTime > 0) {
        player.records.bestInfinity.time = Math.min(player.records.bestInfinity.time, gameTime);
        player.records.bestInfinity.realTime = Math.min(player.records.bestInfinity.realTime, records.realTime);
      }
      // 真的入账了无限次数，现实要求的「本现实内没有无限次数」必须失效（big-crunch.js:101 同款）
      player.requirementChecks.reality.noInfinities = false;
    } finally {
      records.maxAM = savedMaxAM;
    }
  },

  // ------------------------------------------------------------------- EC
  // 对应 eternity.js::giveEternityRewards() 中 EC 分支：
  //   addCompletion(false) -> Currency.eternityPoints.add(gainedEternityPoints())
  //   -> 清 requirementBits -> 退出挑战
  // 不调用 eternity()，因此不清本轮永恒进度（反物质/维度/无限维度），只结算奖励。
  _completeEternityChallenge() {
    const challenge = EternityChallenge.current;
    if (!challenge) {
      if (player.challenge.eternity.current !== 0) player.challenge.eternity.current = 0;
      return false;
    }

    const before = challenge.completions;
    // 补满到 maxCompletions（普通 5 次；Enslaved 下的 EC1 是 1000 次）。
    // addCompletion 内部只在 auto=true 时才可能触发 EC4/EC12 的失败判定，这里传 false，
    // 与正常手动结算一致 —— 不会因为「补次数」把自己判失败。
    while (!challenge.isFullyCompleted) {
      challenge.addCompletion(false);
    }
    // 只有本帧真的新增了完成次数才结算奖励：
    //   重进一个已满级的 EC 时 completions 不变（gained=false），不会重复发 EP。
    //   这也是「同一挑战同一次完成不发两次」的第一道闸门。
    const gained = challenge.completions > before;
    if (gained) this._giveEternityChallengeRewards(challenge);

    player.challenge.eternity.requirementBits &= ~(1 << challenge.id);
    // 第二道闸门：清空 current 后 EternityChallenge.current 变为 undefined，
    // 下一次循环直接走上面的 early return，物理上不可能重复结算。
    player.challenge.eternity.current = 0;
    return gained;
  },

  /**
   * 发放 EC 完成时应得的 EP，并更新最速永恒记录。
   *
   * 为什么必须临时抬高 maxIP：`isGoalReached` 判的是
   * `player.records.thisEternity.maxIP.gte(currentGoal)`（eternity-challenge.js:150），
   * 真实完成那一刻 maxIP 必然 >= 该次完成的目标 IP。而进入即完成结算时 maxIP 已被
   * EC.start() 里的 eternity() 重置为起始值（currency.js:295），
   * gainedEternityPoints()（game.js:367）会算出 0 EP —— 等于完成挑战却没有奖励。
   *
   * 用哪一档目标：本函数把次数一次性补满到 maxCompletions，等价于原版 ECBulk
   * 用一次 maxIP 换 n 次完成（eternity-challenge.js:118 completionsAtIP）。
   * 因此基线取 goalAtCompletions(completions - 1)：这正是「合法拿到第 completions 次
   * 完成所必须达到的最低 IP」，不是自造数值。
   *
   * 结算后还原 maxIP：理由同 C/IC —— 不伪造记录，且不把 maxIP 留在高位
   * （否则 Player.canEternity 恒真，后续每次真实永恒都会重复吃到同一份 EP 基数）。
   * @param {EternityChallengeState} challenge
   */
  _giveEternityChallengeRewards(challenge) {
    const records = player.records.thisEternity;
    const targetIP = challenge.goalAtCompletions(Math.max(challenge.completions - 1, 0));
    const savedMaxIP = records.maxIP;
    if (savedMaxIP.lt(targetIP)) records.maxIP = targetIP;
    try {
      // 原版收益函数：game.js:357 gainedEternityPoints
      Currency.eternityPoints.add(gainedEternityPoints());

      // 与 eternity.js:8-12 的最速永恒记录同源同口径
      const gameTime = inGameTimeOf(records);
      if (gameTime > 0) {
        player.records.bestEternity.time = Math.min(player.records.bestEternity.time, gameTime);
        player.records.bestEternity.realTime = Math.min(player.records.bestEternity.realTime, records.realTime);
      }
    } finally {
      records.maxIP = savedMaxIP;
    }
  }
};

/**
 * 主循环钩子。放在 updateNormalAndInfinityChallenges(diff) 之后调用，
 * 保证本帧的挑战状态已经建立、且早于 EternityChallenge(12).tryFail()，
 * 这样 EC12 不会出现「刚进入就被限时判定判失败」的竞争。
 */
export function tryInstantCompleteChallenges() {
  if (!OrekiInstantChallenge.isActive) return null;
  return OrekiInstantChallenge.tryComplete();
}

globalThis.OrekiInstantChallenge = OrekiInstantChallenge;

export { OrekiInstantChallenge };
