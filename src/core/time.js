export const DeltaTimeState = {
  deltaTime: new TimeSpan(0),
  unscaledDeltaTime: new TimeSpan(0),
  update(deltaTime, gameDeltaTime) {
    this.unscaledDeltaTime = TimeSpan.fromMilliseconds(deltaTime);
    this.deltaTime = TimeSpan.fromMilliseconds(gameDeltaTime);
  }
};

// 记录类字段的“无记录”哨兵（历史存档里也用 Number.MAX_VALUE 表示同样的含义）
const TIME_RECORD_SENTINEL = 999999999999;

/**
 * 判断一个时间记录是否为有效值（排除哨兵、NaN、负数与非数值）。
 * @param {*} ms
 * @returns {boolean}
 */
export function isValidTimeRecord(ms) {
  return typeof ms === "number" && Number.isFinite(ms) && ms >= 0 && ms < TIME_RECORD_SENTINEL;
}

/**
 * 把“游戏循环内累计的原始 game 时间”换算成“游戏内时间”，即现实时间乘以该时段实际生效的
 * 游戏内时间膨胀倍率（时间符文 / 时间储存 / 黑洞 / 奇异点里程碑 / 永恒挑战 12 等）。
 *
 * 本 Mod 的全局速度倍率（OrekiSpeed / GameSpeed）不属于游戏内膨胀，它只是等比例加快模拟，
 * 因此必须在此剔除；否则同一段现实时间会因为玩家把倍率从 1× 调到 10000× 而显示成 10000 倍长。
 * 注意：只有“实时累计中”的 thisInfinity/thisEternity/thisReality/totalTimePlayed 需要经过本函数；
 * bestInfinity/bestEternity/bestReality 与最近十次记录在写入时已完成同样换算，不可重复除法。
 * @param {number} rawGameMs 游戏循环累计的游戏时间（毫秒）
 * @returns {number} 游戏内时间（毫秒）
 */
export function toInGameTimeMs(rawGameMs) {
  if (!Number.isFinite(rawGameMs)) return rawGameMs;
  return rawGameMs / getGlobalSpeedFactor();
}

/**
 * 统一的时间统计文案：现实时间永远优先且明确标注；游戏内时间只在数据可确认时并列显示。
 * 任一数据缺失（旧存档没有 realTime 字段、或记录仍是哨兵值）时只显示可确认的那一项，
 * 不推算、不补造数值。
 * @param {number} realMs 现实时间（毫秒），不可确认时传 undefined/null
 * @param {number} inGameMs 已换算好的游戏内时间（毫秒），不可确认时传 undefined/null
 * @returns {string}
 */
export function timeStatText(realMs, inGameMs) {
  const parts = [];
  if (isValidTimeRecord(realMs)) parts.push(`${TimeSpan.fromMilliseconds(realMs).toStringShort()}（现实时间）`);
  if (isValidTimeRecord(inGameMs)) parts.push(`${TimeSpan.fromMilliseconds(inGameMs).toStringShort()}（游戏内时间）`);
  return parts.length ? parts.join("，") : "暂无记录";
}

/**
 * 「游戏内时间」的按时间片累计器。
 *
 * 为什么不能靠 `原始游戏时间 / 当前倍率` 反推：全局速度倍率可以在一次运行中途改变，
 * 而原始游戏时间是每一帧按「当时生效的倍率」累加的。用改完之后的倍率去除整段历史，
 * 等于把新倍率套用到旧时间片上——把倍率从 1× 调到 10000×，历史「游戏内时间」会凭空缩小一万倍。
 *
 * 因此这里改为在 gameLoop 里逐帧累加 `diff / 当时倍率`，得到与倍率变更历史无关的
 * 「游戏内时间」总量；旧存档没有该累计器时，才退化为用当前倍率近似（数据缺口，见审计报告）。
 * @param {object} section 形如 records.thisInfinity 的记录段
 * @param {string} rawKey 原始游戏时间字段名
 * @param {string} intoKey 游戏内时间累计器字段名
 * @returns {number} 游戏内时间（毫秒）
 */
export function inGameTimeOf(section, rawKey = "time", intoKey = "inGameTime") {
  if (!section) return 0;
  const tracked = section[intoKey];
  if (typeof tracked === "number" && Number.isFinite(tracked) && tracked > 0) return tracked;
  const raw = section[rawKey];
  return typeof raw === "number" && Number.isFinite(raw) ? toInGameTimeMs(raw) : 0;
}

/**
 * 同 inGameTimeOf，但按秒返回。凡是「挑战限时判定 / 时间门槛 / 时间相关效果」都应走这里，
 * 而不是 `Time.thisX.totalSeconds / getGlobalSpeedFactor()`。
 *
 * 为什么必须用累加器：`totalSeconds / 当前倍率` 会把**整段历史**按改完之后的倍率重算。
 * 玩家在「选项 → 游戏性」里把倍率从 1× 调到 10000×，已流逝的游戏内秒数会瞬间缩成万分之一
 * ——挑战限时判定随之被拉长一万倍（或反方向瞬间超时），挑战成绩与限时判定也因此互不同源。
 * 累加器逐帧记 `diff / 当时倍率`，与倍率变更历史无关。
 * @param {object} section 形如 player.records.thisEternity 的记录段
 * @returns {number} 游戏内秒数
 */
export function inGameSecondsOf(section) {
  return inGameTimeOf(section) / 1000;
}


/**
 * 旧存档首次进入新版本时，把缺失的累计器按「当前倍率」补齐一次，使其与既有原始游戏时间对齐。
 * 只在累计器为 0 且原始时间大于 0 时执行，因此重复加载、重复保存不会二次换算。
 * @param {object} section 记录段
 * @param {string} rawKey 原始游戏时间字段名
 * @param {string} intoKey 游戏内时间累计器字段名
 */
export function seedInGameTime(section, rawKey = "time", intoKey = "inGameTime") {
  if (!section) return;
  if (typeof section[intoKey] !== "number" || !Number.isFinite(section[intoKey])) section[intoKey] = 0;
  if (section[intoKey] !== 0) return;
  const raw = section[rawKey];
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    section[intoKey] = raw / getGlobalSpeedFactor();
  }
}

/** 存档级「游戏内时间」总量（毫秒），口径同 inGameTimeOf */
export function totalInGameTimeMs() {
  return inGameTimeOf(player.records, "totalTimePlayed", "totalInGameTime");
}

export const Time = {
  /**
   * @param {Function} getValue
   * @returns {TimeSpan}
   */
  fromMilliseconds(getValue) {
    return TimeSpan.fromMilliseconds(getValue());
  },
  /**
   * @param {TimeSpan} timespan
   * @param {Function} setValue
   */
  toMilliseconds(timespan, setValue) {
    Guard.isTimeSpan(timespan);
    setValue(timespan.totalMilliseconds);
  },
  /**
   * Returns a string indicating the current date and time of day, as indicated by a Date.now() timestamp. After
   * regex formatting, this gives a string resembling "[month] [day] [year] HH:MM:SS"
   * @param {number} timestamp
   * @returns {string}
   */
  toDateTimeString(timestamp) {
    return new Date(timestamp).toLocaleString();
  },

  /**
   * Frame delta time
   * @returns {TimeSpan}
   */
  get deltaTimeFull() {
    return DeltaTimeState.deltaTime;
  },
  /**
   * Frame delta time in seconds
   * @returns {number}
   */
  get deltaTime() {
    return this.deltaTimeFull.totalSeconds;
  },
  /**
   * Frame delta time in ms
   * @returns {number}
   */
  get deltaTimeMs() {
    return this.deltaTimeFull.totalMilliseconds;
  },
  /**
   * Frame delta time, but without EC12 or black hole effects
   * @returns {TimeSpan}
   */
  get unscaledDeltaTime() {
    return DeltaTimeState.unscaledDeltaTime;
  },

  /**
   * @returns {TimeSpan}
   */
  get totalTimePlayed() {
    return this.fromMilliseconds(() => player.records.totalTimePlayed);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set totalTimePlayed(timespan) {
    this.toMilliseconds(timespan, value => player.records.totalTimePlayed = value);
  },

  /**
   * @returns {TimeSpan}
   */
  get timeSinceBlackHole() {
    return this.fromMilliseconds(() => {
      const diff = player.records.totalTimePlayed - player.records.timePlayedAtBHUnlock;
      return Math.max(0, diff);
    });
  },

  /**
   * @returns {TimeSpan}
   */
  get realTimeDoomed() {
    return this.fromMilliseconds(() => player.records.realTimeDoomed);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set realTimeDoomed(timespan) {
    this.toMilliseconds(timespan, value => player.records.realTimeDoomed = value);
  },

  /**
   * @returns {TimeSpan}
   */
  get realTimePlayed() {
    return this.fromMilliseconds(() => player.records.realTimePlayed);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set realTimePlayed(timespan) {
    this.toMilliseconds(timespan, value => player.records.realTimePlayed = value);
  },

  /**
   * @returns {TimeSpan}
   */
  get thisInfinity() {
    return this.fromMilliseconds(() => player.records.thisInfinity.time);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set thisInfinity(timespan) {
    this.toMilliseconds(timespan, value => player.records.thisInfinity.time = value);
  },

  /**
   * @returns {TimeSpan}
   */
  get thisInfinityRealTime() {
    return this.fromMilliseconds(() => player.records.thisInfinity.realTime);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set thisInfinityRealTime(timespan) {
    this.toMilliseconds(timespan, value => player.records.thisInfinity.realTime = value);
  },

  /**
   * @returns {TimeSpan}
   */
  get bestInfinity() {
    return this.fromMilliseconds(() => player.records.bestInfinity.time);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set bestInfinity(timespan) {
    this.toMilliseconds(timespan, value => player.records.bestInfinity.time = value);
  },

  /**
   * @returns {TimeSpan}
   */
  get bestInfinityRealTime() {
    return this.fromMilliseconds(() => player.records.bestInfinity.realTime);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set bestInfinityRealTime(timespan) {
    this.toMilliseconds(timespan, value => player.records.bestInfinity.realTime = value);
  },

  /**
   * @returns {TimeSpan}
   */
  get thisEternity() {
    return this.fromMilliseconds(() => player.records.thisEternity.time);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set thisEternity(timespan) {
    this.toMilliseconds(timespan, value => player.records.thisEternity.time = value);
  },

  /**
   * @returns {TimeSpan}
   */
  get thisEternityRealTime() {
    return this.fromMilliseconds(() => player.records.thisEternity.realTime);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set thisEternityRealTime(timespan) {
    this.toMilliseconds(timespan, value => player.records.thisEternity.realTime = value);
  },

  /**
   * @returns {TimeSpan}
   */
  get bestEternity() {
    return this.fromMilliseconds(() => player.records.bestEternity.time);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set bestEternity(timespan) {
    this.toMilliseconds(timespan, value => player.records.bestEternity.time = value);
  },

  /**
   * @returns {TimeSpan}
   */
  get bestEternityRealTime() {
    return this.fromMilliseconds(() => player.records.bestEternity.realTime);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set bestEternityRealTime(timespan) {
    this.toMilliseconds(timespan, value => player.records.bestEternity.realTime = value);
  },


  /**
   * @returns {TimeSpan}
   */
  get thisReality() {
    return this.fromMilliseconds(() => player.records.thisReality.time);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set thisReality(timespan) {
    this.toMilliseconds(timespan, value => player.records.thisReality.time = value);
  },

  /**
   * @returns {TimeSpan}
   */
  get thisRealityRealTime() {
    return this.fromMilliseconds(() => player.records.thisReality.realTime);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set thisRealityRealTime(timespan) {
    this.toMilliseconds(timespan, value => player.records.thisReality.realTime = value);
  },

  /**
   * @returns {TimeSpan}
   */
  get bestReality() {
    return this.fromMilliseconds(() => player.records.bestReality.time);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set bestReality(timespan) {
    this.toMilliseconds(timespan, value => player.records.bestReality.time = value);
  },

  /**
   * @returns {TimeSpan}
   */
  get bestRealityRealTime() {
    return this.fromMilliseconds(() => player.records.bestReality.realTime);
  },
  /**
   * @param {TimeSpan} timespan
   */
  set bestRealityRealTime(timespan) {
    this.toMilliseconds(timespan, value => player.records.bestReality.realTime = value);
  },

  /**
   * @return {TimeSpan}
   */
  get worstChallenge() {
    return this.fromMilliseconds(() => GameCache.worstChallengeTime.value);
  },

  /**
   * @return {TimeSpan}
   */
  get challengeSum() {
    return this.fromMilliseconds(() => GameCache.challengeTimeSum.value);
  },

  /**
   * @return {TimeSpan}
   */
  get infinityChallengeSum() {
    return this.fromMilliseconds(() => GameCache.infinityChallengeTimeSum.value);
  }
};
