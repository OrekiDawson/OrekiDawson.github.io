// [Oreki AD10] Eternity 阶段的通路自动化：时间维度 → 时间定理 → 时间研究
//
// ── 为什么需要（R21 实测 + 源码逐行核对）────────────────────────────
// 首次永恒只需 15 秒（AD4～AD9 已解决），但 Reality 一直不可达。真实原因链：
//   1. `isRealityAvailable()`（src/core/reality.js:119）要求
//        `player.records.thisReality.maxEP.exponent >= 4000` **且** `TimeStudy.reality.isBought`
//      EP 早已满足（实测 1e694437），所以唯一闸门是那个时间研究。
//   2. `TimeStudy.reality` = `DilationTimeStudyState.studies[6]`
//      （src/core/time-studies/dilation-time-study.js:84），属于时间膨胀研究，
//      需要先有大量**时间定理（TT）**并点亮前置研究。
//   3. `TimeTheorems.checkForBuying()`（src/core/time-theorems.js:112）有一条硬前置：
//        `if (PlayerProgress.realityUnlocked() || TimeDimension(1).bought) return true;`
//      即**必须先买过至少一个时间维度**，否则连用 EP 换 TT 都不允许。
//      原版这里会弹「你需要购买至少一个时间维度」的提示——正好是玩家卡住的点。
//   4. 而时间维度 1~4 的解锁条件是 `this._tier < 5`（src/core/dimensions/time-dimension.js:186），
//      只要花 EP 就能买；到 5~8 才需要时间研究。
//
// 也就是说，从「已经能无限次永恒」到「Reality」之间，玩家必须手动完成一连串
// 机械操作：买时间维度 → 用 EP 买几百上千次 TT → 逐个点亮时间研究。
// 10000× 速度下这套点击根本跟不上，进度就死在这里（实测 EP 涨到 1e694437 却
// 一个时间研究都没买上）。
//
// ── 本模块做什么（三步，全部走原版真实购买路径）──────────────────────
// A) 买时间维度 1~4：调 `buyMaxTimeDimension(tier, fraction)`，按 EP 扣费。
// B) 用 EP（以及 AM/IP）买时间定理：调 `TimeTheorems.buyMax(true)`，
//    内部走 `TimeTheoremPurchaseType.*.purchase(true)`，成本与增量全是原版公式。
// C) 买时间研究：对存在的普通研究 id 逐个尝试 `TimeStudy(id).purchase()`，
//    能买的就买（前置不满足时 purchase 自己返回 false，不会越级）。
//    为了控制开销，这一项每 30 帧才跑一轮。
//
// ── 边界 ─────────────────────────────────────────────────────────────
// · 只在 `!PlayerProgress.realityUnlocked()` 时生效；Reality 之后完全交给原版后期内容。
// · 受玩家既有的「自动购买器」总开关控制，关掉即完全停止。
// · 任意挑战中、毁灭现实中不生效（避免干扰挑战内的资源约束）。
// · 不伪造解锁标志、不写历史记录、不跳阶段；Reality 仍须真实满足
//   `maxEP.exponent >= 4000 && TimeStudy.reality.isBought`。
// · 不碰 `gainedInfinityPoints` / `gainedEternityPoints` 的公式。

import { PlayerProgress } from "./player-progress.js";

/** 每多少帧跑一次「买时间研究」（233 次尝试比较重，不宜每帧跑） */
const STUDY_TICK_INTERVAL = 30;

/**
 * 普通时间研究可能存在的 id 区间。
 * 原版是 11~73 的前置行、81~103 的维度分叉行、以及 111~243 的各 EC 行，
 * 每 10 个一组、组内最多 3 个。这里按这个形状枚举，不存在的 id 由 try/catch 跳过。
 */
function* studyIds() {
  for (let id = 11; id <= 73; id++) yield id;
  for (let hundred = 80; hundred <= 240; hundred += 10) {
    for (let k = 1; k <= 3; k++) yield hundred + k;
  }
  yield 111;
}

export const OrekiEternityAutomation = {
  _frame: 0,

  get active() {
    try {
      if (PlayerProgress.realityUnlocked()) return false;
      if (!player.auto.autobuyersOn) return false;
      if (NormalChallenge.isRunning || InfinityChallenge.isRunning || EternityChallenge.isRunning) return false;
      if (Pelle.isDoomed) return false;
      return true;
    } catch (e) {
      return false;
    }
  },

  /** A) 用 EP 买时间维度 1~4（5 以上需要时间研究，留给第二步） */
  buyTimeDimensions() {
    try {
      let bought = false;
      for (let tier = 4; tier >= 1; tier--) {
        const td = TimeDimension(tier);
        if (!td.isUnlocked) continue;
        if (!td.isAffordable) continue;
        buyMaxTimeDimension(tier, 0.5);
        bought = true;
      }
      return bought;
    } catch (e) {
      return false;
    }
  },

  /**
   * B) 用 EP / IP / AM 买时间定理。
   * 注意 `TimeTheorems.buyMax` 内部会先调 `checkForBuying(true)`，
   * 拿不到「已买时间维度」这条前置时直接返回 0，不会报错也不会弹窗。
   */
  buyTimeTheorems() {
    try {
      return TimeTheorems.buyMax(true) > 0;
    } catch (e) {
      return false;
    }
  },

  /** C) 逐个尝试购买时间研究；前置不满足的 purchase 会自己返回 false */
  buyTimeStudies() {
    try {
      let bought = 0;
      for (const id of studyIds()) {
        try {
          const study = TimeStudy(id);
          if (!study || study.isBought) continue;
          if (study.purchase()) bought++;
        } catch (e) {
          // 该 id 不存在或暂时不可买，跳过
        }
      }
      return bought;
    } catch (e) {
      return 0;
    }
  },

  /**
   * D) 买时间膨胀研究（1~6）。
   * `TimeStudy.reality` 就是`DilationTimeStudyState.studies[6]`（dilation-time-study.js:84），
   * 而膨胀研究是逐级门槛：
   *   1 → 5000 TT、2 → 1e6、3 → 1e7、4 → 1e8、5 → 1e9、6 → 1 TT，
   * 每一级都要求前一级或对应的时间维度研究。
   * 实测（R21）普通研究已买 22 个、TT 已有 260 万，但一个膨胀研究都没买 ——
   * 因为普通研究循环根本覆盖不到这个集合，这就是 Reality 卡死的最后一环。
   */
  buyDilationStudies() {
    try {
      let bought = 0;
      for (let id = 1; id <= 6; id++) {
        try {
          const study = DilationTimeStudyState.studies[id];
          if (!study || study.isBought) continue;
          if (study.purchase()) bought++;
        } catch (e) {
          // 该级暂时不可买（TT 不足或前置未满足）
        }
      }
      return bought;
    } catch (e) {
      return 0;
    }
  },

  /**
   * E) 购买永恒挑战（EC）的研究，并自动进入当前已解锁的 EC。
   *
   * 事实：EC 的解锁不是靠「打完上一个」，而是靠**买下对应的 EC 时间研究**——
   *   `ECTimeStudyState.purchase()` 里写着 `player.challenge.eternity.unlocked = this.id`
   *   （src/core/time-studies/ec-time-study.js:34）。
   * 而 `EternityChallenge.isUnlocked` 就是 `player.challenge.eternity.unlocked === this.id`
   * （src/core/eternity-challenge.js:54），也就是**同一时刻只有一关是开着的**。
   *
   * 这条链是 Reality 的必经之路：膨胀研究 1 要求 EC11 与 EC12 全部完成
   * （secret-formula/eternity/time-studies/dilation-time-studies.js:19），
   * 而膨胀研究 6（= TimeStudy.reality）还要求全部 pre-Reality 成就。
   *
   * 进入挑战后由既有的 core/oreki-instant-challenges.js「进入即完成」接管，
   * 这里只负责按下「开始」那一下，不重复实现完成逻辑。
   */
  buyEcStudiesAndStart() {
    try {
      // 1) 能买的 EC 研究都买掉（前置不满足时 purchase 自己返回 false）
      for (let id = 1; id <= 12; id++) {
        try {
          const study = TimeStudy.eternityChallenge(id);
          if (study && !study.isBought) study.purchase();
        } catch (e) {
          // 该 EC 研究暂不可买
        }
      }

      // 2) 已有挑战在跑就不插手
      if (EternityChallenge.isRunning) return false;

      // 3) 进入当前已解锁的那一关；没打完就不重复进入
      const unlockedId = player.challenge.eternity.unlocked;
      if (!unlockedId) return false;
      let challenge;
      try {
        challenge = EternityChallenge(unlockedId);
      } catch (e) {
        return false;
      }
      if (!challenge || !challenge.isUnlocked) return false;
      if (challenge.completions >= challenge.maxCompletions) {
        // 这一关已满，尝试把下一关的研究买掉（下一次 tick 会重新走 1)）
        return false;
      }
      return challenge.start(true) === true;
    } catch (e) {
      return false;
    }
  },

  tick() {
    if (!this.active) return { dims: false, tt: false, studies: 0, dilation: 0, ec: false };
    const dims = this.buyTimeDimensions();
    const tt = this.buyTimeTheorems();
    this._frame++;
    let studies = 0;
    let dilation = 0;
    let ec = false;
    if (this._frame % STUDY_TICK_INTERVAL === 0) {
      studies = this.buyTimeStudies();
      dilation = this.buyDilationStudies();
    }
    // EC 的进入会触发 eternity 重置，节流到每 20 帧才尝试一次
    if (this._frame % 20 === 0) ec = this.buyEcStudiesAndStart();
    return { dims, tt, studies, dilation, ec };
  },
};
