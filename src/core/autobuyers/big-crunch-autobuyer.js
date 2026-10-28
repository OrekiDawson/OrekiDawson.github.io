import { UpgradeableAutobuyerState } from "./autobuyer.js";
import { PlayerProgress } from "../player-progress.js";
import { DC } from "../constants.js";

export class BigCrunchAutobuyerState extends UpgradeableAutobuyerState {
  get data() {
    return player.auto.bigCrunch;
  }

  get name() {
    return `Infinity`;
  }

  get isUnlocked() {
    // [Oreki AU4] 完成过首次无限后即可运行：原版锁在普通挑战 12 之后，
    // 而挑战 10-12 需要 16 次无限才解锁，导致每轮都要手点大坍缩。
    if (Pelle.isDoomed) return PelleStrikes.infinity.hasStrike;
    const unlocked = this.canBeUpgraded || PlayerProgress.infinityUnlocked();
    // [Oreki AU4b] 用默认策略（AMOUNT，amount = 1）开自动坍缩会把反物质永久卡在 1.8e308：
    // 实测 120 s 内 maxAM 恒为 1e25.7、Infinity Dimension 永远不可用，进度实际停滞。
    // 首次接管时换成「单次 IP ≥ 10× 历史最高才坍缩」，让反物质在两次坍缩之间继续成长。
    // 只改策略默认值，不动坍缩条件、重置副作用与间隔。
    if (unlocked && this.data.mode === AUTO_CRUNCH_MODE.AMOUNT && Decimal.lt(this.data.amount, 10)) {
      this.data.mode = AUTO_CRUNCH_MODE.X_HIGHEST;
      this.data.xHighest = new Decimal(10);
    }
    return unlocked;
  }

  get canBeUpgraded() {
    return NormalChallenge(12).isCompleted;
  }

  get baseInterval() {
    return Player.defaultStart.auto.bigCrunch.interval;
  }

  get mode() {
    return this.data.mode;
  }

  set mode(value) {
    this.data.mode = value;
  }

  get hasAdditionalModes() {
    return EternityMilestone.bigCrunchModes.isReached;
  }

  get increaseWithMult() {
    return this.data.increaseWithMult;
  }

  set increaseWithMult(value) {
    this.data.increaseWithMult = value;
  }

  get amount() {
    return this.data.amount;
  }

  // This is unused mechanically, but should be zero to suppress the "Current bulk:" text
  get bulk() {
    return 0;
  }

  set amount(value) {
    this.data.amount = value;
  }

  get time() {
    return this.data.time;
  }

  set time(value) {
    this.data.time = value;
  }

  get xHighest() {
    return this.data.xHighest;
  }

  set xHighest(value) {
    this.data.xHighest = value;
  }

  autoInfinitiesAvailable(considerMilestoneReached) {
    return (considerMilestoneReached || EternityMilestone.autoInfinities.isReached) &&
      !EternityChallenge(4).isRunning && !EternityChallenge(12).isRunning && !Player.isInAntimatterChallenge &&
      player.auto.autobuyersOn && this.data.isActive &&
      !Autobuyer.eternity.isActive && this.mode === AUTO_CRUNCH_MODE.TIME && this.time <= 5 &&
      !Autobuyer.eternity.autoEternitiesAvailable();
  }

  upgradeInterval(free) {
    super.upgradeInterval(free);
    TabNotification.breakInfinity.tryTrigger();
  }

  bumpAmount(mult) {
    if (this.isUnlocked && this.increaseWithMult) {
      this.amount = this.amount.times(mult);
    }
  }

  get canTick() {
    return Player.canCrunch && super.canTick;
  }

  get resetTickOn() {
    return PRESTIGE_EVENT.ETERNITY;
  }

  get highestPrevPrestige() {
    return player.records.thisEternity.maxIP;
  }

  get timeToNextTick() {
    return Math.clampMin(this.time - Time.thisInfinityRealTime.totalSeconds, 0);
  }

  get willInfinity() {
    if (!player.break || Player.isInAntimatterChallenge) return true;
    // [Oreki AD3b] 首次 ID1 突破：IP 已经够了（AD3 兜底已到账）之后，别再坍缩，
    // 让 thisEternity.maxAM 一路爬过 ID1 的反物质门槛（1e1100）。
    // 否则「每轮坍缩把反物质打回低位」会让 maxAM 永远停在 1e3xx，
    // 而 ID1 的 canUnlock 要求 maxAM ≥ 1e1100 —— 与 IP 无关，所以只补 IP 永远解锁不了。
    if (this.waitingForId1Peak) return false;

    switch (this.mode) {
      case AUTO_CRUNCH_MODE.AMOUNT:
        return gainedInfinityPoints().gte(this.amount);
      case AUTO_CRUNCH_MODE.TIME:
        return Time.thisInfinityRealTime.totalSeconds > this.time;
      case AUTO_CRUNCH_MODE.X_HIGHEST:
      default:
        return gainedInfinityPoints().gte(this.highestPrevPrestige.times(this.xHighest));
    }
  }

  /**
   * [Oreki AD3b] 是否应该「攒着不坍缩，等反物质爬到 ID1 门槛」。
   * 只读判断；窗口：已 Break / 未解锁永恒 / 非挑战 / 非毁灭 / IP 已 ≥ 1e8 / maxAM 还没到 1e1100。
   */
  get waitingForId1Peak() {
    try {
      if (!player.break) return false;
      if (PlayerProgress.eternityUnlocked()) return false;
      if (NormalChallenge.isRunning || InfinityChallenge.isRunning) return false;
      if (Pelle.isDoomed) return false;
      if (Currency.infinityPoints.value.lt(DC.E8)) return false;
      return player.records.thisEternity.maxAM.lt(DC.E1100);
    } catch (e) {
      return false;
    }
  }

  tick() {
    super.tick();
    if (this.willInfinity) bigCrunchResetRequest(true);
  }

  reset() {
    super.reset();
    if (EternityMilestone.bigCrunchModes.isReached) return;
    this.mode = AUTO_CRUNCH_MODE.AMOUNT;
  }
}
