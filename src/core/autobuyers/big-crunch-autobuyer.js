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
    // [Oreki AD14 已回退] 曾在这里挂「仅 EC3 时暂停坍缩」的窄保护。
    // 实测证明这条路是死锁：不坍缩就没有 IP → 没有无限维度乘数 → 反物质上不去 →
    // 第八反物质维度根本买不起。加保护后 40~100 秒整局冻结（et 恒 388、AD8 恒 0）。
    // 已改用 AD15 的 EC 入口门槛缩放（ec-time-study.js 的 requirementTotal）。
    // [Oreki AD12 已回退] 曾在这里挂「EC 入口资源未满足时暂停坍缩」，
    // 但实测反向亏损：EC1 的入口门槛就是**永恒次数**，暂停坍缩只会让永恒次数涨得更慢；
    // 实测 90 秒时 TT 8.3 万、et 仅 21、EC 一次都没完成（挂钩前 49 秒就能完成 EC1/EC2）。
    // 因此撤掉挂钩，保留原版的 10× 最高 IP 节奏。
    // 需要时 OrekiEternityAutomation.shouldHoldReset 仍可单独调用。

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
      // [Oreki R26] 原来这里是 `if (PlayerProgress.eternityUnlocked()) return false;`。
      // 现实重置会把无限维度整体 `fullReset()`（ID1 重新锁定，门槛仍是 1e1100），
      // 而永久进度标志永远为 true → 第一次现实之后这个「攒着别坍缩」的保护消失，
      // 每次坍缩都把反物质打回低位，ID1 的反物质门槛再也爬不到。
      // 改用真实状态：ID1 已解锁才停手。挑战里 `player.break` 为 false，已在上面返回。
      if (InfinityDimension(1).isUnlocked) return false;
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
    // [Oreki R26] 原来这里把模式打回 `AMOUNT`。首次永恒前 `AMOUNT` 的 amount 还是 1
    // （`isUnlocked` 会顺手改成 X_HIGHEST），所以看不出来；但 `amount` 会被
    // `bumpAmount()` 一路乘大，一旦它 ≥ 10，上面那段归一化就再也不触发。
    // 现实重置会把 `player.eternities` 清零 → `EternityMilestone.bigCrunchModes`
    // 反而不成立 → 每次 `reset()` 都把模式锁死成 `AMOUNT` + 一个巨大的固定 amount。
    // 后果（R26 真新档 300 s 实测）：坍缩阈值固定，`thisInfinity.maxAM` 被钉在
    // 1e25.7、`thisEternity.maxAM` 冻结在 1e865.651 整整 200 秒，ID1 的 1e1100
    // 门槛永远到不了 → 无限维度全锁、`et` 恒 0，现实层完全停摆。
    // 改成与 `isUnlocked` 的归一化同口径：恢复「单次 IP ≥ 10× 本次永恒最高」策略，
    // 让反物质每次坍缩都能上一个台阶。
    this.mode = AUTO_CRUNCH_MODE.X_HIGHEST;
    this.data.xHighest = new Decimal(10);
  }
}
