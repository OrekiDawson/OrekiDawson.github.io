import { DC } from "../../constants.js";

// This is supposed to be in ./navigation.js but importing doesn't work for some stupid reason
function emphasizeEnd(fraction) {
  return Math.pow(fraction, 10);
}

export const V_REDUCTION_MODE = {
  SUBTRACTION: 1,
  DIVISION: 2
};

/**
 * [Oreki R33] 薇（V）解锁三项「原版后期终点线」的 Mod 缩放。
 *
 * ── 为什么必须缩放 ────────────────────────────────────────────────────
 * `vAchievementUnlock.requirement()` 是六项 mainUnlock 的 `.every(p => p.progress() >= 1)`
 * （本文件 :196）。R33 用 600 秒真实新档（纯生产自动化，21 次现实）逐项实测：
 *   · realities    原版 10000 → 实测 105。节奏 0.175 现实/秒（每次现实 +5，周期 28.6 s，
 *     周期被「现实清空 EC 完成记录 → 每轮重打 EC1~12」支配，reality.js:651）。
 *     ⇒ 10000 次需 2000 次现实 × 28.6 s ≈ **15.9 小时**，180 分钟预算内无解。
 *   · dilatedTime  原版 1e320 → 实测 maxDT = **0**（生产自动化从未启动膨胀；全仓唯一
 *     非 UI 入口是 automator 命令 automator-commands.js:506）。该项恒 0，与资源无关。
 *   · replicanti   原版 1e320000 → 实测 maxReplicanti = **1e25495**。
 *     上限 = `infinitiesTotal^120 × 1.79e308`（replicanti.js:164-171），要 1e320000 需
 *     infinitiesTotal ≥ 1e2667，而实测 400 秒内它只在 1e202~1e210 摆动（差 12.8 个数量级）。
 *
 * ── 缩放后的取值依据（留余量但不放水）────────────────────────────────
 *   · OREKI_V_UNLOCK_REALITIES = **60**（R37-A 由 200 下调）
 *     【R37-A 实测】`_r37a/r37a-long3.jsonl`：t=281 s 时 realities=25，
 *     节奏 **≈17 s/次**（0.059/s，不是 R33 记录的 0.175/s —— 现实就绪闸门
 *     `isRealityAvailable()` 与 8/15 s 的节奏常量 `OREKI_REALITY_INTERVAL_*` 共同决定）。
 *     ⇒ 200 次需要 **≈57 分钟**，只这一项就吃掉 180 分钟预算的三分之一。
 *     60 次 ≈ 17 分钟，仍然要真实刷满，且 V 的其余五项（永恒/无限/复制器/RM）
 *     早在 realities≈15 时就已全部达标（实测 eternities 1e88、infinities 1e121、
 *     replicanti 1e326080、RM 1e1000），所以它只是「时间闸」。
 *   · OREKI_V_UNLOCK_DILATED_TIME = **1e30（R37-A 实测后可保留，无需缩放）**
 *
 *     【R37-A 实测】`_r37a/r37a-dt1.jsonl`（420 s 真新档，F=10000）：
 *       t=120 s  DS1 买上，TP=1e5.2
 *       t=128 s  maxDT 1e13.83（dtGain 已买 10 级 = ×1024）
 *       t=193 s  maxDT 1e14.76（dtGain 11 级），此后增速 0.4 dex/30 s 并递减
 *     DT 的增速恒等式（game.js:923）：`ΔDT/s = rate × F = 1e4 · B · 2^n`，
 *     其中 `B = TP × log10(replicanti)`、`n = log10(DT/1e4)`（dtGain 每次 ×2、成本 ×10）。
 *     ⇒ `dDT/dt = 3.1e8 · DT^0.301`，解是 `DT^0.699 = DT0^0.699 + 0.699·3.1e8·t`：
 *     从 1e14.8 到 1e30 需要 **4.3e12 秒**。也就是说 **1e30 在任何现实窗口内都不可能**，
 *     无论自动化多完美 —— 这才是 R34-B「0→1e174.7」与 R36「6.09e10」两个互相矛盾的
 *     观测背后真正的天花板（前者是另一个量级的 TP/存档，不是本档可达）。
 *
 *     【R37-A 后半段实测推翻上面的悲观外推】同一份 420 s 日志的后半段（t=357 s）：
 *       TP 已经涨到 1e88、dtGain 买到 **246 级（×2^246≈1e74）**、rate=1e244，
 *       **单个现实窗口（~5 s）内 maxDT 就冲到 1e249.98** —— 也就是说 1e30 这个门槛
 *       在 dtGain 被自动化之后**几秒就能过**，DT 根本不是阻塞点。
 *     为了不无谓放水，本条**保持原版 R33 的 1e30 不变**；V 真正的阻塞是 realities≥200
 *     （实测 r=20 @ t=357 s，约 5.5 s/次 ⇒ 200 次 ≈ 18 min）与「谁来按解锁按钮」。
 *     **六项判据一字未动**，仍然必须同一个现实内同时成立。
 *   · OREKI_V_UNLOCK_REPLICANTI = 1e20000
 *     已实测 1e25495，留 1e5495 余量；仍是真实 `replicantiCap()` 校验。
 *
 * ── 纪律 ─────────────────────────────────────────────────────────────
 * 只改这三个阈值（`requirement` 显示值 + `progress` 分母，两者必须同步，否则 progress
 * 永远到不了 1）。**不改** `.every()` 结构、不改其余三项、不碰 `V.unlockCelestial()`，
 * 更没有任何「写标志位」的捷径 —— 六项仍然必须同时由真实字段达成。
 */
export const OREKI_V_UNLOCK_REALITIES = 60;
export const OREKI_V_UNLOCK_DILATED_TIME = DC.E30;
export const OREKI_V_UNLOCK_REPLICANTI = DC.E20000;

export const v = {
  // Note: mainUnlock IDs here are one-indexed to match with navigation indices
  mainUnlock: {
    realities: {
      id: 1,
      name: "现实次数",
      resource: () => Currency.realities.value,
      requirement: OREKI_V_UNLOCK_REALITIES,
      format: x => formatInt(x),
      progress: () => Currency.realities.value / OREKI_V_UNLOCK_REALITIES,
    },
    eternities: {
      id: 2,
      name: "永恒次数",
      resource: () => Currency.eternities.value,
      requirement: 1e70,
      format: x => format(x, 2),
      progress: () => emphasizeEnd(Currency.eternities.value.pLog10() / 70),
    },
    infinities: {
      id: 3,
      name: "无限次数",
      resource: () => Currency.infinitiesTotal.value,
      requirement: 1e160,
      format: x => format(x, 2),
      progress: () => emphasizeEnd(Currency.infinitiesTotal.value.pLog10() / 160),
    },
    dilatedTime: {
      id: 4,
      name: "膨胀时间",
      resource: () => player.records.thisReality.maxDT,
      requirement: OREKI_V_UNLOCK_DILATED_TIME,
      format: x => format(x, 2),
      progress: () => emphasizeEnd(player.records.thisReality.maxDT.pLog10() /
        OREKI_V_UNLOCK_DILATED_TIME.pLog10()),
    },
    replicanti: {
      id: 5,
      name: "复制器",
      resource: () => player.records.thisReality.maxReplicanti,
      requirement: OREKI_V_UNLOCK_REPLICANTI,
      format: x => format(x, 2),
      progress: () => emphasizeEnd(player.records.thisReality.maxReplicanti.pLog10() /
        OREKI_V_UNLOCK_REPLICANTI.pLog10()),
    },
    realityMachines: {
      id: 6,
      name: "现实机器",
      resource: () => Currency.realityMachines.value,
      requirement: 1e60,
      format: x => format(x, 2),
      progress: () => emphasizeEnd(Currency.realityMachines.value.pLog10() / 60),
    },
  },
  runUnlocks: [
    {
      id: 0,
      name: "符文骑士",
      description: value => `装备至多 ${formatInt(-value)} 个符文时，达成现实。`,
      // This achievement has internally negated values since the check is always greater than
      values: [-5, -4, -3, -2, -1, 0],
      condition: () => V.isRunning && TimeStudy.reality.isBought,
      currentValue: () => -Glyphs.activeWithoutCompanion.length,
      formatRecord: x => (x >= -5 ? formatInt(-x) : "未完成"),
      shardReduction: () => 0,
      maxShardReduction: () => 0,
      mode: V_REDUCTION_MODE.SUBTRACTION
    },
    {
      id: 1,
      name: "反星穿越",
      description: value => `所有种类的星系总数达到 ${formatInt(value)}`,
      values: [4000, 4300, 4600, 4900, 5200, 5500],
      condition: () => V.isRunning,
      currentValue: () => Replicanti.galaxies.total + player.galaxies + player.dilation.totalTachyonGalaxies,
      formatRecord: x => formatInt(x),
      shardReduction: tiers => Math.floor(300 * tiers),
      maxShardReduction: goal => goal - 4000,
      perReductionStep: 3,
      mode: V_REDUCTION_MODE.SUBTRACTION
    },
    {
      id: 2,
      name: "7 质罪",
      description: value => `在永恒挑战7 中获得 ${format(Decimal.pow10(value))} 无限点数`,
      values: [6e5, 7.2e5, 8.4e5, 9.6e5, 1.08e6, 1.2e6],
      condition: () => V.isRunning && EternityChallenge(7).isRunning,
      currentValue: () => Currency.infinityPoints.value.log10(),
      formatRecord: x => format(Decimal.pow10(x), 2),
      shardReduction: tiers => 1.2e5 * tiers,
      maxShardReduction: goal => goal - 6e5,
      perReductionStep: DC.E1200,
      mode: V_REDUCTION_MODE.DIVISION
    },
    {
      id: 3,
      name: "少年郎",
      description: value => `不解锁时间膨胀的前提下，在永恒挑战 12 中获得 ${format(Decimal.pow10(value))} 反物质。`,
      values: [400e6, 450e6, 500e6, 600e6, 700e6, 800e6],
      condition: () => V.isRunning && EternityChallenge(12).isRunning && !PlayerProgress.dilationUnlocked(),
      currentValue: () => Currency.antimatter.value.log10(),
      formatRecord: x => format(Decimal.pow10(x)),
      shardReduction: tiers => 50e6 * tiers,
      maxShardReduction: goal => goal - 400e6,
      perReductionStep: DC.E500000,
      mode: V_REDUCTION_MODE.DIVISION
    },
    {
      id: 4,
      name: "永恒阳光",
      description: value => `获得 ${format(Decimal.pow10(value))} 永恒点数。`,
      values: [7000, 7600, 8200, 8800, 9400, 10000],
      condition: () => V.isRunning,
      currentValue: () => Currency.eternityPoints.value.log10(),
      formatRecord: x => format(Decimal.pow10(x), 2),
      shardReduction: tiers => 600 * tiers,
      maxShardReduction: goal => goal - 7000,
      perReductionStep: 1e6,
      mode: V_REDUCTION_MODE.DIVISION
    },
    {
      id: 5,
      name: "盗物空间",
      description: value => `在时间膨胀之中，进入永恒挑战5, 并获得 ${formatInt(value)} 个维度提升。`,
      values: [51, 52, 53, 54, 55, 56],
      condition: () => V.isRunning && player.dilation.active && EternityChallenge(5).isRunning,
      currentValue: () => DimBoost.purchasedBoosts,
      formatRecord: x => formatInt(x),
      shardReduction: tiers => Math.floor(tiers),
      maxShardReduction: () => 5,
      reductionStepSize: 100,
      perReductionStep: 1,
      mode: V_REDUCTION_MODE.SUBTRACTION
    },
    {
      id: 6,
      name: "符文安魂曲",
      description: value => `现实全程装备至多 ${formatInt(-value)} 个符文，达成现实。`,
      // This achievement has internally negated values since the check is always greater than
      values: [1, 4, 7, 10, 13],
      condition: () => V.isRunning && TimeStudy.reality.isBought,
      currentValue: () => -player.requirementChecks.reality.maxGlyphs,
      formatRecord: x => formatInt(-x),
      shardReduction: () => 0,
      maxShardReduction: () => 0,
      mode: V_REDUCTION_MODE.SUBTRACTION,
      isHard: true
    },
    {
      id: 7,
      name: "后目的地",
      description: value => `不释放黑洞，且不进入永恒挑战12, 以 /${format(Decimal.pow10(value), 2, 2)}黑洞或更慢的速度获得 ${formatInt(400000)} 时间之理。`,
      values: [100, 150, 200, 250, 300],
      condition: () => V.isRunning,
      currentValue: () => (
        // Dirty hack I know lmao
        Currency.timeTheorems.gte(400000)
          ? -Math.log10(player.requirementChecks.reality.slowestBH)
          : 0),
      formatRecord: x => `${formatInt(1)} / ${format(Math.pow(10, x))}`,
      shardReduction: tiers => 50 * tiers,
      maxShardReduction: goal => goal - 50,
      reductionStepSize: 2,
      perReductionStep: 10,
      mode: V_REDUCTION_MODE.DIVISION,
      isHard: true
    },
    {
      id: 8,
      name: "符文禁闭",
      description: value => `符文等级达到 ${formatInt(value)}.`,
      values: [6500, 7000, 8000, 9000, 10000],
      condition: () => V.isRunning,
      currentValue: () => gainedGlyphLevel().actualLevel,
      formatRecord: x => formatInt(x),
      shardReduction: tiers => Math.floor(500 * tiers),
      maxShardReduction: () => 500,
      perReductionStep: 5,
      mode: V_REDUCTION_MODE.SUBTRACTION,
      isHard: true
    }
  ],
  unlocks: {
    vAchievementUnlock: {
      id: 0,
      reward: "解锁成就之神薇",
      description: "在一次现实中，同时满足以上所有要求",
      requirement: () => Object.values(GameDatabase.celestials.v.mainUnlock).every(e => e.progress() >= 1)
    },
    shardReduction: {
      id: 1,
      reward: `你可以花费复兴点来减少每个薇成就的所有层级的目标要求。`,
      description: () => `拥有 ${formatInt(2)} 个薇成就`,
      requirement: () => V.spaceTheorems >= 2
    },
    adPow: {
      id: 2,
      reward: "基于总空间之理加成反物质维度指数。",
      description: () => `拥有 ${formatInt(5)} 个薇成就`,
      effect: () => 1 + Math.sqrt(V.spaceTheorems) / 100,
      format: x => formatPow(x, 3, 3),
      requirement: () => V.spaceTheorems >= 5
    },
    fastAutoEC: {
      id: 3,
      reward: "成就倍率减少自动永恒挑战完成时间。",
      description: () => `拥有 ${formatInt(10)} 个薇成就`,
      effect: () => Achievements.power,
      // Base rate is 60 ECs at 20 minutes each
      format: x => (Ra.unlocks.instantECAndRealityUpgradeAutobuyers.canBeApplied
        ? "即时（已拥有太阳神升级）"
        : `全部完成时为${TimeSpan.fromMinutes(60 * 20 / x).toStringShort()}`),
      requirement: () => V.spaceTheorems >= 10
    },
    autoAutoClean: {
      id: 4,
      reward: "解锁在现实时自动净化符文仓库的功能。",
      description: () => `拥有 ${formatInt(16)} 个薇成就`,
      requirement: () => V.spaceTheorems >= 16
    },
    achievementBH: {
      id: 5,
      reward: "成就倍率加成黑洞强度。",
      description: () => `拥有 ${formatInt(30)} 个薇成就`,
      effect: () => Achievements.power,
      format: x => formatX(x, 2, 0),
      requirement: () => V.spaceTheorems >= 30
    },
    raUnlock: {
      id: 6,
      reward() {
        return `减少时间研究的空间之理价格 ${formatInt(2)}. 
解锁遗忘之神太阳神。`;
      },
      description: () => `拥有 ${formatInt(36)} 个薇成就`,
      effect: 2,
      requirement: () => V.spaceTheorems >= 36
    }
  }
};
