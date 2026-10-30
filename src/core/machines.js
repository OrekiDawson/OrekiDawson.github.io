import { DC } from "./constants.js";

/**
 * [Oreki R35-C] 虚幻机器上限的统一缩放系数（见下方 baseIMCap 的说明）。
 * 原版 = 1（不缩放）。
 *
 * [Oreki R37-A] 10.6 → 100。实测 log10(uncappedRM) 稳定在 10722（EP log10 天花板 1.43e7），
 * 原版曲线给出的上限只有 9.45e7；10.6 倍刚好只够 IU15(1e9)，余量 0.19%（R36 记录），
 * 任何一点倍率扰动都会失手。100 倍把上限抬到 **≈9.45e9**：
 *   · IU15 1e9（莱特拉入口）→ 只需攒到上限的 10.6%，约 11 s；
 *   · IU25 5e9（佩勒入口，OREKI_IU25_COST 已同步缩放）→ 约 65 s；
 *   · IU20 3e12 / IU22~24 6e14 仍然远在上限之外，终局链以外的内容不被打开。
 */
export const OREKI_IM_CAP_MULT = 100;

export const MachineHandler = {
  get baseRMCap() { return DC.E1000; },

  get hardcapRM() {
    return this.baseRMCap.times(ImaginaryUpgrade(6).effectOrDefault(1));
  },

  get distanceToRMCap() {
    return this.hardcapRM.minus(Currency.realityMachines.value);
  },

  get realityMachineMultiplier() {
    return ShopPurchase.RMPurchases.currentMult * Teresa.rmMultiplier * Effects.max(1, PerkShopUpgrade.rmMult) *
      getAdjustedGlyphEffect("effarigrm") * Achievement(167).effectOrDefault(1);
  },

  get uncappedRM() {
    let log10FinalEP = player.records.thisReality.maxEP.plus(gainedEternityPoints()).log10();
    if (!PlayerProgress.realityUnlocked()) {
      if (log10FinalEP > 8000) log10FinalEP = 8000;
      if (log10FinalEP > 6000) log10FinalEP -= (log10FinalEP - 6000) * 0.75;
    }
    let rmGain = DC.E3.pow(log10FinalEP / 4000 - 1);
    // Increase base RM gain if <10 RM
    if (rmGain.gte(1) && rmGain.lt(10)) rmGain = new Decimal(27 / 4000 * log10FinalEP - 26);
    rmGain = rmGain.times(this.realityMachineMultiplier);
    return rmGain.floor();
  },

  get gainedRealityMachines() {
    return this.uncappedRM.clampMax(this.hardcapRM);
  },

  get isIMUnlocked() {
    return Currency.realityMachines.value.gte(this.hardcapRM) || Currency.imaginaryMachines.gt(0);
  },

  /**
   * [Oreki R35-C] 虚幻机器上限整体 ×10.6（`OREKI_IM_CAP_MULT`）。
   *
   * ── 原版式（未改形状）──────────────────────────────────────────────
   *   (max(log10(uncappedRM) − 1000, 0))^2 × (max(log10(uncappedRM) − 1e5, 1))^0.2
   * 其中 `uncappedRM.log10 = 3×(log10EP/4000 − 1)`（本文件 :26-34）。
   *
   * ── 为什么必须抬 ────────────────────────────────────────────────────
   * 实测 EP 的 log10 天花板 ≈ **1.43e7**（`_r34b-final300` t=266 峰值；1300 s 长测末态反而只有
   * 4.7e6/5.8e6/5.1e6，说明 EP 已饱和、不会随时间继续涨）→ log10RM = 10722 → **原版上限只有 9.45e7**。
   * 而这条链上的虚幻升级成本是：IU13 5e7（刚好能买）、**IU14 3.5e8**、**IU15 1e9（莱特拉入口）**、
   * IU20 3e12、IU25 1.6e15 —— 除 IU13 外**全部高于上限，改 cost 也买不到**。
   * 也就是「莱特拉锁死」的根因不在门槛值，而在上限本身。
   *
   * ── 为什么是常数位移、不是改指数 ────────────────────────────────────
   * ×10.6 把上限从 9.45e7 抬到 **≈1.0e9**，正好覆盖 IU14(3.5e8) 与 IU15(1e9)；
   * 若改指数（2 → 3.81）虽然能一次覆盖到 IU25(1.6e15)，但会让 IM 在 EPlog 稍高时**暴涨**
   * （EPlog 1.43e7→2e7 时上限从 1.6e15→2.3e17），「攒 IM」失去张力。
   * 常数位移保留原版曲线形状与所有斜率，只做整体平移，且 IU25 仍保持「远超当前上限」的原版定位。
   *
   * ── 语义 ───────────────────────────────────────────────────────────
   * 仍然只由 `updateIMCap()` 在「uncappedRM ≥ 1e1000」时真实刷新（本文件 :54-62），
   * 不写任何解锁位、不发任何货币。
   */
  get baseIMCap() {
    return (Math.pow(Math.clampMin(this.uncappedRM.log10() - 1000, 0), 2)) *
      (Math.pow(Math.clampMin(this.uncappedRM.log10() - 100000, 1), 0.2)) *
      OREKI_IM_CAP_MULT;
  },

  get currentIMCap() {
    return player.reality.iMCap * ImaginaryUpgrade(13).effectOrDefault(1);
  },

  // This is iM cap based on in-game values at that instant, may be lower than the actual cap
  get projectedIMCap() {
    return this.baseIMCap * ImaginaryUpgrade(13).effectOrDefault(1);
  },

  // Use iMCap to store the base cap; applying multipliers separately avoids some design issues the 3xTP upgrade has
  updateIMCap() {
    if (this.uncappedRM.gte(this.baseRMCap)) {
      if (this.baseIMCap > player.reality.iMCap) {
        player.records.bestReality.iMCapSet = Glyphs.copyForRecords(Glyphs.active.filter(g => g !== null));
        player.reality.iMCap = this.baseIMCap;
      }
    }
  },

  // Time in seconds to reduce the missing amount by a factor of two
  get scaleTimeForIM() {
    return 60 / ImaginaryUpgrade(20).effectOrDefault(1);
  },

  gainedImaginaryMachines(diff) {
    return (this.currentIMCap - Currency.imaginaryMachines.value) *
      (1 - Math.pow(2, (-diff / 1000 / this.scaleTimeForIM)));
  },

  estimateIMTimer(cost) {
    const imCap = this.currentIMCap;
    if (imCap <= cost) return Infinity;
    const currentIM = Currency.imaginaryMachines.value;
    // This is doing log(a, 1/2) - log(b, 1/2) where a is % left to imCap of cost and b is % left to imCap of current
    // iM. log(1 - x, 1/2) should be able to estimate the time taken for iM to increase from 0 to imCap * x since every
    // fixed interval the difference between current iM to max iM should decrease by a factor of 1/2.
    return Math.max(0, Math.log2(imCap / (imCap - cost)) - Math.log2(imCap / (imCap - currentIM))) *
      this.scaleTimeForIM;
  }
};
