import { UpgradeableAutobuyerState } from "./autobuyer.js";

export class GalaxyAutobuyerState extends UpgradeableAutobuyerState {
  get data() {
    return player.auto.galaxy;
  }

  get name() {
    return `Antimatter Galaxy`;
  }

  get isUnlocked() {
    if (Pelle.isDisabled("galaxyAutobuyer")) return false;
    // [Oreki AU3] 完成过首次无限后即可运行（历史实现，与维度提升同一条规则）。
    // [R100 P1] 方案 B：新档立即解锁反物质星系自动购买器。
    // 只放宽「解锁」判据，不写 isBought、不改挑战完成位/成就/资源/购买记录。
    return true;
  }

  get canBeUpgraded() {
    return NormalChallenge(11).isCompleted;
  }

  get baseInterval() {
    return Player.defaultStart.auto.galaxy.interval;
  }

  get limitGalaxies() {
    return this.data.limitGalaxies;
  }

  set limitGalaxies(value) {
    this.data.limitGalaxies = value;
  }

  get maxGalaxies() {
    return this.data.maxGalaxies;
  }

  set maxGalaxies(value) {
    this.data.maxGalaxies = value;
  }

  get buyMaxInterval() {
    return this.data.buyMaxInterval;
  }

  set buyMaxInterval(value) {
    this.data.buyMaxInterval = value;
  }

  get isBuyMaxUnlocked() {
    return EternityMilestone.autobuyMaxGalaxies.isReached;
  }

  get interval() {
    return this.isBuyMaxUnlocked
      ? TimeSpan.fromSeconds(this.buyMaxInterval).totalMilliseconds
      : super.interval;
  }

  get canTick() {
    return Galaxy.canBeBought && Galaxy.requirement.isSatisfied && super.canTick;
  }

  get resetTickOn() {
    return PRESTIGE_EVENT.INFINITY;
  }

  tick() {
    super.tick();
    const limit = this.limitGalaxies ? this.maxGalaxies : Number.MAX_VALUE;
    requestGalaxyReset(this.isBuyMaxUnlocked, limit);
  }
}
