// [Oreki R44] 复兴树（Perk）自动购买 —— 补上「有目标但没有动作」的最后一段
//
// ── 为什么必须有这个模块（能力缺口，不是优化）──────────────────────────────
// 1. `src/core/perks.js` 的 `PerkState` 继承 `SetPurchasableMechanicState`，
//    `purchase()` 是**真实购买入口**：`canBeBought` = 未买 + 点数够 + 与已买节点相邻
//    （`perks.js:36-38` 的 `isAvailableForPurchase` 只认 `connectedPerks`），
//    扣的是 `Currency.perkPoints`，写的是 `player.reality.perks`（Set）。
// 2. 但**全仓库没有任何自动调用点**：`rg "Perk\(.*\)\.purchase" src` 为空
//    （R44 复核过；R43 的策略 spec 里 `buyRealityPerk` 因此被标成 unsupported）。
//    ⇒ `realityTree` 阶段的 goal「买到 12 个节点且自动机已解锁」永远只能靠手点。
// 3. 自动机解锁（`player.js:1001` `AutomatorPoints.totalPoints >= 100`）的主要来源就是
//    带 `automatorPoints` 的复兴节点（`automator-points.js:8-14`，21 个节点、合计 150 点）。
//    不点节点 ⇒ 自动机永远不开 ⇒ 策略的 `realityTree` 阶段永远进不去。
//
// ── 怎么决定买哪个（不写死顺序）───────────────────────────────────────────
// 复兴树是**图**，不是列表：只能买与已买节点相邻的（`perks.js:36`）。
// 所以「下一个买谁」不能是固定 id 序列，必须按**当前已买集合**现算最短路：
//   ① 在已买节点集合上做 BFS，得到每个未买节点的距离 dist（单位：还要买几个节点）；
//   ② 目标 = 未买且 `automatorPoints > 0` 的节点，评分 `automatorPoints / dist`；
//   ③ 买**通往最高分目标那条最短路上的第一步**。
// 这样点数的每一个去向都同时满足：a) 走得到自动机；b) 不绕路。
// 目标全买完之后回落到「离最近自动机节点最近的相邻节点」，保证不会停在半路。
//
// ── 边界（都是「不做」）───────────────────────────────────────────────────
// · 只在 `PlayerProgress.realityUnlocked()` 之后生效（之前点数恒为 0，且页签不可见）；
// · 受玩家既有的自动购买器总开关 `player.auto.autobuyersOn` 控制，关掉即完全停止；
// · 毁灭现实（`Pelle.isDoomed`）不买：那一阶段 `Pelle.uselessPerks` 会让部分节点失效，
//   而复兴节点**没有退点/重置入口**（`dev.respecPerks` 是开发工具），买错就是永久浪费；
// · 手动优先：只认「玩家自己买了一个节点」（`player.reality.perks.size` 的增量里
//   扣掉本模块自己的购买数 > 0），随后让路 60 s。**不读** 执行层那份点击启发式
//   （`OrekiSmartStrategy.debugState().manualHolds`）—— 那一份把「点页签 / 开弹窗」
//   也算手动操作，会让复兴节点在新手期一直被压住，见 `_observeOwnership()` 的说明；
// · 每秒最多买 1 个：点数只来自现实次数，买太快面板（「④ 正在执行」）看不清是谁买的，
//   而且一次买一堆会让「手动接管」来不及生效；
// · 不写任何 `player.*` 字段，不调 `Currency.perkPoints`，一切扣费/校验走 `purchase()`。
//
// ── 与执行层的关系 ────────────────────────────────────────────────────────
// 本模块是**阶段模块**（和 eternity / reality 一样由 `game.js` 每帧调用），
// 同时注册进 `OrekiSmartExecutor` 当 `buyRealityPerk` 的执行目标：
// 模块自己动手时执行层看到摘要非空就不抢；模块卡住（点数不够）时执行层也不会空转
// （`NOOP_COOLDOWN_MS` 管着）。

/** 两次购买之间的最小墙钟间隔（真实毫秒）。 */
const PERK_MIN_INTERVAL_MS = 1000;
/**
 * 玩家手动买了一个节点之后，本模块让路多久（真实毫秒）。
 * 与 `spec.manualOverride.holdSeconds` 的 60 s 一致。
 */
const PERK_MANUAL_HOLD_MS = 60000;

/** 只读观测：累计买到数、上一次失败原因。 */
export const OrekiPerkAutomation = {
  _bought: 0,
  _lastBuyMs: 0,
  _lastError: "",
  _lastPick: null,
  /** 上一次观测到的已买节点数（用于识别「玩家手点」），null = 还没观测过 */
  _lastObservedOwned: null,
  /** 自上次观测以来本模块自己买到的数量（用于从增量里扣掉自己） */
  _selfBuysSinceObserve: 0,
  /** 玩家手动购买后的让路到期时刻（真实毫秒） */
  _manualHoldUntil: 0,

  /** 是否允许动手。纯读，无副作用。 */
  get active() {
    try {
      if (typeof player === "undefined" || !player?.reality) return false;
      if (!player.auto.autobuyersOn) return false;
      if (!PlayerProgress.realityUnlocked()) return false;
      if (Pelle.isDoomed) return false;
      return true;
    } catch (e) {
      this._lastError = `active: ${(e && e.message) || e}`;
      return false;
    }
  },

  /**
   * 玩家是否刚手动买过节点 → 本模块让路。
   *
   * ── 为什么不能用 `OrekiSmartStrategy` 的 manualHold ──────────────────────
   * 那一份信号是**点击启发式**：`oreki-smart-executor.js` 的 `installManualWatch`
   * 监听 `#ui` 上的任何 click，命中就按当前 goal 记 60 s。
   * 但 `#ui` 是整块游戏界面 —— 切页签、点成就页、开弹窗、调倍率**全都算手动操作**。
   * 玩家在新手期几乎一直在点，于是复兴节点会被一直压住：
   *   perk 点数买不出去 ⇒ `reality.perksBought` 不动 ⇒ 自动机点数攒不到 100 ⇒
   *   `automator.unlocked` 永假 ⇒ 策略的 realityTree 阶段与「复兴树」目标整段失效。
   * 这是**代理信号与目标不匹配**，不是玩家操作太多。
   *
   * ── 换成本模块自己的精确信号 ────────────────────────────────────────
   * 只认「已买集合真的变大了，而且不是本模块买的」：
   *   `player.reality.perks.size` 由 `Perk.purchase()` 唯一写入，
   *   所以增量减去本模块自己的购买数 > 0 ⇒ 玩家手点了一个节点。
   * 语义与 spec `manualOverride` 完全一致（「玩家手动执行了某目标对应的动作」），
   * 且**点页签不会让路** —— 假阳性归零。
   */
  _observeOwnership() {
    try {
      const owned = player.reality.perks.size;
      if (this._lastObservedOwned === null) {
        this._lastObservedOwned = owned;
        return;
      }
      const gain = owned - this._lastObservedOwned;
      if (gain > this._selfBuysSinceObserve) this._manualHoldUntil = Date.now() + PERK_MANUAL_HOLD_MS;
      this._lastObservedOwned = owned;
      this._selfBuysSinceObserve = 0;
    } catch (e) {
      this._lastError = `observeOwnership: ${(e && e.message) || e}`;
    }
  },

  /** 玩家是否刚手动买过节点（见 `_observeOwnership` 的说明）。 */
  _manualHoldActive(now) {
    this._observeOwnership();
    return now < this._manualHoldUntil;
  },

  /**
   * 在「已买节点」集合上做 BFS，返回每个节点到已买集合的最短距离与父指针。
   * 已买节点距离为 0；不可达的节点不出现在 map 里。
   * @returns {{dist: Map<number, number>, parent: Map<number, number>}}
   */
  _bfsFromOwned() {
    const dist = new Map();
    const parent = new Map();
    const queue = [];
    const all = Perks.all;
    for (const perk of all) {
      if (perk.isBought) {
        dist.set(perk.id, 0);
        queue.push(perk);
      }
    }
    // 根节点 id 0 永远可买（`perks.js:37` `this.id === 0 || ...`），
    // 开局一个都没买时把它当成「距离 1 的起点」而不是不可达。
    if (queue.length === 0) {
      const root = Perks.find(0);
      if (root) {
        dist.set(root.id, 1);
        parent.set(root.id, -1);
        queue.push(root);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const perk = queue[head];
      const d = dist.get(perk.id);
      for (const next of perk.connectedPerks || []) {
        if (!next || dist.has(next.id)) continue;
        dist.set(next.id, d + 1);
        parent.set(next.id, perk.id);
        queue.push(next);
      }
    }
    return { dist, parent };
  },

  /**
   * 挑出这一帧该买的那一个节点（只读计算）。
   * @returns {{id: number, label: string, automatorPoints: number, dist: number, targetId: number}|null}
   */
  _pickNext() {
    const { dist, parent } = this._bfsFromOwned();
    const unbought = Perks.all.filter(p => !p.isBought && dist.has(p.id));
    if (!unbought.length) return null;

    // 目标：带自动机点数的节点，按「点数/距离」排序（同分取更近、再取点数高的）。
    const targets = unbought
      .filter(p => (p.automatorPoints || 0) > 0)
      .map(p => ({ perk: p, gain: p.automatorPoints, d: dist.get(p.id) }))
      .sort((a, b) => (b.gain / b.d) - (a.gain / a.d) || a.d - b.d || b.gain - a.gain);

    let target = targets[0] || null;
    if (!target) {
      // 自动机节点买完（或全被 Pelle 屏蔽）：买离最近自动机节点最近的相邻节点。
      const remaining = unbought
        .filter(p => (p.automatorPoints || 0) === 0)
        .sort((a, b) => dist.get(a.id) - dist.get(b.id) || a.id - b.id);
      if (!remaining.length) return null;
      const first = remaining[0];
      // 只要相邻（dist === 1）就能直接买；否则沿父指针回溯到第一步。
      target = { perk: first, gain: 0, d: dist.get(first.id) };
    }

    // 回溯到「父节点已买」的那一步。
    let cursor = target.perk;
    const seen = new Set();
    while (cursor && dist.get(cursor.id) > 1) {
      if (seen.has(cursor.id)) break; // 防御：图里出现环也不会死循环
      seen.add(cursor.id);
      const p = parent.get(cursor.id);
      if (p === undefined) break;
      if (p === -1) break;
      const nextPerk = Perks.find(p);
      if (!nextPerk) break;
      cursor = nextPerk;
    }
    if (!cursor) return null;
    return {
      id: cursor.id,
      label: cursor.label || String(cursor.id),
      automatorPoints: cursor.automatorPoints || 0,
      dist: dist.get(cursor.id),
      targetId: target.perk.id,
    };
  },

  /**
   * 买一个节点。走 `Perk(id).purchase()`（真实扣 `Currency.perkPoints`、
   * 真实写 `player.reality.perks`、真实触发 `onPurchased()`）。
   * @returns {boolean} 本次是否买到
   */
  buyPerks() {
    const now = Date.now();
    if (now - this._lastBuyMs < PERK_MIN_INTERVAL_MS) return false;
    if (!this.active) return false;
    if (this._manualHoldActive(now)) return false;
    try {
      if (Currency.perkPoints.lt(1)) return false;
      const pick = this._pickNext();
      if (!pick) return false;
      const perk = Perks.find(pick.id);
      if (!perk || !perk.canBeBought) {
        this._lastPick = { ...pick, result: "canBeBought=false" };
        return false;
      }
      const ok = perk.purchase();
      if (ok) {
        this._bought++;
        // 记一笔「这一个是自己买的」，供 `_observeOwnership()` 从集合增量里扣掉；
        // 不在这里改 `_lastObservedOwned`，否则同一帧里玩家又手点一个就会被漏判。
        this._selfBuysSinceObserve++;
        this._lastBuyMs = now;
        this._lastPick = { ...pick, result: "bought" };
      } else {
        this._lastPick = { ...pick, result: "purchase()=false" };
      }
      return ok === true;
    } catch (e) {
      this._lastError = `buyPerks: ${(e && e.message) || e}`;
      return false;
    }
  },

  /** `game.js` 每帧调用。返回本帧动作摘要（执行层的 `observe()` 直接吃这个形状）。 */
  tick() {
    return { perks: this.buyPerks() ? 1 : 0 };
  },

  /** 只读诊断（探针/面板用）。 */
  debugState() {
    let points = null;
    let owned = null;
    let automatorPoints = null;
    let pick = null;
    try {
      points = Currency.perkPoints.toNumber();
    } catch (e) { /* ignore */ }
    try {
      owned = Perks.all.filter(p => p.isBought).length;
      automatorPoints = globalThis.AutomatorPoints?.totalPoints ?? null;
    } catch (e) { /* ignore */ }
    try {
      pick = this._pickNext();
    } catch (e) { /* ignore */ }
    return {
      active: this.active,
      boughtThisSession: this._bought,
      totalOwned: owned,
      perkPoints: points,
      automatorPoints,
      next: pick,
      lastPick: this._lastPick,
      // 让路必须可观测：0 = 没让路，>0 = 还剩多少毫秒（玩家自己买过节点）
      manualHoldRemainMs: Math.max(0, this._manualHoldUntil - Date.now()),
      error: this._lastError,
    };
  },
};

try {
  globalThis.OrekiPerkAutomation = OrekiPerkAutomation;
} catch (e) {
  // 非浏览器环境忽略
}
