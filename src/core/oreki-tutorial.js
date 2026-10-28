/**
 * AD: Oreki Edition — 内置教程（数据 + 阶段判定）
 *
 * 设计原则：
 * 1. 只读：本模块不写存档、不改任何游戏状态，只读取 player / PlayerProgress / 天神 / 佩勒的状态。
 * 2. 纯数据：章节内容是静态中文文本，渲染交给 src/components/modals/OrekiTutorialModal.js。
 * 3. 阶段判定与展示分离：判定只返回「已进入 / 条件已满足但未进入 / 未解锁」三种状态，
 *    未解锁阶段的内容一律带显式的「现在无法使用」前缀，不会把没解锁的机制写成可用。
 * 4. 文案里出现的每条 Mod 改动都必须能在源码里找到对应位置（见 chapter "mod" 的 source 字段），
 *    找不到证据的机制不写。
 *
 * 阶段判定依据（均为项目既有 API，不新增字段）：
 * - 无限   ：PlayerProgress.infinityUnlocked() / player.infinities
 * - 永恒   ：PlayerProgress.eternityUnlocked() / player.eternities
 * - 现实   ：PlayerProgress.realityUnlocked() / player.realities
 * - 天神   ：Teresa.isUnlocked（成就 147）/ Teresa.pouredAmount
 * - 毁灭   ：Pelle.isUnlocked（虚幻升级 25）/ Pelle.isDoomed
 */

import { GameSpeed } from "./speed-config.js";

const STAGE_EARLY = "early";
const STAGE_INFINITY = "infinity";
const STAGE_ETERNITY = "eternity";
const STAGE_REALITY = "reality";
const STAGE_CELESTIALS = "celestials";
const STAGE_DOOMED = "doomed";

/**
 * 阶段定义。unlocked = 解锁条件是否满足；entered = 是否真的进入过这个阶段。
 * 两者的差别在「天神」上最明显：成就 147 一到手就算解锁（可以进入），
 * 但只有真的往特蕾莎灌注过现实机器才算进入。
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
    focus: "用 IP 买无限升级、打破无限、跑普通挑战；总反物质到 1e40 后打开自动化页面。",
    nextSteps: [
      "先买无限维度与 IP 倍率类升级",
      "总反物质达到 1e40 后打开「自动化 → 自动购买器」",
      "按顺序完成普通挑战 1-8，缩短维度购买器间隔",
      "完成挑战 9-12，强化计数频率 / 提升 / 星系 / 坍缩购买器",
      "打开「打破无限」并升级，把反物质上限推过 1.8e308",
      "IP 攒到首次永恒需求后点「永恒」",
    ],
  },
  {
    key: STAGE_ETERNITY,
    name: "永恒期",
    unlocked: () => PlayerProgress.current.isEternityUnlocked,
    entered: () => new Decimal(player.eternities).gt(0),
    focus: "时间研究、时间维度、永恒升级、时间膨胀；EP 主要用来点亮时间研究树。",
    nextSteps: [
      "用 EP 买时间研究，先走通一条主线",
      "解锁并升级时间维度",
      "买永恒升级，拿到自动机（Automator）",
      "领取永恒里程碑奖励",
      "买时间膨胀，进入膨胀获取膨胀时间（DT）",
      "达到现实要求后做第一次现实",
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
      "把 RM 灌注给特蕾莎换时间定理",
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
    focus: "毁灭现实里大部分机制被佩勒禁用，需要用 Pelle 升级与裂缝逐步夺回。",
    nextSteps: [
      "在「天神 → 佩勒」里先看清哪些机制被禁用",
      "用 Pelle 升级逐个恢复自动购买器与倍率",
      "推进佩勒裂缝与打击目标，直到游戏结束",
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

export const TUTORIAL_CHAPTERS = [
  {
    key: "intro",
    title: "Mod 介绍",
    subtitle: "这是什么版本，哪些是改过的",
    sections: [
      {
        heading: "这是什么",
        points: [
          "这是 Antimatter Dimensions 的 Oreki 改版（Mod）：基础机制与成本没有重写，改的是「怎么更快玩到」的部分。",
          `默认以全局速度倍率 ×${GameSpeed.defaultFactor} 运行，可在「选项 → 游戏性」改成 ${GameSpeed.min}× ~ ${GameSpeed.max}×，改完立即生效。`,
          "这个倍率单独保存在浏览器本地：重置存档、导入存档都不会改变它，也不会进入存档文件。",
          "打开本教程不会暂停游戏，随时可以关掉继续玩（选项 → 游戏性 → 内置教程）。",
        ],
      },
      {
        heading: "本 Mod 改了什么（细节见第 5 章）",
        points: [
          "[Mod 定制 AU2 / AU3 / AU4] 首次无限后，维度、计数频率、维度提升、星系、大坍缩五个自动购买器直接可用；原版要完成挑战 9-12 才逐个解锁。",
          "[Mod 定制 AU4b] 大坍缩自动购买器首次接管时，默认策略被换成「单次 IP 至少 10 倍历史最高」，避免反物质被反复清零卡在 1.8e308。",
          "[Mod 定制 AB2] 维度「买最大」在买不起 10 个时退化为买 1 个，于是重置后的第一维度也能自动买。",
          "完整清单在「帮助」（H2P）→「本版本的改动」，比这里更细。",
        ],
      },
      {
        heading: "爽玩思路",
        points: [
          "目标不是把数值调大，而是用更少的现实时间走到同一个进度。",
          "把重复点击交给自动购买器，把注意力留给「下一步做什么」。",
          "觉得进度只是在干等时，直接看第 4 章「阶段指南」里当前阶段的建议。",
        ],
      },
    ],
  },
  {
    key: "basics",
    title: "新手入门",
    subtitle: "从第一维到第一次无限",
    sections: [
      {
        heading: "把维度买起来",
        points: [
          "第一反物质维度是唯一起点，点它的购买按钮开始积累反物质。",
          "反物质达到 100 时解锁第二维度；之后依次向上解锁。",
          "买过第二维度后出现「计数频率提升」（Tickspeed），它让所有维度的生产更快，越早买越好。",
        ],
      },
      {
        heading: "第一次重置",
        points: [
          "拥有 20 个第四维度时可以买一次「维度提升」（Dimension Boost）：维度被重置，但获得倍率。",
          "拥有 80 个第八维度时可以买「反物质星系」（Galaxy）：它降低维度成本的增长倍率。",
          "重置类操作只会重置维度相关状态，成就不受影响。",
        ],
      },
      {
        heading: "首次无限",
        points: [
          "反物质达到 1.8e308 时，可以点「大坍缩」（Big Crunch）换取无限点数（IP）。",
          "第一次无限会开启无限页签、无限升级与自动购买器收益。",
          "本 Mod 在这一刻就把主要自动购买器交给你（AU2/AU3/AU4），不需要先打挑战。",
        ],
      },
      {
        heading: "两个容易漏的点",
        points: [
          "成就提供额外倍率，越早解锁收益越久。",
          "总反物质达到 1e40 后，侧栏才会出现「自动化」页签；在此之前自动购买器页签不存在，不是坏了。",
        ],
      },
    ],
  },
  {
    key: "automation",
    title: "自动化",
    subtitle: "自动购买器在哪、怎么开、怎么升",
    sections: [
      {
        heading: "在哪看",
        points: [
          "侧栏「自动化 → 自动购买器」。该页签在总反物质达到 1e40 之前不会出现。",
          "每个购买器都有独立开关与间隔，页面顶部还有「暂停 / 恢复全部自动购买器」的总开关。",
          "快捷键 A 可以切换这个总开关。",
        ],
      },
      {
        heading: "什么时候能用",
        points: [
          "[Mod 定制] 首次无限后，维度、计数频率、维度提升、星系、大坍缩五个购买器同时解锁。",
          "挑战依然值得打：完成普通挑战 1-8 缩短维度购买器间隔，挑战 9 缩短计数频率间隔，挑战 10 / 11 分别对应维度提升与星系。",
          "毁灭现实（佩勒）里部分购买器会被禁用，需要在佩勒升级里逐个恢复。",
        ],
      },
      {
        heading: "怎么调",
        points: [
          "间隔降到最小值（100 毫秒）后，后续升级改成「一次多买几个」，不再缩短间隔。",
          "维度购买器默认一次买 10 个；配合 AB2，买不起 10 个时会自动退化为买 1 个。",
          "大坍缩购买器的默认策略是「单次 IP ≥ 10 倍历史最高」。前期不要改成「IP ≥ 1」，否则每次坍缩都会把反物质清零。",
        ],
      },
      {
        heading: "两个可选提速开关",
        points: [
          "「选项 → 游戏性」里有「自动购买器间隔随倍率缩短」和「Tick Speed 购买器间隔随倍率缩短」两个开关，默认关闭。",
          "打开后购买间隔按游戏速度倍率缩短，让购买节奏跟得上游戏时间；倍率调到 1× 时行为与关闭一致。",
          "这两个开关是独立实验特性，只影响对应购买器，不影响别的机制。",
        ],
      },
    ],
  },
  {
    key: "stages",
    title: "阶段指南",
    subtitle: "按你现在的进度给出建议",
    kind: "stages",
    sections: [],
  },
  {
    key: "mod",
    title: "Mod 专属机制",
    subtitle: "每条改动的准确范围",
    sections: [
      {
        heading: "自动购买器提前接管（AU2 / AU3 / AU4）",
        points: [
          "改动：把「解锁条件」从「完成对应普通挑战」改成「完成过首次无限或已满足原条件」。",
          "不改变：购买记录、间隔、成本、批量设置都没有被伪造或跳过；未购买过的购买器 isBought 仍是 false。",
          "证据：src/core/autobuyers/antimatter-dimension-autobuyer.js、tickspeed-autobuyer.js、dimboost-autobuyer.js、galaxy-autobuyer.js、big-crunch-autobuyer.js 里的 isUnlocked。",
        ],
      },
      {
        heading: "大坍缩默认策略（AU4b）",
        points: [
          "改动：首次接管时若策略是「按 IP 数量」且阈值低于 10，自动改成「单次 IP ≥ 10 倍历史最高」。",
          "原因：默认「IP ≥ 1」会让自动坍缩在反物质刚过阈值时立刻清空，反物质长期卡在 1.8e308 附近，无限维度永远攒不出来。",
          "不改变：坍缩条件本身、重置副作用、购买器间隔都没有改动，只是默认策略值。",
          "证据：src/core/autobuyers/big-crunch-autobuyer.js 的 isUnlocked。",
        ],
      },
      {
        heading: "买最大退化（AB2）",
        points: [
          "改动：「买最大维度」在整批 10 个买不起时，改为买 1 个，而不是什么都不做。",
          "原因：重置后反物质恰好是 10、维度是 0，而整批 10 个要 100，自动购买器会永远买不起，玩家每次重置都得手点第一维度。",
          "不改变：买得起整批时逻辑完全不变。",
          "证据：src/core/dimensions/antimatter-dimension.js 的 buyMaxDimension。",
        ],
      },
      {
        heading: "全局速度倍率",
        points: [
          "唯一注入点是主循环里的 realDiff，其余计时按各自语义单独处理，没有第二次放大。",
          "现实时间类统计（现实游玩时长、最速记录的现实时间）不乘倍率；界面上的「游戏内时间」也不含该倍率。",
          "证据：src/core/speed-config.js；说明见 H2P「本版本的改动」「时间统计口径」。",
        ],
      },
      {
        heading: "两个可选工具",
        points: [
          "「选项 → 游戏性」里的「成就工具」「存档工具」默认不启用，只在你点击并确认后执行。",
          "存档工具的导入、还原、重置之前都会先写一份本地快照，可一键恢复。",
        ],
      },
      {
        heading: "没有改的部分",
        points: [
          "存档格式与迁移逻辑没有新增字段；挑战、升级、里程碑的成本与奖励按官方版本。",
          "侧栏导航项数量不变（商店仍是条件项）。",
          "本教程只读取游戏状态，不写任何数据。",
        ],
      },
    ],
  },
  {
    key: "faq",
    title: "常见问题",
    subtitle: "卡住了先看这里",
    sections: [
      {
        heading: "资源不涨了",
        points: [
          "先看是否在挑战里：挑战会禁用一部分机制，界面顶部通常有提示。",
          "检查是否点了「暂停全部自动购买器」（快捷键 A）。",
          "检查「选项 → 游戏性」里的全局速度倍率是否被调成 1×。",
          "毁灭现实（佩勒）会禁用大量倍率与购买器，属于设计而非故障。",
        ],
      },
      {
        heading: "自动购买器不工作",
        points: [
          "「解锁」不等于「已启用」：每个购买器右侧都有自己的开关，需要单独打开。",
          "总开关是否处于暂停状态（快捷键 A 可以切换）。",
          "间隔太长时看着像没工作：升级间隔需要完成对应普通挑战。",
          "佩勒会用 strikes 与升级禁用部分购买器，需要先在佩勒里恢复。",
        ],
      },
      {
        heading: "阶段没解锁",
        points: [
          "看第 4 章「阶段指南」：每一行都标了「已进入 / 条件已满足，尚未进入 / 未解锁」。",
          "未解锁时对应页签不会出现在侧栏，这是正常行为，不是导航损坏。",
          "「条件已满足，尚未进入」表示解锁条件已经达到，只是还没真的做过那一步（例如天神已解锁但还没灌注 RM）。",
        ],
      },
      {
        heading: "怎么知道现在该做什么",
        points: [
          "第 4 章最上面的「当前阶段」会给出一串具体步骤。",
          "「帮助」（H2P）里有每个机制的详细说明，按当前页签自动定位。",
          "拿不准时先做「能立刻做完的那一步」，别停在原地等资源。",
        ],
      },
      {
        heading: "时间对不上",
        points: [
          "界面区分「现实时间」与「游戏内时间」：前者不受全局倍率影响，后者是游戏内膨胀后的时间。",
          "本 Mod 的全局倍率不属于游戏内膨胀，已从「游戏内时间」里剔除。详细口径见 H2P「时间统计口径」。",
        ],
      },
      {
        heading: "存档出问题了",
        points: [
          "「选项 → 存档」可以手动导出存档文本；「存档工具」还能在导入 / 重置前自动写本地快照。",
          "导入前会做版本与格式校验，版本高于当前游戏时会拒绝导入。",
        ],
      },
    ],
  },
];
