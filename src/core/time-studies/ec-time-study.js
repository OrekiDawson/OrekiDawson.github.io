import { TimeStudy } from "./normal-time-study.js";
import { TimeStudyState } from "./time-studies.js";
import { isOrekiBootstrapRun } from "../oreki-bootstrap.js";

/**
 * [Oreki AD15] EC 入口资源门槛的 MOD 缩放系数（Reality 解锁前生效）。
 * 见 `requirementTotal` 里的说明：不加这个缩放，EC3 及之后几关在
 * 10000× / 180 分钟目标下是死锁，而不是可玩的挑战。
 */
const OREKI_EC_REQUIREMENT_DIVISOR = 100;

export class ECTimeStudyState extends TimeStudyState {
  constructor(config) {
    super(config, TIME_STUDY_TYPE.ETERNITY_CHALLENGE);
    this.invalidateRequirement();
  }

  get isBought() {
    return player.challenge.eternity.unlocked === this.id;
  }

  purchase(auto) {
    if (GameEnd.creditsEverClosed) return false;
    EternityChallenge(this.id).hasUnlocked = true;
    const clickTime = Date.now();

    if (this.isBought && player.challenge.eternity.current === 0 && !auto) {
      // If it is bought and you aren't in a Eternity Challenge, check
      if (clickTime - ui.lastClickTime < 750) {
        // If you last clicked on it within 3/4ths of a second, enter them in or ask confirmation if they have that on
        ui.lastClickTime = 0;
        EternityChallenge(this.id).requestStart();
      } else {
        // Otherwise, record it for the next time they click
        ui.lastClickTime = clickTime;
      }
    } else if (!this.isBought && this.canBeBought) {
      // If you haven't bought it and can buy it, reset the time of click, and
      // send you into the EC, deduct your resources, and move you to the EC tab if that isn't disabled
      ui.lastClickTime = 0;

      player.challenge.eternity.unlocked = this.id;
      if (!auto) {
        Tab.challenges.eternity.show();
      }
      player.challenge.eternity.requirementBits |= 1 << this.id;
      Currency.timeTheorems.subtract(this.cost);
      TimeStudyTree.commitToGameState([TimeStudy.eternityChallenge(this.id)]);
      return true;
    }
    return false;
  }

  purchaseUntil() {
    const studiesToBuy = [
      undefined,
      171, 171, 171,
      143, 42, 121,
      111, 123, 151,
      181, 181, 181
    ];
    // If the player shift clicks an EC study that is immediately buyable, we try to
    // buy it first - in case buying studies up to that point renders it unaffordable.
    this.purchase();
    TimeStudyTree.commitToGameState(buyStudiesUntil(studiesToBuy[this.id], this.id));
    // For EC 11 and 12, we can't choose between light and dark,
    // but we can buy the 191/193
    if (this.id === 11) {
      TimeStudy(191).purchase();
    } else if (this.id === 12) {
      TimeStudy(193).purchase();
    }
    this.purchase();
  }

  get canBeBought() {
    if (!this.isAffordable) {
      return false;
    }
    if (player.challenge.eternity.unlocked !== 0) {
      return false;
    }
    if (!this.config.requirement.some(s => TimeStudy(s).isBought)) {
      return false;
    }
    return this.allSecondaryRequirementsMet;
  }

  /**
   * @returns {EternityChallengeState}
   */
  get challenge() {
    return EternityChallenge(this.id);
  }

  get requirementTotal() {
    const base = this.config.secondary.required(this.challenge.completions);
    // [Oreki AD15] MOD 定制（非原版）：EC 入口资源统一按 1/100 缩放，Reality 解锁后恢复原版。
    //
    // 为什么必须这么做（R23/R24 实测，不是拍脑袋）：
    // EC3 的入口是 `AntimatterDimension(8).totalAmount >= 17300`（随后每完成一次 +1250）。
    // 而这个值只能在**两次大坍缩之间**积累，因为坍缩会把维度数量清零；
    // 可一旦真的暂停坍缩去攒它，IP 就没有来源 → 没有无限维度乘数 → 反物质上不去 →
    // AD8 根本买不起。实测：加窄保护后 40~100 秒整局冻结（et 388 不变、AD8 恒为 0）。
    // 也就是说「攒 17300 个 AD8」在本 MOD 的 10000×/180 分钟目标下是死锁，
    // 不是玩家操作问题。其余 EC（EC4 要 1e8 无限次数等）同理。
    //
    // 缩放后仍然要真实达到门槛、真实购买 EC 研究、真实进入并完成挑战；
    // 只改数值门槛，不伪造任何完成状态。
    // [Oreki R26] 原来这里写 `if (PlayerProgress.realityUnlocked()) return base;`。
    // 现实重置会把 `player.eternityChalls` 清空（reality.js:666）→ 每完成一次现实都要
    // 把 EC1~12 重新打一遍；而永久标志永远为 true → 这一遍要用原版门槛，
    // 也就是当初实测证明**不可达**的那套（EC3 要 17300 个 AD8 等）。
    // R26 实测后果：现实后 `ecDone` 只有 9 关到 5 次、EC6/8/12 恒 0、
    // `player.challenge.eternity.unlocked` 恒 0、`ecEntryPending()` 永久挂住自动永恒
    // （et 冻结在 972153，EP 停在 1e1255694）。
    // 改用 `isOrekiBootstrapRun()`（核心模块 core/oreki-bootstrap.js）：
    // 每次现实后窗口会自动重开，买回现实时间研究即恢复原版门槛。
    if (!isOrekiBootstrapRun()) return base;
    try {
      if (typeof base === "number") return Math.max(1, Math.floor(base / OREKI_EC_REQUIREMENT_DIVISOR));
      return base.div(OREKI_EC_REQUIREMENT_DIVISOR).clampMin(1);
    } catch (e) {
      return base;
    }
  }

  get requirementCurrent() {
    const current = this.config.secondary.current();
    if (this.cachedCurrentRequirement === undefined) {
      this.cachedCurrentRequirement = current;
    } else if (typeof current === "number") {
      this.cachedCurrentRequirement = Math.max(this.cachedCurrentRequirement, current);
    } else {
      this.cachedCurrentRequirement = this.cachedCurrentRequirement.clampMin(current);
    }
    return this.cachedCurrentRequirement;
  }

  get allSecondaryRequirementsMet() {
    return Perk.studyECRequirement.isBought || !this.hasForbiddenStudies && this.isEntryGoalMet;
  }

  get hasForbiddenStudies() {
    return this.config.secondary.forbiddenStudies?.some(s => TimeStudy(s).isBought);
  }

  get isEntryGoalMet() {
    if (this.wasRequirementPreviouslyMet) return true;
    if (this.config.secondary.forbiddenStudies) return true;
    const current = this.requirementCurrent;
    const total = this.requirementTotal;
    return typeof current === "number" ? current >= total : current.gte(total);
  }

  get wasRequirementPreviouslyMet() {
    if (this.id === 11 || this.id === 12) return false;
    return (player.challenge.eternity.requirementBits & (1 << this.id)) !== 0;
  }

  invalidateRequirement() {
    this.cachedCurrentRequirement = undefined;
  }
}

ECTimeStudyState.studies = mapGameData(
  GameDatabase.eternity.timeStudies.ec,
  config => new ECTimeStudyState(config)
);

/**
 * @param {number} id
 * @returns {ECTimeStudyState}
 */
TimeStudy.eternityChallenge = function(id) {
  return ECTimeStudyState.studies[id];
};

/**
 * @returns {ECTimeStudyState|undefined}
 */
TimeStudy.eternityChallenge.current = function() {
  return player.challenge.eternity.unlocked
    ? TimeStudy.eternityChallenge(player.challenge.eternity.unlocked)
    : undefined;
};

ECTimeStudyState.invalidateCachedRequirements = function() {
  ECTimeStudyState.studies.forEach(study => study.invalidateRequirement());
};
