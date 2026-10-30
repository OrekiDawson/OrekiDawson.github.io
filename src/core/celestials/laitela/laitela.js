import { DC } from "../../constants.js";
import { Quotes } from "../quotes.js";

import { DarkMatterDimensions } from "./dark-matter-dimension.js";

/**
 * [Oreki R38] 莱特拉熵产量分母（原版硬编码 `1e11`，全仓仅此一处、无 UI 引用）。
 *
 * 原版：`entropyGainPerSecond = clamp((log10(AM) / 1e11)^2, 0, 100) / 200`
 * 上限 0.5/s ⇒ 填满一次熵**至少** 2 秒；而 `game.js` 规定只有
 * `Time.thisRealityRealTime.totalSeconds < 30` 的那次完成才会 `difficultyTier++`。
 * 要把「完全不稳定」（tier 8）刷出来必须 **连续 8 次**都在 30 秒内完成。
 *
 * 实测（R38）：当前版本反物质指数天花板 ≈ 8.8e9，代入原式得
 *   (8.8e9 / 1e11)^2 / 200 ≈ 3.87e-5 /s  ⇒  填满一次需 ≈ 25,800 秒（7.2 小时）
 * 8 次 ≈ 57 小时，且每次都要重新跑一整个莱特拉现实 —— 结构上不可完成。
 *
 * 改成 5e8 后：指数 8.8e9 ⇒ (17.6)^2/200 = 1.55，被 clamp 到 100 ⇒ 0.5/s（满速）
 * ⇒ 每次填满 2 秒，8 次约 16~25 秒，稳稳落在 30 秒窗口内。
 * 低进度侧不被破坏：指数 1e9 时速率仍只有 0.02/s（50 秒填满，慢于窗口），
 * 指数 1e6 时 2e-8/s 基本为零 —— 梯度保留，只是把「不可能」拉成「可完成」。
 */
export const OREKI_LAITELA_ENTROPY_DIVISOR = 5e8;

export const Laitela = {
  displayName: "莱特拉",
  get celestial() {
    return player.celestials.laitela;
  },
  get isUnlocked() {
    return ImaginaryUpgrade(15).isBought;
  },
  initializeRun() {
    clearCelestialRuns();
    this.celestial.run = true;
  },
  get isRunning() {
    return this.celestial.run;
  },
  get difficultyTier() {
    return player.celestials.laitela.difficultyTier;
  },
  set difficultyTier(tier) {
    player.celestials.laitela.difficultyTier = tier;
  },
  get maxAllowedDimension() {
    return 8 - this.difficultyTier;
  },
  get isFullyDestabilized() {
    return Laitela.maxAllowedDimension === 0;
  },
  get continuumUnlocked() {
    return ImaginaryUpgrade(15).isBought && !Pelle.isDisabled("continuum");
  },
  get continuumActive() {
    return this.continuumUnlocked && !player.auto.disableContinuum && !Pelle.isDisabled("continuum");
  },
  setContinuum(x) {
    player.auto.disableContinuum = !x;
    // If continuum is now not disabled (i.e. is enabled) we update the relevant requirement check.
    if (!player.auto.disableContinuum) {
      player.requirementChecks.reality.noContinuum = false;
    }
  },
  get matterExtraPurchaseFactor() {
    return (1 + 0.5 * Math.pow(Decimal.pLog10(Currency.darkMatter.max) / 50, 0.4) *
      (1 + SingularityMilestone.continuumMult.effectOrDefault(0)));
  },
  get realityReward() {
    return Math.clampMin(Math.pow(100, this.difficultyTier) *
      Math.pow(360 / player.celestials.laitela.fastestCompletion, 2), 1);
  },
  // Note that entropy goes from 0 to 1, with 1 being completion
  get entropyGainPerSecond() {
    return Math.clamp(Math.pow(Currency.antimatter.value.add(1).log10() / OREKI_LAITELA_ENTROPY_DIVISOR, 2), 0, 100) / 200;
  },
  get darkMatterMultGain() {
    return Decimal.pow(Currency.darkMatter.value.dividedBy(this.annihilationDMRequirement)
      .plus(1).log10(), 1.5).toNumber() * ImaginaryUpgrade(21).effectOrDefault(1);
  },
  get darkMatterMult() {
    return this.celestial.darkMatterMult;
  },
  get darkMatterMultRatio() {
    return (this.celestial.darkMatterMult + this.darkMatterMultGain) / this.celestial.darkMatterMult;
  },
  get annihilationUnlocked() {
    return ImaginaryUpgrade(19).isBought;
  },
  get annihilationDMRequirement() {
    return 1e60;
  },
  get canAnnihilate() {
    return Laitela.annihilationUnlocked && Currency.darkMatter.gte(this.annihilationDMRequirement);
  },
  annihilate(force) {
    if (!force && !this.canAnnihilate) return false;
    this.celestial.darkMatterMult += this.darkMatterMultGain;
    DarkMatterDimensions.reset();
    Laitela.quotes.annihilation.show();
    Achievement(176).unlock();
    return true;
  },
  // Greedily buys the cheapest available upgrade until none are affordable
  maxAllDMDimensions(maxTier) {
    // Note that tier is 1-indexed
    const unlockedDimensions = DarkMatterDimensions.all
      .filter(d => d.isUnlocked && d.tier <= maxTier);
    const upgradeInfo = unlockedDimensions
      .map(d => [
        [d.rawIntervalCost, d.intervalCostIncrease, d.maxIntervalPurchases, x => d.buyManyInterval(x)],
        [d.rawPowerDMCost, d.powerDMCostIncrease, Infinity, x => d.buyManyPowerDM(x)],
        [d.rawPowerDECost, d.powerDECostIncrease, Infinity, x => d.buyManyPowerDE(x)]])
      .flat(1);
    const buy = function(upgrade, purchases) {
      upgrade[3](purchases);
      upgrade[0] = upgrade[0].times(Decimal.pow(upgrade[1], purchases));
      upgrade[2] -= purchases;
    };
    // Buy everything costing less than 0.02 of initial matter.
    const darkMatter = Currency.darkMatter.value;
    for (const upgrade of upgradeInfo) {
      const purchases = Math.clamp(Math.floor(darkMatter.times(0.02).div(upgrade[0]).log(upgrade[1])), 0, upgrade[2]);
      buy(upgrade, purchases);
    }
    while (upgradeInfo.some(upgrade => upgrade[0].lte(darkMatter) && upgrade[2] > 0)) {
      const cheapestUpgrade = upgradeInfo.filter(upgrade => upgrade[2] > 0).sort((a, b) => a[0].minus(b[0]).sign())[0];
      buy(cheapestUpgrade, 1);
    }
  },
  reset() {
    this.annihilate(true);
    this.celestial.darkMatterMult = 1;
    Currency.darkMatter.max = DC.D1;
    Currency.darkMatter.reset();
    Currency.singularities.reset();
    this.celestial.fastestCompletion = 3600;
    this.celestial.difficultyTier = 0;
    this.celestial.singularityCapIncreases = 0;
  },
  quotes: Quotes.laitela,
  symbol: "ᛝ"
};

EventHub.logic.on(GAME_EVENT.TAB_CHANGED, () => {
  if (Tab.celestials.laitela.isOpen) Laitela.quotes.unlock.show();
});
