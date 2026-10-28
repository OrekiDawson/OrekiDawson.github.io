/**
 * AD: Oreki Edition — 挑战进入即完成
 *
 * 目标：C / IC / EC 一旦成功进入，就在下一次游戏循环里按「正常结算路径」立即完成，
 * 省掉刷挑战的现实时间。不是伪装 UI，也不是直接改存档位域：
 *   - C/IC：复用 big-crunch.js 里 handleChallengeCompletion() 的两个动作
 *           （challenge.complete() + challenge.updateChallengeTime()），然后清空当前挑战；
 *   - EC  ：复用 eternity.js 里 giveEternityRewards() 的 addCompletion() 逻辑，
 *           补满到 maxCompletions，清 requirementBits，再退出挑战。
 *
 * 为什么不做「模拟一次无限/永恒重置」：
 *   - C/IC 的正常结算是玩家自己打满后手动 Infinity 触发，那次 Infinity 会给 IP / 无限次数。
 *     进入即完成如果再补一次大重置，等于每次进挑战白送一份重置收益，可被反复刷。
 *   - EC 的 start() 里已经做过一次 eternity(false, auto, { enteringEC: true })，
 *     进入即完成再调一次 eternity(true) 同样会白送 EP。
 *   所以这里只做「结算 + 退出挑战」，不改任何资源、不碰时间统计的推进方式。
 *
 * 幂等与安全性：
 *   - 只在 player.challenge.*.current 非 0（也就是 start() 真的成功）时才动作；
 *   - C/IC 已经完成过的挑战不会再调 complete()，避免重复派发 INFINITY_CHALLENGE_COMPLETED；
 *   - 结算后立刻把 current 清零，所以下一次循环不会重复结算；
 *   - 不修改解锁条件（Tab.challenges.isUnlocked / lockedAt / hasUnlocked 一律不动）。
 */

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
  // 对应 big-crunch.js::handleChallengeCompletion()：
  //   challenge.complete() -> challenge.updateChallengeTime() -> 清空 current
  // 差别只有一处：不执行 bigCrunchReset()，因此不发放 IP / 无限次数。
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
      challenge.complete();
      challenge.updateChallengeTime();
    }

    player.challenge.normal.current = 0;
    player.challenge.infinity.current = 0;

    if (infinityId) out.infinity = !alreadyCompleted;
    else out.normal = !alreadyCompleted;
    return out;
  },

  // ------------------------------------------------------------------- EC
  // 对应 eternity.js::giveEternityRewards() 中 EC 分支：
  //   addCompletion(false) -> 清 requirementBits -> 退出挑战
  // 不调用 eternity()，因此不发放 EP、也不重算最快永恒时间。
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
    player.challenge.eternity.requirementBits &= ~(1 << challenge.id);
    player.challenge.eternity.current = 0;
    return challenge.completions > before;
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
