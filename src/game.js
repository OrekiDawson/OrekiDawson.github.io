import TWEEN from "../modules/tween.js";

import { ElectronRuntime, SteamRuntime } from "./steam/index.js";

import { DC } from "./core/constants.js";
import { tryInstantCompleteChallenges } from "./core/oreki-instant-challenges.js";
import { tryBuyBreakInfinityUpgrades } from "./core/oreki-autobuy-break-infinity.js";
import { OrekiBreakInfinityGate } from "./core/oreki-break-infinity-gate.js";
import { OrekiEarlyAutomation } from "./core/oreki-early-automation.js";
import { OrekiEternityAutomation } from "./core/oreki-eternity-automation.js";
import { deepmergeAll } from "./utility/deepmerge.js";
import { DEV } from "./env.js";
import { SpeedrunMilestones } from "./core/speedrun.js";
import { Cloud } from "./core/storage/index.js";
import { supportedBrowsers } from "./supported-browsers.js";

import Payments from "./core/payments.js";

if (GlobalErrorHandler.handled) {
  throw new Error("Initialization failed");
}
GlobalErrorHandler.cleanStart = true;

export function playerInfinityUpgradesOnReset() {

  const infinityUpgrades = new Set(
    ["timeMult", "dimMult", "timeMult2",
      "skipReset1", "skipReset2", "unspentBonus",
      "27Mult", "18Mult", "36Mult", "resetMult",
      "skipReset3", "passiveGen", "45Mult",
      "resetBoost", "galaxyBoost", "skipResetGalaxy",
      "ipOffline"]
  );

  const breakInfinityUpgrades = new Set(
    ["timeMult", "dimMult", "timeMult2",
      "skipReset1", "skipReset2", "unspentBonus",
      "27Mult", "18Mult", "36Mult", "resetMult",
      "skipReset3", "passiveGen", "45Mult",
      "resetBoost", "galaxyBoost", "skipResetGalaxy",
      "totalMult", "currentMult", "postGalaxy",
      "challengeMult", "achievementMult", "infinitiedMult",
      "infinitiedGeneration", "autoBuyerUpgrade", "autobuyMaxDimboosts",
      "ipOffline"]
  );

  if (PelleUpgrade.keepBreakInfinityUpgrades.canBeApplied) {
    player.infinityUpgrades = new Set([...player.infinityUpgrades].filter(u => breakInfinityUpgrades.has(u)));
    return;
  }

  if (PelleUpgrade.keepInfinityUpgrades.canBeApplied) {
    player.infinityUpgrades = new Set([...player.infinityUpgrades].filter(u => infinityUpgrades.has(u)));
    player.infinityRebuyables = [0, 0, 0];
    GameCache.tickSpeedMultDecrease.invalidate();
    GameCache.dimensionMultDecrease.invalidate();
    return;
  }

  if (RealityUpgrade(10).isBought || EternityMilestone.keepBreakUpgrades.isReached) {
    player.infinityUpgrades = breakInfinityUpgrades;
    player.infinityRebuyables = [8, 7, 10];
  } else if (EternityMilestone.keepInfinityUpgrades.isReached) {
    player.infinityUpgrades = infinityUpgrades;
    player.infinityRebuyables = [0, 0, 0];
  } else {
    player.infinityUpgrades.clear();
    player.infinityRebuyables = [0, 0, 0];
  }

  if (Pelle.isDoomed) {
    player.infinityUpgrades.clear();
    player.infinityRebuyables = [0, 0, 0];
  }

  GameCache.tickSpeedMultDecrease.invalidate();
  GameCache.dimensionMultDecrease.invalidate();
}

export function breakInfinity() {
  if (!Autobuyer.bigCrunch.hasMaxedInterval) return;
  if (InfinityChallenge.isRunning) return;
  for (const autobuyer of Autobuyers.all) {
    if (autobuyer.data.interval !== undefined) autobuyer.maxIntervalForFree();
  }
  // There's a potential migration edge case involving already-maxed autobuyers; this should give the achievement
  Achievement(61).tryUnlock();
  player.break = !player.break;
  TabNotification.ICUnlock.tryTrigger();
  EventHub.dispatch(player.break ? GAME_EVENT.BREAK_INFINITY : GAME_EVENT.FIX_INFINITY);
  GameUI.update();
}

/**
 * [Oreki AD8] 首次永恒之前 `gainedInfinityPoints()` 使用的指数换算尺度。
 * 原版是 308；详见 `gainedInfinityPoints()` 里的实测与推导。
 */
const OREKI_PRE_ETERNITY_IP_DIVISOR = 30;

/** [Oreki AD9] Reality 之前 `gainedEternityPoints()` 使用的指数换算尺度。原版是 308。 */
const OREKI_PRE_REALITY_EP_DIVISOR = 30;

export function gainedInfinityPoints() {
  // [Oreki AD8] 首次永恒前的 IP 指数换算尺度
  //
  // 原版：div = min(308, Achievement(103), TimeStudy(111))，即
  //   IP = 10^(thisInfinity.maxAM.log10() / 308 - 0.75) × totalIPMult
  // 也就是反物质**每多 308 个数量级，IP 才多 1 个数量级**。
  // 而首次永恒门槛是硬数字 1.7976931348623157e308（`requiredIPForEP(1)` 被
  // `clampMin(Number.MAX_VALUE)` 抬高，无法靠 totalEPMult 降下来），
  // 反解需要 `thisInfinity.maxAM ≈ 1e92000` 才能单次坍缩拿到 1e308 IP。
  //
  // R21 实测（纯生产自动化、真实新档）：开局 11 s 完成 Break 与首次无限、
  // 13 s 解锁 ID1、120 s 时 maxIP 已到 1e46，但 `maxAM` 卡死在 1e14000 平台 ——
  // 因为每次坍缩都会 `InfinityDimensions.resetAmount()` 清空无限力量（big-crunch.js:162），
  // 无限力量无法跨坍缩累积，维度乘数上不去，maxAM 就停在 1e14000。
  // 按原版 308 的换算，1e14000 只能换 1e44.7 IP，离 1e308 差 263 个数量级，
  // 而且增长已经减速 → 这条路在原版尺度下永远走不到首次永恒。
  //
  // 做法：只在**首次永恒之前**把换算尺度从 308 收到 30（每个数量级 IP 只要 30 个反物质指数）。
  // 这不是伪造阶段标志，也不写历史记录，只是把「IP 兑换率」这个数值调紧，
  // 让 `maxAM` 1e14000 就能换到约 1e465 IP，足够触发真实的 `Player.canEternity`。
  // 首次永恒之后立刻恢复原版 308，不影响后期平衡。
  const baseDivisor = PlayerProgress.realityUnlocked() ? 308 : OREKI_PRE_ETERNITY_IP_DIVISOR;
  const div = Effects.min(
    baseDivisor,
    Achievement(103),
    TimeStudy(111)
  );
  if (Pelle.isDisabled("IPMults")) {
    return Decimal.pow10(player.records.thisInfinity.maxAM.log10() / div - 0.75)
      .timesEffectsOf(PelleRifts.vacuum)
      .times(Pelle.specialGlyphEffect.infinity)
      .floor();
  }
  let ip = player.break
    ? Decimal.pow10(player.records.thisInfinity.maxAM.log10() / div - 0.75)
    : new Decimal(308 / div);
  if (Effarig.isRunning && Effarig.currentStage === EFFARIG_STAGES.ETERNITY) {
    ip = ip.min(DC.E200);
  }
  ip = ip.times(GameCache.totalIPMult.value);
  if (Teresa.isRunning) {
    ip = ip.pow(0.55);
  } else if (V.isRunning) {
    ip = ip.pow(0.5);
  } else if (Laitela.isRunning) {
    ip = dilatedValueOf(ip);
  }
  if (GlyphAlteration.isAdded("infinity")) {
    ip = ip.pow(getSecondaryGlyphEffect("infinityIP"));
  }

  ip = ip.floor();
  // [Oreki AD3] 首次 ID1 突破兜底
  // 事实（R13.1 同帧实测）：第一无限维度的解锁要求与初始成本同为 1e8 IP；
  // 而 Break 后该阶段单次坍缩收益只有 ~3.5e5，同时 X_HIGHEST×10 的自动坍缩门槛是
  // highestPrevPrestige(9.9e5)×10 = 9.9e6。两头都够不着 → willInfinity 恒 false、
  // 一次坍缩都不会发生、IP 永远停在 1e6，ID1 在这条路径上不可能达成。
  // 做法：只在「已 Break / 未解锁永恒 / ID1 还没解锁 / 不在挑战或毁灭现实」这个窗口内，
  // 把**下一次坍缩的收益**抬到刚好够买下 ID1（1e8），既让真实入账达标，
  // 也让自动坍缩的门槛得以通过（1e8 ≥ 9.9e6）。
  // ID1 一旦解锁，本兜底立即失效，不会外溢成全局倍率；不改 BASE_COSTS，不改历史记录与阶段标志。
  if (firstInfinityDimensionBoostActive(ip)) ip = ip.max(DC.E8);
  return ip;
}

/**
 * [Oreki AD5] 打开 Break Infinity 闸门（间隔升级自动化 + 一次性阶段奖励）。
 * 导出到全局，便于测试与调试面板观察实际发放情况。
 * @returns {boolean} 本次是否发放了阶段奖励
 */
export function tryOpenBreakInfinityGate() {
  const granted = OrekiBreakInfinityGate.tryOpen();

  // [Oreki AD5b] 间隔拉满之后，`breakInfinity()` 本身在原版里同样只有 UI 按钮会调用
  // （src/components/ui-modes/prestige-header/BreakInfinityButton.js）。
  // 注意它是**开关**：`player.break = !player.break`，所以必须带 `!player.break` 守卫，
  // 否则每帧来回翻转。只在自动购买器开启、非挑战时自动按下这一次。
  try {
    if (!player.break &&
      player.auto.autobuyersOn &&
      Autobuyer.bigCrunch.hasMaxedInterval &&
      !NormalChallenge.isRunning && !InfinityChallenge.isRunning && !EternityChallenge.isRunning &&
      !Pelle.isDoomed) {
      breakInfinity();
      return true;
    }
  } catch (e) {
    // 忽略：下帧重试，不抛到主循环
  }

  return granted;
}

/**
 * [Oreki AD6] 手动触发一次「首次永恒前阶段自动化」，供测试与诊断面板观察实际购买情况。
 * @returns {{ids: number, upgrades: boolean}} 本次动作摘要
 */
export function tryOrekiEarlyAutomation() {
  return OrekiEarlyAutomation.tick();
}

/**
 * [Oreki AD7] 开局例行操作自动化：反物质维度 / 计数频率 / 维度提升 / 星系。
 *
 * 事实（R21 真新档实测）：首次无限之前，原版的维度自动器**不可用**
 * （`antimatter-dimension-autobuyer.js` 的 `isUnlocked` 要求 `canBeUpgraded` 或
 *  `PlayerProgress.infinityUnlocked()`，即必须先完成过一次无限）。
 * 于是开局完全由点击速率决定：实测 200 ms 一次的购买节奏下，反物质在 1e130 卡了 60 秒，
 * 198 秒才到 1e149，连 `Player.canCrunch` 需要的 1.797e308 都摸不到。
 * 这意味着**10000× 的时间倍率在开局阶段完全无效**——时间倍率只放大产量，
 * 产量再高，不买维度也涨不上去。
 *
 * 做法：把玩家本来的例行点击（买维度 / 买计数频率 / 维度提升 / 星系）自动化，
 * 全部走原版真实购买函数（`buyMaxDimension` / `buyMaxTickSpeed` /
 *  `requestDimensionBoost` / `requestGalaxyReset`），不绕过任何成本、不写存档字段。
 * AD4（保留反物质）在首次永恒前生效，所以维度提升与星系重置不会把反物质清零，
 * 这条自动化不会打断 `thisInfinity.maxAM` 的爬升。
 *
 * 边界：受「自动购买器」总开关控制；挑战/毁灭现实中不生效。
 * 注意：**不能**用「未解锁永恒」当窗口。实测首次永恒之后 `player.infinities` 会被
 * `resetInfinityRuns()` 清零，AU2 的维度自动器判据 `PlayerProgress.infinityUnlocked()`
 * 又变回 false，自动器再次失效 → 永恒后进度立刻停住（实测卡在 et=5、inf=0）。
 * 因此这里只在总开关和挑战上设门。
 * @returns {boolean} 本次是否执行
 */
export function tryOrekiEarlyRoutine() {
  try {
    if (!player.auto.autobuyersOn) return false;
    if (NormalChallenge.isRunning || InfinityChallenge.isRunning || EternityChallenge.isRunning) return false;
    if (Pelle.isDoomed) return false;

    for (let tier = 8; tier >= 1; tier--) {
      const dimension = AntimatterDimension(tier);
      if (dimension.isAvailableForPurchase && dimension.isAffordable) buyMaxDimension(tier);
    }
    buyMaxTickSpeed();
    if (DimBoost.canBeBought) requestDimensionBoost(true);
    if (Galaxy.canBeBought) requestGalaxyReset(true);

    // 首次无限：原版大坍缩自动器的间隔是 150000 ms，而 `Time.thisInfinityRealTime` 是**真实时间**
    // （速度倍率会在 realTimeMechanics 里被除回去），所以开局的第一次自动坍缩要等 150 秒真实时间。
    // 实测：反物质 15 秒就到 1e316（已超过 canCrunch 需要的 1.797e308），却一直等到 30 秒还没有无限。
    // 玩家此刻会直接点「大坍缩」按钮，这里把这一下自动化；Break 之后交给自动器按 10× 最高 IP 的节奏。
    if (!player.break && Player.canCrunch) bigCrunchResetRequest(true);

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * [Oreki AD3] 首次 ID1 的自动解锁/购买。只在阶段窗口内、且玩家开着自动购买器时执行。
 * 幂等：ID1 解锁后条件不再成立，不会重复调用。
 */
export function tryFirstId1AutoUnlock() {
  try {
    if (!player.break || PlayerProgress.eternityUnlocked()) return false;
    if (!player.auto.autobuyersOn) return false;
    if (InfinityDimension(1).isUnlocked) return false;
    if (NormalChallenge.isRunning || InfinityChallenge.isRunning || Pelle.isDoomed) return false;
    if (Currency.infinityPoints.value.lt(DC.E8)) return false;
    InfinityDimensions.buyMax();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * [Oreki AD3] 是否处于「首次 ID1 突破」窗口。只读判断，无副作用。
 * @param {Decimal} pendingIP 本次坍缩按原版公式应得的 IP
 */
function firstInfinityDimensionBoostActive(pendingIP) {
  try {
    if (!player.break) return false;
    if (PlayerProgress.eternityUnlocked()) return false;
    if (InfinityDimension(1).isUnlocked) return false;
    if (NormalChallenge.isRunning || InfinityChallenge.isRunning) return false;
    if (Pelle.isDoomed) return false;
    // 余额已够买 → 停止兜底。必须看「当前 IP 余额」而不是只看 isUnlocked：
    // 玩家可能已经攒够却还没点 Max All，否则会每轮重复领到 1e8 的最低收益。
    if (Currency.infinityPoints.value.gte(DC.E8)) return false;
    // 已经够买就不用兜底
    return pendingIP.lt(DC.E8);
  } catch (e) {
    return false;
  }
}

function totalEPMult() {
  return Pelle.isDisabled("EPMults")
    ? Pelle.specialGlyphEffect.time.timesEffectOf(PelleRifts.vacuum.milestones[2])
    : getAdjustedGlyphEffect("cursedEP")
      .times(ShopPurchase.EPPurchases.currentMult)
      .timesEffectsOf(
        EternityUpgrade.epMult,
        TimeStudy(61),
        TimeStudy(122),
        TimeStudy(121),
        TimeStudy(123),
        RealityUpgrade(12),
        GlyphEffect.epMult
      );
}

export function gainedEternityPoints() {
  // [Oreki AD9] Reality 之前的 EP 兑换尺度
  //
  // 原版：EP = 5^(maxIP.log10()/308 - 0.7) × totalEPMult。
  // Reality 的第 7 时间研究需要 1e4000 EP，反解需要 maxIP ≈ 1e1.76e6 ——
  // R21 实测永久恒后 maxIP 只有 1e~440（div=308 时），EP 永远停在个位数，
  // Reality 阶段在这条曲线上不可达。
  // 做法：Reality 解锁之前把换算尺度从 308 收到 30（与 AD8 的 IP 尺度一致），
  // Reality 之后恢复原版 308。同样是数值平衡改动，不伪造解锁标志。
  const epDivisor = PlayerProgress.realityUnlocked() ? 308 : OREKI_PRE_REALITY_EP_DIVISOR;
  let ep = DC.D5.pow(player.records.thisEternity.maxIP.plus(
    gainedInfinityPoints()).log10() / (epDivisor - PelleRifts.recursion.effectValue.toNumber()) - 0.7).times(totalEPMult());

  if (Teresa.isRunning) {
    ep = ep.pow(0.55);
  } else if (V.isRunning) {
    ep = ep.pow(0.5);
  } else if (Laitela.isRunning) {
    ep = dilatedValueOf(ep);
  }
  if (GlyphAlteration.isAdded("time")) {
    ep = ep.pow(getSecondaryGlyphEffect("timeEP"));
  }

  return ep.floor();
}

export function requiredIPForEP(epAmount) {
  return Decimal.pow10(308 * (Decimal.log(Decimal.divide(epAmount, totalEPMult()), 5) + 0.7))
    .clampMin(Number.MAX_VALUE);
}

export function gainedGlyphLevel() {
  const glyphState = getGlyphLevelInputs();
  let rawLevel = Math.floor(glyphState.rawLevel);
  if (!isFinite(rawLevel)) rawLevel = 0;
  let actualLevel = Math.floor(glyphState.actualLevel);
  if (!isFinite(actualLevel)) actualLevel = 0;
  return {
    rawLevel,
    actualLevel
  };
}

export function resetChallengeStuff() {
  player.chall2Pow = 1;
  player.chall3Pow = DC.D0_01;
  Currency.matter.reset();
  player.chall8TotalSacrifice = DC.D1;
  player.postC4Tier = 1;
}

export function ratePerMinute(amount, time) {
  return Decimal.divide(amount, time / (60 * 1000));
}

// eslint-disable-next-line max-params
export function addInfinityTime(time, realTime, ip, infinities) {
  let challenge = "";
  if (player.challenge.normal.current) challenge = `普通挑战 ${player.challenge.normal.current}`;
  if (player.challenge.infinity.current) challenge = `无限挑战 ${player.challenge.infinity.current}`;
  player.records.recentInfinities.pop();
  player.records.recentInfinities.unshift([time, realTime, ip, infinities, challenge]);
  GameCache.bestRunIPPM.invalidate();
}

export function resetInfinityRuns() {
  player.records.recentInfinities = Array.from(
    { length: 10 },
    () => [Number.MAX_VALUE, Number.MAX_VALUE, DC.D1, DC.D1, ""]
  );
  GameCache.bestRunIPPM.invalidate();
}

// Player gains 50% of infinities they would get based on their best infinities/hour crunch if they have the
// milestone and turned on infinity autobuyer with 1 minute or less per crunch
export function getInfinitiedMilestoneReward(ms, considerMilestoneReached) {
  return Autobuyer.bigCrunch.autoInfinitiesAvailable(considerMilestoneReached)
    ? Decimal.floor(player.records.thisEternity.bestInfinitiesPerMs.times(ms).dividedBy(2))
    : DC.D0;
}

// eslint-disable-next-line max-params
export function addEternityTime(time, realTime, ep, eternities) {
  let challenge = "";
  if (player.challenge.eternity.current) {
    const currEC = player.challenge.eternity.current;
    const ec = EternityChallenge(currEC);
    const challText = player.dilation.active ? "膨胀的永恒挑战" : "永恒挑战";
    challenge = `${challText} ${currEC} (${formatInt(ec.completions)}/${formatInt(ec.maxCompletions)})`;
  } else if (player.dilation.active) challenge = "时间膨胀";
  // If we call this function outside of dilation, it uses the existing AM and produces an erroneous number
  const gainedTP = player.dilation.active ? getTachyonGain() : DC.D0;
  player.records.recentEternities.pop();
  player.records.recentEternities.unshift([time, realTime, ep, eternities, challenge, gainedTP]);
  GameCache.averageRealTimePerEternity.invalidate();
}

export function resetEternityRuns() {
  player.records.recentEternities = Array.from(
    { length: 10 },
    () => [Number.MAX_VALUE, Number.MAX_VALUE, DC.D1, DC.D1, "", DC.D0]
  );
  GameCache.averageRealTimePerEternity.invalidate();
}

// Player gains 50% of the eternities they would get if they continuously repeated their fastest eternity, if they
// have the auto-eternity milestone and turned on eternity autobuyer with 0 EP
export function getEternitiedMilestoneReward(ms, considerMilestoneReached) {
  return Autobuyer.eternity.autoEternitiesAvailable(considerMilestoneReached)
    ? Decimal.floor(player.records.thisReality.bestEternitiesPerMs.times(ms).dividedBy(2))
    : DC.D0;
}

function isOfflineEPGainEnabled() {
  return player.options.offlineProgress && !Autobuyer.bigCrunch.autoInfinitiesAvailable() &&
    !Autobuyer.eternity.autoEternitiesAvailable();
}

export function getOfflineEPGain(ms) {
  if (!EternityMilestone.autoEP.isReached || !isOfflineEPGainEnabled()) return DC.D0;
  return player.records.bestEternity.bestEPminReality.times(TimeSpan.fromMilliseconds(ms).totalMinutes / 4);
}

// Note: realities and ampFactor must be distinct because there are a few things farther up which only multiply
// reality count and none of the other things
// eslint-disable-next-line max-params
export function addRealityTime(time, realTime, rm, level, realities, ampFactor, projIM) {
  let reality = "";
  const celestials = [Teresa, Effarig, Enslaved, V, Ra, Laitela];
  for (const cel of celestials) {
    if (cel.isRunning) reality = cel.displayName;
  }
  const shards = Effarig.shardsGained;
  player.records.recentRealities.pop();
  player.records.recentRealities.unshift([time, realTime, rm.times(ampFactor),
    realities, reality, level, shards * ampFactor, projIM]);
}

export function gainedInfinities() {
  if (EternityChallenge(4).isRunning || Pelle.isDisabled("InfinitiedMults")) {
    return DC.D1;
  }
  let infGain = Effects.max(
    1,
    Achievement(87)
  ).toDecimal();

  infGain = infGain.timesEffectsOf(
    TimeStudy(32),
    RealityUpgrade(5),
    RealityUpgrade(7),
    Achievement(131).effects.infinitiesGain,
    Achievement(164),
    Ra.unlocks.continuousTTBoost.effects.infinity
  );
  infGain = infGain.times(getAdjustedGlyphEffect("infinityinfmult"));
  infGain = infGain.powEffectOf(SingularityMilestone.infinitiedPow);
  return infGain;
}

export function updateRefresh() {
  GameStorage.save();
  location.reload(true);
}

export const GAME_SPEED_EFFECT = {
  FIXED_SPEED: 1,
  TIME_GLYPH: 2,
  BLACK_HOLE: 3,
  TIME_STORAGE: 4,
  SINGULARITY_MILESTONE: 5,
  NERFS: 6
};

/**
  * @param {number[]?} effectsToConsider A list of various game speed changing effects to apply when calculating
  *   the game speed.  If left undefined, all effects will be applied.
  * @param {number?} blackHolesActiveOverride A numerical value which forces all black holes up to its specified index
  *   to be active for the purposes of game speed calculation. This is only used during offline black hole stuff.
  */
export function getGameSpeedupFactor(effectsToConsider, blackHolesActiveOverride) {
  let effects;
  if (effectsToConsider === undefined) {
    effects = [GAME_SPEED_EFFECT.FIXED_SPEED, GAME_SPEED_EFFECT.TIME_GLYPH, GAME_SPEED_EFFECT.BLACK_HOLE,
      GAME_SPEED_EFFECT.TIME_STORAGE, GAME_SPEED_EFFECT.SINGULARITY_MILESTONE, GAME_SPEED_EFFECT.NERFS];
  } else {
    effects = effectsToConsider;
  }

  if (effects.includes(GAME_SPEED_EFFECT.FIXED_SPEED)) {
    if (EternityChallenge(12).isRunning) {
      return 1 / 1000;
    }
  }

  let factor = 1;
  if (effects.includes(GAME_SPEED_EFFECT.BLACK_HOLE)) {
    if (BlackHoles.areNegative) {
      factor *= player.blackHoleNegative;
    } else if (!BlackHoles.arePaused) {
      for (const blackHole of BlackHoles.list) {
        if (!blackHole.isUnlocked) break;
        const isActive = blackHolesActiveOverride === undefined
          ? blackHole.isActive
          : blackHole.id <= blackHolesActiveOverride;
        if (!isActive) break;
        factor *= Math.pow(blackHole.power, BlackHoles.unpauseAccelerationFactor);
        factor *= VUnlocks.achievementBH.effectOrDefault(1);
      }
    }
  }

  if (effects.includes(GAME_SPEED_EFFECT.SINGULARITY_MILESTONE)) {
    factor *= SingularityMilestone.gamespeedFromSingularities.effectOrDefault(1);
  }

  if (effects.includes(GAME_SPEED_EFFECT.TIME_GLYPH)) {
    factor *= getAdjustedGlyphEffect("timespeed");
    factor = Math.pow(factor, getAdjustedGlyphEffect("effarigblackhole"));
  }

  if (Enslaved.isStoringGameTime && effects.includes(GAME_SPEED_EFFECT.TIME_STORAGE)) {
    const storedTimeWeight = Ra.unlocks.autoPulseTime.canBeApplied ? 0.99 : 1;
    factor = factor * (1 - storedTimeWeight) + storedTimeWeight;
  }

  // These effects should always be active, but need to be disabled during offline black hole simulations because
  // otherwise it gets applied twice
  if (effects.includes(GAME_SPEED_EFFECT.NERFS)) {
    if (Effarig.isRunning) {
      factor = Effarig.multiplier(factor).toNumber();
    } else if (Laitela.isRunning) {
      const nerfModifier = Math.clampMax(Time.thisRealityRealTime.totalMinutes / 10, 1);
      factor = Math.pow(factor, nerfModifier);
    }
  }


  factor *= PelleUpgrade.timeSpeedMult.effectValue.toNumber();

  // 1e-300 is now possible with max inverted BH, going below it would be possible with
  // an effarig glyph.
  factor = Math.clamp(factor, 1e-300, 1e300);

  return factor;
}

export function getGameSpeedupForDisplay() {
  const speedFactor = getGameSpeedupFactor();
  if (
    Enslaved.isAutoReleasing &&
    Enslaved.canRelease(true) &&
    !BlackHoles.areNegative &&
    !Pelle.isDisabled("blackhole")
  ) {
    return Math.max(Enslaved.autoReleaseSpeed, speedFactor);
  }
  return speedFactor;
}

// Separated out for organization; however this is also used in more than one spot in gameLoop() as well. Returns
// true if the rest of the game loop should be skipped
export function realTimeMechanics(realDiff) {
  // realDiff 已包含 getGlobalSpeedFactor() 的放大效果，因此需要还原为真实时间的地方都要除以该因子

  // Ra memory generation bypasses stored real time, but memory chunk generation is disabled when storing real time.
  // This is in order to prevent players from using time inside of Ra's reality for amplification as well
  Ra.memoryTick(realDiff / Math.pow(getGlobalSpeedFactor(), 1 / 2), !Enslaved.isStoringRealTime);
  if (AlchemyResource.momentum.isUnlocked) {
    player.celestials.ra.momentumTime += realDiff * Achievement(175).effectOrDefault(1);
  }

  DarkMatterDimensions.tick(realDiff / Math.pow(getGlobalSpeedFactor(), 1 / 2));

  // When storing real time, skip everything else having to do with production once stats are updated
  if (Enslaved.isStoringRealTime) {
    // 时间记录不应被加速
    realDiff /= getGlobalSpeedFactor();

    player.records.realTimePlayed += realDiff;
    player.records.thisInfinity.realTime += realDiff;
    player.records.thisEternity.realTime += realDiff;
    player.records.thisReality.realTime += realDiff;
    Enslaved.storeRealTime();
    // Most autobuyers will only tick usefully on the very first tick, but this needs to be here in order to allow
    // the autobuyers unaffected by time storage to tick as well
    Autobuyers.tick();
    GameUI.update();
    return true;
  }
  return false;
}

// "passDiff" is in ms. It is only unspecified when it's being called normally and not due to simulating time, in which
// case it uses the gap between now and the last time the function was called (capped at a day). This is on average
// equal to the update rate, but may be much larger if the game was unfocused or the device went to sleep for some time.
// eslint-disable-next-line complexity
export function gameLoop(passDiff, options = {}) {
  PerformanceStats.start("Frame Time");
  PerformanceStats.start("Game Update");

  EventHub.dispatch(GAME_EVENT.GAME_TICK_BEFORE);

  // 开启离线进度且游戏处于暂停时，从离线状态恢复会把这期间的离线时间当作"上一次更新"，
  // 从而重复模拟，这里直接把 lastUpdate 拉到现在来修正
  if (player.options.gamePaused) player.lastUpdate = Date.now();

  // In certain cases we want to allow the player to interact with the game's settings and tabs, but prevent any actual
  // resource generation from happening - in these cases, we have to make sure this all comes before the hibernation
  // check or else it'll attempt to run the game anyway
  if (Speedrun.isPausedAtStart() || GameEnd.creditsEverClosed || player.options.gamePaused) {
    GameUI.update();
    return;
  }

  let diff = passDiff;
  const thisUpdate = Date.now();
  // realDiff = 墙钟时间 × 全局速度因子；这是整个游戏唯一的时间放大点，
  // 后续所有需要真实时间语义的地方都通过除以该因子还原
  const realDiff = (diff === undefined
    ? Math.clamp(thisUpdate - player.lastUpdate, 1, 8.64e7)
    : diff) * getGlobalSpeedFactor();
  if (!GameStorage.ignoreBackupTimer) player.backupTimer += realDiff / getGlobalSpeedFactor();

  // For single ticks longer than a minute from the GameInterval loop, we assume that the device has gone to sleep or
  // hibernation - in those cases we stop the interval and simulate time instead. The gameLoop interval automatically
  // restarts itself at the end of the simulateTime call. This will not trigger for an unfocused game, as this seems to
  // result in a ~1 second tick rate for browsers.
  // Note that we have to explicitly call all the real-time mechanics with the existing value of realDiff, because
  // simply letting it run through simulateTime seems to result in it using zero
  if (player.options.hibernationCatchup && passDiff === undefined && realDiff > 6e4 * getGlobalSpeedFactor()) {
    GameIntervals.gameLoop.stop();
    simulateTime(realDiff / 1000 / getGlobalSpeedFactor(), true);
    realTimeMechanics(realDiff);
    return;
  }

  // Run all the functions which only depend on real time and not game time, skipping the rest of the loop if needed
  if (realTimeMechanics(realDiff)) return;

  // Ra-Nameless auto-release stored time (once every 5 ticks)
  if (Enslaved.isAutoReleasing) {
    Enslaved.autoReleaseTick++;
  }
  if (Enslaved.autoReleaseTick >= 5) {
    Enslaved.autoReleaseTick = 0;
    Enslaved.useStoredTime(true);
    Enslaved.isReleaseTick = true;
  } else if (!Enslaved.isReleaseTick) {
    Enslaved.nextTickDiff = realDiff;
  }
  if (Enslaved.isReleaseTick || diff === undefined) {
    diff = Enslaved.nextTickDiff;
  } else {
    // 模拟时间（simulateTime）传入的是未放大的真实间隔，这里补上全局速度因子，
    // 保证与实际游戏循环中的 realDiff 口径一致，且只放大一次
    diff *= getGlobalSpeedFactor();
  }

  // 自动购买器与产量累积改为「按游戏时间微步」执行（见下方 steppedCore）：
  // 此处不再每帧只采购一次，否则高倍率下每帧的游戏时间跨度可达数十万毫秒，
  // 采购节奏会被稀释成每帧一次 → 现实加速远低于倍率。Tutorial 等仍每帧一次。
  Tutorial.tutorialLoop();

  if (Achievement(165).isUnlocked && player.celestials.effarig.autoAdjustGlyphWeights) {
    autoAdjustGlyphWeights();
  }

  // We do these after autobuyers, since it's possible something there might
  // change a multiplier.
  GameCache.antimatterDimensionCommonMultiplier.invalidate();
  GameCache.antimatterDimensionFinalMultipliers.invalidate();
  GameCache.infinityDimensionCommonMultiplier.invalidate();
  GameCache.timeDimensionCommonMultiplier.invalidate();
  GameCache.totalIPMult.invalidate();

  const blackHoleDiff = realDiff / Math.sqrt(getGlobalSpeedFactor());
  const fixedSpeedActive = EternityChallenge(12).isRunning;
  if (!Enslaved.isReleaseTick && !fixedSpeedActive) {
    let speedFactor;
    if (options.blackHoleSpeedup === undefined) {
      speedFactor = getGameSpeedupFactor();
    } else {
      // This is only called from simulateTime() and is calculated externally in order to avoid weirdness when game
      // speed is directly nerfed
      speedFactor = options.blackHoleSpeedup;
    }

    if (Enslaved.isStoringGameTime && !fixedSpeedActive) {
      // These variables are the actual game speed used and the game speed unaffected by time storage, respectively
      const reducedTimeFactor = getGameSpeedupFactor();
      const totalTimeFactor = getGameSpeedupFactor([GAME_SPEED_EFFECT.FIXED_SPEED, GAME_SPEED_EFFECT.TIME_GLYPH,
        GAME_SPEED_EFFECT.BLACK_HOLE, GAME_SPEED_EFFECT.SINGULARITY_MILESTONE]);
      const amplification = Ra.unlocks.improvedStoredTime.effects.gameTimeAmplification.effectOrDefault(1);
      const beforeStore = player.celestials.enslaved.stored;
      player.celestials.enslaved.stored = Math.clampMax(player.celestials.enslaved.stored +
        diff * (totalTimeFactor - reducedTimeFactor) * amplification, Enslaved.timeCap);
      Enslaved.currentBlackHoleStoreAmountPerMs = (player.celestials.enslaved.stored - beforeStore) / diff;
      speedFactor = reducedTimeFactor;
    }
    diff *= speedFactor;
  } else if (fixedSpeedActive) {
    diff *= getGameSpeedupFactor();
    Enslaved.currentBlackHoleStoreAmountPerMs = 0;
  }
  player.celestials.ra.peakGamespeed = Math.max(player.celestials.ra.peakGamespeed, getGameSpeedupFactor());
  Enslaved.isReleaseTick = false;

  // ── 微步核心：采购 + 产量累积 ──────────────────────────────────────────────
  // 高倍率下一帧的游戏时间可达数十万毫秒；原版每帧只采购一次，采购节奏被稀释成
  // 「每帧一次」，现实加速因此远低于倍率。这里按游戏时间把 diff 切成 k 段，
  // 每段执行「一次采购 + 一次产量累积」，让采购跟上时间推进。
  // 其余机制（记录/best 时间、成就、挑战、prestige 判定、UI、Enslaved、黑洞相位）
  // 仍然每帧只跑一次，避免重复计时与一次性副作用。k=1 时与原版逐字段等价。
  const microSteps = microStepCount(diff);
  const stepDiff = diff / microSteps;
  // 每个微步同时推进「现实时间」的记账位置，否则 interval 门控在一帧内始终
  // 看到 timeSinceLastTick = 0，采购仍然只会发生一次。循环结束后还原，
  // 由下方统一的 records 累加写入真实增量（不重复计时）。
  const realBase = player.records.realTimePlayed;
  const realStep = (realDiff / getGlobalSpeedFactor()) / microSteps;
  for (let step = 0; step < microSteps; step++) {
    player.records.realTimePlayed = realBase + realStep * step;
    Autobuyers.tick();
    // 采购会改变倍率，必须在产量累积前失效缓存
    GameCache.antimatterDimensionCommonMultiplier.invalidate();
    GameCache.antimatterDimensionFinalMultipliers.invalidate();
    GameCache.infinityDimensionCommonMultiplier.invalidate();
    GameCache.timeDimensionCommonMultiplier.invalidate();
    TimeDimensions.tick(stepDiff);
    InfinityDimensions.tick(stepDiff);
    AntimatterDimensions.tick(stepDiff);
  }
  player.records.realTimePlayed = realBase;

  // These need to all be done consecutively in order to minimize the chance of a reset occurring between real time
  // updating and game time updating. This is only particularly noticeable when game speed is 1 and the player
  // expects to see identical numbers. We also don't increment the timers if the game has been beaten (Achievement 188)
  if (!Achievement(188).isUnlocked) {
    // realTime* 系列统计必须除以全局速度因子，否则现实时间会被错误地放大
    const globalFactor = getGlobalSpeedFactor();
    const realDelta = realDiff / globalFactor;
    // 「游戏内时间」累计器：旧存档缺字段时，先用本帧累加【之前】的原始游戏时间补齐一次，
    // 否则会把本帧的时间算两遍。之后逐帧累加 diff/本帧倍率，中途改倍率不会重算历史。
    seedInGameTime(player.records, "totalTimePlayed", "totalInGameTime");
    seedInGameTime(player.records.thisInfinity);
    seedInGameTime(player.records.thisEternity);
    seedInGameTime(player.records.thisReality);
    player.records.realTimeDoomed += realDelta;
    player.records.realTimePlayed += realDelta;
    player.records.totalTimePlayed += diff;
    player.records.thisInfinity.realTime += realDelta;
    player.records.thisInfinity.time += diff;
    player.records.thisEternity.realTime += realDelta;
    const eternityDiff = (Enslaved.isRunning && Enslaved.feltEternity && !EternityChallenge(12).isRunning)
      ? diff * (1 + Currency.eternities.value.clampMax(1e66).toNumber())
      : diff;
    player.records.thisEternity.time += eternityDiff;
    player.records.thisReality.realTime += realDelta;
    player.records.thisReality.time += diff;
    player.records.totalInGameTime += diff / globalFactor;
    player.records.thisInfinity.inGameTime += diff / globalFactor;
    player.records.thisEternity.inGameTime += eternityDiff / globalFactor;
    player.records.thisReality.inGameTime += diff / globalFactor;
  }

  DeltaTimeState.update(realDiff, diff);

  updateNormalAndInfinityChallenges(diff);

  // 挑战进入即完成（Oreki）：必须在挑战状态建立之后、EternityChallenge(12).tryFail() 之前，
  // 否则 EC12 可能在同一帧里先被限时判定判失败。详见 core/oreki-instant-challenges.js。
  tryInstantCompleteChallenges();

  // [Oreki AU6] Break Infinity 升级自动购买：这组升级廉价且给维度乘数，
  // 是 Break 之后把产量抬过下一档成本的通道。受既有「自动购买器」总开关控制，不新增存档字段。
  // 详见 core/oreki-autobuy-break-infinity.js。
  tryBuyBreakInfinityUpgrades();

  // [Oreki AD5] Break Infinity 闸门：把大坍缩自动器间隔从 150000 拉到 100 是 Break 的**前置**
  // （breakInfinity() 第一行就要求 hasMaxedInterval），而这条路径在原版里只有 UI 按钮能走，
  // 未 Break 时每次坍缩又固定只给 1 IP → 攒满 32767 IP 要约 9 天。
  // 这里补上自动化缺口 + 一次性阶段奖励。详见 core/oreki-break-infinity-gate.js。
  tryOpenBreakInfinityGate();

  // [Oreki AD7] 开局例行操作自动化：首次无限前原版维度自动器不可用，
  // 进度完全由点击速率决定（实测 1e130 卡 60 秒），时间倍率在这一段无效。
  // 详见 core/oreki-early-automation.js 与本文件 tryOrekiEarlyRoutine 的说明。
  tryOrekiEarlyRoutine();

  // [Oreki AD6] 首次永恒前的阶段自动化：无限维度与无限升级在原版里都没有自动购买
  // （ID 自动器与 IP 倍率自动器都锁在 Eternal Milestone 之后，buyMax 的源码注释写着
  //  "Called from Max All UI buttons and nowhere else"）。10000× 速度下玩家跟不上点击节奏，
  // 于是 maxAM 永远停在 1e5921 量级、IP 停在 1e29，摸不到 1.797e308 的永恒门槛。
  // 详见 core/oreki-early-automation.js。
  OrekiEarlyAutomation.tick();

  // [Oreki AD10] Eternity 阶段的通路自动化：时间维度 → 时间定理 → 时间研究。
  // 实测 EP 已到 1e694437 却一个时间研究都没买上，因为
  // `TimeTheorems.checkForBuying()` 要求先买过时间维度（time-theorems.js:112），
  // 而 Reality 的唯一闸门是 `TimeStudy.reality.isBought`（reality.js:119）。
  // 详见 core/oreki-eternity-automation.js。
  OrekiEternityAutomation.tick();

  // IP generation is broken into a couple of places in gameLoop; changing that might change the
  // behavior of eternity farming.
  preProductionGenerateIP(diff);

  if (!Pelle.isDoomed) {
    passivePrestigeGen();
  }


  applyAutoprestige(realDiff / getGlobalSpeedFactor());
  updateImaginaryMachines(realDiff);

  const uncountabilityGain = AlchemyResource.uncountability.effectValue * Time.unscaledDeltaTime.totalSeconds;
  Currency.realities.add(uncountabilityGain);
  Currency.perkPoints.add(uncountabilityGain);

  if (Perk.autocompleteEC1.canBeApplied) player.reality.lastAutoEC += realDiff;

  EternityChallenge(12).tryFail();
  Achievements._power.invalidate();

  // 维度产量累积已在上方「微步核心」中按 stepDiff 完成，此处不再重复 tick。

  const gain = Math.clampMin(FreeTickspeed.fromShards(Currency.timeShards.value).newAmount - player.totalTickGained, 0);
  player.totalTickGained += gain;

  updatePrestigeRates();
  tryCompleteInfinityChallenges();

  EternityChallenges.autoComplete.tick();

  replicantiLoop(diff);

  if (PlayerProgress.dilationUnlocked()) {
    Currency.dilatedTime.add(getDilationGainPerSecond().times(diff / 1000));
  }

  updateTachyonGalaxies();
  Currency.timeTheorems.add(getTTPerSecond().times(diff / 1000));
  InfinityDimensions.tryAutoUnlock();
  // [Oreki AD3] 首次 ID1 的自动解锁/购买：等价于玩家在 ID 页点「全部购买」。
  // 只在「已 Break / 未解锁永恒 / ID1 未解锁 / 余额够 1e8 / 自动购买器总开关打开 /
  // 非挑战 / 非毁灭现实」时执行一次；走原版 InfinityDimensions.buyMax()，
  // 不直接写 isUnlocked，也不覆盖玩家的自动购买器开关。
  tryFirstId1AutoUnlock();

  BlackHoles.updatePhases(blackHoleDiff);

  // Unlocks dilation at a certain total TT count for free, but we add the cost first in order to make
  // sure that TT count doesn't go negative and that we can actually buy it. This technically bumps the max theorem
  // amount up as well, but at this point of the game 5k TT is insignificant to basically all other sources of TT.
  if (Ra.unlocks.autoUnlockDilation.canBeApplied &&
    Currency.timeTheorems.max.gte(TimeStudy.dilation.totalTimeTheoremRequirement) &&
    !isInCelestialReality() &&
    !Pelle.isDoomed) {
    Currency.timeTheorems.add(TimeStudy.dilation.cost);
    TimeStudy.dilation.purchase(true);
  }

  applyAutoUnlockPerks();
  if (GlyphSelection.active) GlyphSelection.update(gainedGlyphLevel());

  // There are some external checks which prevent excessive resource gain with Teresa-25; it may give TP outside of
  // dilation, but the TP gain function is also coded to behave differently if it's active
  const teresa1 = player.dilation.active && Ra.unlocks.autoTP.canBeApplied;
  const teresa25 = !isInCelestialReality() && Ra.unlocks.unlockDilationStartingTP.canBeApplied;
  if ((teresa1 || teresa25) && !Pelle.isDoomed) rewardTP();

  if (Enslaved.canTickHintTimer) {
    player.celestials.enslaved.hintUnlockProgress += Enslaved.isRunning ? realDiff : (realDiff * 0.4);
    if (player.celestials.enslaved.hintUnlockProgress >= TimeSpan.fromHours(5).totalMilliseconds) {
      EnslavedProgress.hintsUnlocked.giveProgress();
      Enslaved.quotes.hintUnlock.show();
    }
  }

  laitelaRealityTick(realDiff / getGlobalSpeedFactor());
  Achievements.autoAchieveUpdate(diff);
  V.checkForUnlocks();
  AutomatorBackend.update(realDiff / getGlobalSpeedFactor());
  Pelle.gameLoop(realDiff);
  GalaxyGenerator.loop(realDiff);
  GameEnd.gameLoop(realDiff / getGlobalSpeedFactor());

  if (!Enslaved.canAmplify) {
    Enslaved.boostReality = false;
  }

  // Stopping these checks after CREDITS_START reduces lag and allows for the glyph customization modal to appear
  if (GameEnd.endState < END_STATE_MARKERS.CREDITS_START) {
    if (Tabs.current.isPermanentlyHidden) {
      const tab = Tabs.all.reverse().find(t => !t.isPermanentlyHidden && t.id !== 10);
      if (tab) tab.show(true);
      else [...Tab.dimensions.subtabs].reverse().find(t => !t.isPermanentlyHidden).show(true);
    }

    if (Tabs.current.subtabs.find(t => t.isOpen).isPermanentlyHidden) {
      [...Tab.dimensions.subtabs].reverse().find(t => !t.isPermanentlyHidden).show(true);
    }
  }

  EventHub.dispatch(GAME_EVENT.GAME_TICK_AFTER);
  GameUI.update();
  player.lastUpdate = thisUpdate;
  PerformanceStats.end("Game Update");
}

// 微步参数：一帧的游戏时间超过 MICRO_STEP_TARGET_MS 才切步，最多 MICRO_STEP_MAX 步。
// 依据：原版 Autobuyers.tick() 每帧一次；高倍率下 diff/frame 可达数十万游戏毫秒，
// 采购被稀释成「每帧一次」。历史上 k=10 时 CPU ≈8.4ms/帧，仍在 20ms 预算内。
const MICRO_STEP_TARGET_MS = 1000;
const MICRO_STEP_MAX = 32;

function microStepCount(gameDiff) {
  if (!Number.isFinite(gameDiff) || gameDiff <= MICRO_STEP_TARGET_MS) return 1;
  return Math.clamp(Math.ceil(gameDiff / MICRO_STEP_TARGET_MS), 1, MICRO_STEP_MAX);
}

function updatePrestigeRates() {
  const currentIPmin = gainedInfinityPoints().dividedBy(Math.clampMin(0.0005, Time.thisInfinityRealTime.totalMinutes));
  if (currentIPmin.gt(player.records.thisInfinity.bestIPmin) && Player.canCrunch) {
    player.records.thisInfinity.bestIPmin = currentIPmin;
    player.records.thisInfinity.bestIPminVal = gainedInfinityPoints();
  }

  const currentEPmin = gainedEternityPoints().dividedBy(Math.clampMin(0.0005, Time.thisEternityRealTime.totalMinutes));
  if (currentEPmin.gt(player.records.thisEternity.bestEPmin) && Player.canEternity) {
    player.records.thisEternity.bestEPmin = currentEPmin;
    player.records.thisEternity.bestEPminVal = gainedEternityPoints();
  }

  const currentRSmin = Effarig.shardsGained / Math.clampMin(0.0005, Time.thisRealityRealTime.totalMinutes);
  if (currentRSmin > player.records.thisReality.bestRSmin && isRealityAvailable()) {
    player.records.thisReality.bestRSmin = currentRSmin;
    player.records.thisReality.bestRSminVal = Effarig.shardsGained;
  }
}

function passivePrestigeGen() {
  let eternitiedGain = 0;
  if (RealityUpgrade(14).isBought) {
    eternitiedGain = DC.D1.timesEffectsOf(
      Achievement(113),
      RealityUpgrade(3),
      RealityUpgrade(14)
    );
    eternitiedGain = Decimal.times(eternitiedGain, getAdjustedGlyphEffect("timeetermult"));
    eternitiedGain = new Decimal(Time.deltaTime).times(
      Decimal.pow(eternitiedGain, AlchemyResource.eternity.effectValue));
    player.reality.partEternitied = player.reality.partEternitied.plus(eternitiedGain);
    Currency.eternities.add(player.reality.partEternitied.floor());
    player.reality.partEternitied = player.reality.partEternitied.sub(player.reality.partEternitied.floor());
  }

  if (!EternityChallenge(4).isRunning) {
    let infGen = DC.D0;
    if (BreakInfinityUpgrade.infinitiedGen.isBought) {
      // 原版刻意排除成就 87 与时间研究 32 的加成；本版本（沿用 ADfaster 平衡）保留这两项
      infGen = infGen.plus(0.5 * Time.deltaTimeMs / Math.clampMin(50, player.records.bestInfinity.time));
      infGen = infGen.timesEffectsOf(
        TimeStudy(32),
        RealityUpgrade(5),
        RealityUpgrade(7),
        Achievement(164),
        Ra.unlocks.continuousTTBoost.effects.infinity
      );
      infGen = infGen.times(getAdjustedGlyphEffect("infinityinfmult"));
    }
    if (RealityUpgrade(11).isBought) {
      infGen = infGen.plus(RealityUpgrade(11).effectValue.times(Time.deltaTime));
    }
    if (EffarigUnlock.eternity.isUnlocked) {
      // We consider half of the eternities we gained above this tick
      // to have been gained before the infinities, and thus not to
      // count here. This gives us the desirable behavior that
      // infinities and eternities gained overall will be the same
      // for two ticks as for one tick of twice the length.
      infGen = infGen.plus(gainedInfinities().times(
        Currency.eternities.value.minus(eternitiedGain.div(2).floor())).times(Time.deltaTime));
    }
    infGen = infGen.plus(player.partInfinitied);
    Currency.infinities.add(infGen.floor());
    player.partInfinitied = infGen.minus(infGen.floor()).toNumber();
  }
}

// Applies all perks which automatically unlock things when passing certain thresholds, needs to be checked every tick
function applyAutoUnlockPerks() {
  if (!TimeDimension(8).isUnlocked && Perk.autounlockTD.canBeApplied) {
    for (let dim = 5; dim <= 8; ++dim) TimeStudy.timeDimension(dim).purchase();
  }
  if (Perk.autounlockDilation3.canBeApplied) buyDilationUpgrade(DilationUpgrade.ttGenerator.id);
  if (Perk.autounlockReality.canBeApplied) TimeStudy.reality.purchase(true);
  applyEU2();
}

function laitelaRealityTick(realDiff) {
  const laitelaInfo = player.celestials.laitela;
  if (!Laitela.isRunning) return;
  if (laitelaInfo.entropy >= 0) {
    laitelaInfo.entropy += (realDiff / 1000) * Laitela.entropyGainPerSecond;
  }

  // Setting entropy to -1 on completion prevents the modal from showing up repeatedly
  if (laitelaInfo.entropy >= 1) {
    let completionText = `Lai'tela's Reality has been destabilized after ${Time.thisRealityRealTime.toStringShort()}.`;
    laitelaInfo.entropy = -1;
    const oldInfo = {
      fastestCompletion: laitelaInfo.fastestCompletion,
      difficultyTier: laitelaInfo.difficultyTier,
      realityReward: Laitela.realityReward
    };
    laitelaInfo.thisCompletion = Time.thisRealityRealTime.totalSeconds;
    laitelaInfo.fastestCompletion = Math.min(laitelaInfo.thisCompletion, laitelaInfo.fastestCompletion);
    clearCelestialRuns();
    if (Time.thisRealityRealTime.totalSeconds < 30) {
      laitelaInfo.difficultyTier++;
      laitelaInfo.fastestCompletion = 300;
      completionText += laitelaBeatText(Laitela.maxAllowedDimension + 1);
      for (const quote of Laitela.quotes.all) {
        if (quote.requirement) {
          quote.show();
        }
      }
    }
    if (Laitela.realityReward > oldInfo.realityReward) {
      completionText += `<br><br>暗物质倍率：${formatX(oldInfo.realityReward, 2, 2)} ➜ ${formatX(Laitela.realityReward, 2, 2)}`;
      if (oldInfo.fastestCompletion === 3600 || oldInfo.fastestCompletion === 300 && oldInfo.difficultyTier > 0) {
        if (Time.thisRealityRealTime.totalSeconds < 30) {
          // First attempt - destabilising
          completionText += `<br>最佳完成时间：无 ➜ 已达到不稳定<br>可用的最高维度：${formatInt(8 - oldInfo.difficultyTier)} ➜ ${formatInt(8 - laitelaInfo.difficultyTier)}`;
        } else {
          // First attempt - not destabilising
          completionText += `<br>最佳完成时间：无 ➜ ${TimeSpan.fromSeconds(laitelaInfo.fastestCompletion).toStringShort()}<br>可用的最高维度：${formatInt(8 - laitelaInfo.difficultyTier)}`;
        }
      } else if (Time.thisRealityRealTime.totalSeconds < 30) {
        // Second+ attempt - destabilising
        completionText += `<br>最佳完成时间：${TimeSpan.fromSeconds(oldInfo.fastestCompletion).toStringShort()} ➜ 已达到不稳定<br>可用的最高维度：${formatInt(8 - oldInfo.difficultyTier)} ➜ ${formatInt(8 - laitelaInfo.difficultyTier)}`;
      } else {
        // Second+ attempt - not destabilising
        completionText += `<br>最佳完成时间：${TimeSpan.fromSeconds(oldInfo.fastestCompletion).toStringShort()} ➜ ${TimeSpan.fromSeconds(laitelaInfo.fastestCompletion).toStringShort()}<br>可用的最高维度：${formatInt(8 - oldInfo.difficultyTier)}`;
      }
      player.records.bestReality.laitelaSet = Glyphs.copyForRecords(Glyphs.active.filter(g => g !== null));
    } else {
      completionText += ` 你需要在 ${TimeSpan.fromSeconds(laitelaInfo.fastestCompletion).toStringShort()} 内达到不稳定，才能提高暗物质的倍率加成。`;
    }
    if (Laitela.isFullyDestabilized) SpeedrunMilestones(24).tryComplete();
    Modal.message.show(completionText, {}, 2);
  }
}

function laitelaBeatText(disabledDim) {
  switch (disabledDim) {
    case 1: return `<br><br>在莱特拉的现实中，所有种类的所有维度都不产生任何东西。你仍然可以进入祂的现实，但你无法继续让祂的现实出现不稳定。祂的现实已完全不稳定，暗能量的产量额外 ${formatX(8)}`;
    case 2: return `<br><br>Lai'tela's Reality will now disable production from all 2nd Dimensions during
      future runs, but the reward will be ${formatInt(100)} times stronger than before. Completely destabilizing
      the Reality for the final Dimension will give you an additional ${formatX(8)} to Dark Energy gain.`;
    case 3: return `<br><br>Lai'tela's Reality will now disable production from all 3rd Dimensions during
        future runs, but the reward will be ${formatInt(100)} times stronger than before.`;
    case 8: return `<br><br>Lai'tela's Reality will now disable production from all 8th Dimensions during
        future runs, but the reward will be ${formatInt(100)} times stronger than before. This boost can be
        repeated for each remaining Dimension by reaching destabilization within ${formatInt(30)} seconds again.`;
    default: return `<br><br>Lai'tela's Reality will now disable production from all
        ${disabledDim}th Dimensions during future runs, but the reward will be
        ${formatInt(100)} times stronger than before.`;
  }
}

// This gives IP/EP/RM from the respective upgrades that reward the prestige currencies continuously
function applyAutoprestige(diff) {
  Currency.infinityPoints.add(TimeStudy(181).effectOrDefault(0));

  if (TeresaUnlocks.epGen.canBeApplied) {
    Currency.eternityPoints.add(player.records.thisEternity.bestEPmin.times(DC.D0_01)
      .times(getGameSpeedupFactor() * diff / 1000).timesEffectOf(Ra.unlocks.continuousTTBoost.effects.autoPrestige));
  }

  if (InfinityUpgrade.ipGen.isCharged) {
    const addedRM = MachineHandler.gainedRealityMachines
      .timesEffectsOf(InfinityUpgrade.ipGen.chargedEffect)
      .times(diff / 1000);
    Currency.realityMachines.add(addedRM);
  }

  if (PelleRifts.chaos.milestones[2].canBeApplied) {
    Currency.eternityPoints.add(gainedEternityPoints().times(DC.D0_1).times(diff / 1000));
  }
}

function updateImaginaryMachines(diff) {
  MachineHandler.updateIMCap();
  Currency.imaginaryMachines.add(MachineHandler.gainedImaginaryMachines(diff));
}

function updateTachyonGalaxies() {
  const tachyonGalaxyMult = Effects.max(1, DilationUpgrade.doubleGalaxies);
  const tachyonGalaxyThreshold = 1000;
  const thresholdMult = getTachyonGalaxyMult();
  player.dilation.baseTachyonGalaxies = Math.max(player.dilation.baseTachyonGalaxies,
    1 + Math.floor(Decimal.log(Currency.dilatedTime.value.dividedBy(1000), thresholdMult)));
  player.dilation.nextThreshold = DC.E3.times(new Decimal(thresholdMult)
    .pow(player.dilation.baseTachyonGalaxies));
  player.dilation.totalTachyonGalaxies =
    Math.min(player.dilation.baseTachyonGalaxies * tachyonGalaxyMult, tachyonGalaxyThreshold) +
    Math.max(player.dilation.baseTachyonGalaxies * tachyonGalaxyMult - tachyonGalaxyThreshold, 0) / tachyonGalaxyMult;

  player.dilation.totalTachyonGalaxies *= DilationUpgrade.galaxyMultiplier.effectValue;
}

export function getTTPerSecond() {
  // All TT multipliers (note that this is equal to 1 pre-Ra)
  let ttMult = Effects.product(
    Ra.unlocks.continuousTTBoost.effects.ttGen,
    Ra.unlocks.achievementTTMult,
    Achievement(137),
    Achievement(156),
  );
  if (GlyphAlteration.isAdded("dilation")) ttMult *= getSecondaryGlyphEffect("dilationTTgen");

  // Glyph TT generation
  const glyphTT = Teresa.isRunning || Enslaved.isRunning || Pelle.isDoomed
    ? 0
    : getAdjustedGlyphEffect("dilationTTgen") * ttMult;

  // Dilation TT generation
  const dilationTT = DilationUpgrade.ttGenerator.isBought
    ? DilationUpgrade.ttGenerator.effectValue.times(Pelle.isDoomed ? 1 : ttMult)
    : DC.D0;

  // Lai'tela TT power
  let finalTT = dilationTT.add(glyphTT);
  if (finalTT.gt(1)) {
    finalTT = finalTT.pow(SingularityMilestone.theoremPowerFromSingularities.effectOrDefault(1));
  }

  return finalTT;
}

// eslint-disable-next-line no-unused-vars
function recursiveTimeOut(fn, iterations, endFn) {
  fn(iterations);
  if (iterations === 0) endFn();
  else setTimeout(() => recursiveTimeOut(fn, iterations - 1, endFn), 0);
}

function afterSimulation(seconds, playerBefore) {
  if (seconds > 600) {
    const playerAfter = deepmergeAll([{}, player]);
    Modal.awayProgress.show({ playerBefore, playerAfter, seconds });
  }

  GameUI.notify.showBlackHoles = true;
}

export function simulateTime(seconds, real, fast) {
  // 模拟过程会多次乘以/除以全局速度因子，必须把倍率冻结为同一快照，
  // 否则用户在离线模拟期间修改倍率会导致时间被放大或缩小多次
  const speedToken = OrekiSpeed.beginSimulation();
  seconds *= getGlobalSpeedFactor();
  // The game is simulated at a base 50ms update rate, with a maximum tick count based on the values of real and fast
  // - Calling with real === true will always simulate at full accuracy with no tick count reduction unless it would
  //   otherwise simulate with more ticks than offline progress would allow
  // - Calling with fast === true will only simulate it with a max of 50 ticks
  // - Otherwise, tick count will be limited to the offline tick count (which may be set externally during save import)
  // Tick count is never *increased*, and only ever decreased if needed.
  if (seconds < 0) {
    OrekiSpeed.endSimulation(speedToken);
    return;
  }
  // 间隔数只按真实秒数计算（先乘后除相互抵消），因此改倍率不会让离线折算精度变化
  let ticks = Math.floor(seconds / getGlobalSpeedFactor() * 20);
  GameUI.notify.showBlackHoles = false;

  // Limit the tick count (this also applies if the black hole is unlocked)
  const maxTicks = GameStorage.maxOfflineTicks(1000 * seconds / getGlobalSpeedFactor(),
    GameStorage.offlineTicks ?? player.options.offlineTicks);
  if (ticks > maxTicks && !fast) {
    ticks = maxTicks;
  } else if (ticks > 50 && !real && fast) {
    ticks = 50;
  }

  const playerStart = deepmergeAll([{}, player]);

  let totalGameTime;

  if (BlackHoles.areUnlocked && !BlackHoles.arePaused) {
    totalGameTime = BlackHoles.calculateGameTimeFromRealTime(seconds, BlackHoles.calculateSpeedups());
  } else {
    totalGameTime = getGameSpeedupFactor() * seconds;
  }

  const infinitiedMilestone = getInfinitiedMilestoneReward(totalGameTime * 1000);
  const eternitiedMilestone = getEternitiedMilestoneReward(totalGameTime * 1000);

  if (eternitiedMilestone.gt(0)) {
    Currency.eternities.add(eternitiedMilestone);
  } else if (infinitiedMilestone.gt(0)) {
    Currency.infinities.add(infinitiedMilestone);
  } else {
    Currency.eternityPoints.add(getOfflineEPGain(seconds * 1000));
  }

  if (InfinityUpgrade.ipOffline.isBought && player.options.offlineProgress) {
    Currency.infinityPoints.add(player.records.thisEternity.bestIPMsWithoutMaxAll.times(seconds * 1000 / 2));
  }

  EventHub.dispatch(GAME_EVENT.OFFLINE_CURRENCY_GAINED);

  let remainingRealSeconds = seconds / getGlobalSpeedFactor();
  // During async code the number of ticks remaining can go down suddenly
  // from "Speed up" which means tick length needs to go up, and thus
  // you can't just divide total time by total ticks to get tick length.
  // For example, suppose you had 6000 offline ticks, and called "Speed up"
  // 1000 ticks in, meaning that after "Speed up" there'd only be 1000 ticks more
  // (so 1000 + 1000 = 2000 ticks total). Dividing total time by total ticks would
  // use 1/6th of the total time before "Speed up" (1000 of 6000 ticks), and 1/2 after
  // (1000 of 2000 ticks). Short of some sort of magic user prediction to figure out
  // whether the user *will* press "Speed up" at some point, dividing remaining time
  // by remaining ticks seems like the best thing to do.
  let loopFn = i => {
    const diff = remainingRealSeconds / i;
    gameLoop(1000 * diff);
    remainingRealSeconds -= diff;
  };

  // Simulation code which accounts for BH cycles (segments where a BH is active doesn't use diff since it splits
  // up intervals based on real time instead in an effort to keep ticks all roughly equal in game time).
  // Black hole auto-pausing is entirely handled by the black hole phase advancement code (for actually pausing)
  // and calculateOfflineTick (for time calculation).
  if (BlackHoles.areUnlocked && !BlackHoles.arePaused) {
    loopFn = i => {
      const [realTickTime, blackHoleSpeedup] = BlackHoles.calculateOfflineTick(remainingRealSeconds,
        i, 0.0001);
      remainingRealSeconds -= realTickTime;
      gameLoop(1000 * realTickTime, { blackHoleSpeedup });
    };
  }

  // We don't show the offline modal here or bother with async if doing a fast simulation
  if (fast) {
    // Fast simulations happen when simulating between 10 and 50 seconds of offline time.
    // One easy way to get this is to autosave every 30 or 60 seconds, wait until the save timer
    // in the bottom-left hits 15 seconds, and refresh (without saving directly beforehand).
    GameIntervals.stop();
    // Fast simulations are always 50 ticks. They're done in this weird countdown way because
    // we want to be able to call the same function that we call when using async code (to avoid
    // duplicating functions), and that function expects a parameter saying how many ticks are remaining.
    for (let remaining = 50; remaining > 0; remaining--) {
      loopFn(remaining);
    }
    GameStorage.postLoadStuff();
    afterSimulation(seconds, playerStart);
    OrekiSpeed.endSimulation(speedToken);
  } else {
    const progress = {};
    ui.view.modal.progressBar = {};
    Async.run(loopFn,
      ticks,
      {
        batchSize: 1,
        maxTime: 60,
        sleepTime: 1,
        asyncEntry: doneSoFar => {
          GameIntervals.stop();
          ui.$viewModel.modal.progressBar = {
            label: "离线进度模拟",
            info: () => `游戏正以较低精度运行，以便快速计算你离线期间获得的资源。技术细节请参见“离线进度”的游戏帮助条目。
若你希望更快返回游戏，可点击“加速”按钮，此时系统将以剩余时间间隔数的一半（最低不少于 ${formatInt(500)} 个）快速模拟剩余进度。点击“跳过”按钮则会将全部剩余离线时间压缩至 ${formatInt(10)} 个时间间隔完成计算。`,
            progressName: "时间间隔",
            current: doneSoFar,
            max: ticks,
            startTime: Date.now(),
            buttons: [{
              text: "加速",
              condition: (current, max) => max - current > 500,
              click: () => {
                const newRemaining = Math.clampMin(Math.floor(progress.remaining / 2), 500);
                // We subtract the number of ticks we skipped, which is progress.remaining - newRemaining.
                // This, and the below similar code in "SKIP", are needed or the progress bar to be accurate
                // (both with respect to the number of ticks it shows and with respect to how full it is).
                progress.maxIter -= progress.remaining - newRemaining;
                progress.remaining = newRemaining;
                // We update the progress bar max data (remaining will update automatically).
                ui.$viewModel.modal.progressBar.max = progress.maxIter;
              }
            },
            {
              text: "跳过",
              condition: (current, max) => max - current > 10,
              click: () => {
                // We jump to 10 from the end (condition guarantees there are at least 10 left).
                // We subtract the number of ticks we skipped, which is progress.remaining - 10.
                progress.maxIter -= progress.remaining - 10;
                progress.remaining = 10;
              }
            }]
          };
        },
        asyncProgress: doneSoFar => {
          ui.$viewModel.modal.progressBar.current = doneSoFar;
        },
        asyncExit: () => {
          ui.$viewModel.modal.progressBar = undefined;
          // .postLoadStuff will restart GameIntervals
          GameStorage.postLoadStuff();
          OrekiSpeed.endSimulation(speedToken);
        },
        then: () => {
          afterSimulation(seconds, playerStart);
        },
        progress
      });
  }
}

window.onload = function() {
  const supportedBrowser = browserCheck();
  GameUI.initialized = supportedBrowser;
  ui.view.initialized = supportedBrowser;
  setTimeout(() => {
    ElectronRuntime.updateZoom();
    document.getElementById("loading").style.display = "none";
  }, 500);
  if (!supportedBrowser) {
    GameIntervals.stop();
    document.getElementById("loading").style.display = "none";
    document.getElementById("browser-warning").style.display = "flex";
  }
};

window.onfocus = function() {
  setShiftKey(false);
};

window.onblur = function() {
  GameKeyboard.stopSpins();
};

export function setShiftKey(isDown) {
  ui.view.shiftDown = isDown;
}

export function setHoldingR(x) {
  Replicanti.galaxies.isPlayerHoldingR = x;
}

export function browserCheck() {
  return supportedBrowsers.test(navigator.userAgent);
}

export function init() {
  // eslint-disable-next-line no-console
  console.log("🌌 Antimatter Dimensions: Reality Update 🌌");
  if (DEV) {
    // eslint-disable-next-line no-console
    console.log("👨‍💻 Development Mode 👩‍💻");
  }
  ElectronRuntime.initialize();
  SteamRuntime.initialize();
  Cloud.init();
  GameStorage.load();
  Tabs.all.find(t => t.config.id === player.options.lastOpenTab)?.show(true);
  Payments.init();
}

window.tweenTime = 0;
let lastFrame;
function animateTweens(time) {
  requestAnimationFrame(animateTweens);
  if (time === undefined || lastFrame === undefined) {
    lastFrame = time;
    return;
  }
  let delta = time - lastFrame;
  lastFrame = time;
  if (player.dilation.active) {
    delta /= Pelle.isDoomed ? 1.5 : 10;
  }
  tweenTime += delta;
  TWEEN.update(tweenTime);
}

animateTweens();
