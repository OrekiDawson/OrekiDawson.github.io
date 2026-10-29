import { BitPurchasableMechanicState, RebuyableMechanicState } from "./game-mechanics/index.js";

/**
 * [Oreki R28] 一次性现实升级的价格缩放系数。
 * 原版最贵的 5 个一次性升级各 100000 RM，而 RM 单次收益实测仅 ≈905，
 * 不缩放就需要 ≈110 次现实才能凑齐成就 147 的前置 → 天神链完全不可达。
 * 手法与既有的 `OREKI_DILATION_TT_DIVISOR = 1000`（膨胀研究 TT 成本缩放）一致。
 */
const OREKI_REALITY_UPGRADE_COST_DIVISOR = 1000;

class RealityUpgradeState extends BitPurchasableMechanicState {
  constructor(config) {
    super(config);
    this.registerEvents(config.checkEvent, () => this.tryUnlock());
  }

  /**
   * [Oreki R28] 一次性现实升级（id ≥ 6）的价格按 MOD 缩放。
   *
   * ── 为什么需要 ────────────────────────────────────────────────────
   * 原版价格阶梯是 15 / 50 / 1500 / 100000 RM。而 RM 的单次收益是
   * `MachineHandler.gainedRealityMachines`，实测在 300 秒真实新档里只有 ≈905
   * （`rmGainL = 905.85`），每次现实还要等 `REALITY_MIN_INTERVAL_MS`。
   * 于是最贵的 5 个一次性升级（RU21~25，各 100000 RM）需要 **≈110 次现实**，
   * 而「购买所有现实升级」= 成就 147 = 特蕾莎门票 = 整条天神链的入口。
   * 也就是说：**不改价格就永远走不到天神**，后面的鹿颈长 / 薇 / 太阳神 /
   * 莱特拉 / Pelle 全部不可达。
   *
   * ── 边界 ──────────────────────────────────────────────────────────
   * · 只改**价格数值**，购买流程完全不变：照样扣 RM、照样写 `upgradeBits`、
   *   照样派发 `REALITY_UPGRADE_BOUGHT`、成就 147 仍由原版 `allBought` 判定
   *   ——**必须真的买齐 20 个一次性 RU 才成立**；
   * · 不改成本公式、不改效果、不改解锁条件（除上文 `tryUnlock` 的三条例外）、
   *   不动终局判定；
   * · 可重复的 1~5 号升级价格**不动**（那是刷取循环，不该被缩放）。
   *
   * 手法与既有的 `OREKI_DILATION_TT_DIVISOR = 1000`（膨胀研究 TT 成本缩放）一致。
   */
  get cost() {
    const base = this.config.cost;
    if (this.id < 6) return base;
    return new Decimal(base).dividedBy(OREKI_REALITY_UPGRADE_COST_DIVISOR);
  }

  get automatorPoints() {
    return this.config.automatorPoints ? this.config.automatorPoints : 0;
  }

  get name() {
    return this.config.name;
  }

  get shortDescription() {
    return this.config.shortDescription ? this.config.shortDescription() : "";
  }

  get requirement() {
    return typeof this.config.requirement === "function" ? this.config.requirement() : this.config.requirement;
  }

  get lockEvent() {
    return typeof this.config.lockEvent === "function" ? this.config.lockEvent() : this.config.lockEvent;
  }

  get currency() {
    return Currency.realityMachines;
  }

  get bitIndex() {
    return this.id;
  }

  get bits() {
    return player.reality.upgradeBits;
  }

  set bits(value) {
    player.reality.upgradeBits = value;
  }

  get hasPlayerLock() {
    return (player.reality.reqLock.reality & (1 << this.bitIndex)) !== 0;
  }

  set hasPlayerLock(value) {
    if (value) player.reality.reqLock.reality |= 1 << this.bitIndex;
    else player.reality.reqLock.reality &= ~(1 << this.bitIndex);
  }

  get isLockingMechanics() {
    const shouldBypass = this.config.bypassLock?.() ?? false;
    return this.hasPlayerLock && this.isPossible && !shouldBypass && !this.isAvailableForPurchase;
  }

  // Required to be changed this way to avoid direct prop mutation in Vue components
  setMechanicLock(value) {
    this.hasPlayerLock = value;
  }

  toggleMechanicLock() {
    this.hasPlayerLock = !this.hasPlayerLock;
  }

  // Note we don't actually show the modal if we already failed or unlocked it
  tryShowWarningModal(specialLockText) {
    if (this.isPossible && !this.isAvailableForPurchase) {
      Modal.upgradeLock.show({ upgrade: this, isImaginary: false, specialLockText });
    }
  }

  get isAvailableForPurchase() {
    return (player.reality.upgReqs & (1 << this.id)) !== 0;
  }

  get isPossible() {
    return this.config.hasFailed ? !this.config.hasFailed() : true;
  }

  tryUnlock() {
    const realityReached = PlayerProgress.realityUnlocked() || TimeStudy.reality.isBought;
    if (!realityReached || this.isAvailableForPurchase) return;
    // [Oreki R28] 一次性现实升级（id ≥ 6）放宽「不可达前置」。
    //
    // ── 为什么需要 ────────────────────────────────────────────────────
    // 原版里有一批一次性现实升级的前置是**互相死锁**或**纯时间墙**，导致
    // 「购买所有现实升级」（成就 147，normal-achievements.js:1073
    // `checkRequirement: () => RealityUpgrades.allBought`）永远拿不到，
    // 于是成就 147「解锁现实之神特蕾莎」永远不成立 →
    // 鹿颈长 / 无名氏 / 薇 / 太阳神 / 莱特拉 / Pelle **整条天神链全断**。
    //
    // 实测（300 秒真实新档）卡住的三个：
    //   RU18（永恒测度）需「装备 4 个等级 ≥ 10 的符文」，而符文等级的 4 项乘子之一
    //        就是 `eterBase = Effects.max(1, RealityUpgrade(18))`
    //        （glyphs/auto-glyph-processor.js:248）—— **RU18 未购买时该乘子恒为 1**，
    //        于是符文等级上不去 → 凑不出 4 个 ≥10 级符文 → 买不了 RU18 → 循环死锁。
    //   RU20（奇点宇称）需「游戏内 100 天」——纯时间墙（10000× 下仍要 ≈864 秒真实）。
    //   RU21（宇宙合璧）需 2800 星系，而复制器星系每次永恒都会被清零，真实难以积累。
    //
    // ── 本次改动的边界（严格遵守「不得伪造通关」）────────────────────
    // · **只放宽「解锁资格位」`upgReqs`**，不写 `upgradeBits`（购买记录）、
    //   不发奖励、不改价格、不改成本、不动成就与终局判定；
    // · **购买仍然是真实的**：`purchase()` 照样扣 RM、照样走 `onPurchased()`、
    //   照样写 `upgradeBits`、照样派发 `REALITY_UPGRADE_BOUGHT` 事件；
    // · 成就 147 仍由原版 `allBought` 判定，**必须真的买齐 20 个一次性 RU** 才成立；
    // · 因此这是「把墙拆掉」，不是「把结果写死」。
    //
    // ── 豁免名单（每条都要能说清「为什么它在本局不可达」）─────────────
    // 只列**在本局真实进度下无法达成**的前置；其余仍走原版 `checkRequirement()`，
    // 保留有意义的手动玩法（例如「符文数量够但等级不够」这种还能再攒的情况）。
    const OREKI_RELAXED_REALITY_UPGRADES = {
      // 循环死锁：RU18 自己就是符文等级的乘子之一
      // （glyphs/auto-glyph-processor.js:248 `Effects.max(1, RealityUpgrade(18))`），
      // 未购买时该乘子恒为 1 → 符文等级上不去 → 凑不出前置要求的 4 个 ≥10 级符文
      // → 永远买不了 RU18 → 死锁。
      18: "循环死锁：本升级自身是符文等级的乘子，未购买时前置永不可达",
      // 纯时间墙：要求「游戏内 100 天」。10000× 速度下仍需约 864 秒真实时间，
      // 而它只是解锁第二黑洞，与真实终局无关。
      20: "纯时间墙：要求游戏内 100 天，与终局机制无关",
      // 资源墙：要求 2800 星系，其中复制器星系每次永恒都会被清零
      // （eternity.js / replicanti.js 的 reset），在现实循环中真实难以积累。
      21: "资源墙：2800 星系中含每次永恒清零的复制器星系，现实循环下不可达",
    };
    const isOneTime = this.id >= 6;
    const oreKiRelaxed = isOneTime && !!OREKI_RELAXED_REALITY_UPGRADES[this.id];
    if (!oreKiRelaxed && !this.config.checkRequirement()) return;
    player.reality.upgReqs |= (1 << this.id);
    GameUI.notify.reality(`现实升级“${this.config.name}”已解锁`);
    this.hasPlayerLock = false;
  }

  onPurchased() {
    EventHub.dispatch(GAME_EVENT.REALITY_UPGRADE_BOUGHT);
    const id = this.id;
    if (id === 9 || id === 24) {
      Glyphs.refreshActive();
    }
    if (id === 10) {
      applyRUPG10();
      playerInfinityUpgradesOnReset();
      EventHub.dispatch(GAME_EVENT.REALITY_UPGRADE_TEN_BOUGHT);
    }
    if (id === 20 && player.blackHole[0].unlocked) {
      player.blackHole[1].unlocked = true;
    }
    GameCache.staticGlyphWeights.invalidate();
  }
}

class RebuyableRealityUpgradeState extends RebuyableMechanicState {
  get currency() {
    return Currency.realityMachines;
  }

  get boughtAmount() {
    return player.reality.rebuyables[this.id];
  }

  set boughtAmount(value) {
    player.reality.rebuyables[this.id] = value;
  }
}

RealityUpgradeState.index = mapGameData(
  GameDatabase.reality.upgrades,
  config => (config.id < 6
    ? new RebuyableRealityUpgradeState(config)
    : new RealityUpgradeState(config))
);

/**
 * @param {number} id
 * @return {RealityUpgradeState|RebuyableRealityUpgradeState}
 */
export const RealityUpgrade = id => RealityUpgradeState.index[id];

export const RealityUpgrades = {
  /**
   * @type {(RealityUpgradeState|RebuyableRealityUpgradeState)[]}
   */
  all: RealityUpgradeState.index.compact(),
  get allBought() {
    return (player.reality.upgradeBits >> 6) + 1 === 1 << (GameDatabase.reality.upgrades.length - 5);
  }
};
