import { BitUpgradeState } from "../game-mechanics/index.js";
import { GameDatabase } from "../secret-formula/game-database.js";

import { DC } from "../constants.js";

import { Quotes } from "./quotes.js";

/**
 * [Oreki R30] 遗迹碎片换算尺度（原版 7500）。
 *
 * ── 为什么必须缩放（R30 实测 + 源码事实）────────────────────────────
 * 原版公式（本文件 `shardsGained`）：
 *     Math.floor(Math.pow(Currency.eternityPoints.exponent / 7500, this.glyphEffectAmount))
 *     * AlchemyResource.effarig.effectValue
 *
 * 这里有两个**乘性**小量，导致碎片恒为 0：
 *   1. 除数 7500 是给「EP 指数 7500 以上」的后期设计的；本 Mod 在 10000× 下
 *      真实新档 240 秒实测 `maxEtL` 只有 **129**（EP ≈ 1e129），
 *      `129 / 7500 = 0.0172` —— **已经小于 1**。
 *   2. 指数 `glyphEffectAmount` 是「已装备符文的 effect 位计数」，实测约 8~12。
 *      小于 1 的底数再取 8~12 次方 → `0.0172^10 ≈ 1e-18` → `Math.floor` 归零。
 *
 * 于是 `shardsGained` **恒等于 0** → `Currency.relicShards` 永远为 0 →
 * `EffarigUnlock.run`（cost 5e11）永远买不起 →
 * 鹿颈长的现实**永远进不去** → 无名氏 / 薇 / 太阳神 / 莱特拉 / Pelle 全链断裂。
 *
 * 实测证据：R30 诊断（`web/_tools/_r30-celestial.jsonl`）里
 * `shardsGainedPerReality: 0`、`relicShardsRaw: 0`，而 `effarigUnlockRunBuyable: false`。
 *
 * ── 为什么改成 30 ────────────────────────────────────────────────
 * 目标是让「EP 指数 ≈ 129」时 `129 / D` 明显大于 1，从而 `pow(...)` 随指数**放大**
 * 而不是缩小：`129 / 30 = 4.3`，`4.3^10 ≈ 2.1e6` 碎片/次现实。
 * 与 `OREKI_PRE_REALITY_EP_DIVISOR = 30`（`src/game.js:100`）取同一尺度，
 * 保持 Mod 内部换算口径一致。
 *
 * ── 边界 ────────────────────────────────────────────────────────
 * · 只改**换算尺度**，不改公式结构、不改 `AlchemyResource.effarig` 的加成方式；
 * · 碎片仍然只在**真实现实结算**时通过 `reality.js:320` 发放，不额外注入；
 * · `EffarigUnlock.purchase()` 仍然真实扣碎片、真实置位、真实触发 `onPurchased`；
 * · 不碰任何终局判定与通关标志。
 * 手法与既有的 `OREKI_EC_REQUIREMENT_DIVISOR`、`OREKI_REALITY_UPGRADE_COST_DIVISOR`、
 * `OREKI_DILATION_TT_DIVISOR` 完全一致。
 */
export const OREKI_EFFARIG_SHARD_DIVISOR = 30;

/**
 * [Oreki R30] 鹿颈长解锁位的价格缩放（原版 cost 除以它）。
 *
 * ── 为什么需要 ────────────────────────────────────────────────────
 * 原版四个解锁位价格：adjuster 1e7 / glyphFilter 2e8 / setSaves 3e9 / **run 5e11**。
 * 即使把碎片尺度从 7500 降到 30（见上），一次现实约得 1e6~1e7 碎片，
 * 买 `run`（5e11）仍需 **数万次现实** —— 在 180 分钟墙钟内不可能。
 * 而 `run` 是鹿颈长现实的**唯一入场券**，买不起就整条天神链断在这里。
 *
 * ── 为什么除以 1e6 ───────────────────────────────────────────────
 * run 5e11 / 1e6 = 5e5，配合一次现实 ~1e6 碎片，**1 次现实即可买到**；
 * adjuster 1e7/1e6 = 10、glyphFilter 200、setSaves 3000，
 * 形成「开局几次现实内依次解锁」的自然节奏，而不是瞬间全开。
 *
 * ── 边界 ────────────────────────────────────────────────────────
 * · 只改**价格数值**；`purchase()` 仍走 `Currency.relicShards.purchase(cost)`
 *   真实扣碎片、真实 `unlock()`、真实 `onPurchased()`；
 * · 不改解锁条件、不改效果、不写任何 bits；
 * · 无 cost 的三个阶段位（infinity / eternity / reality）不受影响，
 *   它们仍由 `big-crunch.js:150` 与 `eternity.js:58` 的真实结算解锁。
 */
export const OREKI_EFFARIG_UNLOCK_COST_DIVISOR = 1e6;

/**
 * [Oreki R30] 鹿颈长现实「削弱强度」的收敛系数（原版 c 值除以它）。
 *
 * ── 削弱是怎么生效的（源码事实）────────────────────────────────────
 *     nerfFactor(power) = 3 * (1 - c / (c + sqrt(power.pLog10())))
 *     tickDilation = 0.7 + 0.1 * nerfFactor
 *     multDilation = 0.25 + 0.25 * nerfFactor
 *     tickspeed    = (10 ^ (base ^ tickDilation)) ^ -1
 *     multiplier   = 10 ^ (base ^ multDilation)
 *
 * `nerfFactor` 在 `power` 很小时趋近 0，于是：
 *   · `multDilation → 0.25` —— 所有乘子被压成 **0.25 次方**（1e100 的乘子只剩 1e25）；
 *   · `tickDilation → 0.7` —— 速度升级效果被大幅压缩。
 * 只有 `power`（时间碎片 / 无限能量）涨到很大，削弱才逐渐解除。
 *
 * ── 为什么这是必须消除的时间墙（R30 实测）──────────────────────────
 * 300 秒真实新档 `_r30-shard.jsonl`：进入鹿颈长 run 时反物质被
 * `beginProcessReality(getRealityProps(true))` 重置到 **1e136**，
 * 之后 90 秒只爬到 **1e154**（每 5 秒约 1 个数量级）。
 * 而 Big Crunch 门槛是 **1.8e308** —— 还差 154 个数量级 ≈ 770 秒纯等待，
 * 且这只是一阶段；后面 ETERNITY / REALITY 两阶段还要各来一遍。
 * 也就是说原版削弱把一个「挑战」变成了**十几分钟的纯挂机**，
 * 这与「消除无意义时间墙、保留有价值的手动玩法」直接冲突。
 *
 * ── 为什么从 100 提到 1e6（R32 重新推导，R30 的取值不够）──────────
 * R31 实测（`_r30-nerf.jsonl`，600 秒真实新档）：divisor=100 时进入 run 后
 * 反物质从 1e136 只爬到 1e169.96（560 秒 +34 个数量级），门槛却是 1.8e308。
 *
 * 关键在于**削弱的聚合方式**：它不是作用在反物质总量上，而是作用在
 * **每一个乘子的指数**上。
 *     Effarig.multiplier(mult) = 10 ^ (pLog10(mult) ^ multDilation)
 * 取 mult = 1e100（pLog10 = 100）：
 *     multDilation = 0.578 → 100^0.578 = 10^1.156 → 该乘子只剩 **1e14.3**
 *     multDilation = 0.9999 → 100^0.9999 = 10^1.99998 → 该乘子恢复 **1e100**
 * 单个乘子就差 85 个数量级；而反物质是十几个乘子**连乘**，在指数空间里
 * 是把这些差值**相加**，所以 aggregate 差距是几百个数量级 —— 138 的缺口被完全覆盖。
 * 这同时解释了 R31 的困惑：divisor=100 之所以只换来 +15，是因为它只把
 * 单乘子从 1e3.2（multDilation≈0.256 时）抬到了 1e14.3，量级上仍在削弱区内。
 *
 * c = 1500/divisor。divisor=1e6 时 c=0.0015，pLog10=136 时 sqrt≈11.66，
 * c/(c+11.66)=1.29e-4 → nerfFactor=2.99961 → multDilation=0.99990。
 * 也就是说削弱在数值上**等于完全解除**，这正是 nerfFactor 公式的数学上界
 * （divisor→∞ 时 nerfFactor→3）。再往上取 1e9 无可观测差别，
 * 故取 1e6：既到达上界，又保留「仍在公式内」的可追溯性，不是盲目放大乘数。
 *
 * ETERNITY(29.29) / REALITY(25) 两个阶段原本 c 就小，除以 1e6 后同样归零，
 * 削弱一并解除 —— 与「一阶段已证明可达，后续阶段应更快」的节奏一致。
 *
 * ── 边界 ────────────────────────────────────────────────────────
 * · 只改**削弱强度**，不改阶段推进条件、不改 `bigCrunchCheckUnlocks` /
 *   `eternity.js` 的真实解锁入口、不改任何符文/碎片收益；
 * · Big Crunch / Eternity / Reality 仍然必须**真实达成**并**真实结算**；
 * · 不写任何 unlockBits、不碰终局判定。
 */
export const OREKI_EFFARIG_NERF_DIVISOR = 1e6;

export const EFFARIG_STAGES = {
  INFINITY: 1,
  ETERNITY: 2,
  REALITY: 3,
  COMPLETED: 4
};

export const Effarig = {
  displayName: "鹿颈长",
  initializeRun() {
    clearCelestialRuns();
    player.celestials.effarig.run = true;
    recalculateAllGlyphs();
    Tab.reality.glyphs.show(false);
  },
  get isRunning() {
    return player.celestials.effarig.run;
  },
  get currentStage() {
    if (!EffarigUnlock.infinity.isUnlocked) {
      return EFFARIG_STAGES.INFINITY;
    }
    if (!EffarigUnlock.eternity.isUnlocked) {
      return EFFARIG_STAGES.ETERNITY;
    }
    if (!EffarigUnlock.reality.isUnlocked) {
      return EFFARIG_STAGES.REALITY;
    }
    return EFFARIG_STAGES.COMPLETED;
  },
  get currentStageName() {
    switch (this.currentStage) {
      case EFFARIG_STAGES.INFINITY:
        return "Infinity";
      case EFFARIG_STAGES.ETERNITY:
        return "Eternity";
      case EFFARIG_STAGES.REALITY:
      default:
        return "Reality";
    }
  },
  get eternityCap() {
    return this.isRunning && this.currentStage === EFFARIG_STAGES.ETERNITY ? DC.E50 : undefined;
  },
  get glyphLevelCap() {
    switch (this.currentStage) {
      case EFFARIG_STAGES.INFINITY:
        return 100;
      case EFFARIG_STAGES.ETERNITY:
        return 1500;
      case EFFARIG_STAGES.REALITY:
      default:
        return 2000;
    }
  },
  get glyphEffectAmount() {
    const genEffectBitmask = Glyphs.activeWithoutCompanion
      .filter(g => generatedTypes.includes(g.type))
      .reduce((prev, curr) => prev | curr.effects, 0);
    const nongenEffectBitmask = Glyphs.activeWithoutCompanion
      .filter(g => !generatedTypes.includes(g.type))
      .reduce((prev, curr) => prev | curr.effects, 0);
    return countValuesFromBitmask(genEffectBitmask) + countValuesFromBitmask(nongenEffectBitmask);
  },
  get shardsGained() {
    if (!TeresaUnlocks.effarig.canBeApplied) return 0;
    // [Oreki R30] 除数 7500 → OREKI_EFFARIG_SHARD_DIVISOR(30)，理由见文件头注释。
    return Math.floor(Math.pow(Currency.eternityPoints.exponent / OREKI_EFFARIG_SHARD_DIVISOR,
      this.glyphEffectAmount)) *
      AlchemyResource.effarig.effectValue;
  },
  get maxRarityBoost() {
    return 5 * Math.log10(Math.log10(Currency.relicShards.value + 10));
  },
  nerfFactor(power) {
    let c;
    switch (this.currentStage) {
      case EFFARIG_STAGES.INFINITY:
        c = 1500;
        break;
      case EFFARIG_STAGES.ETERNITY:
        c = 29.29;
        break;
      case EFFARIG_STAGES.REALITY:
      default:
        c = 25;
        break;
    }
    // [Oreki R30] 削弱系数按 MOD 收敛：c 越大 = 削弱越轻。见文件头
    // OREKI_EFFARIG_NERF_DIVISOR 的说明。
    c /= OREKI_EFFARIG_NERF_DIVISOR;
    // [Oreki R32] 关键修正：`power.pLog10()` 在 **power = 0** 时返回 0，
    // 于是 `c/(c+sqrt(0)) = c/c = 1`，`nerfFactor` 恒等于 0 —— **与 c 完全无关**，
    // divisor 调到多少都无效。R32 实测（_r32-nerf.jsonl，600 秒真实新档）：
    // divisor 已提到 1e6，末态 `effMult` 仍精确等于 0.25、`effNerf` 仍精确等于 0。
    // 根因：鹿颈长阶段 1 的 `Currency.infinityPower` **严格恒为 0**
    //   （全仓写入点只有 infinity-dimension.js:342/382、eternity.js:206、reality.js:635，
    //    唯一产出 :382 依赖 ID1，而阶段 1 的 `ids` 全 0；currency.js:195 落值是精确 DC.D0）。
    // 修法：给 sqrt 的自变量加下限 1，使 degnerate 区间（power ≤ 1）不再产生
    // 「除以自身」的恒等 1。power > 1 时 `max(1, pLog10) = pLog10`，**完全不改变**原有
    // 数值行为，因此不影响阶段 2/3 已在验证的节奏。
    return 3 * (1 - c / (c + Math.sqrt(Math.max(1, power.pLog10()))));
  },
  get tickDilation() {
    return 0.7 + 0.1 * this.nerfFactor(Currency.timeShards.value);
  },
  get multDilation() {
    return 0.25 + 0.25 * this.nerfFactor(Currency.infinityPower.value);
  },
  get tickspeed() {
    const base = 3 + Tickspeed.baseValue.reciprocal().log10();
    return Decimal.pow10(Math.pow(base, this.tickDilation)).reciprocal();
  },
  multiplier(mult) {
    const base = new Decimal(mult).pLog10();
    return Decimal.pow10(Math.pow(base, this.multDilation));
  },
  get bonusRG() {
    // Will return 0 if Effarig Infinity is uncompleted
    return Math.floor(replicantiCap().pLog10() / LOG10_MAX_VALUE - 1);
  },
  quotes: Quotes.effarig,
  symbol: "Ϙ"
};

class EffarigUnlockState extends BitUpgradeState {
  get bits() { return player.celestials.effarig.unlockBits; }
  set bits(value) { player.celestials.effarig.unlockBits = value; }

  get cost() {
    const base = this.config.cost;
    // [Oreki R30] 三个阶段位（infinity/eternity/reality）没有 cost，原样返回 undefined
    if (base === undefined || base === null) return base;
    return new Decimal(base).dividedBy(OREKI_EFFARIG_UNLOCK_COST_DIVISOR).toNumber();
  }

  get isEffectActive() {
    return !Pelle.isDisabled("effarig");
  }

  purchase() {
    if (this.isUnlocked || !Currency.relicShards.purchase(this.cost)) return;
    this.unlock();
    this.config.onPurchased?.();
  }
}

export const EffarigUnlock = mapGameDataToObject(
  GameDatabase.celestials.effarig.unlocks,
  config => new EffarigUnlockState(config)
);

EventHub.logic.on(GAME_EVENT.TAB_CHANGED, () => {
  if (Tab.celestials.effarig.isOpen) Effarig.quotes.initial.show();
});

EventHub.logic.on(GAME_EVENT.BIG_CRUNCH_BEFORE, () => {
  if (!Effarig.isRunning) return;
  Effarig.quotes.completeInfinity.show();
});

EventHub.logic.on(GAME_EVENT.ETERNITY_RESET_BEFORE, () => {
  if (!Effarig.isRunning) return;
  Effarig.quotes.completeEternity.show();
});
