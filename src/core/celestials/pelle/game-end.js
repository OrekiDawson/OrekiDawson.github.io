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
 * [Oreki R37-A / R38-M] 终局判定里的「反物质指数目标」缩放：原版 9e15 → Mod 1e3。
 *
 * ── 公式到底要求什么（R38-M 更正了 R37 写错的两处）──────────────────
 * `endState = (log10(log10(totalAM)+1) - OFFSET) / (log10(TARGET) - OFFSET)`
 * `endState >= 1` 才会由 `GameEnd.gameLoop` 置 `player.isGameEnd = true`。
 * 令 `E = log10(totalAM)`（反物质指数），则 `endState >= 1`
 * ⟺ `log10(E+1) >= log10(TARGET)` ⟺ **`E >= TARGET`**。
 *
 * ⇒ **`TARGET` 就是「需要的反物质指数」本身，`OFFSET` 取什么值都改不了这个事实**
 *   （分子分母同减一个常数，只在 `TARGET = E` 处交会）。R37 的注释把 `1e9` 说成
 *   「门槛 = 反物质指数 9」，还写了「门槛从 +10.7 个数量级降到 +3.7 个数量级」，
 *   这两句都是错的，实际是「要求反物质指数等于 1e9」——永远到不了。已按实测重写。
 *
 * ── 另一处事实更正 ──────────────────────────────────────────────────
 * R37 注释写「`totalAntimatter` 初值就是 1e180000（pelle.js:260）」。
 * 实际 `pelle.js:260` 那句在 `resetResourcesForDilation()` 里，只在佩勒里做**膨胀重置**时
 * 才跑；`player.js:712` 的真实初值是 `DC.D0`（0）。所以判定确实是从 0 开始算峰值。
 *
 * ── OFFSET 为什么必须从 8.7 调低 ────────────────────────────────────
 * 8.7 是原版按 `TARGET = 9e15` 选的：分母 `log10(9e15) - 8.7 = 7.25 > 0`。
 * 一旦 `TARGET < 1e8.7 = 5.01e8`，分母变负、函数**非单调**（E 越大 endState 越小）。
 * 所以「把 TARGET 缩小」这条路在 8.7 偏移下根本走不通 —— 必须同时把偏移压下来。
 * 取 `OFFSET = 1`：分母 `log10(1e3) - 1 = 2 > 0`，函数在 `E > 9` 上严格单调递增，
 * 且 `endState` 在 `E = 10 → 1000` 区间从 0 平滑升到 1，是个能看懂的进度条。
 *
 * ── TARGET 为什么是 1e3（反物质 1e1000）──────────────────────────────
 * R38-M 实测（`_tools/_r38a/lai6.jsonl`，真实新档）：修掉佩勒阶段的重置竞争之前，
 * 反物质峰值被大坍缩死死按在 `e316`（105 秒零增长）；那说明「1e1000」是一个
 * **必须靠真实产量涨上去、无法被重置刷出来**的门槛，符合「不许伪造通关」的口径。
 * 1e1000 也是本作里「反物质」这一层公认的量级刻度，不另造数字。
 *
 * ── 分母为什么写成 `log10(TARGET + 1)`（R38-C 指出的 off-by-one）────────
 * 分子是 `log10(log10(AM) + 1)`，而分母原本是 `log10(TARGET)` —— 两者不对称，
 * 结果 `endState >= 1` 的交会点是 `E >= TARGET - 1`：
 * 取 `TARGET = 1e3` 时，实际在 `E = 999`（反物质 1e999）就过线，
 * 与玩家可见文案「反物质达到 1×10^1000」差一个数量级。
 * 把分母改成同样带 `+1` 的对称形式后：
 *   `endState = 1 ⟺ log10(E+1) = log10(TARGET+1) ⟺ E = TARGET`
 * —— 交会点正好落在 `E = 1000`，文案与判据字面一致，且单调性、`endState` 取值范围都不变。
 * 这是本轮唯一一处改动公式「形状」的地方，理由就是消掉这个实测出来的 off-by-one。
 */
export const OREKI_PELLE_END_OFFSET = 1;
export const OREKI_PELLE_END_TARGET_EXP = 1e3;

export const GameEnd = {
  get endState() {
    if (this.removeAdditionalEnd) return this.additionalEnd;
    return Math.max((Math.log10(player.celestials.pelle.records.totalAntimatter.plus(1).log10() + 1) -
        OREKI_PELLE_END_OFFSET) /
      (Math.log10(OREKI_PELLE_END_TARGET_EXP + 1) - OREKI_PELLE_END_OFFSET) + this.additionalEnd, 0);
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
