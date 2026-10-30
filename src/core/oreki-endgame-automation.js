// [Oreki R37-A] 终局链路自动化：虚幻机器 → 莱特拉 → 佩勒 → 原版终局（isGameEnd）
//
// ── 为什么必须有这个模块（R37-A 读码事实，不是猜）──────────────────────
// V 解锁之后的四步在原版里**全部只有 UI 调用点**，自动化一概不碰：
//   · 虚幻升级购买 `ImaginaryUpgrade(id).purchase()` —— 调用点全在
//     `components/tabs/reality/ImaginaryUpgradeButton.js`；
//   · 莱特拉进入 `Laitela.initializeRun()` —— 调用点 `EnterCelestialsModal.js`；
//   · 佩勒进入 `Pelle.initializeRun()` —— 调用点 `PelleTab.js` 的「毁灭」按钮；
//   · 佩勒升级 `PelleUpgrade.all[i].purchase()` —— 调用点 `PelleUpgradeButton.js`。
// 所以即使 V 解锁、把材料攒满，这条链也**永远不会往前走**。
//
// ── 本模块只做「按原版按钮」这一件事 ──────────────────────────────────
// 全部调用真实 API（purchase / initializeRun），**不写任何解锁位、不发任何货币、
// 不改 requirementChecks**。买不起就返回 false，下一帧再试。
//
// ── 链路与真实判定（逐条对齐源码）────────────────────────────────────
// ① IU15「理想之构」cost 1e9 IM：`checkRequirement = maxID1.eq(0) && am.exponent >= 1.5e12`
//    （secret-formula/reality/imaginary-upgrades.js:158-176）→ 买上后 `Laitela.isUnlocked` 变真
//    （celestials/laitela/laitela.js:11 `ImaginaryUpgrade(15).isBought`）。
// ② 莱特拉「不稳定」：`game.js:1104` 只有 `Time.thisRealityRealTime.totalSeconds < 30` 时才
//    `difficultyTier++`（每次 +1，`maxAllowedDimension = 8 - tier`）。8 次即「完全不稳定」。
//    ⇒ 本模块只在「本现实真实时间 < 15 s」时进入 run，给熵增长留 15 s 余量。
//    熵增速 `Laitela.entropyGainPerSecond = clamp((log10(AM)/1e11)^2,0,100)/200`
//    （laitela.js:52）：AM 指数 ≥1e11 时是 0.5/s ⇒ 2 s 充满，远小于 30 s。
// ③ IU25「彻底抹除」：`checkRequirement = Laitela.isRunning && maxAllowedDimension === 0 &&
//    Glyphs.activeWithoutCompanion.length <= 1 && TimeStudy.reality.isBought`
//    （imaginary-upgrades.js:296-305）。买上后 `Pelle.isUnlocked` 变真（pelle.js:121）。
//    符文条件需要「临门卸符文」：本模块在买之前用原版 `Glyphs.unequipAll()` 卸下，
//    买完不做任何恢复（符文由 auto-glyph-processor / 现实自动化按正常规则再装备）。
// ④ 佩勒：`Pelle.initializeRun()` → 内部 `Glyphs.unequipAll` + 置 `doomed` + 卸全部机制
//    （pelle.js:57-110）。之后每帧买 `PelleUpgrade`（真实 `purchase()`，货币是遗迹碎片）。
//    终局判据是 `player.isGameEnd`，由 `GameEnd.gameLoop` 在 `endState >= 1` 时置真
//    （pelle/game-end.js:38-46）。

import { Pelle, PelleUpgrade } from "./celestials/pelle/pelle.js";
import { maxAll } from "./dimensions/antimatter-dimension.js";
import { requestDimensionBoost } from "./dimboost.js";
import { requestGalaxyReset } from "./galaxy.js";
import { Autobuyer } from "./autobuyers/autobuyers.js";
import { bigCrunchResetRequest } from "./big-crunch.js";
import { Laitela } from "./celestials/laitela/laitela.js";
import { OREKI_IU25_COST } from "./secret-formula/reality/imaginary-upgrades.js";

/** 进莱特拉 run 时本现实真实时间的上限（毫秒）。见上方 ② 的 30 s 判定。 */
const LAT_RUN_ENTER_MAX_REAL_MS = 15000;
/**
 * [Oreki R38-A] 进莱特拉 run 的反物质指数下限（原版熵公式见 laitela.js:74）。
 *
 * 事实：`game.js:1092` 的 `laitelaRealityTick(realDiff)` 用的是**真实时间**，
 *   entropy += realDiff/1000 × entropyGainPerSecond，速率 = (amE/5e8)^2/200（本作已缩放）。
 * 而 `game.js:1104` 只有 `thisRealityRealTime.totalSeconds < 30` 时才 `difficultyTier++`。
 * ⇒ 想在 30 s 内充满 1.0，需要速率 ≥ 1/30 ≈ 0.033/s ⇒ amE ≥ 5e8×sqrt(6.6) ≈ 1.3e9。
 * 取 1e10（速率 0.5/s，2 s 填满）留足余量。
 *
 * 为什么必须设这个下限（R38-A 实测 `_r38a/full1.out`）：
 *   `Laitela.isRunning` 会让 `InfinityDimension.productionPerSecond` 对
 *   `tier > maxAllowedDimension` 的层返回 0（infinity-dimension.js:127-133），
 *   tier=1 时 **ID8 直接停产** → 无限之力塌陷 → amE 掉到 3.5e8 → 熵速率 0.0024/s
 *   → 一次要 400 多秒，远超 30 s 窗口，tier 永远停在 1（实测 522 s→800 s 都是 tier=1）。
 *   所以「无条件常驻一个 run」是错误的；必须等 amE 高时才进，低时退出。
 */
// [R40-A2] 1e10 → 4e8。熵速率公式是 clamp((log10(AM)/2e7)^2, 0, 100)/200
// （laitela.js:82，除数 2e7），指数到 2e8 就已经 clamp 到 0.5/s（2 s 填满），
// 1e10 比满速点高 50 倍；上面注释里的「(amE/5e8)^2/200」是旧除数。
// 实测 r40a2-t1：IU15 之后 265 s、523 个采样里 amE 只有 1 条 ≥1e10，run 0 次，tier 恒 0。
const LAT_RUN_MIN_AM_EXP = 4e8;
/** run 进去后多久还没涨到 0.9 熵就放弃（真实毫秒），避免长期压住 ID8 */
const LAT_RUN_ABORT_MS = 8000;
/**
 * [Oreki R38-A] 本现实真实时间的「压现实上限」（毫秒）。
 *
 * `game.js:1104` 的 `difficultyTier++` 只在 `thisRealityRealTime.totalSeconds < 30` 时发生，
 * 所以压现实最多压到 28 s 就必须放手（留 2 s 给熵结算那一帧）。
 */
const LAT_TIER_WINDOW_MS = 28000;
/**
 * [Oreki R40] tier 8 之后「护住 DS6」的压现实上限（真实毫秒）。
 *
 * ── 为什么必须有这一段（R39 长跑 2230 条采样的硬证据）──────────────
 * `_tools/_r39b/r39b-full.jsonl` 逐条统计：
 *   · `ds6 === true` 的采样 99 条，全部落在 t ≤ 406.5 s；
 *   · `laiTier >= 8` 的采样 1672 条，从 t = 578.2 s 起一直到结束；
 *   · **两者同时成立的采样 = 0 条**。
 * 也就是说：DS6（`TimeStudy.reality`）一被买上，`isRealityAvailable()` 立刻为真、
 * 下一次 `shouldReality()` 就把现实打出去，而现实重置会清空时间研究（reality.js:673）
 * ⇒ DS6 只活一帧。`driveLaitela()` 是 500 ms 真实节流，永远采不到
 * 「DS6 在位 + tier 8」这个交集，于是 IU25 的
 * `checkRequirement`（`Laitela.isRunning && maxAllowedDimension === 0 &&
 * TimeStudy.reality.isBought`，imaginary-upgrades.js:296-305）**一次都不可能成立**。
 * 实测后果：R39 停在 `iu15=true / tier=8 / imL=10.5 / ds6=false`，`iu25` 恒 false。
 *
 * 修法：不要等 DS6 到账再判断——那样必然输掉竞态。改成「EC 链已经全部 5/5」时
 * 就提前压住现实，让 DS6 买上之后**留得住**，再在同一个现实里起 run、卸符文、买 IU25。
 * 上限 90 s，到点无条件放行；每次现实重置后重新计时，不会永久压死现实。
 */
const IU25_HOLD_MAX_MS = 90000;
/** 莱特拉／佩勒动作节流（真实毫秒） */
const SLOW_TICK_MS = 500;
/** IM 购买节流（真实毫秒）：IM 是指数逼近上限，10 s 粒度完全够用 */
const IM_TICK_MS = 2000;
/**
 * [Oreki R38-M] 佩勒阶段「只长大、不重置」——停掉一切会把当前反物质清零的路径。
 *
 * ── 实测事实（这是本轮的关键修正，之前 105 秒的假停摆就是它）────────────────
 * 终局判据 `game-end.js:43` 读 `player.celestials.pelle.records.totalAntimatter`，
 * 而该字段是 `currency.js:216` 的 `max(value)` —— **历史峰值**。
 * 佩勒阶段只要还有人在坍缩，反物质一涨到 `Player.canCrunch` 的门槛
 * （`Decimal.NUMBER_MAX_VALUE` = 1.797e308，id 见 `player.js:958`）就被清零，
 * 于是「每周期峰值」永远停在 e308 量级，峰值字段再也抬不动。
 *
 * `_tools/_r38a/lai6.jsonl` 的原始采样（1 s 粒度，t = 进入佩勒后的秒数）：
 *   t=323.6 pamE=316  amE=154  ad1=6.86e130
 *   t=350.8 pamE=316  amE=308  ad1=1.51e316
 *   t=420.2 pamE=316  amE=308  ad1=1.96e316
 * `pamE` 从 t=323.6 起 **105 秒一动不动**，同期 `ad1` 涨了 186 个数量级
 * （6.86e130 → 1.96e316）—— 产量完全正常，是**重置把峰值按住了**。
 *
 * `crunchL`（无限次数 log10）在同 100 秒内从 0 涨到 3.59，即约 39 次/秒，
 * 远超本文件自己的 3 s 节流 ⇒ 真正的坍缩源是原版自动购买器：
 * `Pelle.initializeRun` 会强制 `Autobuyer.bigCrunch.mode = AMOUNT`（pelle.js:87），
 * 而 `big-crunch-autobuyer.js:107` 的 `canTick` 就是 `Player.canCrunch`，
 * 反物质一过 1.797e308 当帧就坍缩。
 *
 * ── 结论 ────────────────────────────────────────────────────────────
 * 佩勒阶段必须让反物质**单调增长**：关 `Autobuyer.bigCrunch` / `Autobuyer.eternity`，
 * 本文件也不再主动调 `bigCrunchResetRequest` / `eternity` / `Pelle.armageddon`。
 * （[R40-A5b] 其中「不调 `bigCrunchResetRequest`」这条只对**非末日**成立：
 *  末日态为了拉满 15 级间隔必须有真实 IP，见 `_pulseDoomedCrunch()`。）
 * 大灾变同样要停：`Pelle.armageddon` → `finishProcessReality({ reset: true, armageddon: true })`
 * （pelle.js:149-155），那是整局现实重置，比坍缩更彻底。
 * 只保留「全部最大 + 维度提升 + 星系 + 佩勒升级」——这四件都不清空当前反物质。
 *
 * ── ⚠ [Oreki R40-A5] 上面「大灾变也要停」这条结论是**错的，已推翻** ──────
 *
 * 上面那段推理链本身没错（大灾变确实是整局现实重置），但结论下反了：
 * **正因为它是 `finishProcessReality`，它才是原版给佩勒安排的开 Break 通路**。
 *
 * 事实（`git log -L 748,754:src/core/reality.js` 显示这段来自汉化基线 commit，我们没改过）：
 *   reality.js:749-752
 *     if (Pelle.isDoomed && PelleUpgrade.keepAutobuyers.canBeApplied && Autobuyer.bigCrunch.hasMaxedInterval) {
 *       player.break = true;
 *     }
 * 而 `Pelle.armageddon()` 的第一句就是 `finishProcessReality({ reset: true, armageddon: true })`（pelle.js:155）。
 *
 * 反向链条（`_tools/_r40/R40A4-佩勒诊断.md` §7、§8 实测）：
 *   不末日 ⇒ `cel.remnants` 恒 0（`pelle.js:152-154` 是 remnants 唯一入口）
 *   ⇒ `realityShardGainPerSecond = (10^(remnants^(1/7.5)·4) − 1)/1000` 恒 0（`pelle.js:289-295`）
 *   ⇒ `keepAutobuyers`（5e6 碎片）永远买不上
 *   ⇒ `Autobuyer.reset()` 每次都把 interval 打回 150000（`autobuyer.js:185-189`）
 *   ⇒ `hasMaxedInterval` 恒 false ⇒ `breakInfinity()` 第一行就 return（`game.js:85`）
 *   ⇒ 反物质被 `dropTo(Player.infinityGoal)` 夹在 1.797e308（`antimatter-dimension.js:662-663/682`）
 *   ⇒ `endState` 封顶 0.750357（实测 547 s 零抖动）。
 *
 * 所以 `driveDoomed()` 现在按「先买、后末日」的顺序补上末日循环，判据见 `_maybeArmageddon()`。
 */
const DOOM_BUY_MS = 100;
/** [Oreki R40-A5] 两次末日之间的最小墙钟间隔：末日会清 DT/TP/膨胀升级，不是免费的。 */
const DOOM_ARMAGEDDON_MIN_MS = 20000;
/** [Oreki R40-A5] 反物质指数停滞多久算「本轮跑完了」（真实毫秒）。 */
const DOOM_STALL_MS = 6000;

export const OrekiEndgameAutomation = {
  _lastSlowMs: 0,
  _lastImMs: 0,
  /** 只读观测：各步骤累计成功次数 */
  _iuBought: {},
  _laitelaRuns: 0,
  _laitelaTiers: 0,
  /** [Oreki R38-A] 本次 tick 是否要求压住现实（供 `OrekiCelestialAutomation.holdReality` 读取） */
  _laiHold: false,
  /** [Oreki R38-A] tier 8 起 run 的时刻（真实毫秒），用于「买不上就撤 run」的兜底计时 */
  _laiRunAtMs0: 0,
  /** [Oreki R40] tier 8 后「护住 DS6 / 等 IM」的有界准备期起点（真实毫秒，0 = 未开始） */
  _iu25HoldSince: 0,
  _pelleUpgrades: 0,
  _pelleEntered: false,
  _lastDoomBuyMs: 0,
  /** [Oreki R38-M] 佩勒阶段已关掉的重置购买器次数（只读观测；正常应一直为 0 或很小） */
  _doomResetsOff: 0,
  /** [Oreki R40-A5] 末日循环的观测与节流 */
  _doomArmageddons: 0,
  _lastDoomArmAt: 0,
  _doomAmPeak: 0,
  _doomAmPeakAt: 0,
  _doomBreakAt: 0,
  _doomPhase: "idle",
  _doomCrunchesOn: 0,
  _lastError: "",

  /**
   * [Oreki R38-A] 莱特拉刷层期间是否要压住现实。
   *
   * 事实链：
   *   · `reality.js:766` 现实重置**保留**天体 run，但 `reality.js:701` 把熵清零；
   *   · `game.js:1104` 只有 `thisRealityRealTime < 30 s` 才 `difficultyTier++`；
   *   ⇒ 熵 0→1 必须落在**同一个现实的前 30 s**，中途被现实打断就前功尽弃。
   * 只在「run 在位且还在 28 s 窗口内」或「正在爬 amE」时压，窗口一到立刻放手。
   */
  get holdForLaitela() {
    return this._laiHold === true;
  },

  get step() {
    try {
      if (player.isGameEnd === true) return "game-end";
      if (Pelle.isDoomed) return "doomed";
      if (Pelle.isUnlocked) return "pelle-unlock";
      if (ImaginaryUpgrade(25).isBought) return "iu25";
      if (Laitela.isUnlocked) return "laitela";
      if (ImaginaryUpgrade(15).isBought) return "iu15";
      return "idle";
    } catch (e) {
      return "err";
    }
  },

  /** 由 `game.js` 主循环每帧调用（放在 `OrekiCelestialAutomation.tick()` 之后） */
  tick() {
    if (!player.auto.autobuyersOn) return null;
    try {
      if (player.isGameEnd === true) return null;
      this.buyImaginaryUpgrades();
      this.driveLaitela();
      this.drivePelle();
    } catch (e) {
      this._lastError = String((e && e.message) || e);
    }
    return null;
  },

  // ── ① 虚幻升级：按链路优先级逐个真实购买 ──────────────────────────────
  //
  // 只买这条终局链真正需要的几项，避免把 IM 花在无关升级上导致 IU15/IU25 攒不满：
  //   15（莱特拉入口 1e9）→ 25（佩勒入口，OREKI_IU25_COST）
  // 其余（6/8/13/20 等）要么条件不可达、要么会把 IM 余额吸干，一律不碰。
  buyImaginaryUpgrades() {
    const now = Date.now();
    if (now - this._lastImMs < IM_TICK_MS) return;
    this._lastImMs = now;
    // [Oreki R38-A] 这里**不能**写成 `.lte(0)`：本作的 IM 是普通数字（Number），
    // 没有 Decimal 方法。R38-A 实测 `_r38a/diag-iu25.mjs` 报
    // `Currency.imaginaryMachines.value.lte is not a function`，异常被外层 catch 吞掉，
    // 结果整条 IU 购买链**一次都没执行过**（IU15 是冲刺模块自己买的，掩盖了这个 bug）。
    if (!(Number(Currency.imaginaryMachines.value) > 0)) return;
    for (const id of [15, 25]) {
      try {
        const up = ImaginaryUpgrade(id);
        if (!up || up.isBought) continue;
        // IU25 需要「临门一脚」的前置：莱特拉 tier 8 + 符文≤1
        if (id === 25 && !this.iu25ConditionsReady()) continue;
        if (up.purchase() === true) {
          this._iuBought[id] = (this._iuBought[id] || 0) + 1;
        }
      } catch (e) { /* 单项异常不击穿主循环 */ }
    }
  },

  /**
   * IU25 的**全部**前置是否就位（逐条对齐 `imaginary-upgrades.js:296-305`）。
   * 只读判定；购买动作本身仍由 `ImaginaryUpgrade(25).purchase()` 里的
   * `checkRequirement` 再核一遍，不存在「绕过条件直接买」。
   */
  iu25ConditionsReady() {
    try {
      if (!Laitela.isRunning) return false;
      if (Laitela.maxAllowedDimension !== 0) return false;
      if (!TimeStudy.reality.isBought) return false;
      if (Glyphs.activeWithoutCompanion.length > 1) {
        // 临门卸符文：原版「卸下全部」按钮的同一条路径
        Glyphs.unequipAll(true);
        return Glyphs.activeWithoutCompanion.length <= 1;
      }
      // [Oreki R39] 这里原本写的是 `.gte(OREKI_IU25_COST)`。
      // 本作的 `Currency.imaginaryMachines.value` 是**普通 Number**（没有 Decimal 方法），
      // 调用 `.gte` 会抛 TypeError，被外层 catch 吞掉后恒返回 false ——
      // 结果 IU25 的前置判定**永远是「不就位」**，即使 tier 8 / 研究 / 符文 / IM 全部满足。
      // 这与本文件 176 行刚记录过的同类 bug 是同一个坑（IM 不是 Decimal）。
      // 实测（R39 probe.mjs）：imLog10=10、OREKI_IU25_COST=5e9 时仍返回 false。
      return Number(Currency.imaginaryMachines.value) >= OREKI_IU25_COST;
    } catch (e) {
      return false;
    }
  },

  // ── ② 莱特拉：把 difficultyTier 从 0 刷到 8（完全不稳定）────────────────
  driveLaitela() {
    const now = Date.now();
    if (now - this._lastSlowMs < SLOW_TICK_MS) return;
    this._lastSlowMs = now;
    try {
      this._laiHold = false;
      if (Pelle.isDoomed || Pelle.isUnlocked) return;
      if (!Laitela.isUnlocked) return;
      if (ImaginaryUpgrade(25).isBought) {
        // [Oreki R38-A] IU25 买到后必须把 run 撤掉：tier 8 时 `maxAllowedDimension = 0`，
        // `infinity-dimension.js:127-133` 会让 **8 层无限维度全部停产**，继续留着 run
        // 会把后续佩勒阶段的产量按死。
        if (Laitela.isRunning) clearCelestialRuns();
        this._iu25HoldSince = 0;
        return;
      }
      const tier = Laitela.difficultyTier;
      const realMs = player.records.thisReality.realTime;
      const ent = player.celestials.laitela.entropy;
      const amE = Number(player.antimatter?.exponent ?? 0);

      // 已经 8 级：这里**不能**无条件常驻一个 run。
      //
      // R38-A 实测 `_r38a/lai4.jsonl` + `_r38a/diag-iu25.mjs`：tier 8 时
      // `maxAllowedDimension = 0`，8 层无限维度全部停产，EP 不再增长 ⇒
      //   ① `TimeStudy.reality`（膨胀研究 6，「解锁现实」）永远买不到
      //      （要 `thisReality.maxEP.exponent >= 4000`）；
      //   ② 而 IU25 的 `checkRequirement` 又要求 `TimeStudy.reality.isBought`
      //      —— 于是「常驻 run」把 IU25 自己锁死了（实测 180 s 里 iu25=false 恒定）。
      // 正确时序：让现实照常循环，等现实研究买上、IM 攒够，**再**起 run、卸符文、买 IU25。
      if (tier >= 8) {
        const im = Number(Currency.imaginaryMachines.value);
        const ds6 = TimeStudy.reality.isBought;
        // [Oreki R40] EC 链已全部 5/5（= DS6 已可买 / 即将买到）时提前压现实。
        // 理由见文件上方 IU25_HOLD_MAX_MS 的实测证据：等 DS6 到账再判断必然输掉竞态。
        const ecChainDone = (() => {
          try {
            return globalThis.OrekiEternityAutomation?.nextUnfinishedEcId?.() === 0;
          } catch (e) {
            return false;
          }
        })();
        if (!ds6 && !ecChainDone) {
          // 真正没有 DS6、EC 也还没打完：run 必须让开，否则 EP 涨不动、研究买不回来
          if (Laitela.isRunning) clearCelestialRuns();
          this._iu25HoldSince = 0;
          return;
        }
        // 有界准备期：每个「现实轮次」只开一次计时，不能每帧延长
        if (!this._iu25HoldSince) this._iu25HoldSince = now;
        const holdExpired = now - this._iu25HoldSince > IU25_HOLD_MAX_MS;
        if (!holdExpired) this._laiHold = true;
        if (!ds6 || im < OREKI_IU25_COST) {
          // 还在等 DS6 到账 / 等 IM 攒够：保持压制（未超时）让 DS6 不被现实冲掉
          if (holdExpired) {
            this._iu25HoldSince = 0;
            if (Laitela.isRunning) clearCelestialRuns();
            this._laiHold = false;
          }
          return;
        }
        // 「至少 4 个符文槽为空」：先卸符文。卸不干净时补一刀「删除全部未保护符文」
        // （与玩家点同名按钮走的是同一条 `deleteAllUnprotected()`），腾出仓库格再卸。
        if (Glyphs.activeWithoutCompanion.length > 1) {
          Glyphs.unequipAll(true);
          if (Glyphs.activeWithoutCompanion.length > 1) {
            try { Glyphs.deleteAllUnprotected(); } catch (e) { /* 无可用删除时忽略 */ }
            Glyphs.unequipAll(true);
          }
        }
        if (!Laitela.isRunning) Laitela.initializeRun();
        // 原版的解锁位是 `player.reality.imaginaryUpgReqs`（`imaginary-upgrades.js:63`），
        // 由 `tryUnlock()` 在条件成立时置位、**且跨现实保留**（`player.js:496` 只在
        // 新存档初始化）。这里显式补一次 tryUnlock：它自己会再核一遍
        // `checkRequirement()`，不成立就不置位，不存在绕过条件。
        const iu25 = ImaginaryUpgrade(25);
        if (!iu25.isAvailableForPurchase) iu25.tryUnlock();
        this._laiHold = true;
        // 同一次 tick 内立刻尝试真实购买：符文可能被现实自动化的 manageGlyphs
        // 在下一帧重新装上，拖到下一个 IM tick（2 s）条件就可能又变了。
        try {
          if (iu25.purchase() === true) {
            this._iuBought[25] = (this._iuBought[25] || 0) + 1;
            console.log(`[R38-IU25] 已买入（tier=8 im=${im.toExponential(2)} ` +
              `符文=${Glyphs.activeWithoutCompanion.length}）`);
          } else {
            // 诊断用：每 5 s 打一次「为什么没买成」
            if (now - (this._iu25LogAt || 0) > 5000) {
              this._iu25LogAt = now;
              console.log(`[R38-IU25] 未买成：要求=${iu25.isAvailableForPurchase} ` +
                `可能=${iu25.isPossible} 符文=${Glyphs.activeWithoutCompanion.length} ` +
                `研究=${TimeStudy.reality.isBought} run=${Laitela.isRunning} ` +
                `maxDim=${Laitela.maxAllowedDimension}`);
            }
            // run 在位会让 EP 彻底冻结；20 s 还买不上就撤掉，让现实循环推进再来一次
            if (this._laiRunAtMs0 && now - this._laiRunAtMs0 > 20000) {
              clearCelestialRuns();
              this._laiRunAtMs0 = 0;
              this._laiHold = false;
            } else if (!this._laiRunAtMs0) {
              this._laiRunAtMs0 = now;
            }
          }
        } catch (e) { /* 购买失败下个 tick 重试 */ }
        return;
      }

      // ── run 在位：30 s 硬窗口内压住现实，等 `game.js:1092~1112` 自己结算 ──
      //
      // 事实：现实重置会保留 run（`reality.js:766`），但把熵清零（`reality.js:701`）。
      // ⇒ 「熵 0→1」必须在**同一个现实的前 30 s 内**完成，压现实就是为了不让
      // 现实在半路把熵打回 0。
      if (Laitela.isRunning) {
        if (ent >= 0 && realMs < LAT_TIER_WINDOW_MS) {
          this._laiHold = true;
          return;
        }
        // 窗口用尽 or 熵已经卡住（amE 掉到 1e9 以下时速率只有 0.02/s，47 s 才能满）：
        // 主动退出 run，让 ID8 复产、amE 回到 1e10 以上再进，别占着 ID8 白等。
        if (ent >= -1 && this._laitelaRunAtMs && now - this._laitelaRunAtMs > LAT_RUN_ABORT_MS) {
          clearCelestialRuns();
          this._laitelaAborts = (this._laitelaAborts || 0) + 1;
          this._laitelaRunAtMs = 0;
          console.log(`[R38-LAI] 退出 run（tier=${tier} amE=1e${amE.toExponential(2)} ` +
            `ent=${ent.toFixed(3)} 现实=${(realMs / 1000).toFixed(1)}s，累计 ${this._laitelaAborts} 次）`);
        }
        return;
      }

      // ── run 不在位：先用**完整 8 层 ID** 把 amE 顶上去，再进 run ──────────
      //
      // 这是 R38-A 实测 `_r38a/full1.out` 的死结：tier≥1 时 run 在位会让 ID8 停产，
      // amE 被按在 3.49e8，熵速率 0.0024/s（400 多秒），tier 从 522 s 到 800 s 一直是 1。
      if (!(ent >= 0)) return; // 熵 = -1：本现实已完成，等现实重置清成 0
      if (amE < LAT_RUN_MIN_AM_EXP) {
        // 压住现实，让反物质在这个现实里继续涨（现实一重置 amE 就归零，白爬）
        if (realMs < LAT_TIER_WINDOW_MS) this._laiHold = true;
        return;
      }
      if (realMs >= LAT_RUN_ENTER_MAX_REAL_MS) return; // 时间不够，等下个现实
      const before = tier;
      Laitela.initializeRun();
      this._laitelaRunAtMs = now;
      this._laitelaRuns++;
      this._laitelaTiers = before;
    } catch (e) {
      this._lastError = `laitela: ${(e && e.message) || e}`;
    }
  },

  // ── ③ 佩勒：进入毁灭现实，然后持续买佩勒升级 ──────────────────────────
  drivePelle() {
    try {
      if (!Pelle.isUnlocked) return;
      if (!Pelle.isDoomed) {
        if (player.isGameEnd === true) return;
        // `Pelle.initializeRun()` 自带「卸符文 / 检查仓库空位 / 置 doomed / armageddon」，
        // 是 UI「毁灭」按钮的同一条路径（pelle.js:57）。
        Pelle.initializeRun();
        this._pelleEntered = Pelle.isDoomed;
        return;
      }
      this.driveDoomed();
    } catch (e) {
      this._lastError = `pelle: ${(e && e.message) || e}`;
    }
  },

  /**
   * [Oreki R37-A] 毁灭现实（佩勒）驱动。
   *
   * ── 为什么必须单独写一套 ────────────────────────────────────────────
   * 进入佩勒后，本仓库**所有** oreki 自动化都在 `if (Pelle.isDoomed) return` 处退出
   * （early / eternity / reality / celestial / dilation / break-infinity-gate 共 7 处），
   * 而原版的自动购买器在毁灭态里也大多没解锁
   * （`AntimatterDimensionAutobuyerState.isUnlocked` → `Pelle.isDisabled('antimatterDimAutobuyerN')`
   * 返回 true 直到买下对应 PelleUpgrade）。两条一起意味着：**进入佩勒后整局立刻停摆**。
   * 实测会在长跑里给出（`_r37a/r37a-long1.jsonl` 的 pamE 曲线）。
   *
   * ── 用的全是原版按钮/热键的同一条路径 ───────────────────────────────
   * · `maxAll()`（antimatter-dimension.js:272）= UI「全部最大」；
   * · `requestDimensionBoost(true)` / `requestGalaxyReset(true)` = UI 按钮的无弹窗版本
   *   （galaxy.js:151 / dimboost.js:239，都不碰 Modal，不会挡住 GameEnd 的
   *   `ui.$viewModel.modal.progressBar === undefined` 前置）；
   * · `PelleUpgrade.all[i].purchase()` = 佩勒升级按钮；
   * · `Pelle.armageddon(true)` = UI「大灾变」按钮（pelle.js:149-161）——
   *   [R40-A5] 它不再是「故意不调」，而是本阶段的**主推进器**，理由见文件头 R40-A5 那段。
   *   大坍缩 / 永恒仍然不主动调（`Autobuyer.bigCrunch` 只在「拉满间隔」那一段被放开）。
   *
   * ── 节流 ───────────────────────────────────────────────────────────
   * 全部动作合并到 100 ms 一帧（`DOOM_BUY_MS`）；
   * 末日另有 `DOOM_ARMAGEDDON_MIN_MS` / `DOOM_STALL_MS` 两道闸门，见 `_maybeArmageddon()`。
   */
  driveDoomed() {
    const now = Date.now();
    if (now - this._lastDoomBuyMs < DOOM_BUY_MS) return;
    this._lastDoomBuyMs = now;
    try {
      const keepAuto = PelleUpgrade.keepAutobuyers;
      // ⓪ 重置购买器策略（R40-A5 起按阶段切换，见 `_stopDoomedResets()`）
      //
      // 「已经买到 keepAutobuyers、但间隔还没拉满」这一段需要真实 IP 买那 15 级间隔，
      // 而毁灭态里 IP 的唯一来源就是大坍缩 —— 但**不能指望大坍缩自动器**：
      // 它在毁灭态要求先吃过「无限冲击」（`big-crunch-autobuyer.js:14-18`），
      // 也就是必须有一次真坍缩才会解锁（`big-crunch.js:58`）。
      // 实测（R40-A5 `r40a5-arm1` t≈1411 s）放开 `isActive` 后 557 s 内 `ip` 恒为 0、
      // `bcUnlocked=false`、`ivl=150000`，就是这么卡住的。
      // ⇒ 改成 `_pulseDoomedCrunch()` 自己按一次 UI 大坍缩按钮，自动器全程保持关闭
      //   （开着会按 AMOUNT 模式把反物质反复清零，而我们要的是「单调增长」）。
      this._stopDoomedResets();

      // ① 反物质维度 + 计数频率：原版「全部最大」
      maxAll();
      // ② 维度提升 / 星系（两者都只减反物质、不清零；Pelle.isDoomed 分支见 dimboost.js:207）
      if (DimBoost.canBeBought) requestDimensionBoost(true);
      if (Galaxy.canBeBought) requestGalaxyReset(true);
      // ③ 佩勒升级：先用遗迹碎片买可重复项（产出乘子），再买单次项。
      //    没碎片时 `canBeBought` 为 false，是纯 no-op，不会触发大灾变。
      //    `keepAutobuyers`（id 2，5e6 碎片）**优先**：它的货币是 realityShards，
      //    不优先买会被别的单次升级把碎片花掉。
      if (!keepAuto.isBought && keepAuto.canBeBought && keepAuto.purchase() === true) this._pelleUpgrades++;
      for (const up of PelleUpgrade.rebuyables) {
        if (up.canBeBought && up.purchase() === true) this._pelleUpgrades++;
      }
      for (const up of PelleUpgrade.singles) {
        if (up === keepAuto) continue;
        if (!up.isBought && up.canBeBought && up.purchase() === true) this._pelleUpgrades++;
      }
      // ④ 拉满间隔所需真实 IP（只在这一段按大坍缩，R40-A5b）
      this._pulseDoomedCrunch(keepAuto);
      // ⑤ 末日循环（R40-A5）：必须**最后**跑（先买、后末日），理由见 `_maybeArmageddon()`
      this._maybeArmageddon(now, keepAuto);
    } catch (e) {
      this._lastError = `doomed: ${(e && e.message) || e}`;
    }
  },

  /**
   * [Oreki R40-A5] 判定「现在该不该末日」。
   *
   * ── 为什么需要它 ──────────────────────────────────────────────────
   * 末日的唯一目的是拿 `cel.remnants`（进而拿 realityShards 买 `keepAutobuyers`），
   * 以及**在买齐条件后触发一次 `finishProcessReality`** 让 `reality.js:749-752`
   * 把 `player.break` 置回 true。它同时会清 DT / TP / 膨胀升级，所以不能每帧都来。
   *
   * ── 判据（分两个阶段，都能解释给玩家听）──────────────────────────
   * 阶段 A「还没买到 keepAutobuyers」：
   *   `Pelle.canArmageddon`（remnantsGain ≥ 1）**且** 反物质指数已停滞 `DOOM_STALL_MS`
   *   **且** 距上次末日 ≥ `DOOM_ARMAGEDDON_MIN_MS`。
   *   含义：本轮的产量已经顶到 1.8e308 天花板（没有 break 就再也上不去），
   *   继续等只会空转；此时末日把这一轮的 progress 换成遗迹碎片才是唯一推进。
   *
   * 阶段 B「已买到 keepAutobuyers、且间隔已拉满」：
   *   立刻末日（同样受最小间隔约束）。含义：原版的开 Break 判定只在 `finishProcessReality`
   *   里执行，所以「买齐 → 立刻末日」就是玩家会做的同一个动作序列。
   *
   * 已 `player.break === true` 时一律不再末日：这时候反物质能自由增长，
   * 任何重置都只是在推迟 `endState`。
   */
  _maybeArmageddon(now, keepAuto) {
    if (player.break) {
      this._doomPhase = "broken";
      return;
    }
    if (!Pelle.canArmageddon) {
      this._doomPhase = "wait-remnants";
      return;
    }
    if (now - this._lastDoomArmAt < DOOM_ARMAGEDDON_MIN_MS) {
      this._doomPhase = "cooldown";
      return;
    }
    if (keepAuto.isBought) {
      if (!Autobuyer.bigCrunch.hasMaxedInterval) {
        this._doomPhase = "max-interval";
        return;
      }
    } else {
      // 停滞判定：只看反物质指数（`player.antimatter.exponent`），它被 1.8e308 夹住时不再变化
      const amE = Number(player.antimatter.exponent) || 0;
      if (!this._doomAmPeakAt || amE > this._doomAmPeak + 0.25) {
        this._doomAmPeak = amE;
        this._doomAmPeakAt = now;
        this._doomPhase = "grow";
        return;
      }
      if (now - this._doomAmPeakAt < DOOM_STALL_MS) {
        this._doomPhase = "grow";
        return;
      }
    }
    this._doomPhase = "armageddon";
    const beforeBreak = player.break;
    Pelle.armageddon(true);
    this._lastDoomArmAt = now;
    this._doomArmageddons++;
    this._doomAmPeak = 0;
    this._doomAmPeakAt = 0;
    if (!beforeBreak && player.break) this._doomBreakAt = now;
  },

  /**
   * [Oreki R40-A5b] 毁灭态里「拉满大坍缩自动器间隔」所需的真实 IP。
   *
   * ── 为什么需要单独一手 ──────────────────────────────────────────────
   * `reality.js:749-752` 开 Break 的第三个前提是 `Autobuyer.bigCrunch.hasMaxedInterval`，
   * 而间隔在进毁灭那一帧被打回 150000（`autobuyer.js:185-189` + `reality.js:643` 清永恒次数），
   * 要拉满 15 级需要 32767 IP。毁灭态里 IP 的唯一来源是坍缩。
   *
   * ── 为什么不能靠自动器（实测更正）────────────────────────────────────
   * `big-crunch-autobuyer.js:14-18`：`if (Pelle.isDoomed) return PelleStrikes.infinity.hasStrike;`
   * 没吃过「无限冲击」的毁灭态里它**根本没解锁**，`isActive = true` 是纯空转。
   * `r40a5-arm1` 实测：放开 `isActive` 后 557 s 内 `ip` 恒 0、`bcUnlocked=false`、`ivl=150000`。
   * 而 `big-crunch.js:55-59` 的 `bigCrunchReset()` 在 `Pelle.isDoomed` 时会
   * `PelleStrikes.infinity.trigger()` —— 也就是说**按一次大坍缩按钮本身就是解锁自动器的那一步**。
   *
   * ── 所以这里做的是 ──────────────────────────────────────────────────
   * 按一次 `bigCrunchResetRequest(true)`（= `BigCrunchButton.js:18` 的同一路径，禁动画版），
   * 收益是 `gainedInfinityPoints()`（实测单次 6.2e9 IP，≫ 32767，一次就够买满 15 级），
   * 副作用只有幂等的 `PelleStrikes.infinity.unlock()`（`strikes.js:33-45`，只解锁不重置）。
   * 触发条件收得很紧，避免无谓重置：
   *   · 已经 `player.break`：不需要；
   *   · `keepAutobuyers` 没买：不需要 IP（这时候按坍缩只会拖慢残迹增长）；
   *   · 间隔已满：不需要；
   *   · IP 已经买得起下一级：交给 `OrekiBreakInfinityGate` 的 A 段去买，不必再坍缩；
   *   · `!Player.canCrunch`：反物质还没到 1.797e308，按了也是空操作。
   */
  _pulseDoomedCrunch(keepAuto) {
    try {
      if (player.break) return;
      if (!keepAuto.isBought) return;
      const bc = Autobuyer.bigCrunch;
      if (bc.hasMaxedInterval) return;
      if (Currency.infinityPoints.value.gte(bc.cost)) return;
      if (!Player.canCrunch) return;
      bigCrunchResetRequest(true);
      this._doomCrunchesOn++;
    } catch (e) {
      this._lastError = `doomed-crunch: ${(e && e.message) || e}`;
    }
  },

  /**
   * [Oreki R38-M / R40-A5] 佩勒阶段重置购买器的开关。
   *
   * 只置 `isActive`，走选项页开关的同一条路径，不碰任何公式；
   * `Pelle.initializeRun` 之后原版会强制 `Autobuyer.bigCrunch.mode = AMOUNT`
   * （pelle.js:87），所以我们每帧检查一次、被重开就再关。
   *
   * [R40-A5b] 参数 `allowCrunch` 已删除：它假设「放开 `isActive` 就能产 IP」，
   * 而毁灭态里自动器要 `PelleStrikes.infinity.hasStrike` 才解锁（`big-crunch-autobuyer.js:15`），
   * 实测放开 557 s 零收益。产 IP 改由 `_pulseDoomedCrunch()` 直接按按钮完成，
   * 自动器**全程关闭**：开着会按 AMOUNT 模式（pelle.js:87）在反物质刚到 1.797e308 时反复清零，
   * 正好破坏 R38-M 要的「单调增长」。
   * 永恒自动器**任何时候都关**：它会给 EP，但也会把 EC/时间研究清掉，
   * 与 `isRealityAvailable()` 无关，却会让后续阶段更难。
   */
  _stopDoomedResets() {
    try {
      if (Autobuyer.bigCrunch.isActive) {
        Autobuyer.bigCrunch.isActive = false;
        this._doomResetsOff++;
      }
      if (Autobuyer.eternity.isActive) {
        Autobuyer.eternity.isActive = false;
        this._doomResetsOff++;
      }
    } catch (e) {
      this._lastError = `doomed-stop: ${(e && e.message) || e}`;
    }
  },

  get debugState() {
    const pick = fn => { try { return fn(); } catch (e) { return null; } };
    return {
      step: this.step,
      imL: pick(() => Currency.imaginaryMachines.value.log10()),
      imCapL: pick(() => MachineHandler.currentIMCap),
      iuBought: this._iuBought,
      laitelaTier: pick(() => Laitela.difficultyTier),
      laitelaRunning: pick(() => Laitela.isRunning),
      laitelaRuns: this._laitelaRuns,
      pelleUnlocked: pick(() => Pelle.isUnlocked),
      doomed: pick(() => Pelle.isDoomed),
      pelleUpgrades: this._pelleUpgrades,
      gameEnd: player.isGameEnd === true,
      lastError: this._lastError,
      // [Oreki R40-A5] 末日循环观测
      doomPhase: this._doomPhase,
      doomArmageddons: this._doomArmageddons,
      doomBreakAt: this._doomBreakAt,
      doomCrunchesOn: this._doomCrunchesOn,
      doomKeepAutobuyers: pick(() => PelleUpgrade.keepAutobuyers.isBought),
      doomShardsL: pick(() => Currency.realityShards.value.log10()),
      doomRemnants: pick(() => player.celestials.pelle.remnants),
      doomRemnantsGain: pick(() => Pelle.remnantsGain),
      // [Oreki R40-A5b] 间隔 / IP / 冲击：诊断「卡在拉满 15 级」那一段的三个数
      doomBcInterval: pick(() => Autobuyer.bigCrunch.interval),
      doomBcCost: pick(() => Autobuyer.bigCrunch.cost),
      doomIpL: pick(() => Currency.infinityPoints.value.log10()),
      doomStrikeInfinity: pick(() => PelleStrikes.infinity.hasStrike),
    };
  }
};

// 与其它 oreki 模块一致：挂到 globalThis，避免反向 import 成环
globalThis.OrekiEndgameAutomation = OrekiEndgameAutomation;
