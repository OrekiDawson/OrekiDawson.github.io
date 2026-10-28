import { UpgradeableAutobuyerState } from "./autobuyer.js";
import { PlayerProgress } from "../player-progress.js";

export class DimBoostAutobuyerState extends UpgradeableAutobuyerState {
  get data() {
    return player.auto.dimBoost;
  }

  get name() {
    return `Dimension Boost`;
  }

  get isUnlocked() {
    if (Pelle.isDisabled("dimBoostAutobuyer")) return false;
    // [Oreki AU3] 完成过首次无限后即可运行：原版把它锁在普通挑战 10 之后，
    // 而挑战要先有无限才能进，导致首次无限到 1e308 之间全靠手点「维度提升」。
    return this.canBeUpgraded || PlayerProgress.infinityUnlocked();
  }

  get canBeUpgraded() {
    return NormalChallenge(10).isCompleted;
  }

  get baseInterval() {
    return Player.defaultStart.auto.dimBoost.interval;
  }

  get limitDimBoosts() {
    return this.data.limitDimBoosts;
  }

  set limitDimBoosts(value) {
    this.data.limitDimBoosts = value;
  }

  get maxDimBoosts() {
    return this.data.maxDimBoosts;
  }

  set maxDimBoosts(value) {
    this.data.maxDimBoosts = value;
  }

  get limitUntilGalaxies() {
    return this.data.limitUntilGalaxies;
  }

  set limitUntilGalaxies(value) {
    this.data.limitUntilGalaxies = value;
  }

  get galaxies() {
    return this.data.galaxies;
  }

  set galaxies(value) {
    this.data.galaxies = value;
  }

  get bulk() {
    return this.data.bulk;
  }

  set bulk(value) {
    this.data.bulk = value;
  }

  get buyMaxInterval() {
    return this.data.buyMaxInterval;
  }

  set buyMaxInterval(value) {
    this.data.buyMaxInterval = value;
  }

  get isBuyMaxUnlocked() {
    return BreakInfinityUpgrade.autobuyMaxDimboosts.isBought;
  }

  get interval() {
    return this.isBuyMaxUnlocked
      ? TimeSpan.fromSeconds(this.buyMaxInterval).totalMilliseconds
      : super.interval;
  }

  get canTick() {
    return DimBoost.canBeBought && DimBoost.requirement.isSatisfied && super.canTick;
  }

  get resetTickOn() {
    // Before max dimboost, we want to do dimboosts as quickly as possible,
    // so we reset the autobuyer's timer to 0 after every galaxy.
    // After max dimboost, we'll generally have "Blink of an eye",
    // so doing a dimboost right after a galaxy will do a single dimboost
    // and then wait for the autobuyer interval to do any more dimboosts,
    // which seems unideal and in fact does slow getting dimboosts/galaxies
    // at the start of infinities down by about 20%.
    // After "Yo dawg, I heard you liked reskins...", it doesn't matter much
    // which we do (less than 1 tick difference, it seems).
    return this.isBuyMaxUnlocked ? PRESTIGE_EVENT.INFINITY : PRESTIGE_EVENT.ANTIMATTER_GALAXY;
  }

  tick() {
    if (this.isBuyMaxUnlocked) {
      const galaxyCondition = !this.limitUntilGalaxies || player.galaxies >= this.galaxies;
      if (!DimBoost.canUnlockNewDimension && !galaxyCondition) return;
      requestDimensionBoost(true);
      super.tick();
      return;
    }

    const limitCondition = !this.limitDimBoosts || DimBoost.purchasedBoosts < this.maxDimBoosts;
    const galaxyCondition = this.limitUntilGalaxies && player.galaxies >= this.galaxies;
    if (limitCondition || galaxyCondition) {
      requestDimensionBoost(false);
      super.tick();
    }
  }
}
