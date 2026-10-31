// [Oreki R26] Reality 层自动化：首次现实 → 现实循环 → 现实升级 / 符文装备
//
// ── 为什么需要（R26 实测）────────────────────────────────────────────
// R25 已能真实满足 `maxEP.exponent >= 4000 && TimeStudy.reality.isBought`，但**没有人按下
// 现实按钮**：原版现实没有「无条件可用」的自动器，`RealityAutobuyerState.isUnlocked`
// 反而要求 `RealityUpgrade(25).isBought`（autobuyers/reality-autobuyer.js:13），
// 而 RealityUpgrade 25 的价格是 100000 RM —— 先有现实才有自动现实，死锁。
// 所以首次现实必须由自动化按下与玩家点击**完全同一条路径**。
//
// ── 走哪条路径（源码事实）────────────────────────────────────────────
// `requestManualReality()`（reality.js:140）只是 UI 前置检查（动画 / 确认框 / 仓库空间），
// 真正干活的是 `processManualReality(sacrifice, glyphID)`（reality.js:164）：
//   · realities === 0 时锁 `player.reality.seed`、发起始符文 + 同伴符文；
//   · 之后 `beginProcessReality(getRealityProps(false, true))` → `finishProcessReality`。
// `getRealityProps(false, ...)` 的 `reset: false` 就是「**给奖励**」——与 `reality(true)` 的
// `reset: true` 相反（`finishProcessReality` 里 `if (!isReset) giveRealityRewards(...)`，
// reality.js:593）。所以本模块**只传 false**，绝不跳过结算。
// 后续现实走 `autoReality()`（reality.js:280），它同样是 `getRealityProps(false, false)`，
// 是原版自动现实用的同一条带奖励路径，不需要 RealityUpgrade(25)。
//
// ── 边界 ─────────────────────────────────────────────────────────────
// · 受「自动购买器总开关」控制；毁灭现实（Pelle）与天神现实中不生效。
// · 只在 `isRealityAvailable()` 为真时动手，不伪造 EP / 不伪造时间研究。
// · 现实重置会清空 EC 完成记录（reality.js:651）与时间研究，所以现实后必须靠
//   oreki-eternity-automation 再把 EC 1~12 打回 5 次 —— 那条链的 `active` 已放开到现实之后。

import { PlayerProgress } from "./player-progress.js";

const REALITY_MIN_INTERVAL_MS = 2000;
// [Oreki R28] 分阶段现实节奏：现实会清空 EC 完成记录 / 时间研究 / 膨胀研究
// （reality.js:651 附近），频率过高会把「现实→打 EC→再现实」打成来回清零，
// 导致 ecDone 从 12×5 退化到只剩少数关卡。因此按阶段收敛现实频率。
// 阶段 A：一次性现实升级尚未买齐 → 8 s（仍需足够快以在 180 分钟内推进 RU 链）
// 阶段 B：已买齐、正在推进天神链 → 15 s（给 EC/膨胀研究留出重打窗口）
const OREKI_REALITY_INTERVAL_PRE_RU_MS = 8000;
const OREKI_REALITY_INTERVAL_CELESTIAL_MS = 15000;

export const OrekiRealityAutomation = {
  _frame: 0,
  _lastRealityAt: 0,
  _realitiesFired: 0,
  /** 「现实就绪」的起始时间戳（用于给膨胀研究 1 留窗口），0 表示当前未就绪 */
  _readySince: 0,
  /**
   * [Oreki R42-C] 被 catch 吞掉的异常（只读观测，不参与任何判定）。
   * 理由与 `oreki-eternity-automation.js::_err` 完全相同：
   * 本模块每个方法都是 `try { ... } catch (e) { return false/0; }`，
   * 一旦里面某个 getter 写错（例如对普通 number 调 Decimal 方法），
   * 外面看到的现象就是「现实永远不触发 / 符文永远装不上」，没有任何异常暴露。
   * 这里只记录，不改变返回值。
   */
  _lastError: "",

  /**
   * @param {string} tag 调用点（方法名）
   * @param {*} e 捕获到的异常
   */
  _err(tag, e) {
    const msg = `${tag}: ${(e && e.message) || e}`;
    if (this._lastError !== msg) this._lastError = msg;
  },

  get active() {
    try {
      if (!player.auto.autobuyersOn) return false;
      if (Pelle.isDoomed) return false;
      // [Oreki R27] 允许在天神现实（teresa/effarig/enslaved/v 等）中继续现实：
      // 进入天神 run 后需要一次「带奖励」的现实来结算该 run（拿奖励并清 run），
      // 否则会永久卡在天神削弱态、现实循环停摆。Pelle 有独立的毁灭现实流程，仍禁用。
      // 符文选择弹窗打开时不重置，否则会打断玩家的选择
      if (GlyphSelection.active) return false;
      return true;
    } catch (e) {
      this._err("active", e);
      return false;
    }
  },

  get realityReady() {
    try {
      return isRealityAvailable();
    } catch (e) {
      this._err("realityReady", e);
      return false;
    }
  },

  /**
   * 这次现实值不值得做。
   * 首次无条件；之后要求「本次可得 RM 至少是现有 RM 的 2%」或距上次现实超过 20 秒，
   * 避免把时间浪费在毫无增长的短循环上（RM 增长是现实层唯一硬通货）。
   */
  shouldReality() {
    try {
      // [Oreki R33/R35-A2] 收尾阶段压住现实：`maxDT` 每个现实清零（reality.js:696），
      // 所以 V 的 `dilatedTime` 判据只能在同一个现实内攒出来，而自动现实每 ~25 s
      // 就会把它清零；同理，现实还会清空 `player.eternityChalls` 与整棵时间研究树，
      // 让「respec 换分叉 → 重建 233 → 进 EC12」这条链永远走不完。
      //
      // ⚠️ 这里**只读一处**：`OrekiCelestialAutomation.holdReality`。它是
      // `holdRealityForV`（V 收尾）与 `holdRealityForDeepChallenge`（深度挑战阶段）的
      // 「或」，两条来源各自的护栏都在 oreki-celestial-automation.js /
      // oreki-dilation-automation.js 里，本模块不再拼任何条件 —— R34 就是因为
      // 两处各写一套（其中一处多了 `TP > 0`）而互相锁死。
      // 用 globalThis 取而不是 import：本模块被 celestial-automation 反向依赖，
      // 直接 import 会成环；该对象在 celestial-automation 模块底部挂到 globalThis。
      if (globalThis.OrekiCelestialAutomation?.holdReality === true) return false;
      if (!this.realityReady) {
        this._readySince = 0;
        return false;
      }
      if (player.realities === 0) return true;
      const now = Date.now();
      if (!this._readySince) this._readySince = now;
      // [Oreki R26] 现实就绪后先给「膨胀研究 1」一个最多 10 秒的窗口。
      //
      // 事实：EC11 / EC12 一旦各满 5 次，`isRealityAvailable()` 立刻为真，而
      // 膨胀研究 1 的要求恰好是「EC11 与 EC12 全满 + 231~234 之一 + 最大 TT ≥ 12900」
      // （secret-formula/eternity/time-studies/dilation-time-studies.js:3-19）。
      // 现实一旦触发就清空 `player.eternityChalls` 与时间研究 → 这个窗口在一帧内消失，
      // 于是 `dilationUnlocked` 在 300 秒真新档里**一次都没成立过**：
      // 没有膨胀时间 → `gainedGlyphLevel()` 只有 4~5 级 → RU18（4 个 ≥10 级符文）
      // 永远拿不到 → 成就 147「购买所有现实升级」不成立 → Teresa 永远不出现。
      // 这里只是把「就绪之后立刻按」改成「最多等 10 秒让 DS1 先买上」，有上限、
      // 到点照常现实，不会卡死；DS1 买上后 `PlayerProgress.dilationUnlocked()` 为真，
      // 之后每次现实都不再等待。
      if (!PlayerProgress.dilationUnlocked() && now - this._readySince < 10000) return false;
      if (now - this._lastRealityAt < REALITY_MIN_INTERVAL_MS) return false;

      // [Oreki R28] **现实节奏按阶段收敛**。
      //
      // 事实（reality.js 现实重置清理清单）：每次现实都会清空
      //   · `player.eternityChalls`（EC 完成记录）
      //   · `Currency.timeTheorems`（时间定理）与 `player.dilation.studies`（膨胀研究）
      //   · `player.challenge.eternity.unlocked` / `current` / `requirementBits`
      // 而 R26 的节奏是「每 2~5 秒现实一次」——于是**每一次现实都把刚打好的
      // EC 进度清零**。实测（R28，124 秒真实新档）末态 `ecDone` 只剩
      // `5,0,5,0,0,0,0,0,0,0,0,0`，比 R25 的 12×5 明显退化，`nextEc=2` 说明
      // 自动化一直在重打 EC2，永远攒不出「EC1~12 全满」这个现实前置。
      //
      // 于是这里改成**按阶段决定间隔**：
      //   · 阶段 A「还没买齐一次性现实升级」：间隔放大到 8 s。
      //     此时 RM 才是瓶颈（RU21~25 各 100000 RM，缩放后 100 RM），
      //     而 EC 进度只影响「下次现实是否可用」，由 `isRealityAvailable()` 把关。
      //   · 阶段 B「已买齐、正在推进天神链」：间隔放大到 15 s。
      //     天神 run 必须靠「一次带奖励的现实」来结算（`oreki-celestial-automation`
      //     的注释里写明：进入 run 后需要一次现实来结算并清 run），
      //     所以**不能太频繁现实**，否则永远结算不完当前 run。
      let interval = REALITY_MIN_INTERVAL_MS;
      let allRuBought = false;
      try {
        allRuBought = RealityUpgrades.allBought === true;
      } catch (e) {
        allRuBought = false;
      }
      interval = allRuBought ? OREKI_REALITY_INTERVAL_CELESTIAL_MS : OREKI_REALITY_INTERVAL_PRE_RU_MS;
      if (now - this._lastRealityAt < interval) return false;

      // [Oreki R42-C] **这里故意不拦「现实 vs 研究/Boss 挑战」**，实测证据如下：
      //
      // ① 顺序上本来就不冲突：主循环里 `OrekiEternityAutomation.tick()`（game.js:883）
      //    早于 `OrekiRealityAutomation.tick()`（:894），同一帧里研究购买永远先尝试，
      //    「现实抢在研究购买之前」不存在，不需要在这里补一次购买。
      // ② 真会被现实清掉的只有「正在跑的那次 EC」（`reality.js:651` 的
      //    `player.eternityChalls = {}` + `:654` 的 `current = 0`）。真实新档 958 条
      //    1 s 采样里 20 次现实，19 次发生在 EC 链 12/12 之后，唯一一次 t=443 是
      //    EC12 打到一半被清、24 s 后补回 12/12 —— 代价 24 s，一次性。
      // ③ 我试过加「`EC 链未满 + 有 EC 在跑` 就让路 30 s」的护栏，**结果是净亏**：
      //    真实新档 A/B（同样 10000×、同样 1 s 采样）现实触发时刻
      //      无护栏：69 / 139 / 197 / 246（与基线 68 / 134 / 194 / 243 基本一致）
      //      有护栏：69 / 135 / 293 / 381 / 433 / 478 / 527 / 582
      //    EC 在后期是「<1 s 的密集小段」，`_ecYieldSince` 在每个间隙被重置，
      //    30 s 上限永远到不了，现实被切成 60~100 s 一轮 —— RM 增长速度直接砍半。
      //    ⇒ 护栏已经回退，不要再往 `shouldReality()` 里加「等 X 做完再现实」。

      const gain = MachineHandler.gainedRealityMachines.times(simulatedRealityCount(false) + 1);
      const have = Currency.realityMachines.value;
      if (gain.gte(have.times(0.02))) return true;
      // [Oreki R26] 20 s → 5 s：RM 一旦摸到 `MachineHandler.hardcapRM`（实测 1e1000）
      // 之后 `gain` 与 `have` 都不再变化，2% 判定永远为假，每次现实都要白等 20 s。
      // 现实能否进行由 `isRealityAvailable()`（EC 全通 + 时间研究）真正把关，
      // 这个兜底只影响「已经就绪之后还要等多久」，缩到 5 s 不会刷出无意义的空循环。
      return now - this._lastRealityAt >= interval * 3;
    } catch (e) {
      this._err("shouldReality", e);
      return false;
    }
  },

  /** 真正执行一次现实（带奖励的真实路径） */
  tryReality() {
    try {
      if (!this.shouldReality()) return false;
      if (player.realities === 0) {
        // 首次现实：与玩家点击按钮后走的是同一个函数，含种子锁定与起始/同伴符文
        processManualReality(false);
      } else {
        autoReality();
      }
      this._lastRealityAt = Date.now();
      this._realitiesFired++;
      return true;
    } catch (e) {
      this._err("tryReality", e);
      return false;
    }
  },

  /**
   * [Oreki R26] 现实升级的「解锁」是**事件驱动**的：`RealityUpgradeState.tryUnlock()`
   * 挂在各自的 `checkEvent` 上（例如 `GAME_EVENT.REALITY_UPGRADE_BOUGHT` / `ETERNITY_RESET_AFTER`），
   * 而玩家侧只有 UI 会在对应时机去触发。自动现实循环里很多事件不会按原版节奏发生，
   * 于是「条件早就满足、但 `player.reality.upgReqs` 这一位永远是 0」——
   * `isAvailableForPurchase` 恒假，RM 再多也买不了，Teresa 的成就 147「购买所有现实升级」永远到不了。
   * 这里每 10 帧主动跑一次条件复检（`tryUnlock()` 自身幂等且只读判断，不伪造任何状态）。
   * @returns {number} 本次新解锁的条数
   */
  tryUnlockRealityUpgrades() {
    let unlocked = 0;
    for (const upg of RealityUpgrades.all) {
      try {
        if (typeof upg.tryUnlock !== "function") continue;
        if (upg.isAvailableForPurchase) continue;
        upg.tryUnlock();
        if (upg.isAvailableForPurchase) unlocked++;
      } catch (e) {
        // 单项失败不影响其它条
      }
    }
    return unlocked;
  },

  /** 可重复购买的 1~5 号现实升级（膨胀时间 / 复制器 / 永恒 / 无限 / 维度） */
  buyRebuyableUpgrades() {
    let bought = 0;
    for (let id = 1; id <= 5; id++) {
      try {
        const upg = RealityUpgrade(id);
        // 只买买得起的，宁可留钱给下一次；上限由 canBeBought 自己判定
        while (upg.canBeBought && upg.purchase()) bought++;
      } catch (e) {
        // 该 id 不存在或暂不可买
      }
    }
    return bought;
  },

  /**
   * 一次性现实升级。只买 `isAvailableForPurchase` 为真的（= 对应前置已经在这次存档里
   * 真实达成过，由 `tryUnlock()` 写进 `player.reality.upgReqs`），不伪造任何解锁位。
   * 价格从 15 RM 起，早期只买得起最便宜的几项，按价格升序买。
   */
  buyRealityUpgrades() {
    try {
      const db = GameDatabase.reality?.upgrades || [];
      const candidates = db
        .filter(cfg => cfg.id >= 6)
        .map(cfg => ({ id: cfg.id, cost: cfg.cost }))
        .sort((a, b) => a.cost - b.cost);
      let bought = 0;
      for (const { id } of candidates) {
        try {
          const upg = RealityUpgrade(id);
          if (!upg || upg.isBought) continue;
          if (upg.purchase()) bought++;
        } catch (e) {
          // 忽略单项失败
        }
      }
      return bought;
    } catch (e) {
      this._err("buyRealityUpgrades", e);
      return 0;
    }
  },

  /**
   * 符文仓库管理：保留每个类型里评分最高的若干个，其余献祭/删除。
   * 评分用 `等级 × 强度`（与原版排序口径一致，glyph-core.js:40）。
   * 只在仓库剩余空间少于 12 格时清理，正常情况不动玩家的符文。
   */
  manageGlyphs() {
    try {
      if (GameCache.glyphInventorySpace.value >= 12) return 0;
      const byType = new Map();
      const all = Glyphs.inventoryList.filter(g => g && g.type !== "companion");
      for (const g of all) {
        if (!byType.has(g.type)) byType.set(g.type, []);
        byType.get(g.type).push(g);
      }
      let removed = 0;
      for (const list of byType.values()) {
        list.sort((a, b) => b.level * b.strength - a.level * a.strength);
        for (const g of list.slice(2)) {
          GlyphSacrificeHandler.removeGlyph(g, true);
          removed++;
        }
      }
      return removed;
    } catch (e) {
      this._err("manageGlyphs", e);
      return 0;
    }
  },

  /**
   * 装备评分最高的符文，**只往空槽装，绝不替换已占用的槽**。
   *
   * [Oreki R40-A · 实测根因，不是猜测]
   * 原来这里是「空槽优先，必要时替换更弱的」（`freeSlot < 0` 时挑最差的槽覆盖）。
   * 但原版 `Glyphs.equip()` 在目标槽**已占用**时走的是 `swapIntoActive()`
   * （glyphs/glyph-core.js:319-323），而 `swapIntoActive()` 里有一行
   *   `finishProcessReality({ reset: true, ... })`（glyph-core.js:759）
   * —— 那是**一次完整现实重置**：清空 `player.eternityChalls`（EC 完成记录）、
   * `Currency.timeTheorems`（时间定理 + 整棵时间研究树）、`player.dilation.studies`（膨胀研究），
   * 而 `reset: true` 表示**不发奖励**、`realities` 也不增加（reality.js 只有 `!isReset` 才结算）。
   *
   * 于是自动现实循环每一轮都会出现「现实 → 0.4 s 后 equipGlyphs 又静默重置一次」：
   * 实测 `_r40/r40a-fix.refunds.jsonl`，8 次可观测的现实重置里有 **3 次**来自本条：
   *   t=140.9s r=15、t=256.1s r=20、t=387.8s r=25  —— 全部紧跟在上一次真实现之后
   *   （t=255.7s 真实现 → t=256.1s 静默重置），且 `realities` 均未变化。
   * 后果：刚打通的 EC1~EC12 与 DS1~DS6 在同一个现实周期内被抹掉，EC 链被迫重打，
   * `realities` 增长被拖慢（V 需要 200 次），`TimeStudy.reality`(DS6) 也活不过一帧。
   *
   * 修法：只剩「装空槽」这一条路径（它与原版手动点击装空槽完全等价，不触发任何重置）。
   * 满槽就跳过。RU9/16/17/18/24 的「恰好 N 个符文」形态要求由 `_driveGlyphRequirements`
   * 先卸下再装空槽来完成，不依赖替换，因此不受影响。
   */
  equipGlyphs() {
    try {
      if (Glyphs.activeSlotCount === 0) return 0;
      const score = g => g.level * g.strength;
      const inventory = Glyphs.inventoryList.filter(g => g && g.type !== "companion");
      if (!inventory.length) return 0;
      inventory.sort((a, b) => score(b) - score(a));
      let equipped = 0;
      const savedConfirm = player.options.confirmations.glyphReplace;
      player.options.confirmations.glyphReplace = false;
      try {
        for (const glyph of inventory.slice(0, Glyphs.activeSlotCount)) {
          const already = Glyphs.activeWithoutCompanion.some(g => g && g.level === glyph.level &&
            g.strength === glyph.strength && g.type === glyph.type);
          if (already) continue;
          const freeSlot = Glyphs.active.findIndex(g => g === null);
          // 没有空槽 → 跳过。**不能替换**：替换 = 一次无收益的完整现实重置。
          if (freeSlot < 0) continue;
          Glyphs.equip(glyph, freeSlot);
          equipped++;
        }
      } finally {
        player.options.confirmations.glyphReplace = savedConfirm;
      }
      return equipped;
    } catch (e) {
      this._err("equipGlyphs", e);
      return 0;
    }
  },

  /**
   * [Oreki R26] 现实升级 9 / 16 / 17 / 18 / 24 的「符文形态」要求。
   *
   * 事实（源码）：这五条的 `checkRequirement` 全都是**当前这一瞬间的装备形态**：
   *   9 ：装备**恰好 1 个**等级 ≥3 的符文，且当前 EP 指数 ≥ 4000（reality-upgrades.js:129）
   *   16：装备**恰好 4 个**稀有度 ≥1.5 的符文（:259）
   *   17：装备**恰好 4 个**词条数 ≥2 的符文（:276）
   *   18：装备**恰好 4 个**等级 ≥10 的符文（:290）
   *   24：装备**0 个**符文且本次现实可得 RM ≥ 5000（:366）
   * 原版全靠玩家手动装卸，自动现实循环里永远碰到同一套「最优 3 符文」→ 永远满足不了，
   * 于是 RU9/24 的两个额外符文槽拿不到，成就 147「购买所有现实升级」→  Teresa 永远不出现。
   *
   * 依赖顺序是硬性的：9、24 各给一个符文槽，16/17/18 需要「恰好 4 个」= 4 个槽。
   * 所以按 9 → 16 → 17 → 18 → 24 的顺序驱动，全部走 `Glyphs.equip` / `Glyphs.unequip`
   * 的原版路径，不改任何解锁位与完成记录。
   */
  _glyphCandidates() {
    try {
      return Glyphs.inventoryList.filter(g => g && g.type !== "companion");
    } catch (e) {
      this._err("_glyphCandidates", e);
      return [];
    }
  },

  _glyphReqsDone() {
    try {
      const ok = id => {
        const u = RealityUpgrade(id);
        return !!u && (u.isAvailableForPurchase || u.isBought);
      };
      return ok(9) && ok(16) && ok(17) && ok(18) && ok(24);
    } catch (e) {
      this._err("_glyphReqsDone", e);
      return true;
    }
  },

  _unequipAllGlyphs() {
    let removed = 0;
    // 最多 8 次，避免异常状态下的死循环
    while (removed < 8) {
      const idx = Glyphs.active.findIndex(g => g && g.type !== "companion");
      if (idx < 0) break;
      Glyphs.unequip(idx);
      removed++;
    }
    return removed;
  },

  /** 装到「恰好 1 个等级 ≥3」——RU9 的形态 */
  _glyphFormOne() {
    if (Currency.eternityPoints.exponent < 4000) return 0;
    const active = Glyphs.activeWithoutCompanion;
    if (active.length === 1 && active[0].level >= 3) return 0;
    const best = this._glyphCandidates()
      .filter(g => g.level >= 3)
      .sort((a, b) => b.level * b.strength - a.level * a.strength)[0];
    if (!best) return 0;
    this._unequipAllGlyphs();
    const slot = Glyphs.active.findIndex(g => g === null);
    if (slot < 0) return 0;
    Glyphs.equip(best, slot);
    return 1;
  },

  /** 装到「恰好 4 个满足 pred」——RU16/17/18 的形态 */
  _glyphFormFour(pred) {
    // 符文槽不足 4 个（RU9 / RU24 还没买到）时硬凑「恰好 4 个」只会每 30 帧反复装卸
    if (Glyphs.activeSlotCount < 4) return 0;
    const active = Glyphs.activeWithoutCompanion;
    if (active.length === 4 && active.every(g => pred(g))) return 0;
    const want = this._glyphCandidates()
      .filter(pred)
      .sort((a, b) => b.level * b.strength - a.level * a.strength)
      .slice(0, 4);
    if (want.length < 4) return 0;
    this._unequipAllGlyphs();
    let equipped = 0;
    for (const glyph of want) {
      const slot = Glyphs.active.findIndex(g => g === null);
      if (slot < 0) break;
      Glyphs.equip(glyph, slot);
      equipped++;
    }
    return equipped;
  },

  /** 卸到 0 个符文——RU24 的形态 */
  _glyphFormNone() {
    if (Glyphs.activeWithoutCompanion.length === 0) return 0;
    if (MachineHandler.gainedRealityMachines.lt(5000)) return 0;
    return this._unequipAllGlyphs();
  },

  /**
   * 驱动到「下一个待解锁的现实升级」所需的装备形态。
   * @returns {number} 本次装载/卸下的符文数（0 表示没动）
   */
  satisfyGlyphRequirements() {
    try {
      const ready = id => {
        const u = RealityUpgrade(id);
        return !!u && (u.isAvailableForPurchase || u.isBought);
      };
      const savedConfirm = player.options.confirmations.glyphReplace;
      player.options.confirmations.glyphReplace = false;
      try {
        if (!ready(9)) return this._glyphFormOne();
        // [Oreki R26] 24 必须排在 16/17/18 之前：它要的是「0 个符文」，
        // 排在后面就会一直卡在「4 个符文」的形态里等 18；而且它自己再给一个符文槽，
        // 越早拿到越宽松。条件同样只有 `gainedRM ≥ 5000 && 0 装备`，与其它四条不冲突。
        if (!ready(24)) return this._glyphFormNone();
        if (!ready(16)) return this._glyphFormFour(g => g.strength >= 1.5);
        if (!ready(17)) return this._glyphFormFour(g => countValuesFromBitmask(g.effects) >= 2);
        if (!ready(18)) return this._glyphFormFour(g => g.level >= 10);
        return 0;
      } finally {
        player.options.confirmations.glyphReplace = savedConfirm;
      }
    } catch (e) {
      this._err("satisfyGlyphRequirements", e);
      return 0;
    }
  },

  tick() {
    if (!this.active) return { reality: false, upgrades: 0, glyphs: 0 };
    this._frame++;
    const reality = this.tryReality();
    if (!PlayerProgress.realityUnlocked()) return { reality, upgrades: 0, glyphs: 0 };
    let upgrades = 0;
    let glyphs = 0;
    // 现实升级与符文只在每 10 帧跑一次，避免每帧遍历数据库
    if (this._frame % 10 === 0) {
      this.tryUnlockRealityUpgrades();
      upgrades = this.buyRebuyableUpgrades() + this.buyRealityUpgrades();
    }
    if (this._frame % 30 === 0) {
      // 符文形态由 9/16/17/18/24 的要求独占；只有五条全部拿到之后
      // 才回到「装备评分最高的 3 个」的常规策略，避免两边互相拆台。
      const glyphReqsDone = this._glyphReqsDone();
      if (glyphReqsDone) {
        this.manageGlyphs();
        glyphs = this.equipGlyphs();
      } else {
        glyphs = this.satisfyGlyphRequirements();
      }
    }
    return { reality, upgrades, glyphs };
  },
};

// 便于真实新档脚本观测内部计数（不影响任何游戏逻辑）
try {
  globalThis.OrekiRealityAutomation = OrekiRealityAutomation;
} catch (e) {
  // 非浏览器环境（例如单测）忽略
}
