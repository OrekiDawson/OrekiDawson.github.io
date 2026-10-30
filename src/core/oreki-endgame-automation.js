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
const LAT_RUN_MIN_AM_EXP = 1e10;
/** run 进去后多久还没涨到 0.9 熵就放弃（真实毫秒），避免长期压住 ID8 */
const LAT_RUN_ABORT_MS = 8000;
/**
 * [Oreki R38-A] 本现实真实时间的「压现实上限」（毫秒）。
 *
 * `game.js:1104` 的 `difficultyTier++` 只在 `thisRealityRealTime.totalSeconds < 30` 时发生，
 * 所以压现实最多压到 28 s 就必须放手（留 2 s 给熵结算那一帧）。
 */
const LAT_TIER_WINDOW_MS = 28000;
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
 * 大灾变同样要停：`Pelle.armageddon` → `finishProcessReality({ reset: true, armageddon: true })`
 * （pelle.js:149-155），那是整局现实重置，比坍缩更彻底。
 * 只保留「全部最大 + 维度提升 + 星系 + 佩勒升级」——这四件都不清空当前反物质。
 */
const DOOM_BUY_MS = 100;

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
  _pelleUpgrades: 0,
  _pelleEntered: false,
  _lastDoomBuyMs: 0,
  /** [Oreki R38-M] 佩勒阶段已关掉的重置购买器次数（只读观测；正常应一直为 0 或很小） */
  _doomResetsOff: 0,
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
        if (!TimeStudy.reality.isBought) {
          // 现实研究没买上：run 必须让开，否则 EP 涨不动、研究永远买不回来
          if (Laitela.isRunning) clearCelestialRuns();
          return;
        }
        if (im < OREKI_IU25_COST) return;             // 钱不够就不白停产
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
   * · 大坍缩 / 永恒 / 大灾变**故意不调**——它们都会把 `records.totalAntimatter` 按住不动，
   *   推导与实测见文件头 `DOOM_BUY_MS` 上方那段注释（R38-M 修正）。
   *
   * ── 节流 ───────────────────────────────────────────────────────────
   * 全部动作合并到 100 ms 一帧（`DOOM_BUY_MS`），不再分别节流：
   * 现在佩勒阶段只剩「不清零反物质」的三件事，没有互相打架的重置节奏。
   */
  driveDoomed() {
    const now = Date.now();
    if (now - this._lastDoomBuyMs < DOOM_BUY_MS) return;
    this._lastDoomBuyMs = now;
    try {
      // ⓪ 先掐掉会清零当前反物质的三条路径（见 DOOM_BUY_MS 上方的实测推导）
      this._stopDoomedResets();
      // ① 反物质维度 + 计数频率：原版「全部最大」
      maxAll();
      // ② 维度提升 / 星系（两者都只减反物质、不清零；Pelle.isDoomed 分支见 dimboost.js:207）
      if (DimBoost.canBeBought) requestDimensionBoost(true);
      if (Galaxy.canBeBought) requestGalaxyReset(true);
      // ③ 佩勒升级：先用遗迹碎片买可重复项（产出乘子），再买单次项。
      //    没碎片时 `canBeBought` 为 false，是纯 no-op，不会触发大灾变。
      for (const up of PelleUpgrade.rebuyables) {
        if (up.canBeBought && up.purchase() === true) this._pelleUpgrades++;
      }
      for (const up of PelleUpgrade.singles) {
        if (!up.isBought && up.canBeBought && up.purchase() === true) this._pelleUpgrades++;
      }
    } catch (e) {
      this._lastError = `doomed: ${(e && e.message) || e}`;
    }
  },

  /**
   * [Oreki R38-M] 关掉佩勒阶段会自动触发的重置购买器。
   *
   * 只置 `isActive = false`，走的是选项页里那个开关的同一条路径，不碰任何公式；
   * `Pelle.initializeRun` 之后原版会强制 `Autobuyer.bigCrunch.mode = AMOUNT`
   * （pelle.js:87），所以我们**每帧检查一次**、被重开就再关，成本可忽略。
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
    };
  }
};

// 与其它 oreki 模块一致：挂到 globalThis，避免反向 import 成环
globalThis.OrekiEndgameAutomation = OrekiEndgameAutomation;
