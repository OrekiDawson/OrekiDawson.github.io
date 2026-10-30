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
import { VUnlocks } from "./celestials/V.js";
import { OREKI_V_UNLOCK_REALITIES, OREKI_V_UNLOCK_DILATED_TIME } from "./secret-formula/celestials/v.js";

/** 深度挑战的推进顺序（每关打满 5 次才切下一关） */
const DEEP_EC_IDS = [9, 10, 11, 12];
/** DS1 的「时间研究前置」：这四个里有任意一个为真即可 */
const DEEP_TT_STUDY_IDS = [231, 232, 233, 234];
/** 压现实总时长上限（真实毫秒） */
const HOLD_MAX_MS = 240000;
/** EC 完成总数停滞多久就放手（真实毫秒） */
const HOLD_STALL_MS = 90000;
/** 放手后的冷却（真实毫秒），避免刚放手又立刻压回去 */
const HOLD_COOLDOWN_MS = 60000;
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
      if (VUnlocks.vAchievementUnlock.isUnlocked) return this._release("v-unlocked");

      const now = Date.now();
      if (this._cooldownUntilMs && now < this._cooldownUntilMs) return false;

      // 只在**真的打到深层**时压现实。EC11 打满说明 EC1~EC10 已经全部到位，
      // 剩下只有 EC12 → DS1 这条短链；此时压现实的代价最小（实测每轮只多花 ~20 s），
      // 而收益最大（现实每 ~25 s 就会把 EC 记录与整棵研究树清空）。
      if (!EternityChallenge(11).isFullyCompleted) return this._release("shallow");

      // V 的第一项门槛是 realities ≥ 200。没到之前压现实等于把现实次数按死，
      // 所以只允许极少数早期演练，其余时间必须让现实照常循环。
      // 注意：`Currency.realities.value` 在本工程里是**普通数字**（不是 Decimal），
      // 直接 `.gte()` 会抛 `is not a function` —— 第一次 300 s 真跑就是这么静默失效的，
      // 所以这里统一走 `Decimal.gte`，两种类型都能吃。
      const atGate = Decimal.gte(Currency.realities.value, OREKI_V_UNLOCK_REALITIES);
      if (!atGate && this._earlyHoldUsedMs >= EARLY_HOLD_BUDGET_MS) return this._release("grow-realities");

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

      const holdMax = this._holdIsEarly ? EARLY_HOLD_MAX_MS : HOLD_MAX_MS;
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
      if (VUnlocks.vAchievementUnlock.isUnlocked) { this._phase = "idle"; return null; }

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
