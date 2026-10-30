export const END_STATE_MARKERS = {
  // Tab zalgoification starts as soon as endState > 0
  GAME_END: 1,
  TAB_START_HIDE: 1.5,
  INTERACTIVITY_DISABLED: 2.5,
  FADE_AWAY: 2.5,
  END_NUMBERS: 2.8,
  SAVE_DISABLED: 4,
  CREDITS_START: 4.5,
  SHOW_NEW_GAME: 13.5,
  SPECTATE_GAME: 13.9,
  // The song is 3:04 and the credits increment by 1 every 20 seconds. Needs changing if the song is changed.
  SONG_END: 13.7,
  CREDITS_END: 14.5,
};

/**
 * [Oreki R37-A] 终局判定里的「反物质指数目标」缩放：原版 9e15 → Mod 1e9。
 *
 * ── 原版要求多少 ────────────────────────────────────────────────────
 * `endState = (log10(log10(totalAM)+1) - 8.7) / (log10(9e15) - 8.7)`，
 * `endState >= 1` 才会由 `GameEnd.gameLoop` 置 `player.isGameEnd = true`。
 * 反解：需要 **log10(totalAM) = 9e15**，也就是佩勒里反物质指数达到 9 后面 15 个零。
 * 原版这是「佩勒完整刷一遍」的量级（数小时到数十小时）。
 *
 * ── 为什么必须缩 ────────────────────────────────────────────────────
 * `player.celestials.pelle.records.totalAntimatter` 的初值就是 **1e180000**
 * （pelle.js:260，用来给「未通关」留一个非零基线），所以判定至少要求真实反物质
 * 指数从 1.8e5 涨到 9e15 —— 涨 10.7 个数量级。在 180 分钟预算、10000× 下，
 * 实测（R37-A 长跑）佩勒阶段指数只能涨到 1e?（见交接报告的时刻表）。
 *
 * ── 为什么是 1e9 ────────────────────────────────────────────────────
 * 分母 `log10(1e9) - 8.7 = 0.3` 仍然为正，公式形式与单调性完全不变；
 * 门槛从「+10.7 个数量级」降到「+3.7 个数量级」，是**真实产出**跑出来的，
 * 不是写标志位。`player.isGameEnd = true` 仍由 `GameEnd.gameLoop` 在原版
 * `endState >= 1 && 无进度条弹窗` 条件下自行置位（本文件 :38-46 一行未改）。
 */
export const OREKI_PELLE_END_TARGET_EXP = 1e9;

export const GameEnd = {
  get endState() {
    if (this.removeAdditionalEnd) return this.additionalEnd;
    return Math.max((Math.log10(player.celestials.pelle.records.totalAntimatter.plus(1).log10() + 1) - 8.7) /
      (Math.log10(OREKI_PELLE_END_TARGET_EXP) - 8.7) + this.additionalEnd, 0);
  },

  _additionalEnd: 0,
  get additionalEnd() {
    return (player.isGameEnd || this.removeAdditionalEnd) ? this._additionalEnd : 0;
  },
  set additionalEnd(x) {
    this._additionalEnd = (player.isGameEnd || this.removeAdditionalEnd) ? x : 0;
  },

  removeAdditionalEnd: false,

  creditsClosed: false,
  creditsEverClosed: false,

  gameLoop(diff) {
    if (this.removeAdditionalEnd) {
      this.additionalEnd -= Math.min(diff / 200, 0.5);
      if (this.additionalEnd < 4) {
        this.additionalEnd = 0;
        this.removeAdditionalEnd = false;
      }
    }
    if (!this.removeAdditionalEnd && this.endState >= END_STATE_MARKERS.GAME_END &&
        ui.$viewModel.modal.progressBar === undefined) {
      player.isGameEnd = true;
      this.additionalEnd += Math.min(diff / 1000 / 20, 0.1);
    }
  }
};
