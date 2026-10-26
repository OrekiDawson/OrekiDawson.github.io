/**
 * @abstract
 */
export class AutobuyerState {
  constructor(id = null) {
    this._id = id;
  }

  /**
   * @abstract
   */
  get data() { throw new NotImplementedError(); }

  /**
   * @abstract
   */
  get isUnlocked() { throw new NotImplementedError(); }

  get id() { return this._id; }

  get canTick() {
    const isDisabled = !player.auto.autobuyersOn || !this.constructor.isActive;
    return this.isActive && !isDisabled && (this.isUnlocked || this.isBought);
  }

  get isActive() {
    return this.data.isActive;
  }

  set isActive(value) {
    this.data.isActive = value;
  }

  get bulk() {
    return 1;
  }

  toggle() {
    this.isActive = !this.isActive;
  }

  /**
   * @abstract
   */
  tick() { throw new NotImplementedError(); }

  // eslint-disable-next-line no-empty-function
  reset() { }

  static get entryCount() { return 1; }

  /**
   * @abstract
   * @returns {string}
   */
  static get autobuyerGroupName() { throw new NotImplementedError(); }
  static get isActive() { return true; }
  /** @abstract */
  static set isActive(value) { throw new NotImplementedError(); }

  static createAccessor() {
    const entryCount = this.entryCount;
    /** @type {object[]} */
    const zeroIndexed = Array.range(1, entryCount).map(id => new this(id));
    const oneIndexed = [null, ...zeroIndexed];
    /** @param {number} id */
    const accessor = id => oneIndexed[id];
    Object.defineProperties(accessor, {
      oneIndexed: { get: () => oneIndexed },
      zeroIndexed: { get: () => zeroIndexed },
      entryCount: { get: () => entryCount },
      anyUnlocked: { get: () => zeroIndexed.some(x => x.isUnlocked) },
      allUnlocked: { get: () => zeroIndexed.every(x => x.isUnlocked) },
      allActive: { get: () => zeroIndexed.every(x => x.isActive) },
      groupName: { get: () => this.autobuyerGroupName },
      isActive: {
        get: () => this.isActive,
        set: value => { this.isActive = value; },
      },
    });
    accessor.toggle = () => this.isActive = !this.isActive;
    return accessor;
  }
}


/**
 * @abstract
 */
export class IntervaledAutobuyerState extends AutobuyerState {
  get interval() {
    return this.data.interval;
  }

  /** 是否把 interval 按全局倍率缩放（实验开关，默认只有反物质维度购买器启用） */
  get usesSpeedScaledInterval() {
    return false;
  }

  /**
   * 实际用于比较的间隔。
   * 关闭开关（默认）时就是 interval，行为与原版一致；
   * 打开时 interval / 倍率，使购买节奏按「游戏时间」而非「现实时间」——
   * 否则高倍率下每个现实毫秒对应的游戏时间变多，购买决策密度会被稀释。
   * 只影响触发判定，不改 `lastTick` 的记账口径（仍记现实时间）。
   */
  get effectiveInterval() {
    if (!this.usesSpeedScaledInterval) return this.interval;
    const scaling = typeof GameSpeed !== "undefined" && GameSpeed.scaleAutobuyerInterval;
    if (!scaling) return this.interval;
    return this.interval / Math.max(1, getGlobalSpeedFactor());
  }

  get canTick() {
    return super.canTick && this.timeSinceLastTick >= this.effectiveInterval;
  }

  get timeSinceLastTick() {
    return player.records.realTimePlayed - this.data.lastTick;
  }

  tick() {
    this.data.lastTick = player.records.realTimePlayed;
  }

  /**
   * @abstract
   */
  get resetTickOn() { return undefined; }

  resetTick(prestigeEvent) {
    if (prestigeEvent >= this.resetTickOn) this.data.lastTick = 0;
  }

  // eslint-disable-next-line no-empty-function
  reset() { }
}


/**
 * @abstract
 */
export class UpgradeableAutobuyerState extends IntervaledAutobuyerState {
  /**
  * @abstract
  */
  get baseInterval() { throw new NotImplementedError(); }

  get cost() {
    return this.data.cost;
  }

  get interval() {
    const interval = this.data.interval;
    return BreakInfinityUpgrade.autobuyerSpeed.isBought ? interval / 2 : interval;
  }

  get hasMaxedInterval() {
    return this.data.interval <= 100;
  }

  upgradeInterval(free) {
    if (this.hasMaxedInterval) return;
    if (!free && !Currency.infinityPoints.purchase(this.cost)) return;
    this.data.cost *= 2;
    this.data.interval = Math.clampMin(this.data.interval * 0.6, 100);
    Achievement(52).tryUnlock();
    Achievement(53).tryUnlock();
    GameUI.update();
  }

  maxIntervalForFree() {
    while (!this.hasMaxedInterval) {
      this.upgradeInterval(true);
    }
  }

  reset() {
    if (EternityMilestone.keepAutobuyers.isReached || PelleUpgrade.keepAutobuyers.canBeApplied) return;
    this.data.interval = this.baseInterval;
    this.data.cost = 1;
  }

  static createAccessor() {
    const accessor = super.createAccessor();
    Object.defineProperty(accessor, "allMaxedInterval", {
      get: () => accessor.zeroIndexed.every(x => x.hasMaxedInterval)
    });
    Object.defineProperty(accessor, "hasInstant", {
      get: () => accessor.zeroIndexed.some(x => x.interval < player.options.updateRate)
    });
    return accessor;
  }
}
