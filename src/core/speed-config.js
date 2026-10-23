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
 * - getGlobalSpeedFactor()：生效倍率，Pelle 毁灭现实中开平方（沿用上游设计）
 * - getGlobalSpeedFactorRaw()：不做 Pelle 开方处理
 * - globalSpeedFactor：只读 getter，供 H2P 等文案显示动态倍率
 */
export function installSpeedGlobals(target = window) {
  // GameSpeed 需要作为全局暴露：oreki-tools / H2P 文案在运行时读取当前倍率
  target.GameSpeed = GameSpeed;
  target.OrekiSpeed = GameSpeed;
  target.getGlobalSpeedFactorRaw = () => GameSpeed.effectiveFactor;
  target.getGlobalSpeedFactor = () => {
    const factor = GameSpeed.effectiveFactor;
    const pelle = target.Pelle;
    return pelle !== undefined && pelle !== null && pelle.isDoomed ? Math.sqrt(factor) : factor;
  };
  Object.defineProperty(target, "globalSpeedFactor", {
    configurable: true,
    get: () => GameSpeed.factor
  });
  return GameSpeed;
}

installSpeedGlobals();
