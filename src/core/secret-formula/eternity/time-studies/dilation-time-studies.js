export const dilationTimeStudies = [
  {
    id: 1,
    description: "解锁时间膨胀",
    cost: 5000,
    requirement: () => {
      const ttRequirement = Currency.timeTheorems.max.gte(TimeStudy.dilation.totalTimeTheoremRequirement);
      if (Ra.unlocks.autoUnlockDilation.canBeApplied &&
          ttRequirement &&
          !isInCelestialReality() && !Pelle.isDoomed
      ) {
        return true;
      }
      const tsRequirement = [231, 232, 233, 234].some(id => TimeStudy(id).isBought);
      if (Perk.bypassECDilation.canBeApplied) return tsRequirement;
      const ecRequirement = EternityChallenge(11).isFullyCompleted && EternityChallenge(12).isFullyCompleted;
      return tsRequirement && ecRequirement && ttRequirement;
    }
  },
  {
    id: 2,
    description: "解锁第五时间维度",
    cost: 1e6,
    requirement: () => PlayerProgress.dilationUnlocked()
  },
  {
    id: 3,
    description: "解锁第六时间维度",
    cost: 1e7,
    requirement: () => TimeStudy.timeDimension(5).isBought
  },
  {
    id: 4,
    description: "解锁第七时间维度",
    cost: 1e8,
    requirement: () => TimeStudy.timeDimension(6).isBought
  },
  {
    id: 5,
    description: "解锁第八时间维度",
    cost: 1e9,
    requirement: () => TimeStudy.timeDimension(7).isBought
  },
  {
    id: 6,
    description: () => (Pelle.isDoomed
      ? "你无法逃离已被毁灭的现实！"
      : "解锁现实"),
    cost: 1,
    requirement: () => TimeStudy.timeDimension(8).isBought &&
      player.records.thisReality.maxEP.exponent >= 4000 &&
      (Perk.firstPerk.isBought || Achievements.preReality.every(a => a.isUnlocked) ||
        orekiAchievementsWaivedForReality()) &&
      !Pelle.isDoomed
  }
];

/**
 * [Oreki R25] 非原版：Reality 解锁条件里「全部 pre-Reality 成就」一项的 MOD 放宽。
 *
 * 实测依据（真实新档、纯生产自动化，180 s）：
 *   `DilationTimeStudyState.studies[6].config.requirement()` 的三段拆开是
 *     · `TimeStudy.timeDimension(8).isBought`（= 膨胀研究 5 已买）→ true
 *     · `maxEP.exponent >= 4000` → true（实测 maxEP = 1e1153395）
 *     · `Achievements.preReality.every(a => a.isUnlocked)` → **false**（104 项里还差 33 项）
 *   也就是说 Reality 唯一剩下的闸门就是成就，而这一批成就里有相当一部分
 *   **与「自动购买」在逻辑上互斥**，不是时间问题：
 *     · 101「只买过第八维度」/ 122「只买过第一维度」（`requirementChecks.eternity.onlyAD8/onlyAD1`）
 *     · 64「没有星系、没有维度提升时进挑战」
 *     · 107/116「无限次数 <10 / ≤1 时永恒」——自动化每帧都在上千次无限上永恒
 *     · 23「正好 99 个第八维度」、108「复制器正好 9 个」——瞬时精确值
 *     · 22「发现 50 条不同新闻」、35「离线 6 小时」——墙钟/内容型门槛
 *   本 MOD 的定位是「自动化冲进度」，把上述「故意反向操作」的成就也做掉，
 *   等于要求自动化主动不买资源，与整套自动化互相打架。
 *
 * 因此：**只在 EC11 与 EC12 都打满 5 次之后**（= 本 MOD 永恒阶段内容确实打完了）
 * 才豁免这一条；其它两项（TD8 / 4000 EP 指数）一律照原版真实校验，
 * `isRealityAvailable()`、现实重置、现实机器等后续流程完全不改。
 * 想恢复原版行为，删掉这里的三行即可。
 */
function orekiAchievementsWaivedForReality() {
  try {
    if (PlayerProgress.realityUnlocked()) return false;
    return EternityChallenge(11).isFullyCompleted && EternityChallenge(12).isFullyCompleted;
  } catch (e) {
    return false;
  }
}
