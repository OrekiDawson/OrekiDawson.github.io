/**
 * AD: Oreki Edition — 全局游戏速度系统
 *
 * 设计要点（为什么这样写）：
 * 1. 上游 ADfaster 把 1000× 写死在 public/index.html 里，作为全局常量注入。
 *    本模块把这个常量升级为「可运行时修改、独立持久化」的配置，
 *    并保持同名全局符号（getGlobalSpeedFactor / globalSpeedFactor）不变，
 *    这样 60 余处既有调用点无需修改即可工作。
 * 2. 速度倍率保存在 localStorage 而非存档内：
 *    - 重置/导入存档不会影响用户的倍率偏好
 *    - 不新增存档字段，存档结构与迁移逻辑完全不受影响
 * 3. 因子只在 gameLoop 的 realDiff 处生效一次（见 game.js），
 *    本模块只负责「取值」，不参与计时数学。
 */

const STORAGE_KEY = "oreki-game-speed";
/** 实验开关：自动购买器 interval 是否按全局倍率缩放（独立持久化，默认关闭） */
const AUTOBUYER_SCALE_KEY = "oreki-autobuyer-interval-scale";
/** 实验开关：Tick Speed 购买器的 interval 是否按全局倍率缩放（与上一个开关相互独立） */
const TICKSPEED_SCALE_KEY = "oreki-tickspeed-autobuyer-interval-scale";
/** 动态速度模式开关（默认开启，独立持久化） */
const DYNAMIC_KEY = "oreki-game-speed-dynamic";
/** 动态控制器参数：连续无进度多久算停滞、两次升档的最小间隔、每次升档的倍数 */
const DYN_STALL_MS = 4000;
const DYN_ADJUST_MS = 5000;
const DYN_STEP = 2;
/** 延迟读取全局 player，避免与 player.js 的初始化顺序耦合 */
function target_player() {
  return (typeof window !== "undefined" && window.player) ? window.player : null;
}

export const GAME_SPEED_DEFAULT = 10000;
export const GAME_SPEED_MIN = 1;
/**
 * 上限的技术依据：
 * - 游戏以 60fps 运行，单帧墙钟约 16.7ms；100000× 时单帧推进约 1670 秒游戏时间。
 * - 上游已用 Decimal(break_infinity) 表示数值，1e300 级指数不会溢出，
 *   真正的限制来自「离散机制」：自动购买器/Automator 每帧只 tick 一次，
 *   倍率越高，其相对游戏时间的触发频率越低；离线模拟的 tick 数按真实秒数固定，
 *   倍率越高，单 tick 覆盖的游戏时间越长，精度越差。
 * - 100000× 是默认值 10000× 的 10 倍余量，仍在可玩范围内；
 *   再往上收益递减且会明显失真，因此硬性钳制在 1e5。
 */
export const GAME_SPEED_MAX = 100000;

const MAX_REASON = "上限 100000×：更高倍率不会让离散机制（自动购买器、离线模拟）跟上，只会放大计时失真";

/** 解析用户输入，返回 { ok, value, message } */
export function parseSpeedFactor(input) {
  if (input === null || input === undefined) {
    return { ok: false, value: GAME_SPEED_DEFAULT, message: "请输入一个数字" };
  }
  const text = String(input).trim().replace(/[×xX*]\s*/gu, "").replace(/,/gu, "");
  if (text === "") return { ok: false, value: GAME_SPEED_DEFAULT, message: "请输入一个数字" };

  // 只接受普通十进制写法，显式拒绝 Infinity / NaN / 科学计数法误用
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/u.test(text)) {
    return { ok: false, value: GAME_SPEED_DEFAULT, message: "格式无效：请输入普通数字，例如 10000" };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    return { ok: false, value: GAME_SPEED_DEFAULT, message: "数值无效（不允许 NaN / Infinity）" };
  }
  if (value <= 0) {
    return { ok: false, value: GAME_SPEED_DEFAULT, message: "倍率必须大于 0" };
  }
  if (value < GAME_SPEED_MIN) {
    return { ok: false, value: GAME_SPEED_MIN, message: `倍率不能低于 ${GAME_SPEED_MIN}×` };
  }
  if (value > GAME_SPEED_MAX) {
    return { ok: false, value: GAME_SPEED_MAX, message: `倍率不能高于 ${GAME_SPEED_MAX}×（${MAX_REASON}）` };
  }
  return { ok: true, value, message: "" };
}

function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return GAME_SPEED_DEFAULT;
    const parsed = parseSpeedFactor(raw);
    // 存档值非法时不覆盖用户数据，只在内存里回退到默认值
    return parsed.ok ? parsed.value : GAME_SPEED_DEFAULT;
  } catch (e) {
    return GAME_SPEED_DEFAULT;
  }
}

function readStoredFlag(key, fallback = false) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch (e) {
    return fallback;
  }
}

function writeStoredFlag(key, value) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
    return true;
  } catch (e) {
    return false;
  }
}

function writeStored(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
    return true;
  } catch (e) {
    return false;
  }
}

let currentFactor = readStored();
/** 离线/休眠模拟期间冻结因子：simulateTime 内部会多次乘以、除以该因子，
 *  若中途改变会导致时间被重复放大或缩小，必须锁定为同一快照 */
let simulationToken = null;
/** 自动购买器 interval 缩放开关（实验特性，默认关闭；关闭时与原行为完全一致） */
let autobuyerIntervalScaling = readStoredFlag(AUTOBUYER_SCALE_KEY);
/** Tick Speed 购买器间隔缩放开关（实验特性，默认关闭，与上一个开关互不影响） */
let tickspeedIntervalScaling = readStoredFlag(TICKSPEED_SCALE_KEY);
/** 动态速度：是否启用（默认开）。关闭时完全退回手动固定倍率。 */
let dynamicEnabled = readStoredFlag(DYNAMIC_KEY, true);
/** 动态控制器的运行期状态（不持久化） */
const dyn = {
  lastSignal: null,     // 上一次「进度指纹」
  stagnantMs: 0,        // 连续无进度累计
  lastAdjustAt: 0,      // 上次调整倍率的墙钟
  lastSampleAt: 0,
  ramps: 0,             // 本次运行升档次数（诊断用）
};

export const GameSpeed = {
  get storageKey() { return STORAGE_KEY; },
  get min() { return GAME_SPEED_MIN; },
  get max() { return GAME_SPEED_MAX; },
  get defaultFactor() { return GAME_SPEED_DEFAULT; },

  /** 当前用户设置的倍率（不含冻结） */
  get factor() { return currentFactor; },
  /** 实际生效的倍率（模拟期间为快照值） */
  get effectiveFactor() { return simulationToken === null ? currentFactor : simulationToken.factor; },
  get isSimulationLocked() { return simulationToken !== null; },

  /**
   * 实验开关（默认关闭）：打开后，启用了缩放的自动购买器（当前只有反物质维度）会把
   * `interval` 除以全局倍率，使「两次购买之间」对应固定的**游戏时间**而不是固定现实时间。
   * F=1 时除以 1，行为与原版完全一致。
   */
  get scaleAutobuyerInterval() { return autobuyerIntervalScaling; },
  setScaleAutobuyerInterval(value) {
    autobuyerIntervalScaling = !!value;
    writeStoredFlag(AUTOBUYER_SCALE_KEY, autobuyerIntervalScaling);
    return autobuyerIntervalScaling;
  },
  get autobuyerScaleStorageKey() { return AUTOBUYER_SCALE_KEY; },

  /**
   * 实验开关（默认关闭）：Tick Speed 购买器专用，与反物质维度那个开关完全独立。
   * 打开后 Tick Speed 购买器同样按游戏速度倍率缩短间隔；F=1 时行为不变。
   */
  get scaleTickspeedAutobuyerInterval() { return tickspeedIntervalScaling; },
  setScaleTickspeedAutobuyerInterval(value) {
    tickspeedIntervalScaling = !!value;
    writeStoredFlag(TICKSPEED_SCALE_KEY, tickspeedIntervalScaling);
    return tickspeedIntervalScaling;
  },
  get tickspeedAutobuyerScaleStorageKey() { return TICKSPEED_SCALE_KEY; },

  /**
   * 动态速度模式（默认开）。
   * 目的：自动消除「无意义等待」——进度真的停住时逐步提高倍率，进度在走时保持不升。
   * 只在关卡信号（阶段解锁 / 无限次数 / IP / 本纪最高反物质 / 提升 / 星系）全部无变化时升档，
   * 且带最小调整间隔、每次 ×2、上下限钳制，避免每帧抖动。
   */
  get isDynamic() { return dynamicEnabled; },
  setDynamic(value) {
    dynamicEnabled = !!value;
    writeStoredFlag(DYNAMIC_KEY, dynamicEnabled);
    if (!dynamicEnabled) { dyn.stagnantMs = 0; dyn.lastSignal = null; }
    return dynamicEnabled;
  },
  get dynamicStorageKey() { return DYNAMIC_KEY; },
  /** 诊断用：本次运行已自动升档次数 */
  get dynamicRampCount() { return dyn.ramps; },
  /** 界面用：一句话状态 */
  get modeLabel() {
    return dynamicEnabled ? `自动（当前 ${this.format(this.factor)}×）` : `手动（${this.format(this.factor)}×）`;
  },

  /**
   * 由 1s 定时器调用。读取「进度指纹」，判断是否停滞。
   * 返回本次是否调整了倍率（便于测试断言）。
   */
  tickDynamic(now = Date.now()) {
    if (!dynamicEnabled || simulationToken !== null) return false;
    // 游戏主循环没在跑（例如暂停/未开始）时不调整
    let signal = null;
    try {
      const p = target_player();
      if (!p) return false;
      // 用 0.01 数量级的分辨率做指纹：只看 exponent 取整会把「同一数量级内的真实增长」
      // 误判成停滞（例如 1.2e100 → 4.8e100）。尾数信息一起纳入，既不漏判也不过敏。
      const ex = v => {
        if (v && typeof v.exponent === "number") {
          const m = (typeof v.mantissa === "number" && v.mantissa > 0) ? Math.log10(v.mantissa) : 0;
          return Math.round((v.exponent + m) * 100);
        }
        return typeof v === "number" ? Math.round(v * 100) : 0;
      };
      signal = [
        ex(p.infinities), ex(p.infinityPoints), ex(p.eternities), ex(p.realities),
        ex(p.records.thisEternity.maxAM), p.dimensionBoosts, p.galaxies,
        p.break ? 1 : 0,
      ].join("|");
    } catch (e) { return false; }

    const dt = dyn.lastSampleAt === 0 ? 0 : Math.max(0, now - dyn.lastSampleAt);
    dyn.lastSampleAt = now;
    if (dyn.lastSignal !== signal) {
      dyn.lastSignal = signal;
      dyn.stagnantMs = 0;
      return false;
    }
    dyn.stagnantMs += dt;
    if (dyn.stagnantMs < DYN_STALL_MS) return false;
    if (now - dyn.lastAdjustAt < DYN_ADJUST_MS) return false;
    if (currentFactor >= GAME_SPEED_MAX) return false;
    const next = Math.min(GAME_SPEED_MAX, Math.max(GAME_SPEED_MIN, currentFactor * DYN_STEP));
    if (next <= currentFactor) return false;
    currentFactor = next;
    writeStored(next);
    dyn.lastAdjustAt = now;
    dyn.stagnantMs = 0;
    dyn.ramps++;
    return true;
  },

  /**
   * 设置倍率。成功返回 { ok:true }，失败返回 { ok:false, message } 且不改变任何状态。
   */
  set(input) {
    const result = parseSpeedFactor(input);
    if (!result.ok) return result;
    currentFactor = result.value;
    const persisted = writeStored(result.value);
    return { ok: true, value: result.value, persisted, message: persisted ? "" : "已生效，但浏览器拒绝写入本地存储，刷新后会恢复默认值" };
  },

  resetDefault() {
    return this.set(GAME_SPEED_DEFAULT);
  },

  /** 开始一次时间模拟，冻结当前倍率；返回用于结束的令牌 */
  beginSimulation() {
    simulationToken = { factor: currentFactor };
    return simulationToken;
  },

  /** 结束模拟并解冻；令牌不匹配时忽略（防止异步回调重复解冻） */
  endSimulation(token) {
    if (token !== undefined && token !== null && simulationToken !== token) return;
    simulationToken = null;
  },

  /** 用于界面显示的文本 */
  format(value = this.factor) {
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value * 100) / 100);
  }
};

/**
 * 挂载全局符号，兼容上游 60 余处既有调用点。
 * - getGlobalSpeedFactor()：生效倍率。**毁灭现实不再额外开平方**（见下）
 * - getGlobalSpeedFactorRaw()：保留为同义入口（历史调用点不隔离）
 * - globalSpeedFactor：只读 getter，供 H2P 等文案显示动态倍率
 *
 * 【Mod 定制 · 2026-10-27】上游 ADfaster 在 `public/index.html:6` 让
 * `getGlobalSpeedFactor()` 在 Pelle 毁灭现实中返回 `sqrt(f)`，本 Mod 早期沿用。
 * 后果是：默认 10000× 下，毁灭现实只剩 100×，整条终局拉伸慢 100 倍；
 * 且与本 Mod 的 Android 端（`OrekiSpeed.mult()` 无 isDoomed 分支，恒为全额）
 * 形成跨端不一致（Web 100× vs Android 10000×）。
 *
 * 按《Oreki 爽玩优先标准》——缩短现实通关时间优先、两端规则一致——
 * 这里取消开平方，毁灭现实与其余阶段同用全额倍率。
 * 该函数同时是「乘」与「除」的唯一来源（`game.js` 注入点 `* f`、各现实时间
 * 还原点 `/ f`、Ra/暗物质/黑洞的 `sqrt(f)` 派生），因此两侧自动成对，记录口径不会失真。
 */
export function installSpeedGlobals(target = window) {
  // GameSpeed 需要作为全局暴露：oreki-tools / H2P 文案在运行时读取当前倍率
  target.GameSpeed = GameSpeed;
  target.OrekiSpeed = GameSpeed;
  target.getGlobalSpeedFactorRaw = () => GameSpeed.effectiveFactor;
  target.getGlobalSpeedFactor = () => GameSpeed.effectiveFactor;
  Object.defineProperty(target, "globalSpeedFactor", {
    configurable: true,
    get: () => GameSpeed.factor
  });
  // 动态速度控制器：1 s 采样一次，足够分辨「停滞」又不会每帧抖倍率。
  // 定时器回调与游戏主循环同线程，不会在单帧中途改变倍率，因此不会破坏
  // 「同一帧乘/除使用同一倍率快照」的约束（game.js 每帧读一次的写法不受影响）。
  try {
    if (!target.__orekiDynSpeedTimer) {
      target.__orekiDynSpeedTimer = setInterval(() => {
        try { GameSpeed.tickDynamic(); } catch (e) { /* 控制器异常不得影响主循环 */ }
      }, 1000);
    }
  } catch (e) { /* 非浏览器环境忽略 */ }
  return GameSpeed;
}

installSpeedGlobals();
