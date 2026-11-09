// [Oreki R35-A2] 深度挑战阶段 → DS1（膨胀研究 1）→ 真实膨胀。
//
// ── 为什么需要（R35-A2 实测，不是静态推导）────────────────────────────
// R35-A 两次真实新档（`_r35a-vgate.jsonl` 129 样本 / `_r35a2-diag-a.jsonl` 50 样本）实测：
//   · `ecDone` 的尾部**永远**是 `5,5,5,5,5,5,5,5,5,5,5,0` —— EC1~EC11 每轮都能打满，
//     **只有 EC12 恒为 0**；
//   · `gDS1=false`、`gMaxDT="0"`、`dtL=null`，`gates.notUnlocked` 一路上涨、`passed` 恒 0。
// 因果链（逐条对齐源码）：
//   1. `PlayerProgress.dilationUnlocked()` = `player.dilation.studies.includes(1)`（DS1），
//   2. DS1 要求 `[231,232,233,234].some(isBought)` ∧ `EC11/EC12 各 5 次` ∧ `maxTT ≥ 12900`
//      （secret-formula/eternity/time-studies/dilation-time-studies.js:3-19），
//   3. EC12 恒 0 ⇒ DS1 永远买不到 ⇒ `dilationUnlocked()` 恒 false ⇒ `thisReality.maxDT` 恒 0
//      ⇒ V 的 `dilatedTime` 项恒 0 ⇒ V 永不解锁。
//
// ── EC12 为什么恒 0（实测证据）──────────────────────────────────────
// `_r35a2-diag-a.jsonl` 每个样本都同时记录了 12 个判定位：
//   t=24s  `ec12 {canBuy:false, reqMet:true, forb:true}`  ← 233 已买，但 **71 还在树里**
//   t=36s  `ec11.c=5, ec12 {canBuy:false, forb:true}`     ← EC11 刚打满，仍需 respec 换分叉
//   t=48s  `realities 0→5, studiesN=0`                     ← **现实在这一刻清空了整棵树**
// 也就是说：EC11→EC12 之间必须做一次 `respecTimeStudies` 换掉维度分叉 71→73
// （EC11 的 `forbiddenStudies=[72,73]`、EC12 的 `forbiddenStudies=[71,72]`，
//  ec-time-studies.js:131 / :141），重建 233 那条链需要若干帧，而自动现实
// 每 ~25 s 就把 `player.eternityChalls` + 时间研究整批清空（reality.js:651/666/673），
// 于是「respec → 重建 → 买 EC12 研究 → 进入」这个窗口永远被现实打断。
//
// ── 本模块做的事（全部走原版真实路径）────────────────────────────────
// ① **深度挑战阶段**：`EC11.completions < 5 || EC12.completions < 5` 时压住现实
//    （压现实的判定只有一处，见 `hold`——现实自动化与 `tickDilation` 共用它）。
// ② 按 9 → 10 → 11 → 12 的顺序推进，每关满 5 次才切下一关（`_targetEc`）。
//    进入用原版 `EternityChallenge(id).start(true)`，买研究用 `purchase(true)`，
//    换分叉用原版 `respecTimeStudies(true)`；**不写任何解锁位 / 完成次数**。
// ③ EC11/EC12 都满后，真实购买 `TimeStudy(231~234)` 中尚缺的一个，再买 DS1。
// ④ DS1 到手后由 `OrekiCelestialAutomation.tickDilation()` 真实启动膨胀并播种速子粒子，
//    本模块只负责「压现实」让 `maxDT` 在同一个现实里攒到 `1e30`（否则 reality.js:696 清零）。
//
// ── 三条防死锁护栏 ──────────────────────────────────────────────────
// ① 总时长上限 240 s；② EC 完成总数 90 s 不动即放手一轮（60 s 冷却）；
// ③ 达标后 20 s 宽限（让同帧稍后的 V 检查看到六项同时成立）后放手。
// 早期（realities < V 门槛）压现实有累计时长预算（EARLY_HOLD_BUDGET_MS），花完必须让现实跑起来，
// 否则 `realities` 永远攒不到 V 的 200 次门槛 —— 这是 R33 的教训（压现实压死进度）。

import { PlayerProgress } from "./player-progress.js";
import { OrekiEternityAutomation } from "./oreki-eternity-automation.js";
import { OREKI_V_UNLOCK_REALITIES, OREKI_V_UNLOCK_DILATED_TIME } from "./secret-formula/celestials/v.js";
import { VUnlocks } from "./celestials/V.js";
import { Laitela } from "./celestials/laitela/laitela.js";

/**
 * 深度挑战的推进顺序（每关打满 5 次才切下一关）。
 *
 * [Oreki R50] 9~12 → **8~12**。
 * R49 及以前这里是 `[9, 10, 11, 12]`，而 EC8 交给「通用永恒自动化」按顺序推。
 * 实测（R50 隔离新档 `_r50/r50-diag1.jsonl`，t≈400 s）证明那条路走不通：
 *   · `ecDone = [5,5,5,5,5,5,5,0,0,0,0,0]` —— EC1~EC7 每轮都能打满，**EC8 恒 0**；
 *   · `player.reality.unlockedEC = 62`（只有 EC1~5 的解锁位）；
 *   · `TimeStudy(123)`（EC8 的 `config.requirement`）从没买过 ⇒
 *     `TimeStudy.eternityChallenge(8).canBeBought` 恒 false（ec-time-study.js:83）。
 * 因为自动现实每几秒就把 `player.eternityChalls` 与整棵研究树清空（reality.js:651/673），
 * 通用路径永远停在 EC7。EC8 必须和 9~12 一样由本模块在「压住现实」时推进。
 */
const DEEP_EC_IDS = [8, 9, 10, 11, 12];
/** DS1 的「时间研究前置」：这四个里有任意一个为真即可 */
const DEEP_TT_STUDY_IDS = [231, 232, 233, 234];
/** 压现实总时长上限（真实毫秒） */
const HOLD_MAX_MS = 240000;
/**
 * [Oreki R50 五修] 深层 EC 链（EC8~EC12）单次压现实的上限：480 s。
 *
 * 原 240 s 对「EC8→9→10→11→12 各打满 5 次」常常不够：单关要买研究、被互斥分叉挡住要 respec、
 * 再进关打 5 次，5 关串起来容易越过 240 s；一超时就放手，而现实立刻清空 `eternityChalls`，
 * 已经打下的进度全部作废（`r50-fresh4` t=1350 s：ecs 只在 5~8 之间来回）。
 * 这里只放宽「总时长」这一条，`HOLD_STALL_MS`（90 s 无新完成即放手）不变——
 * 真卡住照样会放手，不会把现实永久压死。
 */
const DEEP_EC_HOLD_MAX_MS = 480000;
/** EC 完成总数停滞多久就放手（真实毫秒） */
const HOLD_STALL_MS = 90000;
/** 放手后的冷却（真实毫秒），避免刚放手又立刻压回去 */
// [Oreki R40-A2] 60000 → 10000。实测（`_tools/_r40/r40a2-t1.jsonl`）：
//   5 次 release 各带 60 s 冷却 ⇒ 0~484 s 里有 **300.1 s（62% 的时间）**处于冷却态；
//   而 `realities` 刚好在 release 后 24 s 就到达 60，冷却却要再压 36 s 才肯放手，
//   于是 V 被拖到 484.5 s（R39 是 407.6 s）。冷却只需要避开「刚放手立刻压回去」的抖动，
//   10 s 足够。
const HOLD_COOLDOWN_MS = 10000;
/** 达标后继续压住现实的宽限（真实毫秒） */
const HOLD_GRACE_MS = 20000;
/**
 * 早期（realities 未达 V 门槛）**累计**压现实的时长预算（真实毫秒）。
 *
 * [Oreki R37-A] 原来是「最多演练 2 次」（MAX_EARLY_ATTEMPTS=2）。实测
 * `_r37a/r37a-long1.jsonl`：t=143 s 时 realities 已经 5 次、EC12 仍是 0、DS1 从未买到，
 * 因为 2 次演练用完后再也不压现实，而每次现实都会把 EC 记录清空（reality.js:651），
 * 于是「EC12 打满 → 买 DS1」这条链再没有任何机会。
 * 改成「累计预算」：只要还没花完 120 s，就继续在 EC11 满的时候尝试；
 * 花完就彻底放手让 realities 涨到 V 的门槛。既不会无限压死现实，也不会只赌两次。
 */
const EARLY_HOLD_BUDGET_MS = 120000;
/** 早期单次压现实的上限（真实毫秒）：比终局期的 240 s 短，避免一次就吃掉半个预算 */
const EARLY_HOLD_MAX_MS = 45000;
/** 驱动节流：EC 入口/购买每 400 ms 一次，研究树补路每 1000 ms 一次，respec 每 6 s 一次 */
const DRIVE_INTERVAL_MS = 400;
const TREE_INTERVAL_MS = 1000;
const RESPEC_INTERVAL_MS = 6000;

export const OrekiDilationAutomation = {
  /** 本轮压现实的起点（0 = 当前未压） */
  _holdSinceMs: 0,
  /** 最近一次「EC 完成总数发生变化」的时刻 */
  _progressAtMs: 0,
  /** 最近一次观测到的 EC 完成总数（EC11+EC12，够用且便宜） */
  _progressMark: -1,
  _cooldownUntilMs: 0,
  _achieveAtMs: 0,
  /** [Oreki R37-A] 早期压现实已用时长 / 本次压现实是否为早期阶段 */
  _earlyHoldUsedMs: 0,
  _holdIsEarly: false,
  _deepRunAchieved: false,
  _lastDriveMs: 0,
  _lastTreeMs: 0,
  _lastRespecMs: 0,
  _actions: 0,
  _releases: 0,
  _lastRelease: "",
  _phase: "idle",
  _lastStart: 0,
  /** 最近一次被吞掉的异常（只读观测用，绝不影响判定） */
  _lastError: "",
  /** 最近一次驱动落在哪一步（只读观测用） */
  _step: "",

  /** EC11 / EC12 还没打满 → 需要深度挑战阶段 */
  get ecDepthNeeded() {
    try {
      return !EternityChallenge(11).isFullyCompleted || !EternityChallenge(12).isFullyCompleted;
    } catch (e) {
      return false;
    }
  },

  /** DS1 已买且本现实 `maxDT` 已达 V 的门槛 */
  get achieved() {
    try {
      return PlayerProgress.dilationUnlocked() === true &&
        player.records.thisReality.maxDT.gte(OREKI_V_UNLOCK_DILATED_TIME);
    } catch (e) {
      return false;
    }
  },

  _completionMark() {
    try {
      return EternityChallenge(11).completions + EternityChallenge(12).completions;
    } catch (e) {
      return -1;
    }
  },

  _release(reason, cooldown = 0) {
    if (this._holdSinceMs) {
      this._releases++;
      // [Oreki R37-A] 早期压现实按「累计时长」记账（见 EARLY_HOLD_BUDGET_MS）
      if (this._holdIsEarly) this._earlyHoldUsedMs += Date.now() - this._holdSinceMs;
    }
    this._holdIsEarly = false;
    this._holdSinceMs = 0;
    this._progressAtMs = 0;
    this._progressMark = -1;
    this._achieveAtMs = 0;
    this._lastRelease = reason;
    if (cooldown > 0) this._cooldownUntilMs = Date.now() + cooldown;
    return false;
  },

  /**
   * 是否压住自动现实。**这是全仓唯一的一处「深度挑战阶段压现实」判定**：
   * `oreki-reality-automation.js::shouldReality` 与 `tickDilation` 的门禁都读
   * `OrekiCelestialAutomation.holdReality`，而该 getter 只把 `holdRealityForV` 与本 getter
   * 做一次「或」——不存在第二套条件（R34 就是两处各写一套而死锁的）。
   */
  get hold() {
    try {
      if (!player.auto.autobuyersOn) return this._release("off");
      if (Pelle.isDoomed) return this._release("pelle");
      // [Oreki R50] 原来这里是 `if (VUnlocks...isUnlocked) release("v-unlocked")`。
      // 那是**第二个死锁**：V 解锁后本模块整体停机，但 IU25（解锁佩勒）的
      // `checkRequirement`（imaginary-upgrades.js:362-363）要求
      // `TimeStudy.reality.isBought`（DS6），而 DS6 在膨胀树里 ⇒ 必须先有 DS1
      // ⇒ 必须先把 EC11/EC12 打满。V 一解锁就停 ⇒ EC8~EC12 再没人推 ⇒ DS1 永远没有
      // ⇒ IU25 永远买不上 ⇒ 佩勒与终局永远到不了。
      // 实测（R50 `r50-save1`，V 已解锁后 3 分钟）：`ds1=false / ds6=false /
      // tp=0 / maxDT=0 / laiDim=0(已到 tier 8) / iu25=false`，卡在 laitela 阶段。
      // 现在改成「IU25 买到才算这条链结束」。
      if (ImaginaryUpgrade(25).isBought) return this._release("iu25-bought");

      // ── [Oreki R50 web · 八修] 莱特拉刷层窗口（tier 0~7）里不再压现实 ──────────
      //
      // 【实测】`r50-fresh9-lai.jsonl`（500 ms 粒度，真实新档）逐帧对账：
      //   · t=506 s 莱特拉解锁 → t=820 s 进佩勒，这一段 314 s 里本模块的 `hold` 一直为真
      //     （`holdDeep=true / holdForV=false / laiHold=false`，来源唯一）；
      //   · 每一次 `difficultyTier++` 之后，`entropy` 被 `laitelaRealityTick` 置 -1，
      //     而**只有一次现实重置能把它清回 0**（reality.js:701），
      //     ⇒ 每上一层都必须先让现实跑一次；
      //   · 但 `hold` 把现实压住：实测 tier1→2 等了 40 s、tier2→3 等了 56 s、
      //     tier3→4 等了 36 s，而现实在 hold 放手的 10 s 窗口里 4 s 内就能完成。
      //
      // 为什么这段压现实是**纯开销**：本模块压现实的唯一目的是让
      //   ① `maxDT ≥ 1e30`（V 的 dilatedTime 判据）与 ② DS1/DS6 在位（IU25 的 checkRequirement）
      //   在同一个现实内成立。而进入莱特拉阶段的前提是 IU15 已买（`Laitela.isUnlocked`），
      //   IU15 在 `OrekiIu15Sprint` 里就要求 `VUnlocks.vAchievementUnlock` 已解锁
      //   ⇒ **V 此时必然已经解锁**，`maxDT` 判据再也不会被读；而 IU25 只在 tier 8
      //   才需要 DS6（`driveLaitela` 的 `ready = ds6 && im >= cost`）。
      //   ⇒ tier 0~7 这一段里「压现实重建 EC 链 → 买 DS1 → 攒 maxDT」没有任何消费者，
      //     却把现实节奏从 ~15 s 拉到 ~40 s，而莱特拉的每一层都靠现实推进。
      //
      // 有界性：判据只读三个原版位（V 解锁 / 莱特拉解锁 / `maxAllowedDimension !== 0`），
      // 一旦 tier 到 8（`Laitela.isFullyDestabilized`）本分支自动失效，hold 立刻恢复，
      // EC 链 → DS1 → DS6 照旧重建，`driveLaitela` 的 IU25 通路不受影响。
      // 不会出现「放开了就再也压不回去」的活锁。
      if (VUnlocks.vAchievementUnlock.isUnlocked && Laitela.isUnlocked && !Laitela.isFullyDestabilized) {
        return this._release("laitela-tiers");
      }

      const now = Date.now();
      if (this._cooldownUntilMs && now < this._cooldownUntilMs) return false;

      // V 的第一项门槛是 realities ≥ 60（R37-A 由 200 下调，见 `OREKI_V_UNLOCK_REALITIES`）。
      // 没到之前压现实等于把现实次数按死，
      // 所以只允许极少数早期演练，其余时间必须让现实照常循环。
      // 注意：`Currency.realities.value` 在本工程里是**普通数字**（不是 Decimal），
      // 直接 `.gte()` 会抛 `is not a function` —— 第一次 300 s 真跑就是这么静默失效的，
      // 所以这里统一走 `Decimal.gte`，两种类型都能吃。
      //
      // [Oreki R50] 这一行从下方前移到 hold 判据之前（原来在 EC11 门禁之后），
      // 因为下面新加的「EC8 通路」要用它。
      const atGate = Decimal.gte(Currency.realities.value, OREKI_V_UNLOCK_REALITIES);

      // 只在**真的打到深层**时压现实。EC11 打满说明 EC1~EC10 已经全部到位，
      // 剩下只有 EC12 → DS1 这条短链；此时压现实的代价最小（实测每轮只多花 ~20 s），
      // 而收益最大（现实每 ~25 s 就会把 EC 记录与整棵研究树清空）。
      //
      // ── [Oreki R50] 打破「要 hold 才能打 EC11，要 EC11 才能 hold」的闭环 ──────
      //
      // 原来的判据是 `if (!EternityChallenge(11).isFullyCompleted) release("shallow")`，
      // 而推进 EC8~EC12 的 `_driveEcChain()` **只在 hold 为真时被 `tick()` 调用**（:407-411）。
      // 实测后果（R50 `r50-diag1`，真实新档 t=400 s）：realities 已 115、TT 1.5e7、
      // `hold` 恒 false（`lastRelease="shallow"`、`releases=4`），
      // `gates.notUnlocked=8583` —— 一帧都没进过 EC8，DS1/maxDT/V 全部为 0，
      // 整局永久停在 `celestialsEnslaved`。这不是「天神死锁」，是 EC 驱动缺失。
      //
      // 新判据：EC11 未满时，只要 **EC1~EC7 已全部 5/5** 且 **现实次数已过 V 门槛**，
      // 就允许压现实，让 `_driveEcChain()` 去把 EC8~EC12 打穿。
      // 不放开到更早阶段的原因：realities < 60 时压现实会按死 V 的第一项门槛，
      // 而 EC1~EC7 没满说明通用路径还在有效推进，没必要抢它的窗口。
      // 防无限压死：`HOLD_MAX_MS`（240 s 总时长）、`HOLD_STALL_MS`（90 s 无完成即放手）、
      // `HOLD_COOLDOWN_MS`（10 s 冷却）三条护栏都在下面原样生效。
      // ── [Oreki R50 五修] 过了 V 门槛就不再要求「EC7 已满」才肯压现实 ──────────
      //
      // 原判据 `!(ec7Done && atGate)` 要求「本现实里 EC1~EC7 全部 5/5」才允许压住现实，
      // 但现实每 8~15 s 就把 `player.eternityChalls` 整批清空（reality.js:651），
      // 于是每个现实开头 `ec7Done` 必为 false → 立刻 `_release("shallow")` →
      // `_driveEcChain()` 一帧都进不去 → EC8~EC12 永远打不满。
      // 实测三份真实新档（`r50-fresh2` 163 次释放、`r50-fresh4` 62 次释放）都是这个循环；
      // `r50-fresh1` 只在偶然的一轮里凑够 EC7 才侥幸走通（V 在 2044 s）。
      //
      // 门槛前（realities < 60）仍然只走老路径：那时压现实会把 V 的第一项判据按死。
      // 过门槛后 `realities` 已远超 60，压现实不再伤 V 的任何一项，此时**EC 深度才是唯一瓶颈**，
      // 所以只要深层 EC 未满就压住，让 `_driveEcChain()` 真正把这 5 关打完。
      // 防压死仍由 `HOLD_STALL_MS`（90 s 无新完成即放手）与 `HOLD_MAX_MS` 系列兜底。
      if (!EternityChallenge(11).isFullyCompleted && !atGate) {
        return this._release("shallow");
      }
      // 门槛前的压现实（只有「EC11 已满」这条老路径才可能走到这里）仍受累计预算约束。
      if (!atGate && this._earlyHoldUsedMs >= EARLY_HOLD_BUDGET_MS) return this._release("grow-realities");

      // ── [Oreki R50] 膨胀链收尾即放手，把现实还给「RM→IM」的产出 ──────────────
      //
      // 事实：IU25 要 `OREKI_IU25_COST = 5e9` 的虚幻机器，而 IM 只从现实产出的 RM 换算
      // （`machines.js:31-45/103-106`）。压住现实就不再产生 RM ⇒ IM 停滞 ⇒ IU25 永远差钱。
      // 实测（R50 `r50-save1`）：EC 已全 5/5、`ds1=true` 之后 `hold` 仍然一直是 true，
      // 现实被压住，`im` 停在 1.7e9 不动。
      // 所以：**DS1 与 DS6 同时在手**就立刻放手一个现实周期；下一次现实把研究树清空后
      // `ds1/ds6` 变 false，hold 会自动重新压住并把 EC8~EC12 再打一遍。
      //
      // ⚠️ [Oreki R50 二修] 但**IM 已经够 IU25 的那一刻不能放手**。
      // 实测（同一份存档，`im` 抬到 5.29e9 之后）：一放手 → 现实立刻重置 →
      // `ds1/ds6` 双双清零 → 下一轮 EC 全链又要重打，而 `driveLaitela` 要求
      // 「DS6 在位 且 IM 够」同一帧成立 ⇒ 70 秒里 `ds6` 一次都没再为真，IU25 永远差临门一脚。
      // 所以 IM 达标时改为继续压住现实，让 DS6 留在位，由 endgame 模块起 run 并买 IU25；
      // IU25 一买上 `hold` 会在最上面按 `iu25-bought` 释放，不会永久压死现实。
      // ── [Oreki R50 三修] 放手的前提是「膨胀真的跑起来过」，不是「DS1/DS6 在手上」──
      //
      // 原判据：DS1 与 DS6 同时在手且 IM < IU25 成本 → 立刻放手。
      // 实测（`r50-fresh2`，2840 s 真实新档）：t=90 s 买到 DS1、t=110 s 就被现实清空，
      // 此后 2700 s 里 `maxDT` 恒 0，形成「打 EC 链 → 拿到 DS1/DS6 → 立刻放手 →
      // 现实清空 dilation.studies → 重打」的活锁：`releases` 走到 163、
      // `_phase` 在 idle/deep-ec 之间反复、EC11 永远打不满。
      // 这不是「慢」而是**链式死锁**：
      //   maxDT=0 ⇒ V 的 `dilatedTime` 项恒 0 ⇒ V 永不解锁
      //   ⇒ `OrekiIu15Sprint.canArm` 恒 false（它要求 `vAchievementUnlock`）
      //   ⇒ IU15 永不买 ⇒ 莱特拉永久锁 ⇒ IU25/佩勒/终局全部不可达；
      // 同时缺膨胀乘数 ⇒ `maxEP` 只到 1e3872681 ⇒ `log10(uncappedRM)=2907`
      //   ⇒ `baseIMCap=1.09e9`，而 `player.reality.iMCap` 只升不降、冻结在 2.7159e9
      //   ⇒ IM 天花板 2.72e9 < IU25 成本 5e9，钱也永远不够。
      //
      // 新判据：**只有 `achieved`（`maxDT ≥ OREKI_V_UNLOCK_DILATED_TIME`）之后**才允许
      // 放手去产出 RM→IM。未达标就继续压住，让 `tickDilation()` 真正启动膨胀。
      // 同时不再要求 DS6：V 的 `dilatedTime` 判据只读 `records.thisReality.maxDT`，
      // 实测 `r50-fresh1` 全程没买过 DS6（`ds6` 从未为 true）却照样解锁了 V。
      // 未 achieved 时**不 return**，落回下面的 `HOLD_MAX_MS` / `HOLD_STALL_MS` 护栏，
      // 不会把现实永久压死。
      if (PlayerProgress.dilationUnlocked()) {
        // ── [Oreki R50 七修] 「IM 够 + 莱特拉已解锁」也不许无限压住 ────────────
        //
        // 六修在这里 `return true`，实测（`r50-fresh5`）确实把 V/IU15/莱特拉一路打到位
        // （t=445 s 进莱特拉阶段，比 r50-fresh1 的 2044 s 快 4.6 倍），但随即卡死：
        // `im=5.25e9 ≥ IU25 成本`、`ds6=true`、`tier=4`、`laiRun=false`，
        // `realities` 从 t≈730 s 起冻在 80 到 1225 s **一动不动**（500 秒）。
        // 原因是 IU25 的判据是「在莱特拉的现实中……达成现实」——它**需要一次现实**
        // 才能真正结算，而压住现实恰好把这件事挡死；`driveLaitela` 又没能在窗口内
        // 把 tier 推到 8 并起 run。于是「为了留住 DS6 而压住」变成「压住导致永远买不到」。
        //
        // 结论：压现实最多只能是一个**有界窗口**（下方 `HOLD_GRACE_MS` 的 20 s），
        // 用它让同帧的 V / IU25 检查看到 maxDT 与 DS6，之后必须放手让现实跑起来。
        // 所以这里不再 `return true`，一律落到宽限分支。
        if (!this.achieved) this._progressAtMs = now;
      }

      // ── [Oreki R40-A2] 曾经想在这里加「DS6 已到手就放手」，**实测否决，不要再加** ──
      //
      // 动机：`_r40/r40a2-t1.jsonl` 显示 DS6 在 25.1 s 就买到，此后 5 段压现实共 139.4 s
      //   `realities` 一动不动，`realities=60` 被拖到 446.5 s（R39 是 362.6 s）。
      //   看上去「档位前压现实 = 把门槛冻住，纯亏」。
      //
      // 两次真跑都失败（证据在 `_tools/_r40/`）：
      //   ① 判据用 `EternityChallenge(11) && (12).isFullyCompleted`（`r40a3-d1v1-rejected.log`）：
      //      `[FIRST] ds1 t=23.6s` 时链已满，但 DS6 还要再等 `231~234 + TT` 约 1.5 s；
      //      这 1.5 s 一放手，现实立刻清空研究树 ⇒ **全程 ds6 一次都没出现过**。
      //   ② 判据改用 `TimeStudy.reality.isBought`（`r40a3-d1v2-rejected.log`）：
      //      DS6 保住了、`realities=60` 也提前到 380 s（省 66 s），**但 V 反而解不开**——
      //      641 s 时 `VUnlocks` 六项里 `infinities` 只有 **0.063**（1e121 / 要求 1e160），
      //      而基线 r40a2-t1 在 484.5 s 就 V=1。
      //      根因：那几段「白压」同时也是**每个现实内攒产能的窗口**（复制器 1e20000、
      //      无限次数 1e160 这些 per-reality 记录），放手太勤 ⇒ 20 s 一轮现实 ⇒ 产能记录
      //      永远长不起来 ⇒ V 的其余五项反而永远不达标。
      //
      // 结论：**门槛前的压现实不是纯浪费，它是「产能窗口」与「现实次数」的交换**。
      //   一句话记牢：**V 的 maxDT / maxReplicanti / infinitiesTotal 全是
      //   `records.thisReality.*`，每一个现实都会清零，放手太勤就永远长不起来。**
      //   要动只能动冷却（见下面的 HOLD_COOLDOWN_MS）与「达标后立刻放手」，
      //   不能动「门槛前是否压」。

      if (!this._holdSinceMs) {
        this._holdSinceMs = now;
        this._progressAtMs = now;
        this._progressMark = this._completionMark();
        this._achieveAtMs = 0;
        this._holdIsEarly = !atGate;
      }

      // 达标后的宽限：`game.js:884` 的现实自动化**先于** `:887` 的天神 tick，
      // 而 V 的六项检查在后者里。放手太早，同帧的现实会把 `maxDT` 清零（reality.js:696），
      // V 检查看到的永远是 0。
      if (this.achieved) {
        this._deepRunAchieved = true;
        if (!this._achieveAtMs) this._achieveAtMs = now;
        if (now - this._achieveAtMs > HOLD_GRACE_MS) {
          return this._release("grace-after-achieve", HOLD_COOLDOWN_MS);
        }
        return true;
      }
      this._achieveAtMs = 0;

      const holdMax = this._holdIsEarly
        ? EARLY_HOLD_MAX_MS
        : (this.ecDepthNeeded && atGate ? DEEP_EC_HOLD_MAX_MS : HOLD_MAX_MS);
      if (now - this._holdSinceMs > holdMax) {
        return this._release("timeout", HOLD_COOLDOWN_MS);
      }

      const mark = this._completionMark();
      if (mark > this._progressMark) {
        this._progressMark = mark;
        this._progressAtMs = now;
      }
      if (now - this._progressAtMs > HOLD_STALL_MS) {
        return this._release("stall", HOLD_COOLDOWN_MS);
      }
      return true;
    } catch (e) {
      // 只记录、不抛：压现实判定每帧都被调用，异常不能击穿 gameLoop。
      // （R35-A2 第一次 300 s 真跑就是因为漏了 `VUnlocks` 的 import，
      //   这里每帧抛 ReferenceError 被吞掉，表现为「hold 永远 false」。）
      this._lastError = `hold: ${e && e.message}`;
      return false;
    }
  },

  /** 兼容探针命名（诊断脚本读 `holdRealityForDeepChallenge`） */
  get holdRealityForDeepChallenge() {
    return this.hold === true;
  },

  /** 9 → 10 → 11 → 12：第一关没满 5 次就停在这一关 */
  _targetEc() {
    try {
      for (const id of DEEP_EC_IDS) {
        const ch = EternityChallenge(id);
        if (!ch.isFullyCompleted) return id;
      }
    } catch (e) {
      // 忽略
    }
    return 0;
  },

  /** 目标 EC 是否「前置研究都买了，只是被互斥分叉挡住」 */
  _blockedByForbidden(id) {
    try {
      const st = TimeStudy.eternityChallenge(id);
      if (!st) return false;
      const forb = st.config?.secondary?.forbiddenStudies;
      if (!forb) return false;
      if (!st.config.requirement.some(s => TimeStudy(s).isBought)) return false;
      return forb.some(s => TimeStudy(s).isBought);
    } catch (e) {
      return false;
    }
  },

  /**
   * 推进深层 EC 链。全部走原版函数；只在「已压住现实」时被调用。
   * @returns {object|null} 本次动作（只读观测用）
   */
  _driveEcChain(now) {
    if (now - this._lastDriveMs < DRIVE_INTERVAL_MS) return null;
    if (EternityChallenge.isRunning) { this._step = "ec-running"; return null; }
    this._lastDriveMs = now;

    // 已经买了某一关的研究但从没进去过 / 那一关已满 → 必须 respec 才能买别的关
    const unlockedId = player.challenge.eternity.unlocked;
    if (unlockedId !== 0 && now - this._lastRespecMs > RESPEC_INTERVAL_MS) {
      try {
        const ch = EternityChallenge(unlockedId);
        if (!ch || ch.completions >= ch.maxCompletions) {
          respecTimeStudies(true);
          this._lastRespecMs = now;
          this._step = "respec:completed";
          return { respec: "completed" };
        }
      } catch (e) { this._step = `respec-err:${e && e.message}`; }
    }

    const target = this._targetEc();
    if (!target) { this._step = "no-target"; return null; }
    const st = TimeStudy.eternityChallenge(target);
    if (!st) { this._step = "no-study"; return null; }

    if (st.isBought) {
      if (EternityChallenge(target).start(true) === true) {
        this._actions++;
        this._lastStart = target;
        this._step = `start:${target}`;
        return { start: target };
      }
      this._step = `start-fail:${target}`;
      return null;
    }
    if (st.canBeBought) {
      if (st.purchase(true) === true) {
        this._actions++;
        this._step = `buy:${target}`;
        return { buy: target };
      }
      this._step = `buy-fail:${target}`;
      return null;
    }
    // 只差互斥分叉：EC11 要 71（禁 72/73），EC12 要 73 或什么都不买（禁 71/72）
    this._step = `blocked:${target}:${this._blockedByForbidden(target) ? 1 : 0}:${unlockedId}`;
    if (now - this._lastRespecMs > RESPEC_INTERVAL_MS && this._blockedByForbidden(target)) {
      try {
        respecTimeStudies(true);
        this._lastRespecMs = now;
        this._step = `respec:forbidden-ec${target}`;
        return { respec: `forbidden-ec${target}` };
      } catch (e) { this._step = `respec-err2:${e && e.message}`; }
    }
    // [Oreki R50] EC8~EC12 的「补前置研究」必须走原版 `purchaseUntil()`，不能只靠通用补路。
    //
    // 依据：`ECTimeStudyState.canBeBought`（ec-time-study.js:76-87）的第三条是
    // `config.requirement.some(s => TimeStudy(s).isBought)`——EC8/9/10 分别是 123/151/181。
    // R50 真实新档实测：`TimeStudy(151)`/`TimeStudy(181)` 都买上了，**`TimeStudy(123)` 从没买过**，
    // 于是 `TimeStudy.eternityChallenge(8).canBeBought` 恒 false，EC8 一次都没进过。
    // 通用 `buyTimeStudies()` 是按它自己的优先级补树，不会为了 EC8 专门去点 123 这条分叉。
    //
    // `purchaseUntil()` 是原版「Shift+点击 EC 研究」的入口（ec-time-study.js:54-74）：
    // 先 `purchase()` → `buyStudiesUntil(studiesToBuy[id], id)` 把到该 EC 的整条前置买齐 → 再 `purchase()`。
    // 只在 `unlocked === 0` 时调用：`purchase()` 的第一道闸就是 `unlocked !== 0` 直接 false，
    // 开着别的 EC 时乱动研究树会把当前关的前置拆掉。
    if (unlockedId === 0 && now - this._lastTreeMs > TREE_INTERVAL_MS) {
      this._lastTreeMs = now;
      try {
        st.purchaseUntil();
        if (st.isBought) {
          this._actions++;
          this._step = `purchaseUntil:${target}`;
          return { until: target };
        }
        this._step = `until-fail:${target}`;
      } catch (e) {
        this._step = `until-err:${target}:${e && e.message}`;
      }
      try {
        OrekiEternityAutomation.buyTimeStudies();
      } catch (e) { this._step = `tree-err:${e && e.message}`; }
      return null;
    }
    if (now - this._lastTreeMs > TREE_INTERVAL_MS) {
      this._lastTreeMs = now;
      try {
        OrekiEternityAutomation.buyTimeStudies();
      } catch (e) { this._step = `tree-err:${e && e.message}`; }
    }
    return null;
  },

  /**
   * EC11/EC12 都满之后的收尾：先补一个 231~234，再买 DS1。
   * 两个都是原版 `purchase()`，TT 不够就返回 false（不跳过、不伪造）。
   */
  _buyDs1(now) {
    if (now - this._lastDriveMs < DRIVE_INTERVAL_MS) return null;
    this._lastDriveMs = now;
    try {
      if (!DEEP_TT_STUDY_IDS.some(id => TimeStudy(id).isBought)) {
        for (const id of [231, 233, 232, 234]) {
          try {
            if (TimeStudy(id).purchase()) {
              this._actions++;
              return { tt: id };
            }
          } catch (e) { /* 该 id 暂不可买 */ }
        }
      }
      const ds1 = DilationTimeStudyState.studies[1];
      if (!ds1.isBought && ds1.canBeBought) {
        if (ds1.purchase() === true) {
          this._actions++;
          return { ds1: true };
        }
      }
      if (!ds1.isBought && now - this._lastTreeMs > TREE_INTERVAL_MS) {
        this._lastTreeMs = now;
        OrekiEternityAutomation.buyTimeStudies();
      }
    } catch (e) {
      // 单点异常不击穿主循环
    }
    return null;
  },

  /** 由 `OrekiCelestialAutomation.tick()` 每帧调用 */
  tick() {
    try {
      if (!player.auto.autobuyersOn) return null;
      if (Pelle.isDoomed) return null;
      // [Oreki R50] 同 `hold`：停机条件是「IU25 已买」而不是「V 已解锁」。
      if (ImaginaryUpgrade(25).isBought) { this._phase = "idle"; return null; }

      const now = Date.now();

      // ── [Oreki R37-A] **不压现实时也要买 DS1** ────────────────────────────
      //
      // 事实（R37-A 120 s 真新档实测 `_r37a/r37a-smoke.jsonl`）：DS1 在 t=76.8 s
      // 被买上、t=90 s 起 `maxDT` 已经到 1e11，DT 增速 = `rate × F`（F=10000）。
      // 但在 realities < 200 的整个成长阶段里 `hold` 恒 false（`_release("grow-realities")`），
      // 于是 `tick()` 在第 340 行直接返回，DS1 **一次都不会被买**——R36-D 实测
      // `ds1.canBeBought=true` 而 `isBought=false` 连续 300+ 秒就是因为这一条。
      // DS1 是 `PlayerProgress.dilationUnlocked()` 的唯一来源，也是 `game.js:921`
      // 累积 `dilatedTime` 的唯一开关，所以这里把「买 DS1」从 hold 门禁里拆出来：
      // 只要 EC11/EC12 已满（`ecDepthNeeded` 为假）就照常尝试，纯原版 `purchase()`。
      // 买不上就返回，不影响任何其它链路。
      if (!this.ecDepthNeeded && !PlayerProgress.dilationUnlocked()) {
        const bought = this._buyDs1(now);
        if (bought) { this._phase = "buy-ds1"; return bought; }
      }

      // 注意：先读 hold —— 这个 getter 同时维护压现实的计时器/护栏。
      if (this.hold !== true) { this._phase = "idle"; return null; }

      if (this.ecDepthNeeded) {
        this._phase = "deep-ec";
        return this._driveEcChain(now);
      }
      if (!PlayerProgress.dilationUnlocked()) {
        this._phase = "buy-ds1";
        return this._buyDs1(now);
      }
      // DS1 已到手：启动膨胀 / 攒 maxDT 交给 tickDilation（它读同一个 hold）
      this._phase = "dilate";
      return null;
    } catch (e) {
      this._lastError = `tick: ${e && e.message}`;
      return null;
    }
  },

  get debugState() {
    const pick = fn => { try { return fn(); } catch (e) { return null; } };
    return {
      phase: this._phase,
      ecDepthNeeded: pick(() => this.ecDepthNeeded),
      targetEc: pick(() => this._targetEc()),
      holdActive: pick(() => this._holdSinceMs > 0),
      holdForMs: this._holdSinceMs ? Date.now() - this._holdSinceMs : 0,
      achieved: pick(() => this.achieved),
      deepRunAchieved: this._deepRunAchieved,
      earlyHoldUsedMs: this._earlyHoldUsedMs,
      actions: this._actions,
      releases: this._releases,
      lastRelease: this._lastRelease,
      lastStart: this._lastStart,
      ec11: pick(() => EternityChallenge(11).completions),
      ec12: pick(() => EternityChallenge(12).completions),
      ds1: pick(() => DilationTimeStudyState.studies[1].isBought === true),
      ds1CanBuy: pick(() => DilationTimeStudyState.studies[1].canBeBought === true),
      maxDTL: pick(() => player.records.thisReality.maxDT.pLog10()),
      ttStudy: pick(() => DEEP_TT_STUDY_IDS.find(id => TimeStudy(id).isBought) || 0),
      lastError: this._lastError,
      step: this._step,
      cooldownMs: Math.max(0, this._cooldownUntilMs - Date.now()),
    };
  },
};

try {
  globalThis.OrekiDilationAutomation = OrekiDilationAutomation;
} catch (e) {
  // 非浏览器环境忽略
}
