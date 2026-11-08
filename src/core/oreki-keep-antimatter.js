// [Oreki AD4] 首次永恒前保留反物质 —— 打破「坍缩死锁」
//
// 事实（R19 真新档 600 s 实测，Web 侧浏览器实测 + 源码交叉核验）：
// 1. `Player.canCrunch` 要求 `player.records.thisInfinity.maxAM >= Decimal.NUMBER_MAX_VALUE`（1.797e308）。
//    见 src/core/player.js：`get canCrunch()` → `player.records.thisInfinity.maxAM.gte(goal)`。
// 2. 维度提升（softReset）与星系重置（galaxyReset）都会把反物质清零重爬。
//    `thisInfinity.maxAM` 只记录历史峰值，所以峰值能缓慢上升，但**当前反物质**被反复清零。
// 3. 死锁闭环：反物质反复清零 → 当前反物质爬不到 1.797e308 → 不能坍缩 → 没有 IP →
//    没有 IP 倍率 → 反物质增长更慢 → 更爬不上去。
//    R19 实测基线（exp-clean 真新档 600 s）：`坍缩=0`、`inf=0`、`maxAM` 卡在 1e250，
//    反物质从 t=177 s 起 423 s 完全零增长（`maxEt` 停在 1e250.73）。
// 4. 对照实验（exp-am-keep.mjs ARM=keep，测试层临时让 Currency.antimatter.reset() 不清零）：
//    同样 180~240 s 内 `坍缩` 从 0 变成 14 → 证实「保留反物质」能打破死锁。
// 5. 原版里保留反物质的两个开关此刻都不可用：
//    - `Achievement(111)`：需要过去 10 次无限每次 IP 增长 1e308 倍 —— 本阶段远达不到；
//    - `Perk.antimatterNoReset`：现实（Reality）级 Perk —— 首次永恒前根本没解锁。
//    → 所以第一次永恒之前，原版必然卡死在这个闭环里。
//
// 做法：在「首次永恒之前」这个窗口里，让维度提升 / 星系重置**保留反物质数量**
// （等价于提前给 `antimatterNoReset` 的反物质部分），其余一切不变：
// - 不改任何成本、不改 IP 公式、不改 maxAM 记录、不改挑战/毁灭规则；
// - 不写存档字段，不需要迁移；
// - 窗口关闭后（进入天神现实 / 挑战 / 毁灭现实）自动失效，恢复原版行为；
// - 挑战、毁灭现实下仍按原版清零，避免破坏挑战计时与毁灭规则。
//
// 判定口径（与 Web 既有 AD3/AD3b 一致）：
// - 未解锁永恒（PlayerProgress.eternityUnlocked() 为 false）
//   —— 注意：**不要求已 Break**。
//   R19 实测：Break 之前同样会卡死，因为 `canCrunch` 要求
//   `thisInfinity.maxAM >= 1.797e308`，而维度提升/星系重置每次都把反物质清零重爬，
//   于是「当前反物质」永远到不了 1.797e308 → 第一次坍缩都发不出来。
//   若把窗口限制在「已 Break 之后」，这个死锁在第一次无限之前就已经成立，修复无效。
// - 不在任何挑战中（普通挑战 / 无限挑战 / 永恒挑战）
// - 不在毁灭现实（Pelle.isDoomed）

/**
 * [Oreki AD4] 是否处于「保留反物质」窗口。
 * 只读判断，无副作用。true 表示维度提升 / 星系重置不应清零反物质。
 */
export const OrekiKeepAntimatter = {
  get active() {
    try {
      // [Oreki R26] 原来这里写着 `if (PlayerProgress.eternityUnlocked()) return false;`，
      // 而 `eternityUnlocked()` 在**现实之后恒为 true**（`isEternityUnlocked` 里
      // `|| isRealityUnlocked`，player-progress.js:16）。于是第一次现实一发生，
      // 这条窗口立刻关闭 —— 而现实重置恰好把 `player.break`、`dimensionBoosts`、
      // `galaxies`、IP 全部清零（reality.js:629-635），等于把 AD4 当初解决的
      // 「维度提升/星系重置把反物质清零 → 爬不到 1.797e308 → 永远不能无限」死锁
      // 在每一次现实后重新演一遍。
      // R26 实测：现实后 maxAM 卡在 1e270 量级、ID1 需要的 1e1100 永远到不了、
      // `et` 从头到尾是 0，整个现实层直接停摆。
      // 现在改成：只在毁灭现实与天神现实里关闭（那里有各自的资源约束）。
      // [Oreki R32] 鹿颈长 run 例外：阶段 1 的目标就是「真实把反物质打到 1.8e308
      // 触发 Big Crunch」，而 run 内维度提升/星系重置同样会把当前反物质清零。
      // R32 实测（_r32-nerf.jsonl）：关掉本窗口时 maxAM 在 t=245 起锁死 1e159 整整
      // 350 秒零增长，而门槛是 1e308 —— 与 R19 首次无限前完全同构的死锁闭环。
      // 这里只放开「鹿颈长 run 进行中」，毁灭现实、普通/无限/永恒挑战仍按原版清零
      // （时序上把天神判断放在挑战判断之前，但只针对 effarig.run，不影响其他天神）。
      if (player.celestials.effarig.run === true) return true;
      if (isInCelestialReality()) return false;
      if (NormalChallenge.isRunning || InfinityChallenge.isRunning) return false;
      if (EternityChallenge.isRunning) return false;
      if (Pelle.isDoomed) return false;
      return true;
    } catch (e) {
      return false;
    }
  },
};

/**
 * [Oreki AD4] 供 UI / 教程显示当前窗口是否生效。
 * @returns {boolean}
 */
export function isKeepAntimatterWindowActive() {
  return OrekiKeepAntimatter.active;
}
