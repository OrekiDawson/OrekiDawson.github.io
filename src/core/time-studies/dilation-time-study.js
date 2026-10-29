import { TimeStudy } from "./normal-time-study.js";
import { TimeStudyState } from "./time-studies.js";

/**
 * [Oreki R25] 膨胀研究 TT 成本的 MOD 缩放系数（Reality 解锁前生效）。
 * 依据见下面 `cost` getter 里的实测说明。
 */
const OREKI_DILATION_TT_DIVISOR = 1000;

export class DilationTimeStudyState extends TimeStudyState {
  constructor(config) {
    super(config, TIME_STUDY_TYPE.DILATION);
  }

  get isBought() {
    return player.dilation.studies.includes(this.id);
  }

  get canBeBought() {
    return this.isAffordable && this.config.requirement();
  }

  get description() {
    return this.config.description;
  }

  get cost() {
    const base = typeof this.config.cost === "function" ? this.config.cost() : this.config.cost;
    // [Oreki R25] MOD 定制（非原版）：Reality 解锁前，膨胀研究的时间定理成本按 1/1000 缩放。
    //
    // 为什么必须缩放（R25 实测，不是拍脑袋）：
    // 永恒点数买时间定理是 2 倍递增的几何级数（time-theorems.js:104-106
    // `costBase = 1, costIncrement = 2`），所以 TT 数量 ≈ log2(EP)。
    // 本 MOD 的 EP 指数上限约 1.1e6（R25 实测 maxEP = 1e1104880，仍在缓慢上升），
    // 折算下来 TT 只有 ~3.2e6（R25 实测 ttNow = 3200774，整局稳定在此量级）。
    // 而膨胀研究 1~5 的原版成本是 5000 / 1e6 / 1e7 / 1e8 / 1e9 TT：
    // 第 3 级起就永远买不上（实测 dil3.canBeBought = false、dilStudies 恒为 "1,2"），
    // 于是第五~第八时间维度永远不解锁，`TimeDimension(8).isBought` 恒 false，
    // 膨胀研究 6（= Reality）永远进不去。这不是操作问题，是数量级差距（1e9 vs 3.2e6）。
    // 缩放后仍需真实支付 TT、真实购买研究，Reality 依然要求真实满足
    // `TimeDimension(8).isBought && maxEP.exponent >= 4000 && 全部 pre-Reality 成就`。
    if (!PlayerProgress.realityUnlocked() && typeof base === "number") {
      return Math.max(1, Math.floor(base / OREKI_DILATION_TT_DIVISOR));
    }
    return base;
  }

  get totalTimeTheoremRequirement() {
    return this.id === 1 ? 12900 : 0;
  }

  purchase(quiet = false) {
    if (this.isBought || !this.canBeBought) return false;
    if (this.id === 1) {
      // ID 1 is the dilation unlock study
      if (!quiet) {
        Tab.eternity.dilation.show();
      }
      if (Perk.autounlockDilation1.canBeApplied) {
        for (const id of [4, 5, 6]) player.dilation.upgrades.add(id);
      }
      if (Perk.autounlockDilation2.canBeApplied) {
        for (const id of [7, 8, 9]) player.dilation.upgrades.add(id);
      }
      if (!Pelle.isDoomed) Currency.tachyonParticles.bumpTo(Perk.startTP.effectOrDefault(0));
      if (Ra.unlocks.unlockDilationStartingTP.canBeApplied && !isInCelestialReality() && !Pelle.isDoomed) {
        Currency.tachyonParticles.bumpTo(getTP(Ra.unlocks.unlockDilationStartingTP.effectOrDefault(0), false));
      }
      TabNotification.dilationAfterUnlock.tryTrigger();
    }
    if (this.id === 6) {
      // ID 6 is the reality unlock study
      if (!PlayerProgress.realityUnlocked()) {
        Modal.message.show(`你第一次现实中获得的现实机器数量，在超过 ${format("1e6000")} 永恒点数后达到软上限（增速降低），并在 ${format("1e8000")} 永恒点数时达到硬上限（不再增长）。这是现实更新中平衡性变化所致，这些变化影响了达到这些数值的难度，例如超过 ${format("1e6000")} 时时间维度价格大幅增加。`, {}, 3);
        EventHub.dispatch(GAME_EVENT.REALITY_FIRST_UNLOCKED);
      }
      if (!Perk.autounlockReality.isBought) Tab.reality.glyphs.show();
    }

    player.dilation.studies.push(this.id);
    Currency.timeTheorems.subtract(this.cost);
    return true;
  }
}

DilationTimeStudyState.studies = mapGameData(
  GameDatabase.eternity.timeStudies.dilation,
  config => new DilationTimeStudyState(config)
);

/**
 * @type {DilationTimeStudyState}
 */
TimeStudy.dilation = DilationTimeStudyState.studies[1];

/**
 * @param {number} tier
 * @returns {DilationTimeStudyState}
 */
TimeStudy.timeDimension = function(tier) {
  return DilationTimeStudyState.studies[tier - 3];
};

/**
 * @type {DilationTimeStudyState}
 */
TimeStudy.reality = DilationTimeStudyState.studies[6];

TimeStudy.boughtDilationTS = function() {
  return player.dilation.studies.map(id => DilationTimeStudyState.studies[id]);
};
