// [Oreki R27] 天神 / 特蕾莎浇注 / V 解锁 自动化。
//
// ── 为什么需要（专家已复核的源码事实）────────────────────────────────────
// 1. 特蕾莎浇注 `Teresa.pourRM(diff)`（teresa.js:14）的 `diff` 是**真实秒**（内部
//    `timePoured += diff`，公式 `(poured+1e6)*0.01*timePoured²`）。全仓**唯一调用点**
//    是 `TeresaTab.js` 的「按住」按钮——纯 UI 驱动。不自动化则 `pouredAmount` 永远 0，
//    于是 `TeresaUnlocks.effarig`（鹿颈长解锁位）永远不亮 → 整条天神链（鹿颈长/无名氏/
//    V/Ra/莱特拉/Pelle）全断。
// 2. 天神 run 入口 `X.initializeRun()`（teresa.js:28、effarig.js:17、enslaved.js:148、
//    v.js:182）全仓唯一调用点是 `EnterCelestialsModal.js:81-86`（6 个天神）。不自动化
//    则天神现实永远进不去。
// 3. V 解锁 `V.unlockCelestial()`（v.js:177）唯一调用点 `VTab.js:109`，前置
//    `V.canUnlockCelestial`（v.js:174，6 项 mainUnlock 同一现实内同时达标）。
//
// ── 时间语义（关键）────────────────────────────────────────────────────
// 浇注必须用**真实墙钟时间差**，绝不能用 gameLoop 的 `diff`（那是游戏内毫秒，会被
// 10000× 放大成「瞬间注满」，等于作弊式跳过）。本模块自己用 `Date.now()` 算真实帧间隔，
// 并把浇注系数提速 10×（保留「按住」手感，不归零 `timePoured`）。
//
// ── 不浇水的护栏 ───────────────────────────────────────────────────────
// 现实升级（RU1~5 可重复 + RU6~25 一次性）必须先买齐，否则 RM 全浇进特蕾莎会导致
// 成就 147「购买所有现实升级」永远拿不到 → 特蕾莎解锁位永远不亮（死循环）。所以：
// 只要还有「当前可购买」的 RU（不管本帧买不买得起），就**不浇**，把 RM 留给 RU。

import { Teresa, TeresaUnlocks } from "./celestials/teresa.js";
import { Effarig, EffarigUnlock, EFFARIG_STAGES } from "./celestials/effarig.js";
import { Enslaved, ENSLAVED_UNLOCKS } from "./celestials/enslaved.js";
import { V, VUnlocks } from "./celestials/V.js";
import { RealityUpgrades, RealityUpgrade } from "./reality-upgrades.js";
import { OrekiRealityAutomation } from "./oreki-reality-automation.js";
import { OrekiEternityAutomation } from "./oreki-eternity-automation.js";
import { OrekiDilationAutomation } from "./oreki-dilation-automation.js";
import { PlayerProgress } from "./player-progress.js";
import { startDilatedEternity, getTP, buyDilationUpgrade } from "./dilation.js";
import { OREKI_V_UNLOCK_DILATED_TIME } from "./secret-formula/celestials/v.js";

/** 浇注系数：把 0.01 这一项乘 10，原本 ≈23.2s 真实按住降到 ≈2.3s 真实。保留手感不归零。 */
const OREKI_TERESA_POUR_RATE = 10;
/** 真实帧间隔上限（毫秒）：防止后台/卡顿后一次性把 RM 全浇掉。 */
const OREKI_MAX_REAL_FRAME_MS = 100;
/**
 * [Oreki R35] `maxDT` 已达标后继续压住现实的宽限（真实毫秒）。
 *
 * 为什么必须有：`game.js:884` 的现实自动化**先于** `:888` 的天神 tick 执行，
 * 而 V 的解锁检查（`V.canUnlockCelestial` → `V.unlockCelestial()`）在后者里。
 * 若 maxDT 一达标就放开现实，同一帧的现实会先把 `thisReality.maxDT` 清零
 * （reality.js:696），V 检查随后看到的始终是 0 → 永远解锁不了。
 * 5 s 足以覆盖「同一帧稍后」与少量掉帧，且不解锁时必然由护栏③放手。
 */
const OREKI_V_HOLD_GRACE_MS = 5000;

/**
 * [Oreki R30] 鹿颈长解锁位的**购买顺序**（按 cost 升序，见
 * `secret-formula/celestials/effarig.js`）：
 *   adjuster 1e7 → glyphFilter 2e8 → setSaves 3e9 → run 5e11
 * 后三个（infinity / eternity / reality）没有 cost，是**阶段解锁位**，
 * 只能由真实的 Big Crunch / Eternity / Reality 触发（big-crunch.js:150、eternity.js:58），
 * 本模块绝不购买、也绝不直接 `unlock()`。
 */
const OREKI_EFFARIG_BUY_ORDER = ["adjuster", "glyphFilter", "setSaves", "run"];

export const OrekiCelestialAutomation = {
  _lastRealMs: 0,
  /** 已尝试进入过的天神（避免反复进入把生产卡在天神削弱态） */
  _entered: {},
  /** [Oreki R30] 进入时的鹿颈长阶段快照（name -> EFFARIG_STAGES 值），用于阶段推进后重新进入 */
  _enteredStage: {},
  _vUnlocked: false,
  _unlocksBought: 0,
  /** [Oreki R33] 上一次尝试启动膨胀的时刻（毫秒），用于 3 秒冷却，避免每帧刷永恒 */
  _lastDilationTryMs: 0,
  /** [Oreki R33] 本进程内累计成功启动膨胀的次数（只读观测用） */
  _dilationStarts: 0,
  /** [Oreki R33] 累计「膨胀中强化一次永恒喂速子粒子」的次数（只读观测用） */
  _dilationTpSeeds: 0,
  /** [Oreki R33] 最近一次成功进入膨胀的时刻，供 holdRealityForV 的护栏①使用 */
  _lastDilationStartOkMs: 0,
  /** [Oreki R37-A] 上次批量买 dtGain 的时刻（250 ms 节流）与累计购买级数（只读观测） */
  _lastDtUpgMs: 0,
  _dtUpgBought: 0,
  /** [Oreki R33] V 收尾压现实的起始时刻与起始 maxDT 指数，供护栏②超时兜底使用 */
  _vHoldSinceMs: 0,
  _vHoldStartDtL: 0,
  /** [Oreki R35] maxDT 已达标、等 V 解锁的宽限起点（0 = 未进入宽限） */
  _vGraceSinceMs: 0,
  /** [Oreki R34] 只读门禁计数（见 tickDilation 开头），用于定位播种被哪一道门挡住 */
  _gates: { vUnlocked: 0, notUnlocked: 0, ecRunning: 0, ecEntryPending: 0, ecBypass: 0, passed: 0 },

  /**
   * 是否存在「当前可购买且尚未购买」的现实升级（一次性或可重复）。
   *
   * ⚠️ 一次性 RU 必须同时判 `!upg.isBought`，否则死锁：
   * 一次性现实升级的解锁资格位是 `player.reality.upgReqs`（reality-upgrades.js:76
   * `isAvailableForPurchase` 读的就是它），而**购买完成后这个位不会被清除**
   * （全仓只有 `:86` 的一处置位 `player.reality.upgReqs |= (1 << this.id)`，
   * 没有任何清除代码）。真正记录「已购买」的是另一个位掩码
   * `player.reality.upgradeBits`（`BitPurchasableMechanicState.isBought`，
   * game-mechanics/bit-purchasable.js:22）。
   * 所以若只看 `isAvailableForPurchase`，一旦任意一次性 RU 解锁，这个判断就**永远为真**
   * → 永远不浇特蕾莎 → 成就 147「购买所有现实升级」永远拿不到
   * → 特蕾莎解锁位永远不亮 → 整条天神链死锁。
   */
  _hasBuyableRU() {
    try {
      // [Oreki R28] **只判一次性现实升级（id ≥ 6）**。
      //
      // ── R28 实测根因（300 秒真实新档）────────────────────────────────
      // 原实现遍历 `RealityUpgrades.all`（**包含可重复的 1~5**），判
      // `upg.isAvailableForPurchase && !upg.isBought`：
      //   · 可重复 RU 继承 `RebuyableMechanicState`，其 `isAvailableForPurchase`
      //     **恒为 true**（game-mechanics/rebuyable.js:30）；
      //   · `isBought` 只定义在 `BitPurchasableMechanicState`
      //     （game-mechanics/bit-purchasable.js:22），可重复 RU **根本没有这个属性**
      //     → `!upg.isBought` 恒等于 `!undefined === true`。
      // 于是这个守卫**永远返回 true** → 特蕾莎永远不浇注 →
      // `Teresa.pouredAmount` 恒为 0 → `TeresaUnlocks.effarig`（鹿颈长解锁位，
      // 门槛 1e24，teresa.js:15-20）永不亮 → 整条天神链在鹿颈长处断掉。
      // 实测末态确认：`allRuBought=true`、`a147=true`、`teresaRun=true`，
      // 但 `pouredL=null`（= log10(0) = -∞）、`effarigUnlocked=false`。
      //
      // ── 为什么只判一次性 ────────────────────────────────────────────
      // 一次性 RU 有真正的「购买记录」位（`player.reality.upgradeBits`），
      // 是成就 147「购买所有现实升级」的真实依据；可重复的 1~5 是刷取循环，
      // 买多少都不影响成就 147，也**不应该**阻止浇注（原版里特蕾莎与放大器
      // 是并行推进的，玩家通常一边买放大器一边按住浇注）。
      // 所以：**一次性 RU 全部买齐 → 才允许浇注**。
      for (const upg of RealityUpgrades.all) {
        if (upg.id < 6) continue;
        // 解锁资格位 + 未购买位，两个都要判
        if (upg.isAvailableForPurchase && !upg.isBought) return true;
      }
    } catch (e) {
      // 异常时保守地认为「还有可买的」，避免误浇
      return true;
    }
    return false;
  },

  /**
   * [Oreki R30] 购买鹿颈长解锁位（按 cost 升序，买不起就跳过）。
   *
   * ── 为什么必须有这一步 ────────────────────────────────────────────────
   * `EffarigUnlock.run`（「鹿颈长的现实」，cost 5e11 遗迹碎片）是**进入鹿颈长 run 的
   * 真正入场券**：原版 UI 里不买它，`Entcelestials` 的入口按钮就是禁用的。
   * R29 的 `_canEnter("effarig")` 只判 `TeresaUnlocks.effarig.isUnlocked`（特蕾莎浇到 1e24），
   * 于是自动化**没买票就进了 run** —— 等于跳过了真实前置。
   *
   * ── 走真实路径 ──────────────────────────────────────────────────────
   * `EffarigUnlockState.purchase()`（celestials/effarig.js:130）内部是
   * `Currency.relicShards.purchase(this.cost)`（currency.js:159，真实扣款）→ `unlock()`
   * （置 `player.celestials.effarig.unlockBits` 对应位）→ `config.onPurchased()`（原版回调）。
   * 碎片不够时 `purchase()` 自己返回，**不伪造**。
   *
   * @returns {number} 本次真实买到的条数
   */
  buyEffarigUnlocks() {
    let bought = 0;
    for (const key of OREKI_EFFARIG_BUY_ORDER) {
      try {
        const unlock = EffarigUnlock[key];
        if (!unlock || unlock.isUnlocked) continue;
        // 买不起就跳过（`purchase()` 内部也会再判一次，这里只是省掉无意义的调用）
        if (!Currency.relicShards.gte(unlock.cost)) continue;
        unlock.purchase();
        if (unlock.isUnlocked) bought++;
      } catch (e) {
        // ── onPurchased 的 UI 副作用可能在没有对应界面时抛错 ──
        // 注意：`purchase()` 里 `unlock()` 在 `onPurchased()` **之前**执行
        // （celestials/effarig.js:132-133），所以这里吞掉异常不会丢解锁位，
        // 只需把位状态再确认一遍。
        try {
          if (EffarigUnlock[key].isUnlocked) bought++;
        } catch (e2) { /* ignore */ }
      }
    }
    this._unlocksBought += bought;
    return bought;
  },

  /** 某天神是否「可进入」（解锁位已亮、且尚未进入过、且当前不在其 run 中） */
  _canEnter(name) {
    try {
      if (Pelle.isDoomed) return false;
      if (player.celestials[name].run) return false;
      switch (name) {
        case "teresa": return !this._entered[name] && Teresa.isUnlocked;
        // Effarig 没有自己的 isUnlocked getter；它的解锁位就是 TeresaUnlocks.effarig
        // （= 特蕾莎浇注到 1e24，teresa.js:15-20）。
        //
        // [Oreki R30] **还必须持有入场券 `EffarigUnlock.run`**（cost 5e11 碎片）。
        // 少了这一条，R29 的自动化在 170 s 就直接进了 run，绕过真实前置。
        //
        // 另外鹿颈长是**三阶段**的（INFINITY → ETERNITY → REALITY）：
        // 每个阶段都由一次真实的重置推进，而推进函数内部会
        // `beginProcessReality(getRealityProps(true))`（big-crunch.js:152 / eternity.js:60）
        // → `finishProcessReality` → `clearCelestialRuns()`（reality.js:608）把 run 清掉。
        // 所以「进入过就不再进」的旧规则会让 INFINITY 之后再也无法进入 ETERNITY 阶段。
        // 这里改成**按阶段各进一次**：阶段没变就不重复进，阶段推进了就允许再进。
        case "effarig": {
          if (!TeresaUnlocks.effarig.isUnlocked) return false;
          if (!EffarigUnlock.run.isUnlocked) return false;
          const stage = Effarig.currentStage;
          if (stage >= EFFARIG_STAGES.COMPLETED) return false;
          return this._enteredStage.effarig !== stage;
        }
        case "enslaved": {
          // [Oreki R33] **必须持有无名氏的入场券 `ENSLAVED_UNLOCKS.RUN`**。
          //
          // ── R33 实测根因（300 秒真实新档，_r32-stage3.jsonl）───────────────
          // R32 的判据只有 `Enslaved.isUnlocked`，而它等价于
          // `EffarigUnlock.eternity.isUnlocked`（celestials/enslaved.js:171）——那是
          // **天神页签的解锁位**，不是「能进祂的现实」的入场券。于是自动化在
          // t≈187 s 直接 `Enslaved.initializeRun()`，而同帧起整局崩掉：
          //   · t=186 反物质 log10=6.03e9、AD8 totalAmount=2.00e6；
          //   · t=187 起 AD8 totalAmount **恒为 1**，时间定理恒 15880、时间研究恒 23 项，
          //     `canReality` 从 t=195 一直到 t=299 **110 秒内再也没真过**，
          //     `realities` 冻在 30 不动。
          // 无名氏现实会把产量压到极低（时间被拉长、维度被砍），必须靠「一次完整的
          // 现实」才能 `Enslaved.completeRun()`（reality.js:360）并清 run；而现实又要求
          // `TimeStudy.reality.isBought`（reality.js:120），后者要求 EC11/EC12 各 5 次
          // ——在被压低的产量下 EC 重打不完 → 永远 reality 不了 → 永远清不掉 run。
          // 这是一个**自锁**，进去就出不来。
          //
          // ── 为什么是「跳过真实前置」而不是「资源不足」─────────────────────
          // 原版 UI 的入口按钮是 `v-if="hasUnlock(unlocksInfo.RUN)"`
          // （components/tabs/celestial-enslaved/EnslavedTab.js:214），门票本身要求
          // 1e40 年游戏时间 + 一个 5000 级符文 + 一个 100% 稀有度符文
          // （celestials/enslaved.js:11-22、:20-22）。本档符文 13 级，门票根本不可能有。
          // 这与 R30 修掉的鹿颈长「没买票就进 run」是同一类越权，不是缺资源。
          //
          // 结论：没有门票就不进。宁可放弃无名氏的 EC1×1000 奖励，
          // 也不能让整条现实循环永久停摆（现状是 110 s 零现实）。
          if (!Enslaved.has(ENSLAVED_UNLOCKS.RUN)) return false;
          return !this._entered[name] && Enslaved.isUnlocked;
        }
        // V 同样没有 isUnlocked getter；真实解锁位是 VUnlocks.vAchievementUnlock
        // （v.js:100-101 的 bits 读写 + v.js:174 canUnlockCelestial）。
        //
        // [Oreki R37-A] **不再自动进入 V 的 run**。
        // 事实：进入 V 现实后全局产量被 V 的规则压住（`dilation.js:138` `dtRate.pow(0.5)`、
        // galaxy/维度等一系列削弱），而 V run 唯一产出是 `V.spaceTheorems`（成就层级），
        // 它只用于 `Ra.isUnlocked`（ra.js:366 `V.spaceTheorems >= 36`）。
        // 而 R37-A 的终局链是 IU15 → 莱特拉 → IU25 → 佩勒，**全部不依赖 Ra**
        // （IU25 的 requirement 只查莱特拉 + 符文 + 现实研究，imaginary-upgrades.js:296-305）。
        // 若自动化在 V 解锁后立刻进 V 现实并长住，整条终局会被产量削弱拖死。
        case "v": return false;
        default: return false;
      }
    } catch (e) {
      return false;
    }
  },

  _enterRun(name) {
    try {
      const stageBefore = Effarig.currentStage;
      switch (name) {
        case "teresa": Teresa.initializeRun(); break;
        case "effarig": Effarig.initializeRun(); break;
        case "enslaved": Enslaved.initializeRun(); break;
        case "v": V.initializeRun(); break;
        default: return false;
      }
      this._entered[name] = true;
      // 记录进入时的鹿颈长阶段：阶段推进后（run 被 clearCelestialRuns 清掉）才允许再进
      if (name === "effarig") this._enteredStage.effarig = stageBefore;
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * [Oreki R37-A] 用真实 `buyDilationUpgrade(1, n)` 批量买 `dtGain`（膨胀升级 1）。
   *
   * 节流 250 ms 一次、每次最多 25 级：这两项只影响「买得多快」，不影响能买多少 ——
   * 真正的上限永远是 `Currency.dilatedTime` 的余额（内部 `affordGeometricSeries` 会算好）。
   * 异常全部吞掉：它是每帧调用的旁观逻辑，不能击穿 `tickDilation` 的状态机。
   */
  _buyDtGainUpgrades() {
    try {
      if (!PlayerProgress.dilationUnlocked()) return 0;
      const now = Date.now();
      if (now - this._lastDtUpgMs < 250) return 0;
      this._lastDtUpgMs = now;
      let bought = 0;
      // 连续两轮都买满仍买得起才继续（`affordGeometricSeries` 会在余额不足时返回 0）
      for (let i = 0; i < 4; i++) {
        const before = player.dilation.rebuyables[1];
        if (buyDilationUpgrade(1, 25) !== true) break;
        const after = player.dilation.rebuyables[1];
        if (after <= before) break;
        bought += after - before;
      }
      this._dtUpgBought += bought;
      return bought;
    } catch (e) {
      return 0;
    }
  },

  /**
   * [Oreki R34] V 收尾阶段：**压住现实，让膨胀真的把 `maxDT` 抬起来**。
   *
   * ── 为什么必须分「压现实」和「启动膨胀」两件事 ────────────────────────
   * · `maxDT` 每个现实清零（`reality.js:696`），所以 V 的 `dilatedTime` 判据只能在
   *   **同一个现实内**攒出来；而自动现实每 ~28 s 按一次，实测「`dilationUnlocked` 为真的窗口
   *   只有 17 帧」（`_r33-vchain.jsonl`，t=168~185）—— 一现实只给 17 秒，来不及。
   * · 只调 `startDilatedEternity(true)` 还不够（R33 实测 `_r33-vchain2/3.jsonl`）：
   *   `dilStarts=1` 成功进了膨胀，但 `tpL=null`（速子粒子恒 0）、`dtRaw` 恒 0。
   *   因为 DT 速率 = 速子粒子 × 乘子（`dilation.js:117-134`），而速子粒子只在
   *   「**膨胀状态下做一次永恒**」时才发放（`eternity.js:99 if (player.dilation.active) rewardTP()`）。
   *   进了膨胀却不再永恒 → TP 永远 0 → DT 永远 0，死锁。
   *
   * ── 三段状态机（全部走真实函数，不伪造任何数值）──────────────────────
   *   ① `holdRealityForV` 为真时才动手（压住现实，见下方 getter）
   *   ② TP = 0 且未 active → `startDilatedEternity(true)`（真实永恒 + 置 active）
   *   ③ TP = 0 且已 active → `eternity(false, true)`（**真实的膨胀中永恒**，
   *      `eternity.js:99` 会 `rewardTP()` 把 TP 喂起来，同时按规矩退出膨胀）
   *   ④ TP > 0 且未 active → 再次 `startDilatedEternity(true)`，此时 DT 开始复利增长
   *   ⑤ `maxDT >= OREKI_V_UNLOCK_DILATED_TIME` → 六项同时成立，V 自己解锁
   *
   * @returns {boolean} 本次是否真的进入了膨胀
   */
  tickDilation() {
    try {
      // [Oreki R34] 只读门禁计数：用于定位「DS1 已解锁、TP=0」却仍然不播种的原因。
      // 只自增、不参与任何判定（除 `ecBypass` 的日志意义外）。
      const gates = this._gates;
      if (VUnlocks.vAchievementUnlock.isUnlocked) { gates.vUnlocked++; return false; }
      const active = player.dilation.active === true;
      if (!active && !PlayerProgress.dilationUnlocked()) { gates.notUnlocked++; return false; }

      // ── [Oreki R37-A] 持续买膨胀升级 1（`dtGain`）────────────────────────────
      //
      // 事实（`dilation.js:118-138`）：`dtRate ∝ TP × DilationUpgrade.dtGain.effect`，
      // 而 `dtGain` 是可重复购买项（`secret-formula/eternity/dilation-upgrades.js:27-33`）：
      //   第 n 次花费 1e4·10^n DT，效果 ×2^n（`effect: bought => 2^bought`）。
      // 也就是 `dtRate ∝ DT^0.301` —— **DT 自己喂自己**，是它唯一能突破线性增长的通路。
      // 原版玩家在膨胀页签里手动点这个按钮；全仓没有任何自动化买它（R37-A 静态核对：
      // `buyDilationUpgrade` 的非 UI 调用点只有 `applyAutounlockPerks` 里的 `ttGenerator`）。
      // 所以不加这一段，`maxDT` 只能以 `rate × F` 的**常数速率**线性涨（实测
      // `_r37a-smoke.jsonl` t=80→120 s：1e9.57 → 1e11.29，即 ≈4.6e9/s），
      // 到 1e30 需要 1e20 秒，物理上不可能。
      //
      // 走原版 `buyDilationUpgrade(1, bulk)`：内部 `affordGeometricSeries` 算批量、
      // `Currency.dilatedTime.subtract(cost)` 真扣款、`player.dilation.rebuyables[1]` 真累加。
      // 只买 id=1；**绝不买 id=2**（`galaxyThreshold` 会把 `dilatedTime` 清零，dilation.js:82）。
      this._buyDtGainUpgrades();
      // [Oreki R34] hold 成立期间放行 EC 门与 EC 入口等待：那时我们在收尾（压现实攒 DT），
      // 不该被 EC 的等待态挡住。hold 不成立时保持原样（避免在正常刷现实时插入永恒）。
      //
      // [Oreki R35-A2] 这里必须**直接复用** `holdReality`（= `holdRealityForV` ∪ 深度挑战阶段），
      // 不能再自行拼一套条件。R34 的同款条件多了一条 `TP > 0`，而 `holdRealityForV` 里也有
      // 同一条 —— 结果是 **TP 与 held 互为前提的死锁**：
      //   · 播种（阶段 1）要求先穿过 EC 门；
      //   · 穿 EC 门要求 holdCond；
      //   · holdCond 要求 TP > 0；
      //   · TP 只能由阶段 1 播种产生。
      // R34-B 1300 s 长测（`_r34b-gate1300.jsonl`）的 `gates.passed` 全程为 **0**、`tpL`
      // 全程为 null，就是这条死锁的实测证据：DS1 在位的那一两帧里 EC 恒在跑，函数永远
      // 在 `gates.ecRunning` 处返回，一次都没走到播种。
      const holdCond = this.holdReality === true;
      if (EternityChallenge.isRunning) {
        if (!holdCond) { gates.ecRunning++; return false; }
        gates.ecBypass++;
      }
      // EC 入口资源正在攒的时候绝不插永恒（eternity 会清掉 requirementCurrent 峰值缓存）
      if (OrekiEternityAutomation.ecEntryPending()) {
        if (!holdCond) { gates.ecEntryPending++; return false; }
        gates.ecBypass++;
      }
      gates.passed++;

      const now = Date.now();
      if (now - this._lastDilationTryMs < 3000) return false;
      this._lastDilationTryMs = now;

      const tpZero = Currency.tachyonParticles.value.eq(0);

      // ── 阶段 0：`realities` 门只管「压现实」，不管「播种」──────────────────
      //
      // [Oreki R34] 原来这里整段 `if (realities < 200) return false;` 是错的：
      // DS1（`dilationUnlocked`）只在「买完 DS6 → 现实落」之间的一两帧为真，
      // 实测 263 次 ×5s 采样里只命中 4 次（t=150~165）。任何额外条件都会错过这个窗口。
      // 于是 realities<200 时把播种一起挡掉，等于**永远等不到窗口**（t=998 才到 200，
      // 那时 DS1 早就不在位）。现在的分工：
      //   · 播种（阶段 1）：只判 `dilationUnlocked && !active && TP==0`，不限 realities；
      //   · 压现实（hold）：才判 `realities >= 200`（见 holdRealityForV）。
      // 六项判据一字未改。

      // ── 阶段 1「播种」：把速子粒子从 0 抬起来 ────────────────────────────
      // 不需要压现实，成本被限制在「进膨胀 → 立刻做一次真实永恒」这 3 秒内，
      // 因为 `startDilatedEternity` 本身就会做一次永恒。
      if (tpZero) {
        if (active) {
          // 膨胀中且 TP 还是 0：这一次永恒的**唯一目的**就是触发
          // `eternity.js:99 if (player.dilation.active) rewardTP()`，把 TP 播种下来。
          //
          // ⚠️ 必须等 `Player.canEternity` 为真才按（R33 实测踩过）：
          // `rewardTP()` → `getTP(maxAM, true)` → `getBaseTP` 第一行就是
          // `if (!Player.canEternity && requireEternity) return DC.D0;`（dilation.js:166）。
          // 刚进膨胀时 IP 被那次入场永恒清零，此时强按永恒只会拿到 TP = 0（实测
          // `tpSeeds=1` 但 `tpL=null`，`_r33-vseed.jsonl` t≈251 s）。
          //
          // [Oreki R34] 光判 `canEternity` **还不够**，必须再判「这一次永恒真的能拿到 TP」：
          //   `rewardTP()` 用的是 `bumpTo(getTP(thisEternity.maxAM, true))`，
          //   而 `getBaseTP = (log10(maxAM)/400)^1.5` —— `maxAM` 还没爬起来时（刚进膨胀、
          //   记录只有 1 或 1e10 量级）算出来可能 ≤ 当前 TP，`bumpTo` 于是**一点不涨**，
          //   但旧代码照样 `_dilationTpSeeds++`，观测上就是「播种了却 tpL=null」，把真正的
          //   失败掩盖成成功。这里改成「预计可得 TP 必须严格大于现有 TP」才按，且只有
          //   真的按成功（`eternity` 没返回 false）才记数。
          const willGainTp = Player.canEternity &&
            getTP(player.records.thisEternity.maxAM, true).gt(Currency.tachyonParticles.value);
          if (willGainTp && eternity(false, true) !== false) {
            this._dilationTpSeeds++;
          }
        } else if (startDilatedEternity(true) === true) {
          this._dilationStarts++;
          this._lastDilationStartOkMs = now;
          return true;
        }
        return false;
      }

      // ── 阶段 2「放大」：TP > 0 之后才允许长时间待在膨胀里滚 DT ────────────
      // 这一段会把产量压到接近 0（antimatter-dimension.js:70-74 的 dilatedValueOf），
      // 所以**只在 V 收尾阶段**（压现实 + TP 已就绪）开启，绝不污染刷现实的主循环。
      if (!this.holdReality) {
        // [Oreki R34] **主动退出膨胀**，不要靠下一次现实来清 active。
        // 事实：`maxDT` 一旦达标 `holdRealityForV` 就变假（375 行），于是阶段 2 什么都不做，
        // 但 `player.dilation.active` 还是 true —— 产量继续被 `dilatedValueOf` 压着，
        // 只能等下一次现实（reality.js:674）才解除。若此时 `shouldReality()` 恰好为假
        // （例如 `GlyphSelection.active`，oreki-reality-automation.js:53），整局就会一直
        // 停在膨胀态里空转。这里用**原版「退出膨胀」按钮的同一条路径**
        // （dilation.js:23 `animateAndUndilate` → `eternity(false,false,{switchingDilation:true})`）
        // 收尾，不伪造任何状态。
        if (active && player.records.thisReality.maxDT.gte(OREKI_V_UNLOCK_DILATED_TIME)) {
          eternity(false, false, { switchingDilation: true });
        }
        return false;
      }
      if (player.records.thisReality.maxDT.gte(OREKI_V_UNLOCK_DILATED_TIME)) return false;
      if (!active && startDilatedEternity(true) === true) {
        this._dilationStarts++;
        this._lastDilationStartOkMs = now;
        return true;
      }
    } catch (e) {
      // 单点异常不击穿主循环
    }
    return false;
  },

  /**
   * [Oreki R35] V 收尾阶段的**纯状态前提**（不含 TP、不含时间戳）。
   *
   * `holdRealityForV` 与 `tickDilation` 的门禁必须共用同一份判断 —— R34 各写一套，
   * 两套条件里的 `TP > 0` 互相锁死（详见 `tickDilation` 里 `holdCond` 的注释）。
   *
   * 三个条件都是**原版字段**，没有任何伪造：
   *   · `realities >= 200`：V 的第一项 mainUnlock 门槛；
   *   · V 尚未解锁：解锁后不再压现实；
   *   · `dilationUnlocked`（= `player.dilation.studies.includes(1)`，DS1）或正在膨胀：
   *     DS1 在位 = 同一现实内可以播种 TP / 攒 DT。它也是 `startDilatedEternity()` 的
   *     唯一前置（dilation.js:44），缺了它连膨胀都进不去。
   */
  _vFinishEligible() {
    try {
      if (VUnlocks.vAchievementUnlock.isUnlocked) return false;
      // [Oreki R35-A2] `Currency.realities` 是 `NumberCurrency`（currency.js:391-393），
      // `Currency.realities.value` 是**普通数字**，没有 `.lt()` / `.gte()`。
      // 原写法 `Currency.realities.value.lt(...)` 每帧抛 TypeError 被本函数的 catch 吞掉，
      // 于是 `_vFinishEligible()` **恒为 false**、`holdRealityForV` 恒为 false ——
      // 这正是 `_r35a-vgate.jsonl` 里 `gEligible` / `gHold` 全程 0 的直接原因
      // （不是「V 的条件没满足」，而是这段判定从第一帧就抛异常）。改成数字比较。
      if (Currency.realities.value < OREKI_V_UNLOCK_REALITIES) return false;
      // ── [Oreki R37-A] 关键修正：这里**不再要求 DS1 / 膨胀在跑** ──────────────
      //
      // 原来返回 `dilationUnlocked() || dilation.active`，形成一个实测确认的互锁：
      //   · `_vFinishEligible()` 是 `holdRealityForV` 的唯一前提 → hold 为假；
      //   · 而「买 DS1」只在 `OrekiDilationAutomation.tick()` 里，它的第一行是
      //     `if (this.hold !== true) return` → 也永远不会执行（深度挑战那条 hold
      //     又要求 EC11 已满，而现实每 ~12 s 就把 EC 记录清空）。
      // 实测证据 `_r37a/r37a-long4.jsonl`：t=714.8 s realities 已达 60（V 的第一项达标），
      // 但 `holdV=false`、`ec12=0`、`dil=0`，之后 20 s 内 realities 继续前进，V 永久卡住。
      // 现在：realities 一达标就允许压现实，让 EC12 → DS1 → 播种 TP → DT 这条链拿到时间。
      // 防死锁全靠既有护栏（膨胀 60 s 起不来 / 播不下 TP / 300 s 内 maxDT 涨幅 < 6 就放手）。
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * [Oreki R33/R35] 是否处于「V 收尾」阶段 —— 由 `oreki-reality-automation.js` 读取，
   * 为真时**暂停自动现实**，把同一现实的 `maxDT` 攒到 V 的门槛。
   *
   * ── R35 相对 R34 的两处修正 ────────────────────────────────────────────
   * ① **删掉 `TP > 0` 前提**。它原本的理由是「TP = 0 时进膨胀只压产量、不产 DT」
   *    （dilation.js:126-143，DT 速率正比于 TP）。但这条前提本身就是死锁：
   *    TP 只能由 `tickDilation()` 阶段 1 播种出来，而阶段 1 想穿过 EC 门又要求
   *    hold 成立 —— TP 与 hold 互为前提。实测证据：`_r34b-gate1300.jsonl`
   *    全程 `gates.passed = 0`、`tpL = null`、`maxDTL = null`，而到了 t=1309
   *    其余五项 mainUnlock 全部达标（realities 1.175 / eternities 11.44 /
   *    infinities 17.96 / replicanti 3.4e12 / RM 1.65e12），**只差 dilatedTime**。
   *    也就是说「TP=0」不是「不该 hold」的理由，而恰恰是「必须 hold 住 DS1 窗口
   *    去播种」的理由。hold 的代价被下面两条护栏限死，不会永久压住现实。
   * ② **maxDT 达标后不再立刻放手**。`game.js:884` 的现实自动化**先于** `:888` 的
   *    天神 tick 执行，而 V 的解锁检查在后者里。若 maxDT 一达标 hold 就变假，
   *    同一帧的现实会先把 `thisReality.maxDT` 清零（reality.js:696），
   *    随后 V 检查看到的永远是 0 → **V 永远不可能解锁**。所以达标后再压一小段
   *    （`OREKI_V_HOLD_GRACE_MS`），让稍后的 V 检查真正看到六项同时成立。
   *
   * ── 三条防死锁护栏（缺一不可）────────────────────────────────────────
   * ① **膨胀必须真的在跑**：当前不在膨胀、且连续 60 秒都没成功启动过 → 立刻放开现实。
   * ② **超时兜底**：压现实累计 > 300 秒而 maxDT 的 log10 增量 < 6
   *    （= 0.02 数量级/秒 × 300 s）时强制释放并打印 `[V-HOLD] 超时释放`；
   *    稳定增长不误杀。
   * ③ **[R35] 达标宽限**：maxDT 已达标但超过 5 秒仍未解锁 V（说明另有条件没满足，
   *    例如复制器/永恒次数掉下门槛）→ 放开现实，回到正常循环，下一轮再试。
   *
   * [Oreki R34] 护栏② 用的 `Decimal#pLog10()` 是「正部 log10」：**0、1、1e-30 一律返回 0**
   * （R34-B 浏览器实测：`new Decimal(0).pLog10() === 0`）。所以 `maxDT === 0` 时起始值与
   * 当前值都是 0，差值是 0 而不是 `-Infinity`/`NaN` —— 护栏② 在 DT 从 0 起步时**照样会触发**，
   * 不会因为 `0 → -Infinity` 的算术而永久失效。R34-B 实测的 DT 增速是「一个现实内
   * 0 → 1e174.7」，远大于 6 个数量级，所以这条兜底只在真的卡住时才会开火。
   */
  get holdRealityForV() {
    try {
      if (!this._vFinishEligible()) {
        this._vHoldSinceMs = 0;
        this._vGraceSinceMs = 0;
        return false;
      }
      const now = Date.now();
      const active = player.dilation.active === true;

      // ── 已达 DT 门槛：只在「等 V 解锁」的宽限期内继续压现实（护栏③）──
      if (player.records.thisReality.maxDT.gte(OREKI_V_UNLOCK_DILATED_TIME)) {
        if (!this._vGraceSinceMs) this._vGraceSinceMs = now;
        if (now - this._vGraceSinceMs > OREKI_V_HOLD_GRACE_MS) {
          console.warn(`[V-HOLD] maxDT 已达标但 ${OREKI_V_HOLD_GRACE_MS / 1000} s 内未解锁 V，放开现实重试`);
          this._vHoldSinceMs = 0;
          this._vGraceSinceMs = 0;
          return false;
        }
        return true;
      }
      this._vGraceSinceMs = 0;

      if (!this._vHoldSinceMs) {
        this._vHoldSinceMs = now;
        this._vHoldStartDtL = player.records.thisReality.maxDT.pLog10();
        if (!this._lastDilationStartOkMs) this._lastDilationStartOkMs = now;
        return true;
      }

      if (!active && now - this._lastDilationStartOkMs > 60000) {
        console.warn(`[V-HOLD] 膨胀连续 60 s 未能启动，放开现实（压现实 ${Math.round((now - this._vHoldSinceMs) / 1000)} s）`);
        this._vHoldSinceMs = 0;
        return false;
      }

      // ④ [R35] 进了膨胀却 60 s 都播不出速子粒子（膨胀态 IP 产量被 `dilatedValueOf`
      // 压低，可能一直够不到永恒门槛）→ 放开现实回到正常循环重试，
      // 不把整局永久压在膨胀态里。
      if (active && Currency.tachyonParticles.value.lte(0) && now - this._vHoldSinceMs > 60000) {
        console.warn(`[V-HOLD] 膨胀中 60 s 未能播下速子粒子，放开现实重试（压现实 ${Math.round((now - this._vHoldSinceMs) / 1000)} s）`);
        this._vHoldSinceMs = 0;
        return false;
      }

      const dtL = player.records.thisReality.maxDT.pLog10();
      if (now - this._vHoldSinceMs > 300000 && dtL - this._vHoldStartDtL < 6) {
        console.warn(`[V-HOLD] 超时释放：压现实 ${Math.round((now - this._vHoldSinceMs) / 1000)} s，` +
          `maxDT 仅从 1e${this._vHoldStartDtL.toFixed(1)} 涨到 1e${dtL.toFixed(1)}`);
        this._vHoldSinceMs = 0;
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * [Oreki R35-A2] **全仓唯一的「压住自动现实」判定**。
   *
   * 两个来源做一次「或」，绝不各写一套：
   *   · `holdRealityForV`            —— V 收尾：`maxDT` 已在同一个现实内攒到门槛（含三条护栏）；
   *   · `holdRealityForDeepChallenge` —— 深度挑战阶段：EC11/EC12 未满，现实会在 ~25 s 后
   *     把 `player.eternityChalls` 与整棵时间研究树清空（reality.js:651/666/673），
   *     使 「respec 换维度分叉 → 重建 233 → 买 EC12 研究 → 进入」 这条链永远走不完。
   *
   * `oreki-reality-automation.js::shouldReality` 与 `tickDilation` 的门禁都只读这一个 getter。
   */
  get holdReality() {
    if (this.holdRealityForV === true) return true;
    if (this.holdRealityForDeepChallenge === true) return true;
    // [Oreki R37-A] IU15 冲刺期间同样压住现实。
    //
    // 事实：IU15 要求「本现实内从未买过 ID1」+ `antimatter.exponent >= 1.5e12`
    // （imaginary-upgrades.js:158-176），而 `maxID1` 每个现实才重置
    // （player.js 的 `resetRequirements("reality")`）。若冲刺期间现实照常每 ~17 s 一次，
    // 反物质指数会被反复打回 1e9 量级，永远爬不到 1.5e12（`_r37a/r37a-long3.jsonl`
    // 实测 amE 在 1e9 与 1e24 之间来回跳）。压住现实后指数才有机会单向上爬。
    // 护栏：冲刺本身有 10 min / 5 min 的时间闸（oreki-early-automation.js），
    // 不会永久压死现实。
    // [Oreki R38-A] 注意：**不要**再读 `OrekiEarlyAutomation.isIu15SprintActive()`。
    // R36/R37 用它压现实，而 R38-A 实测证明「压住现实等指数上涨」不成立
    // （`_r38a/exp2.jsonl`：冻结重置 + 禁买 ID 后 amE 卡在 4.53e8 不动）。
    // 现在的 IU15 冲刺**不压现实**：`maxID1` 每个现实重置，只要 EC7 一直被跳过，
    // ID1 就恒为 0，现实照常循环反而让乘数继续涨。`holding` 恒为 false。
    try {
      if (globalThis.OrekiIu15Sprint?.holding === true) return true;
    } catch (e) { /* 读取失败不影响既有判定 */ }
    return false;
  },

  /** 深度挑战阶段（EC11/EC12 未打满）是否压住现实；判定与护栏全部在 oreki-dilation-automation.js */
  get holdRealityForDeepChallenge() {
    try {
      if (!OrekiDilationAutomation) return false;
      return OrekiDilationAutomation.hold === true;
    } catch (e) {
      return false;
    }
  },

  tick() {
    const result = { poured: false, entered: [], vUnlocked: false, unlocks: 0, stage: 0, dilation: false, deep: null };
    try {
      if (!player.auto.autobuyersOn) return result;
      if (Pelle.isDoomed) return result;
      try {
        result.stage = Effarig.currentStage;
      } catch (e) { /* ignore */ }

      // 1) 先买现实升级（RU1~5 可重复 + RU6~25 一次性），幂等，留给 RU 的 RM 不能浇。
      try {
        OrekiRealityAutomation.buyRebuyableUpgrades();
        OrekiRealityAutomation.buyRealityUpgrades();
      } catch (e) { /* 单项失败不影响其它 */ }

      // 2) 特蕾莎浇注：只在「特蕾莎已解锁（A147 达成）= 没有可买 RU」后才浇。
      //    用真实墙钟时间差，绝不用 gameLoop 的放大 diff。
      try {
        if (Teresa.isUnlocked && !this._hasBuyableRU()) {
          const now = Date.now();
          if (!this._lastRealMs) this._lastRealMs = now;
          let realMs = now - this._lastRealMs;
          this._lastRealMs = now;
          if (realMs < 0) realMs = 0;
          if (realMs > OREKI_MAX_REAL_FRAME_MS) realMs = OREKI_MAX_REAL_FRAME_MS;
          const diff = (realMs / 1000) * OREKI_TERESA_POUR_RATE;
          Teresa.pourRM(diff);
          result.poured = true;
        }
      } catch (e) { /* 单点异常不击穿主循环 */ }

      // 3) V 解锁：必须**在进入 V 的 run 之前**做。
      //    `V.canUnlockCelestial` = `VUnlocks.vAchievementUnlock.canBeUnlocked`
      //    （v.js:174），而进入 V run 的前置 `_canEnter("v")` 判的是
      //    `VUnlocks.vAchievementUnlock.isUnlocked` —— 先解锁才可能进 run，顺序反了会死锁。
      try {
        if (V.canUnlockCelestial) {
          V.unlockCelestial();
          this._vUnlocked = true;
          result.vUnlocked = true;
        }
      } catch (e) { /* 单点异常不击穿主循环 */ }

      // 3.5) [Oreki R30] 买鹿颈长解锁位（遗迹碎片，按 cost 升序）。
      //      `run`（5e11）是进入鹿颈长现实的入场券，必须在第 4 步之前买到。
      //      买不起就跳过；`infinity / eternity / reality` 三个阶段位不在购买列表里，
      //      只能由真实的 Big Crunch / Eternity / Reality 触发。
      try {
        result.unlocks = this.buyEffarigUnlocks();
      } catch (e) { /* 单点异常不击穿主循环 */ }

      // 3.6) [Oreki R35-A2] 深度挑战阶段（EC9→EC12）→ DS1 → 真实膨胀。
      //      顺序必须在 tickDilation 之前：DS1 一买上，同帧 / 下一帧就要能启动膨胀。
      try {
        result.deep = OrekiDilationAutomation.tick();
      } catch (e) { /* 单点异常不击穿主循环 */ }

      // 3.7) [Oreki R33] V 收尾阶段的膨胀（三段状态机 + 压现实护栏）。
      //
      // 历史教训（_r33-vchain2/3.jsonl）：只调 `startDilatedEternity(true)` 会死锁 ——
      // 进了膨胀但速子粒子恒 0（`tpL=null`），DT 一秒都不涨（`dtRaw` 恒 0）。
      // 因为速子粒子只在「膨胀状态下做一次永恒」时发放（eternity.js:99），
      // 而膨胀把产量压到 0 之后自动永恒再也不会触发。所以必须由本模块在膨胀中
      // **主动**做一次真实永恒把 TP 喂起来，然后再进膨胀让 DT 复利。
      try {
        result.dilation = this.tickDilation();
      } catch (e) { /* 单点异常不击穿主循环 */ }

      // 4) 进入天神 run（teresa/effarig/enslaved/v）。每神只进一次，随后由自动现实
      //    完成该 run（拿奖励、清 run），避免长时间卡在天神削弱态拉低产量。
      //    同一时刻只进一个：新天神的 initializeRun 会 clearCelestialRuns 清掉正在
      //    跑的那个，必须等当前 run 被现实完成（清 run）后再进下一个。
      //    ⚠️ 这里必须 break：若一帧内连进多个天神的 run，后一个的 clearCelestialRuns()
      //    会把前一个的 run 直接清掉，等于两个 run 都没真正开始（白跑一次现实）。
      if (!isInCelestialReality()) {
        for (const name of ["teresa", "effarig", "enslaved", "v"]) {
          try {
            if (this._canEnter(name)) {
              if (this._enterRun(name)) {
                result.entered.push(name);
                // 一帧只进一个，下一帧再考虑下一个
                break;
              }
            }
          } catch (e) { /* 单点异常不击穿主循环 */ }
        }
      }
    } catch (e) {
      // 整帧兜底：任何未捕获异常都不应击穿 gameLoop
    }
    return result;
  }
};

/**
 * [Oreki R30] 只读观测快照：主 Agent / 定向脚本可直接读
 * `OrekiCelestialAutomation.debugState`，不需要自己拼十几个 getter。
 * 全部字段都是**读真实状态**，不写入任何东西。
 */
Object.defineProperty(OrekiCelestialAutomation, "debugState", {
  get() {
    const lg = v => {
      try {
        const n = Number(v && typeof v === "object" && typeof v.toString === "function" ? v.toString() : v);
        if (!Number.isFinite(n)) {
          // Decimal 超大值走字符串指数拆解
          const t = String(v);
          const i = t.indexOf("e");
          if (i < 0) return Number.isFinite(n) ? Math.log10(Math.abs(n)) : null;
          return Math.log10(Math.abs(Number(t.slice(0, i)))) + Number(t.slice(i + 1));
        }
        return n === 0 ? null : Math.log10(Math.abs(n));
      } catch (e) {
        return null;
      }
    };
    const pick = fn => { try { return fn(); } catch (e) { return null; } };
    const unlock = key => pick(() => EffarigUnlock[key].isUnlocked === true);
    return {
      pouredAmount: pick(() => lg(Teresa.pouredAmount)),
      pouredAmountRaw: pick(() => Teresa.pouredAmount),
      relicShards: pick(() => lg(Currency.relicShards.value)),
      relicShardsRaw: pick(() => Currency.relicShards.value),
      shardsGainedPerReality: pick(() => Effarig.shardsGained),
      glyphEffectAmount: pick(() => Effarig.glyphEffectAmount),
      unlocks: {
        adjuster: unlock("adjuster"),
        glyphFilter: unlock("glyphFilter"),
        setSaves: unlock("setSaves"),
        run: unlock("run"),
        infinity: unlock("infinity"),
        eternity: unlock("eternity"),
        reality: unlock("reality"),
      },
      effarigStage: pick(() => Effarig.currentStage),
      effarigStageName: pick(() => Effarig.currentStageName),
      effarigRunning: pick(() => Effarig.isRunning === true),
      entered: pick(() => JSON.parse(JSON.stringify(this._entered))),
      enteredStage: pick(() => JSON.parse(JSON.stringify(this._enteredStage))),
      currentRun: pick(() => ["teresa", "effarig", "enslaved", "v"]
        .filter(n => player.celestials[n] && player.celestials[n].run)),
      inCelestialReality: pick(() => isInCelestialReality() === true),
      realities: pick(() => player.realities),
      unlocksBought: this._unlocksBought,
      vUnlocked: this._vUnlocked,
      // [Oreki R33] 膨胀观测：V 的 maxDT 判据只可能来自这里
      dilationActive: pick(() => player.dilation.active === true),
      dilationStarts: this._dilationStarts,
      dilationTpSeeds: this._dilationTpSeeds,
      tachyonL: pick(() => lg(Currency.tachyonParticles.value)),
      maxDTL: pick(() => lg(player.records.thisReality.maxDT)),
      holdRealityForV: pick(() => this.holdRealityForV === true),
      vHoldSince: this._vHoldSinceMs,
      /** [Oreki R35] V 收尾纯状态前提 / maxDT 达标后的宽限起点 */
      vFinishEligible: pick(() => this._vFinishEligible() === true),
      vGraceSince: this._vGraceSinceMs,
      /** [Oreki R34] 只读门禁计数：每个 tickDilation 的 return 点各记一次 */
      gates: pick(() => JSON.parse(JSON.stringify(this._gates))),
    };
  },
  enumerable: true,
  configurable: true,
});

try {
  globalThis.OrekiCelestialAutomation = OrekiCelestialAutomation;
} catch (e) {
  // 非浏览器环境忽略
}
