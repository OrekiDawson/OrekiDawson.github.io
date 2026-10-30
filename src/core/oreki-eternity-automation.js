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
 * 普通时间研究 id 列表：直接从数据库取，不再手写区间。
 *
 * [Oreki R25] 原来手写的是「11~73 + 每组 x01~x03」，漏掉了所有 x04：214 / 224 / 234
 * （normal-time-studies.js 里确实存在这三个）。R25 实测末态 boughtIds 里恰好没有 214/234。
 * 影响：
 *   · 234 是 EC12 的另一条入口（ec-time-studies.js:139 `requirement: [233, 234]`，
 *     AT_LEAST_ONE），214 又是 227/228 的前置（normal-time-studies.js:633）——
 *     这条路整条不可达；
 *   · 好在 233（←225/226←213）这一条能走通，所以 EC12 还能靠 233 满足；
 *     真正的 EC12 死锁是「买错维度分叉（71）」，见 `blockedStudies()`。
 *   但手写枚举与数据库脱节本身就是隐患（以后再加 x04 还会漏），改为直接读数据库。
 */
function* studyIds() {
  const db = (typeof GameDatabase !== "undefined" && GameDatabase.eternity?.timeStudies?.normal) || [];
  for (const study of db) yield study.id;
  // 兜底：万一数据库还没初始化，仍用旧的枚举形状（不会更差）
  if (!db.length) {
    for (let id = 11; id <= 73; id++) yield id;
    for (let hundred = 80; hundred <= 240; hundred += 10) {
      for (let k = 1; k <= 4; k++) yield hundred + k;
    }
  }
}

export const OrekiEternityAutomation = {
  _frame: 0,
  /** [Oreki R40-A] 「满级关换关 respec」的次数与上次快照，仅用于观测与防抖 */
  _respecCount: 0,
  _fullEcRespec: null,

  get active() {
    try {
      // [Oreki R26] 原来这里写着 `if (PlayerProgress.realityUnlocked()) return false;`，
      // 意味着**第一次现实之后整套「买时间维度 / TT / 时间研究 / 自动永恒」全部停摆**。
      // 但现实重置会把 `player.eternityChalls`（EC 完成记录）、时间定理、时间维度、
      // 膨胀研究全部清空（reality.js:651 / :670 / :673），
      // 而再次现实的唯一闸门仍是 `TimeStudy.reality.isBought`（需要 EC11/EC12 各 5 次 +
      // 8 级时间维度 + 数百万 TT）。不放开这一层，第二次现实就永远等不到 —— 现实层直接卡死。
      // 现在只排除天神现实（那里有各自的资源约束，不能乱买）。
      //
      // [Oreki R29] **上面这条「排除天神现实」是错的，已撤销 —— 它造成了一个真实死锁。**
      //
      // ── 死锁链（源码事实）─────────────────────────────────────────────
      // 1. 天神 run 的结算写入点在 `reality.js:341-342`：
      //      `if (Currency.antimatter.gt(player.celestials.teresa.bestRunAM))
      //         player.celestials.teresa.bestRunAM = Currency.antimatter.value;`
      //    —— 它发生在**现实结算**（`finishProcessReality` → `giveRealityRewards`）里。
      //    也就是说：run 必须靠「一次带奖励的现实」才能真正结算。
      // 2. 但 `isRealityAvailable()`（reality.js:119-121）是
      //      `player.records.thisReality.maxEP.exponent >= 4000 && TimeStudy.reality.isBought`
      //    —— 硬依赖 `TimeStudy.reality`（膨胀研究 6）。
      // 3. 而现实重置会清空 EC 完成记录 / 时间定理 / 时间维度 / 膨胀研究
      //    （reality.js:651 / :670 / :673），于是 `TimeStudy.reality` 变成未购买。
      // 4. 重买它需要 EC11 + EC12 各 5 次 + 8 级时间维度 + 数百万 TT —— 全靠本模块。
      // ⇒ 一旦进了天神 run，本模块停摆 → EC 再也打不回来 → `isRealityAvailable()` 永假
      //   → run 永远等不到那次结算现实 → **天神链彻底卡死**。
      //
      // 实测证据（R28 300 秒真实新档，`web/_tools/_r28-300.jsonl`）：
      //   t=202s 起 `realities` 永久停在 30 直到结束；末态 `ecDone` 全 0、
      //   `teresaRun=true` 但 `effarigUnlocked=false`、`endState=0`。
      //   即：进了特蕾莎 run 之后，现实再也发生不了。
      //
      // ── 为什么放开是安全的 ──────────────────────────────────────────
      // 天神现实里本模块买的仍然是**原版允许买的东西**（时间维度 / TT / 时间研究 /
      // 膨胀研究），全部走 `purchase()` 系列真实路径、真实扣费、真实前置判定；
      // 买不上就返回 false，不存在伪造。Pelle 毁灭态仍由下面的 `Pelle.isDoomed` 排除。
      // 唯一的变化是：不再因为「处于天神 run」而整套停摆。
      if (!player.auto.autobuyersOn) return false;
      if (NormalChallenge.isRunning || InfinityChallenge.isRunning || EternityChallenge.isRunning) return false;
      if (Pelle.isDoomed) return false;
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * A) 用 EP 买时间维度 1~8。
   *
   * [Oreki R25] 原来只买到 4 级。但膨胀研究 6（`TimeStudy.reality`）的第一条要求是
   * `TimeStudy.timeDimension(8).isBought`（dilation-time-studies.js:50），
   * 而 `TimeStudy.timeDimension(8)` 就是**膨胀研究 5**（dilation-time-study.js:78
   * `studies[tier - 3]`），也就是 5~8 级时间维度的解锁链。
   * 这里按 `isUnlocked` 自己判定（8→1 顺序，高级维度对 DD 的加成最大），
   * 只买得起才买，成本与扣费全走原版 `buyMaxTimeDimension`。
   */
  buyTimeDimensions() {
    try {
      let bought = false;
      for (let tier = 8; tier >= 1; tier--) {
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

  /**
   * 目标 EC 需要的「互斥研究列」。
   *
   * 时间研究树有三组互斥列（`requiresST` 表示「买了对方就要花空间定理」，
   * 而 Reality 之前 `V.availableST` 恒为 0，等于只能选一列）：
   *   列 A：121 / 122 / 123（normal-time-studies.js:306-345）
   *   列 B：131(←121) / 132(←122) / 133(←123)（:352-...）
   *   列 C：141(←131) / 142(←132) / 143(←133)（:388-...）
   *   151 只要列 C 任意一个（:430）。
   *
   * 而各 EC 的主前置是写死的（ec-time-studies.js）：
   *   · EC4 → 143 → 133 → 123（第 43-44 行 `requirement: [143]`）
   *   · EC8 → 123（第 90-92 行 `requirement: [123]`）
   *   · EC6 → 121（第 65-68 行 `requirement: [121]`）
   * 也就是说 EC4/EC8 与 EC6 必须在**不同列**里打，必须靠 respec 换列。
   * R25 实测：贪心按 id 升序只会买到 121 列，末态 `ts143 = false`、`ts123 = false`，
   * 于是 ec4.cur 早就 ≥ tot（met = true）却 `bought = false`、EC4 永远是 0 次。
   */
  preferredColumn() {
    try {
      const id = this.nextUnfinishedEcId();
      if (id === 4 || id === 8) return 123;
      return 121;
    } catch (e) {
      return 121;
    }
  },

  /**
   * [Oreki R40-A] 目标维度分叉：73（时间维度）还是 71（反物质维度）。
   *
   * ── 为什么需要单独一个判定（R40-A 200ms 真实新档实测）───────────────
   * 原实现是 `path = this.nextUnfinishedEcId() === 12 ? 73 : 71`，即「只有当前目标正好是
   * EC12 时才走 73」。但两条自动化对「当前目标」的定义不同：
   *   · 本模块 `nextUnfinishedEcId()` 按 1→12 取第一个未满 = 可能是 **EC6**
   *     （EC6 卡在复制器星系资源上，会长期停在那里）；
   *   · `OrekiDilationAutomation._targetEc()` 按 9→10→11→12 取，此时是 **EC12**，
   *     而 EC12 的 `secondary.forbiddenStudies = [71,72]`（ec-time-studies.js:141），
   *     只要 71 在树里它每 6 s 就 `respecTimeStudies(true)` 一次。
   * 于是形成闭环：dilation 清空整棵树（期望换到 73）→ 本模块认为目标是 EC6（允许 71）
   * → 立刻把 71 买回来 → dilation 再次判定被 71 阻挡 → 再 respec……
   *
   * 实测证据（`_r40/r40a-diag.refunds.jsonl`，700 s 真实新档）：
   *   t=27.8 / 34.0 / 40.3 / 46.6 / 52.8 / 59.1 / 65.3 s 连续 7 次 respec，
   *   间隔恒为 6.2 s，`unlocked=0`、`studiesLen=38` 全程不变、EC 完成数一次都没增加
   *   —— 纯抖动，38 s 里把 38 个研究反复清空重建，EC12 需要的 233/234 链永远建不完。
   *
   * 修法：把「维度分叉」从「当前目标是不是 12」改成「EC11 是否已满、EC12 是否未满」。
   * 这是**全局树状态**问题，与「下一个要打哪一关」解耦，因此不影响
   * `nextUnfinishedEcId()` 对 EC6/EC3 等窄保护的语义。
   *
   * 为什么必须换到 73：原版 71 要求 `!EternityChallenge(12).isUnlocked`、
   * 73 要求 `!EternityChallenge(11).isUnlocked`（normal-time-studies.js:146 / :190），
   * 而 EC12 的 `forbiddenStudies=[71,72]`、EC11 的是 `[72,73]` —— 两关天然互斥，
   * 在 EC11 打满之后必须常驻 73 一侧，直到 EC12 也打满。
   * 全程只走原版 `purchase()`，不写任何解锁位。
   */
  dimensionPathId() {
    try {
      const ec11 = EternityChallenge(11);
      const ec12 = EternityChallenge(12);
      if (ec11.completions >= ec11.maxCompletions && ec12.completions < ec12.maxCompletions) return 73;
      return 71;
    } catch (e) {
      return 71;
    }
  },

  /**
   * 当前不允许购买的研究集合：
   *   1) 与目标 EC 所需列互斥的另外两列；
   *   2) 维度分叉里没选中的那两条（71/73 只能留一条，见下）。
   *
   * 维度分叉（DIMENSION_PATH，normal-time-studies.js:146/188）：
   *   · EC11 的 forbiddenStudies = [72, 73]（ec-time-studies.js:131）→ 只能走 71 那条；
   *   · EC12 的 forbiddenStudies = [71, 72]（ec-time-studies.js:141）→ 只能走 73 那条；
   *   81 的前置是 71、83 的前置是 73，而默认 allowedDimPathCount = 1，
   *   买错一条就再也买不到另一条 → 对应 EC 的 `hasForbiddenStudies` 恒真。
   *   R25 实测：末态 `ts71 = true` → `ec12.forb = true, met = false`。
   */
  blockedStudies() {
    const col = this.preferredColumn();
    const blocked = new Set();
    for (const id of [121, 122, 123]) if (id !== col) blocked.add(id);
    if (col === 123) {
      blocked.add(131).add(132);
      blocked.add(141).add(142);
    } else if (col === 122) {
      blocked.add(131).add(133);
      blocked.add(141).add(143);
    } else {
      blocked.add(132).add(133);
      blocked.add(142).add(143);
    }
    // [Oreki R40-A] 由 `dimensionPathId()` 统一决定，不再看 nextUnfinishedEcId()。
    const path = this.dimensionPathId();
    for (const id of [71, 72, 73]) if (id !== path) blocked.add(id);
    return blocked;
  },

  /** 已经买错列/买错分叉 → 只能靠 respec 换回来 */
  needsBranchRespec() {
    try {
      if (!this.active) return false;
      if (player.challenge.eternity.unlocked !== 0) return false;
      for (const id of this.blockedStudies()) {
        if (TimeStudy(id).isBought) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  /** C) 逐个尝试购买时间研究；前置不满足的 purchase 会自己返回 false */
  buyTimeStudies() {
    try {
      const blocked = this.blockedStudies();
      let bought = 0;
      for (const id of studyIds()) {
        if (blocked.has(id)) continue;
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
  /**
   * [Oreki R37-A] 删除了死变量 `_ecTarget`（恒为 1，中间没有任何赋值）。
   *
   * 原缺陷（R36-A 报告点出）：`shouldHoldReset()` 读 `this._ecTarget`（旧 :404），
   * 而它从定义（旧 :295）到读取之间**没有任何写入点**，所以「暂停自动永恒
   * 让 EC 入口资源爬满」这条保护**只对 EC1 生效**；EC2~EC12 全程被自动永恒打断，
   * 入口资源的峰值缓存（`ECTimeStudyState.invalidateCachedRequirements()`）反复清零。
   * 现在直接读 `nextUnfinishedEcId()`（本对象已有的真实实现，按 1→12 找第一个未满的），
   * 与 `_driveEcChain` 的目标完全一致，不再有第二份状态。
   */

  /**
   * E) 推进永恒挑战（EC1→EC12），为 Reality 的膨胀研究 1 铺路。
   *
   * 关键机制（源码逐个核对，这是之前卡在 EC2 的真正原因）：
   * 1. `ECTimeStudyState.canBeBought` 里有
   *      `if (player.challenge.eternity.unlocked !== 0) return false;`
   *    ——**只要已经解锁了某一关，就再也买不了别的 EC 研究**。
   *    `unlocked` 只在 `respecTimeStudies()` 里被清 0（time-studies.js:149），
   *    而它会退款并清空普通研究。所以原版流程是：打完一关 → 重洗时间研究 → 买下一关。
   *    之前只调 `purchase()`，一关满级后 `unlocked` 永远停在那，于是永远买不到 EC3。
   * 2. 官方购买入口不是 `purchase()` 而是 `purchaseUntil()`
   *    （ec-time-study.js:52）：它会先 `commitToGameState(buyStudiesUntil(目标, id))`
   *    补齐该 EC 需要的研究路径再重试购买；EC11/12 还补 191/193。
   *
   * 本方法一关一关推进，每步都走原版真实路径：
   *   - 挑战在跑 → 不插手（交给「进入即完成」模块）
   *   - 当前关没满 5 次 → start(true)
   *   - 当前关已满 → respecTimeStudies(true) 清 unlocked 并退款
   *   - unlocked === 0 → 对目标关 purchaseUntil()，买上了立刻 start(true)
   *   - 买不上就停在这一关等资源（不跳关、不伪造）
   */
  buyEcStudiesAndStart() {
    try {
      // 1) 能买的 EC 研究都买掉（canBeBought 会自己校验：unlocked 为 0 / 主研究已买 / 二级资源达标）
      for (let id = 1; id <= 12; id++) {
        try {
          // 【R36 修复】已经解锁了某一关就不能再买别的 EC 研究
          // （ec-time-study.js:80 `if (player.challenge.eternity.unlocked !== 0) return false;`）。
          // 不 break 的话，后面的 id 会白跑一轮「补前置研究」，白白烧掉 TT。
          if (player.challenge.eternity.unlocked !== 0) break;

          const study = TimeStudy.eternityChallenge(id);
          if (!study || study.isBought) continue;
          // 关键：**已经打满 5 次的 EC 不要再买它的研究**。
          // 否则会出现死循环：买下已满级的 EC 研究 → 下一帧判定「已满」→ respec 清空研究树
          // → 再把同一关买回来…… 实测后果是 TT 一直在退，但已买普通研究恒为 0，
          // 整个时间研究链永远建立不起来（R23 实测：59 秒 TT 367 万、研究 0 个）。
          const challenge = EternityChallenge(id);
          if (challenge && challenge.completions >= challenge.maxCompletions) continue;

          // 【R36 关键修复 · 真正的全局阻塞点】
          // EC9~EC12 买不上的真正原因**不是资源**，而是**前置普通时间研究没买**。
          // ECTimeStudyState.canBeBought（src/core/time-studies/ec-time-study.js:76-87）有三条：
          //   ① this.isAffordable                      —— 资源
          //   ② player.challenge.eternity.unlocked !== 0 —— 同一时刻只能开着一关
          //   ③ this.config.requirement.some(s => TimeStudy(s).isBought)  ← **前置研究**
          //      EC9 的 requirement 是 [151]（normal-time-studies.js:430「所有时间维度提升 1e4 倍」），
          //      EC10/11/12 是 [181]。
          // 原实现只调 study.purchase()，**从不补前置** ⇒ 第③条恒为 false ⇒
          // canBeBought 恒 false ⇒ EC9~EC12 永远买不上。
          // R36 实测（web/_tools/_r36a/_r36a-ec9.jsonl）：
          //   infPowerL = 1.29e12931925  ≫ 门槛 1e17498（资源早就够了）
          //   ecReqTot9L = 17498、ecUnlocked = 8、ecDone = [5,5,5,5,5,5,5,5,0,0,0,0]
          //   ec9StudyBought = false
          // ⇒ R35「EC9 是无限之力 1e17498 墙」的结论**是错的**，
          //   真正卡住的是「研究 151 没被买」。
          //
          // 修法：买不动时，按 EC 配置里的 requirement 补齐前置普通研究链
          // （普通研究自带 purchaseUntil() → buyStudiesUntil()，会连同整条前置一起买）。
          // 买不上就等下一帧（TT 会继续涨），不跳关、不伪造。
          if (!study.canBeBought) {
            for (const sid of (study.config?.requirement || [])) {
              try {
                const pre = TimeStudy(sid);
                if (pre && !pre.isBought) pre.purchaseUntil();
              } catch (e) {
                // 该前置研究暂时不可买，等下一帧
              }
            }
          }
          study.purchase();
        } catch (e) {
          // 该 EC 研究暂不可买
        }
      }

      // 2) 已有挑战在跑就不插手（完成逻辑交给 oreki-instant-challenges）
      if (EternityChallenge.isRunning) return false;

      // 3) 进入当前已解锁的那一关
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
        // [AD11.1] 这一关已满：必须 respecTimeStudies 才能把 unlocked 清 0，
        // 否则 ECTimeStudyState.canBeBought 里那条 unlocked !== 0 就直接 return false，
        // 后面所有 EC 研究永远买不上（实测卡在 EC2 满级后无法推进）。
        // respec 会退款并清空普通研究，下一步由 AD10 的自动买研究重新补齐。
        //
        // [Oreki R40-A] 加一层「同一关 + 同一完成次数快照只 respec 一次」的会话内闸门。
        // 正常路径下 respec 会把 unlocked 清 0、本分支自然只走一次；但若有别的模块
        // 在同一帧内又把这一关的研究买回来（实测 `_driveEcChain` 每 6 s 会 respec 一次，
        // 之后本模块 30 帧内的 `buyTimeStudies` 会把 71/EC 研究补回去），
        // 就会出现「重置 → 重买 → 再重置」的无限循环。
        // 3 s 窗口只抑制这种同快照抖动：一旦这一关的完成次数真的变了（例如现实重置后
        // 从 5 回到 0 再打回 5），快照不同，闸门自动放行。
        const now = Date.now();
        const mark = this._fullEcRespec;
        if (mark && mark.id === unlockedId && mark.completions === challenge.completions
          && now - mark.at < 3000) {
          return false;
        }
        this._fullEcRespec = { id: unlockedId, completions: challenge.completions, at: now };
        this._respecCount++;
        respecTimeStudies(true);
        return false;
      }
      return challenge.start(true) === true;
    } catch (e) {
      return false;
    }
  },

  shouldHoldReset() {
    try {
      if (!this.active) return false;
      if (player.challenge.eternity.unlocked !== 0) return false;
      // [Oreki R37-A] 这里原先读死变量 `_ecTarget`（恒 1）→ 只保护 EC1。改读真实目标。
      const id = this.nextUnfinishedEcId();
      if (!id || id > 12) return false;
      const challenge = EternityChallenge(id);
      if (!challenge) return false;
      if (challenge.completions >= challenge.maxCompletions) return false;
      const study = TimeStudy.eternityChallenge(id);
      if (!study) return false;
      if (study.isBought) return false;
      // 守卫一：必须先进入时间研究阶段（TT 已经能攒起来），否则开局会被永久卡住。
      // R22 实测教训：没有这个守卫时，EC1 的入口门槛在开局就不满足，
      // 于是全程不坍缩 → 无限次数为 0、TT 为 0，整局停摆。
      if (Currency.timeTheorems.max.lt(100)) return false;
      // 守卫二：只差「二级资源」时才值得暂停。
      // EC 研究的主前置是某条时间研究（config.requirement），
      // 若连这条研究都没买上，暂停坍缩也换不来进度，反而拖死开局。
      const primaryMet = (study.config.requirement || []).some(s => {
        try {
          return TimeStudy(s).isBought;
        } catch (e) {
          return false;
        }
      });
      if (!primaryMet) return false;
      return !study.isEntryGoalMet;
    } catch (e) {
      return false;
    }
  },

  /**
   * G) 自动永恒（带 EC 入口保护）。
   *
   * 为什么需要：原版没有「自动永恒」，玩家必须手动点；而 10000× 下永恒收益变化极快，
   * 新手不可能一直盯着。更重要的是——**永恒会把 EC 的入口采样清空**：
   * `eternity()` 里有一行 `ECTimeStudyState.invalidateCachedRequirements();`（eternity.js:147），
   * 它会丢掉 `requirementCurrent` 缓存的「本次运行内观察到的最高资源值」。
   * EC3 的入口要求是 `AntimatterDimension(8).totalAmount >= 17300`
   * （ec-time-studies.js:35-36，且每完成一次 +1250），这个量必须**在一次永恒之内**爬到，
   * 一旦中途永恒就前功尽弃 —— 这正是实测「EC2 满级后永远进不去 EC3」的直接原因。
   *
   * 所以：当「下一个未完成的 EC」的**主研究已经买好、只差入口资源**时，
   * 暂停自动永恒（但**不暂停大坍缩**，坍缩不影响 totalAmount 的峰值记录，
   * 而且 EC1/EC2 需要的永恒次数增长不能被拖慢 —— R22 实测过全局暂停坍缩是反效果）。
   *
   * 其余情况按「EP 收益 ≥ 当前 EP 的 10 倍」才永恒，避免无意义的频繁重置。
   */
  nextUnfinishedEcId() {
    try {
      // [Oreki R38-A] IU15 冲刺期间**永远不重打 EC7**。
      // 事实：`TimeDimensions.tick()` 末尾
      //   EternityChallenge(7).reward.applyEffect(p => InfinityDimension(8).amount += p * diff/1000)
      // （time-dimension.js:331-335）只要 EC7 有完成次数就会持续生产 ID8，
      // 而 `InfinityDimensions.tick()` 又把 ID8→ID7→…→ID1 逐层生产
      // （infinity-dimension.js:373-375）。⇒ 只要 EC7 完成过，ID1 的 amount 必然 > 0，
      // `player.requirementChecks.reality.maxID1` 同帧变正，IU15 永久失败。
      // 现实重置会清空 EC 完成记录，所以「不重打 EC7」= ID1 全程恒 0。
      const skipEc7 = (() => {
        try { return globalThis.OrekiIu15Sprint?.skipEc7 === true; } catch (e) { return false; }
      })();
      for (let id = 1; id <= 12; id++) {
        if (id === 7 && skipEc7) continue;
        const challenge = EternityChallenge(id);
        if (challenge && challenge.completions < challenge.maxCompletions) return id;
      }
      return 0;
    } catch (e) {
      return 0;
    }
  },

  /** 下一个 EC 是否「只差入口资源」（主研究已买、但二级门槛未满足） */
  ecEntryPending() {
    try {
      if (!this.active) return false;
      if (player.challenge.eternity.unlocked !== 0) return false;
      const id = this.nextUnfinishedEcId();
      if (!id) return false;
      // [Oreki R25] EC4 例外：它的入口是 `Currency.infinitiesTotal`（无限次数），
      // 而 `Currency.infinities` 每次永恒都会清零，只有 `infinitiesBanked`
      // 会在永恒时按 5% 结算累积（eternity.js:53 + 时间研究 191）。
      // 也就是说「暂停永恒」对 EC4 是**反效果**：攒不到 1e6，反而把唯一的累积途径关掉。
      if (id === 4) return false;
      const study = TimeStudy.eternityChallenge(id);
      if (!study || study.isBought) return false;
      const primaryMet = (study.config.requirement || []).some(s => {
        try {
          return TimeStudy(s).isBought;
        } catch (e) {
          return false;
        }
      });
      if (!primaryMet) return false;
      return !study.isEntryGoalMet;
    } catch (e) {
      return false;
    }
  },

  tickEternity() {
    try {
      if (!this.active) return false;
      // [Oreki R38-A] IU15 冲刺期间禁止永恒：永恒会把反物质指数打回 0，
      // 而 IU15 要求 `antimatter.exponent >= 1.5e12`，只能在同一个大坍缩周期内连续增长。
      try {
        if (globalThis.OrekiIu15Sprint?.freezeResets === true) return false;
      } catch (e) { /* 读取失败不改变既有行为 */ }
      if (!Player.canEternity) return false;
      // [Oreki R26] 现实升级 10「生存延续」的解锁条件是
      //   `Currency.infinityPoints.exponent >= 400 && player.requirementChecks.reality.noEternities`
      // （reality-upgrades.js:146-148），而 `noEternities` 在第一次永恒时就被置 false
      // （eternity.js:96），现实重置又会把它复位为 true。
      // 自动永恒默认在 `Player.canEternity`（IP = 1.797e308，指数 308）就立刻触发，
      // 永远差 92 个指数 → 这条现实升级在**每一次现实**里都拿不到
      // → 成就 147「购买所有的现实升级」永远不成立 → Teresa 永远不出现。
      // 这里只在「还没拿到 RU10」时，把本现实运行里的第一次永恒压到 IP 指数 ≥ 400。
      if (this.holdForRealityUpgrade10()) return false;
      // 入口保护：只在「主研究已买、只差资源」时生效，不拖慢 EC1/EC2 的永恒次数增长
      if (this.ecEntryPending()) return false;
      if (gainedEternityPoints().lt(Currency.eternityPoints.value.times(10))) return false;
      return eternity(false, true) === true;
    } catch (e) {
      return false;
    }
  },

  /**
   * 是否应该为了现实升级 10 压住第一次永恒。
   * 只读判断 + 会话内计时；**最多压 10 秒**，避免 IP 被自动买无限维度花掉时把这局卡死。
   */
  _ru10HoldSince: 0,

  holdForRealityUpgrade10() {
    try {
      const noEternitiesYet = player.requirementChecks.reality.noEternities;
      const upg = RealityUpgrade(10);
      const stop = !noEternitiesYet || !upg || upg.isAvailableForPurchase || upg.isBought ||
        player.eternities > 0 || Currency.infinityPoints.exponent >= 400;
      if (stop) {
        this._ru10HoldSince = 0;
        return false;
      }
      if (!this._ru10HoldSince) this._ru10HoldSince = Date.now();
      if (Date.now() - this._ru10HoldSince > 10000) {
        this._ru10HoldSince = 0;
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * H) 仅针对 EC3 的「窄保护」：暂停大坍缩，让第八反物质维度在一次坍缩周期内爬够 17300。
   *
   * 为什么只做 EC3、且只暂停坍缩：
   * - `AntimatterDimension(8).totalAmount`（antimatter-dimension.js:514）是
   *   `amount.max(continuumAmount)`，而每次大坍缩都会 `reset()` 把 amount 清零，
   *   所以这个值只能在**两次坍缩之间**积累。R23 实测：AD8 数量长期为 0、
   *   EC3 采样只到 10/17300 —— 因为自动坍缩按「10× 最高 IP」触发，周期太短。
   * - 但 R22 已实测：全局暂停坍缩会拖慢 EC1/EC2 需要的永恒次数增长（反效果）。
   *   所以这里把条件收窄到「下一关就是 EC3、主研究 171 已买、入口还没达标」。
   * - 不暂停永恒：EC3 的门槛是维度数量，不是跨永恒的累计量；而永恒会影响 AD8 重建速度，
   *   这里只关掉坍缩这一个变量，便于定位。
   *
   * 退出条件（任一满足即恢复坍缩）：
   *   1) EC3 入口达标（isEntryGoalMet 为真）
   *   2) EC3 已买上（isBought）或已进入/完成
   *   3) 下一关不再是 EC3
   *   4) 不在自动化窗口（挑战中 / 毁灭现实 / 总开关关闭 / 已解锁 Reality）
   */
  shouldHoldCrunch() {
    try {
      if (!this.active) return false;
      if (player.challenge.eternity.unlocked !== 0) return false;
      if (this.nextUnfinishedEcId() !== 3) return false;
      const study = TimeStudy.eternityChallenge(3);
      if (!study || study.isBought) return false;
      const primaryMet = (study.config.requirement || []).some(s => {
        try {
          return TimeStudy(s).isBought;
        } catch (e) {
          return false;
        }
      });
      if (!primaryMet) return false;
      return !study.isEntryGoalMet;
    } catch (e) {
      return false;
    }
  },

  /**
   * I) EC6 的入口是「复制器星系 ≥ 1」（ec-time-studies.js:71，AD15 已按 /100 缩放）。
   *
   * 为什么必须单独处理（R25 实测 + 源码核对）：
   * 1. `Replicanti.galaxies.max = ReplicantiUpgrade.galaxies.value + extra`
   *    （replicanti.js:550-552），而 `value` 就是 `player.replicanti.boughtGalaxyCap`，
   *    初始 0；`extra` 来自时间研究 131，效果是 `floor(boughtGalaxyCap / 2)` = 0。
   *    所以不先买「复制器星系上限」升级，上限恒为 0 → `canBuyMore` 恒 false → 永远 0 个。
   *    R25 实测末态 `repGalMax: 0`、`repGal: 0`。
   * 2. 复制器星系的自动购买器在**买到时间研究 131 后被硬性禁用**：
   *    `ReplicantiGalaxyAutobuyerState.isEnabled` 是
   *    `Achievement(138).isUnlocked || !TimeStudy(131).isBought`（replicanti-galaxy-autobuyer.js:16）。
   *    自动化为了推进研究树一定买了 131 → 自动器永久关闭（R25 实测 rgAutoOn = false）。
   *    这里直接走原版手动购买函数 `replicantiGalaxy(true)`（它本身只校验
   *    `RealityUpgrade(6)` 与 `canBuyMore`，不受自动器开关影响），不伪造任何状态。
   * 3. `player.replicanti.galaxies` 会被 `Replicanti.reset()`（eternity.js:120）清零，
   *    所以只在下一次 EC 就是 EC6 时才刷，避免每帧拖慢别的关。
   */
  tryReplicantiGalaxyForEc6() {
    try {
      if (!this.active) return false;
      if (this.nextUnfinishedEcId() !== 6) return false;
      const study = TimeStudy.eternityChallenge(6);
      if (!study || study.isBought) return false;
      const primaryMet = (study.config.requirement || []).some(s => {
        try {
          return TimeStudy(s).isBought;
        } catch (e) {
          return false;
        }
      });
      if (!primaryMet) return false;
      if (EternityChallenge(6).completions >= EternityChallenge(6).maxCompletions) return false;
      let did = false;
      if (Replicanti.galaxies.bought < 1) {
        if (Replicanti.galaxies.max < 1) {
          // 上限升级（1e170 IP 起，成本对当前进度可以忽略）
          ReplicantiUpgrade.galaxies.purchase();
          did = true;
        }
        // `replicantiGalaxy()` 内部自己做 canBuyMore（复制器数量 ≥ 1.8e308）校验
        if (Replicanti.galaxies.max >= 1) {
          replicantiGalaxy(true);
          did = did || Replicanti.galaxies.bought >= 1;
        }
      }
      if (Replicanti.galaxies.bought >= 1 && !study.isBought) {
        // [R25] 必须在**同一个函数调用里**把 EC6 研究买掉：
        // `player.replicanti.galaxies` 每次永恒都会被 `Replicanti.reset()` 清零
        // （eternity.js:120），而永恒自动化每帧都在跑（et 每秒几千次）。
        // 若留到 20 帧一次的 EC 循环再买，`requirementCurrent` 缓存早被
        // `invalidateCachedRequirements()` 清掉，又要重新攒 —— 与 AD16 修的是同一类
        // 「同帧被重置冲掉」问题。
        study.purchase();
        did = true;
      }
      return did;
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
      // 换列（121 ↔ 123）或换维度分叉（71 ↔ 73）只能靠 respec：
      // 这些研究互斥，买了一条就再也买不到另一条
      if (this.needsBranchRespec()) {
        respecTimeStudies(true);
      } else {
        studies = this.buyTimeStudies();
        dilation = this.buyDilationStudies();
      }
    }
    this.tryReplicantiGalaxyForEc6();
    // EC 的进入会触发 eternity 重置，节流到每 20 帧才尝试一次
    if (this._frame % 20 === 0) ec = this.buyEcStudiesAndStart();
    return { dims, tt, studies, dilation, ec };
  },
};

// 便于真实新档脚本观测内部判定（例如 ecEntryPending / nextUnfinishedEcId），
// 与 oreki-reality-automation.js 的做法一致；不参与任何游戏逻辑。
try {
  globalThis.OrekiEternityAutomation = OrekiEternityAutomation;
} catch (e) {
  // 非浏览器环境忽略
}
