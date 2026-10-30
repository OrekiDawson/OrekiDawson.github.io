/**
 * AD: Oreki Edition — 内置教程（阶段判定 + 内容派生）
 *
 * 设计原则：
 * 1. 只读：本模块不写存档、不改任何游戏状态，只读取 player / PlayerProgress / 天神 / 佩勒的状态。
 * 2. 单一内容源：正文只存在于 src/core/oreki-tutorial-data.json（Android 构建期读同一份）。
 *    本文件不写任何一句正文，只把 JSON 暴露给渲染层（见 TUTORIAL_CHAPTERS）。
 *    JSON 经 scripts/gen_tutorial_module.mjs 机械转成 oreki-tutorial-data.gen.js——
 *    因为本项目没有打包器，`import ... with { type: "json" }` 超出声明的浏览器范围。
 *    渲染组件里禁止再写第二份正文。
 * 3. 阶段判定与展示分离：判定只返回「已进入 / 条件已满足但未进入 / 未解锁」三种状态，
 *    未解锁阶段的内容一律带显式的「现在无法使用」前缀，不会把没解锁的机制写成可用。
 *
 * 阶段判定依据（均为项目既有 API，不新增字段）：
 * - 无限   ：PlayerProgress.infinityUnlocked() / player.infinities
 * - 永恒   ：PlayerProgress.eternityUnlocked() / player.eternities
 * - 现实   ：PlayerProgress.realityUnlocked() / player.realities
 * - 天神   ：Teresa.isUnlocked（成就 147）/ Teresa.pouredAmount
 * - 毁灭   ：Pelle.isUnlocked（虚幻升级 25）/ Pelle.isDoomed
 */

import { scheduleTutorialEntry } from "./oreki-tutorial-entry.js";
import tutorialData from "./oreki-tutorial-data.gen.js";

// 常驻入口：卡片按钮注入到页面（见 oreki-tutorial-entry.js）。
// 这一句让「有没有教程可看」不再取决于玩家能不能翻到选项页最下面。
scheduleTutorialEntry();

const STAGE_EARLY = "early";
const STAGE_INFINITY = "infinity";
const STAGE_ETERNITY = "eternity";
const STAGE_REALITY = "reality";
const STAGE_CELESTIALS = "celestials";
const STAGE_DOOMED = "doomed";

/**
 * 阶段定义。unlocked = 解锁条件是否满足；entered = 是否真的进入过这个阶段。
 * 两者的差别在「天神」上最明显：成就 147 一到手就算解锁（可以进入），
 * 但只有真的向特蕾莎投入过现实机器才算进入。
 */
const STAGE_DEFS = [
  {
    key: STAGE_EARLY,
    name: "开局（未无限）",
    unlocked: () => true,
    entered: () => !PlayerProgress.current.isInfinityUnlocked,
    focus: "买维度 → 计数频率 → 维度提升 → 反物质星系，把反物质推到 1.8e308 做第一次无限。",
    nextSteps: [
      "点第一反物质维度开始积累反物质",
      "反物质达到 100 时买第二维度",
      "买过第二维度后买「计数频率提升」",
      "拥有 20 个第四维度时买一次维度提升",
      "拥有 80 个第八维度时买反物质星系",
      "反物质到 1.8e308 时点「大坍缩」完成首次无限",
    ],
  },
  {
    key: STAGE_INFINITY,
    name: "无限期",
    unlocked: () => PlayerProgress.current.isInfinityUnlocked,
    entered: () => new Decimal(player.infinities).gt(0),
    focus: "这个阶段要连过三道墙：Break（大坍缩间隔拉满）→ IP 够 1e8 → 本纪最高反物质够 1e1100。三道都有 Mod 自动推进，你只需要让自动购买器总开关保持开启。",
    nextSteps: [
      "先确认「自动化 → 自动购买器」顶部的总开关是开着的——AD3 / AD5 / AD6 / AD7 全靠它",
      "然后不用管：AD7 管开局，AD5 补 IP 并拉满大坍缩间隔，AD5b 自动按 Break，AD3 自动买下第一无限维度",
      "ID1 解锁前自动坍缩会短暂暂停，等「本纪最高反物质」爬到 1e1100（详见第 6 章）",
      "AD6 会继续自动买无限维度与无限升级；期间可以顺手跑普通挑战 1-9 / 10-12 换购买器间隔",
      "IP 摸到 1.797e308 后，「永恒」页按钮会亮，直接做第一次永恒",
      "实测参考（默认 10000×、纯生产自动化、无脚本注入）：首次无限 4 秒、Break 5 秒、ID1-8 全解锁 10 秒——如果你远慢于这个量级，先回第 6 章逐条核对窗口",
    ],
  },
  {
    key: STAGE_ETERNITY,
    name: "永恒期",
    unlocked: () => PlayerProgress.current.isEternityUnlocked,
    entered: () => new Decimal(player.eternities).gt(0),
    focus: "时间研究、时间维度、永恒升级、时间膨胀；EP 主要用来点亮时间研究树。这一阶段的 IP / EP 兑换尺度仍然按 AD8 / AD9 收紧了，Reality 解锁后才恢复原版。",
    nextSteps: [
      "用 EP 买时间研究，先走通一条主线",
      "解锁并升级时间维度",
      "买永恒升级，拿到自动机（Automator）",
      "领取永恒里程碑奖励",
      "买时间膨胀，进入膨胀获取膨胀时间（DT）",
      "达到现实要求后做第一次现实",
      "实测参考：首次永恒之后进度不会停滞——同一局 102 秒时已完成 21891 次无限、ID1-4 解锁、本纪最高反物质到 1e13140（默认 10000×）",
    ],
  },
  {
    key: STAGE_REALITY,
    name: "现实期",
    unlocked: () => PlayerProgress.current.isRealityUnlocked,
    entered: () => player.realities > 0,
    focus: "符文（Glyph）与复兴树（Perk）是主要成长来源，现实机器（RM）用于符文与天神。",
    nextSteps: [
      "每次现实后从三个符文中挑一个装备",
      "用 RM 买现实升级",
      "买复兴树节点（Perk），优先自动化与倍率",
      "提升符文等级与配置，准备解锁天神页签（成就 147）",
    ],
  },
  {
    key: STAGE_CELESTIALS,
    name: "天神期",
    unlocked: () => Teresa.isUnlocked,
    entered: () => Teresa.pouredAmount > 0,
    focus: "按导航顺序推进天神：特蕾莎 → 鹿颈长 → 无名氏 → 薇 → 太阳神 → 莱特拉。",
    nextSteps: [
      "把现实机器（RM）投入特蕾莎，换时间之理",
      "按「天神 → 天神导航」的顺序推进下一位天神",
      "用天神机制换符文等级与全局倍率",
      "莱特拉之后准备进入毁灭现实",
    ],
  },
  {
    key: STAGE_DOOMED,
    name: "毁灭现实（佩勒）",
    unlocked: () => Pelle.isUnlocked,
    entered: () => Pelle.isDoomed,
    focus: "毁灭现实里大部分机制被佩勒禁用，需要用 Pelle 升级与裂缝逐步夺回。终局目标：让反物质达到 1×10^1000。",
    nextSteps: [
      "在「天神 → 佩勒」里先看清哪些机制被禁用",
      "用 Pelle 升级逐个恢复自动购买器与倍率",
      "推进佩勒裂缝与打击目标，把反物质一路推高",
      "反物质达到 1×10^1000 就抵达终局——这是最后一个目标，对着反物质最大值看进度",
    ],
  },
];

const STATUS_ENTERED = "entered";
const STATUS_AVAILABLE = "available";
const STATUS_LOCKED = "locked";

const STATUS_TEXT = {
  [STATUS_ENTERED]: "已进入",
  [STATUS_AVAILABLE]: "条件已满足，尚未进入",
  [STATUS_LOCKED]: "未解锁",
};

/**
 * 生成当前阶段快照。调用点只在教程弹窗的 update() 里，且只在阶段 key 变化时才写 DOM。
 * @returns {{
 *   key: string, name: string, index: number, focus: string, nextSteps: string[],
 *   rows: {key: string, name: string, status: string, statusText: string, focus: string}[]
 * }}
 */
export function getTutorialStageSnapshot() {
  const flags = STAGE_DEFS.map(def => ({ unlocked: def.unlocked(), entered: def.entered() }));
  // 当前阶段 = 最后一个「已进入」的阶段；一个都没进入时退回开局
  let index = 0;
  flags.forEach((flag, i) => {
    if (flag.entered) index = i;
  });
  const current = STAGE_DEFS[index];
  const rows = STAGE_DEFS.map((def, i) => {
    let status = STATUS_LOCKED;
    if (flags[i].entered) status = STATUS_ENTERED;
    else if (flags[i].unlocked) status = STATUS_AVAILABLE;
    return {
      key: def.key,
      name: def.name,
      status,
      statusText: STATUS_TEXT[status],
      focus: def.focus,
    };
  });
  return {
    key: current.key,
    name: current.name,
    index,
    focus: current.focus,
    nextSteps: current.nextSteps.slice(),
    rows,
  };
}

/** 未解锁阶段的行会带上这个前缀，避免把没解锁的机制读成「已经能用」 */
export const TUTORIAL_LOCKED_PREFIX = "尚未解锁 · 本阶段功能现在无法使用 —— ";

/* ============================================================================
 * 正文：全部来自 oreki-tutorial-data.json，本文件不写任何一句正文
 * ==========================================================================*/

/** 原始数据（含 schemaVersion / updatedAt / note），渲染层如需元信息从这里取 */
export const TUTORIAL_DATA = tutorialData;

/** 章节数组，顺序即阅读顺序（JSON 里已按 ch00、ch01… 排好） */
export const TUTORIAL_CHAPTERS = tutorialData.chapters;

/**
 * 附录数组，与 chapters 平级。
 *
 * 与章节的区别（渲染层必须守住）：
 * - 没有十字段，只有 `id / title / body`（`body` 是 Markdown 子集）；
 * - **不参与进度链**：不显示阶段徽标、不参与 `stageKey` 的 entered / available / locked 判定、
 *   不影响「下一步」；
 * - `body` 在 `apx_automation` 那条是构建期由各章 `automation` 聚合的（见 gen_tutorial_module.mjs），
 *   运行时要当作普通正文读，不要在这里再算一遍。
 */
export const TUTORIAL_APPENDICES = Array.isArray(tutorialData.appendices) ? tutorialData.appendices : [];

/**
 * 按 id 解析「上次读到哪」：先查章节，再查附录。
 *
 * 为什么必须查附录：玩家读到附录 D → 被顶掉或关掉 → 再打开时，如果只按 chNN 查，
 * 会跳回某章正文，玩家的感受就是「附录没了」。
 *
 * @param {string|null} id
 * @returns {{kind: "chapter"|"appendix", index: number}|null}
 */
export function findTutorialEntry(id) {
  if (!id) return null;
  const chapterIndex = TUTORIAL_CHAPTERS.findIndex(chapter => chapter.id === id);
  if (chapterIndex >= 0) return { kind: "chapter", index: chapterIndex };
  const appendixIndex = TUTORIAL_APPENDICES.findIndex(apx => apx.id === id);
  if (appendixIndex >= 0) return { kind: "appendix", index: appendixIndex };
  return null;
}

/** 结构版本：渲染层发现不认识的版本时宁可显示警告，也不猜字段 */
export const TUTORIAL_SCHEMA_VERSION = tutorialData.schemaVersion;

/**
 * 十个内容字段的中文名，只用于「本章还缺什么」的占位卡。
 * 顺序与 `docs/TUTORIAL_SCHEMA.md` 的表格一致。
 */
export const TUTORIAL_FIELD_LABELS = [
  ["stageGoal", "阶段目标"],
  ["entry", "进入条件"],
  ["steps", "具体操作"],
  ["buyOrder", "购买优先级"],
  ["automation", "自动化配置"],
  ["challenges", "挑战攻略"],
  ["numbers", "关键数值"],
  ["done", "完成判据"],
  ["next", "下一步"],
  ["traps", "常见卡点"],
];

/**
 * 草稿章的缺口清单：哪些字段已经有内容、哪些还是空的。
 *
 * 为什么要这个函数：`draft: true` 的章节只有 `stageGoal / entry / done / next` 四句话，
 * 直接渲染出来只有 160~380 字，玩家会以为教程坏了。渲染层据此画一张「本章编写中」的占位卡，
 * 明确说明现在只有骨架、还缺哪几块。
 *
 * 只做字段存在性判断，不生成、不补齐任何正文。
 * @param {object} chapter
 * @returns {{ready: string[], pending: string[], isEmpty: boolean}}
 */
export function getChapterGaps(chapter) {
  const ready = [];
  const pending = [];
  for (const [key, label] of TUTORIAL_FIELD_LABELS) {
    const value = chapter ? chapter[key] : undefined;
    const filled = Array.isArray(value)
      ? value.length > 0
      : typeof value === "string" && value.trim() !== "";
    (filled ? ready : pending).push(label);
  }
  return { ready, pending, isEmpty: ready.length === 0 };
}

/** 当前阶段在 STAGE_DEFS 里的下标 → 章节列表里第一个属于该阶段的章节下标 */
function firstChapterIndexByStage(stageKey) {
  return TUTORIAL_CHAPTERS.findIndex(chapter => chapter.stageKey === stageKey);
}

function chapterIndexById(id) {
  return TUTORIAL_CHAPTERS.findIndex(chapter => chapter.id === id);
}

const safeNumber = (fn, fallback = 0) => {
  try {
    const value = fn();
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  } catch (e) {
    return fallback;
  }
};

const safeBool = (fn, fallback = false) => {
  try {
    return Boolean(fn());
  } catch (e) {
    return fallback;
  }
};

/**
 * 打开教程时的默认章节：按当前阶段定位，同一阶段有多章时再用可观测进度细分。
 * 这里只做「跳到哪一章」的导航判断，不参与任何玩法。
 * @returns {number} TUTORIAL_CHAPTERS 的下标
 */
export function getTutorialStartIndex() {
  let stageKey = STAGE_EARLY;
  try {
    stageKey = getTutorialStageSnapshot().key;
  } catch (e) {
    stageKey = STAGE_EARLY;
  }
  const fallback = Math.max(0, firstChapterIndexByStage(stageKey));

  if (stageKey === STAGE_EARLY) {
    // 有星系 → 已经在等第一次无限；有维度提升 → 已过开局
    if (safeBool(() => player.galaxies >= 1)) return orFallback(chapterIndexById("ch03"), fallback);
    if (safeBool(() => player.dimensionBoosts >= 1)) return orFallback(chapterIndexById("ch02"), fallback);
    return orFallback(chapterIndexById("ch01"), fallback);
  }
  if (stageKey === STAGE_INFINITY) {
    // 还没 Break → 第 4 章（攒 IP 拉间隔）；已 Break 但 IP 还不到 5e11 → 第 5 章；否则第 6 章
    if (!safeBool(() => player.break)) return orFallback(chapterIndexById("ch04"), fallback);
    const ip = safeNumber(() => Currency.infinityPoints.exponent, 0);
    if (ip < 11) return orFallback(chapterIndexById("ch05"), fallback);
    return orFallback(chapterIndexById("ch06"), fallback);
  }
  return fallback;
}

function orFallback(index, fallback) {
  return index >= 0 ? index : fallback;
}

/**
 * 阅读位置（跨组件重建）。
 *
 * 为什么需要：弹窗在 `PopupModal` 里是 `<component :is="view.modal.current.component">`，
 * 一旦有更高优先级的弹窗（例如成就的一次性说明，`Modal.message.show(..., {}, 3)`）
 * 把 `current` 抢走，教程组件会被**销毁**；那条消息关掉后组件**重建**，
 * `data()` 会重新跑一遍。若不记住位置，玩家读到第 10 章被一条成就提示打断，
 * 回来就落回「当前阶段」那一章（实测：跳到 ch10 → 被打断 → 关掉消息 → 回到 ch06）。
 *
 * 除了章节，还要记住内容区的滚动位置：组件重建时 `scrollTop` 会归零，只保章节的话
 * 玩家虽然还在第 10 章，却要从章首重读一遍。两者是同一类伤害，只是大小不同。
 *
 * 只存章节 id 与像素偏移，不写 player、不落 localStorage：
 * - 不写 player 是为了守住「本模块只读存档」这条边界；
 * - 不落 localStorage 是因为刷新后应该重新按当前阶段定位，而不是回到上次翻到的旧章。
 *
 * 语义：`chapterId === null` 表示「没有未完成的阅读」，下次打开按当前阶段定位，
 * 同时把 `scrollTop` 视为 0。
 */
export const TutorialReadingPosition = { chapterId: null, scrollTop: 0 };


/**
 * 某一章所属阶段的状态（entered / available / locked）。
 * 章节 stageKey 为 null（导览类章节）时返回 null，表示「不适用」。
 * @returns {{status: string, statusText: string, name: string} | null}
 */
export function getChapterStageStatus(chapter) {
  if (!chapter || !chapter.stageKey) return null;
  try {
    const row = getTutorialStageSnapshot().rows.find(item => item.key === chapter.stageKey);
    return row ? { status: row.status, statusText: row.statusText, name: row.name } : null;
  } catch (e) {
    return null;
  }
}
