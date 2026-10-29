/**
 * [Oreki R26] 「当前现实运行是否仍处于开局爬坡期」的统一判定。
 *
 * ── 为什么需要这个模块 ────────────────────────────────────────────────
 * AD8 / AD9 / AD15 / R25 的几处数值缩放（IP·EP 的指数换算尺度、EC 入口资源、
 * 膨胀研究的 TT 成本）都写成
 *
 *     if (!PlayerProgress.realityUnlocked()) return 缩放后的值;
 *
 * 也就是把**永久进度标志**当成「是否还在开局爬坡」的阶段代理。问题在于：
 * `finishProcessReality()` 会把整局打回起点 ——
 *   · `player.break = false` / IP / STD / 维度 / 星系 / 无限升级（reality.js:629-635）
 *   · `InfinityDimensions.fullReset()` → 8 个无限维度全部重新锁定（reality.js:713）
 *   · `player.eternityChalls = {}` → EC 完成记录清空（reality.js:666）
 *   · `Currency.timeTheorems.reset()` / `player.dilation.studies = []` → 时间研究与膨胀研究清空
 * 而 `realityUnlocked()` 之后永远为 true，于是**每一次现实之后**这些缩放会全部失效，
 * 玩家要用「原版 100 倍以上的门槛」把同一段内容再爬一遍 —— 而这一段在原版尺度下
 * 本来就是不可达的（这正是当初加缩放的原因）。
 *
 * R26 真新档实测（300 s / 200 s / 130 s 三轮）：
 *   · t=46 s 第一次现实 → `thisEternity.maxAM` 冻结在 1e865.651，IP 停在 1e23，et 恒 0；
 *   · 把 IP 尺度修好后又卡在 EC6/EC8/EC12 入口（`ecDone` 只到 9 关），
 *     `player.challenge.eternity.unlocked` 恒为 0，`ecEntryPending()` 永久挂住自动永恒。
 *
 * ── 判定口径（只用真实运行状态，不伪造任何阶段/解锁标志）──────────────
 * 1. 还没解锁现实 → 一定是爬坡期。
 * 2. 已解锁现实 → 看**本次现实运行**是否已经买回「现实」时间研究
 *    （`TimeStudy.reality.isBought`，即膨胀研究 6）。现实重置会清空
 *    `player.dilation.studies`（reality.js 的 `player.dilation.studies = []`），
 *    所以这个值在每次现实后自动回到 false，窗口自然重开；
 *    一旦买回它，本次运行马上就要现实了，恢复原版尺度不影响后期平衡。
 *
 * 只读判断、无副作用、不写存档字段。
 */
export function isOrekiBootstrapRun() {
  try {
    if (typeof PlayerProgress === "undefined") return true;
    if (!PlayerProgress.realityUnlocked()) return true;
    if (typeof TimeStudy === "undefined") return true;
    const realityStudy = TimeStudy.reality;
    if (!realityStudy) return true;
    return realityStudy.isBought !== true;
  } catch (e) {
    // 任何异常都退回「爬坡期」：宁可给缩放，也不能让门槛回到原版不可达尺度
    return true;
  }
}
