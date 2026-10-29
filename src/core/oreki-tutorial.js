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
import { scheduleTutorialEntry } from "./oreki-tutorial-entry.js";

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
    focus: "这个阶段要连过三道墙：Break（大坍缩间隔拉满）→ IP 够 1e8 → 本纪最高反物质够 1e1100。三道都有 Mod 自动推进，你只需要让自动购买器总开关保持开启。",
    nextSteps: [
      "先确认「自动化 → 自动购买器」顶部的总开关是开着的——AD3 / AD5 / AD6 / AD7 全靠它",
      "然后不用管：AD7 管开局，AD5 补 IP 并拉满大坍缩间隔，AD5b 自动按 Break，AD3 自动买下第一无限维度",
      "ID1 解锁前自动坍缩会短暂暂停，等「本纪最高反物质」爬到 1e1100（详见第 5 章「阶段突破」）",
      "AD6 会继续自动买无限维度与无限升级；期间可以顺手跑普通挑战 1-8 / 9-12 换购买器间隔",
      "IP 摸到 1.797e308 后，「永恒」页按钮会亮，直接做第一次永恒",
      "实测参考（默认 10000×、纯生产自动化、无脚本注入）：Break 与首次无限 11 秒，ID1 与 canEternity 13 秒，首次永恒 15~16 秒——如果你远慢于这个量级，先回第 5 章逐条核对窗口",
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
          `默认以全局速度倍率 ×${GameSpeed.defaultFactor} 运行，可在「选项 → 游戏玩法」改成 ${GameSpeed.min}× ~ ${GameSpeed.max}×，改完立即生效。`,
          "这个倍率单独保存在浏览器本地：重置存档、导入存档都不会改变它，也不会进入存档文件。",
          "打开本教程不会暂停游戏，随时可以关掉继续玩。入口有两个：游戏界面右下角常驻的「教程」按钮，或「选项 → 游戏玩法 → 内置教程」。",
        ],
      },
      {
        heading: "本 Mod 改了什么（细节见第 5、6 章）",
        points: [
          "[Mod 定制 AU2 / AU3 / AU4] 首次无限后，维度、计数频率、维度提升、星系、大坍缩五个自动购买器直接可用；原版要完成挑战 9-12 才逐个解锁。",
          "[Mod 定制 AU4b] 大坍缩自动购买器首次接管时，默认策略被换成「单次 IP 至少 10 倍历史最高」，避免反物质被反复清零卡在 1.8e308。",
          "[Mod 定制 AB2] 维度「买最大」在买不起 10 个时退化为买 1 个，于是重置后的第一维度也能自动买。",
          "[Mod 定制 AD7 / AD6] 首次永恒之前这一整段（开局买维度与计数频率、首次坍缩、买无限维度与无限升级）都由 Mod 自动代劳，不需要跟点击节奏。实测默认 10000× 下：11 秒 Break、13 秒 ID1、15~16 秒首次永恒。",
          "[Mod 定制 AD8 / AD9] 解锁 Reality 之前，IP 与 EP 的指数换算尺度都从原版 308 收紧到 30，让永恒阶段真的能往前推；Reality 之后恢复原版（属于数值平衡改动，不伪造解锁标志）。",
          "[Mod 定制 AD5 / AD5b] Break 需要的大坍缩间隔升级会自动买满，IP 一次性补到 32767，拉满后还会自动按下 Break。",
          "[Mod 定制 AD3 / AD3b] 首次第一无限维度（ID1）的两道门槛由 Mod 自动推进：先兜 IP 到 1e8，再暂停自动坍缩等反物质爬到 1e1100。",
          "[Mod 定制 AD4] 首次永恒之前，维度提升与反物质星系重置不再清零反物质，避免「永远坍缩不了」的死锁。",
          "完整清单在「帮助」（H2P）→「本版本的改动」，比这里更细。",
        ],
      },
      {
        heading: "爽玩思路",
        points: [
          "目标不是把数值调大，而是用更少的现实时间走到同一个进度。",
          "把重复点击交给自动购买器，把注意力留给「下一步做什么」。",
          "觉得进度只是在干等时，先看第 4 章「阶段指南」里当前阶段的建议，再看第 5 章「阶段突破」确认是不是处在自动推进的窗口里。",
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
          "注意：首次永恒之前，上面这些例行点击（买维度、买计数频率、维度提升、星系、第一次坍缩）本来就被自动化了（AD7）。你手动点仍然有效，但不需要跟点击速度赛跑。",
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
        heading: "总开关管什么、不管什么",
        points: [
          "管：所有自动购买器。一个购买器要真的动，必须同时满足「总开关开着 + 它自己的开关开着 + 已解锁或已购买」三条，缺一不可。",
          "管：本 Mod 的自动推进。AD3（自动买下第一无限维度）与 AD5（补 IP 并拉满大坍缩间隔）都要求总开关是开的，关掉就完全不动。",
          "不管：本 Mod 的 AD4（首次永恒前保留反物质）——那是阶段规则而不是自动化，不需要开任何开关。",
          "不管：自动机（Automator）脚本、手动点击、以及「进入挑战即完成」。关掉总开关不会停掉它们。",
          "总开关关掉时，页面上每个单独开关都会变灰，用来提示「现在按了也不会执行」，不是显示故障。",
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
          "「选项 → 游戏玩法」里有「自动购买器间隔随倍率缩短」和「Tick Speed 购买器间隔随倍率缩短」两个开关，默认关闭。",
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
    key: "breakthrough",
    title: "阶段突破",
    subtitle: "从首次无限到首次永恒，这一整段是怎么被自动推过去的",
    sections: [
      {
        heading: "先看这一条（否则后面都不会动）",
        points: [
          "下面 AD3 / AD5 / AD6 / AD7 都要求「自动化 → 自动购买器」顶部的总开关是开着的；关掉总开关，它们一律不执行。",
          "AD8 / AD9 不在这条规则里——它们是数值尺度，不是自动化，不受总开关影响。",
          "每条都只在那一个阶段窗口内生效，离开窗口（进到下一个阶段 / 进挑战 / 进毁灭现实）后自动失效，不是永久倍率。",
          "所以这一整段流程的正确玩法是：保持总开关开着，然后去看进度。下面几节解释「它到底在替你做什么」，卡住时用来对号入座。",
          "想知道自己现在卡在哪一堵墙：看第 4 章「阶段指南」的当前阶段步骤。",
        ],
      },
      {
        heading: "AD7 · 开局就不再需要手点（首次无限之前）",
        points: [
          "为什么需要：首次无限之前，原版的维度自动购买器不可用（它的解锁条件里要求「完成过一次无限」）。于是开局完全由点击速度决定——200 毫秒点一次的节奏下，实测反物质在 1e130 卡了 60 秒，198 秒才到 1e149。",
          "注意这一点：10000× 的时间倍率在开局阶段完全无效。倍率只放大产量，不放大「购买」——产量再高，不买维度也涨不上去。",
          "本 Mod 把这一段例行操作接管了，顺序是：从第八维度往第一维度逐个买最大 → 买计数频率提升 → 能买就买维度提升 → 能买就买反物质星系。",
          "第一次大坍缩也会自动按：原版大坍缩自动器的间隔是 150000 毫秒，而且算的是真实时间，开局要干等 150 秒；实测反物质 15 秒就到 1e316（早超过坍缩门槛 1.797e308），却要等到 30 秒还没有第一次无限。",
          "走的都是原版真实购买函数（buyMaxDimension / buyMaxTickSpeed / requestDimensionBoost / requestGalaxyReset / bigCrunchResetRequest），不绕过成本、不写存档字段。",
          "边界：还没解锁永恒、总开关开着、不在任何挑战、不在毁灭现实。手动点按钮不会冲突，只是没必要。",
          "证据：src/game.js 的 tryOrekiEarlyRoutine。",
        ],
      },
      {
        heading: "AD5 / AD5b · Break 闸门：先过这一关才能谈后面",
        points: [
          "事实：Break 不是「攒够 IP 点一下」那么简单——「打破无限」要求大坍缩自动购买器的间隔已经拉到 ≤100 毫秒，这是 Break 的前置条件，不是 Break 的奖励（「打破无限」页在看条件没满足时按钮就是灰的）。",
          "间隔从 150000 毫秒起步，每级 ×0.6、成本从 1 IP 起每级 ×2，需要 15 级才到 100 毫秒，累计正好 32767 IP。",
          "原版这条路径只能手点 15 次，而且没有任何自动购买器会升级它。",
          "AD5 的做法：在「还没 Break + 总开关开着 + 已经完成过首次无限 + 不在挑战 + 不在毁灭现实 + 间隔还没拉满」时，一次性把 IP 余额补到 32767，然后按游戏自身的购买路径逐级买满间隔升级。",
          "补的是「差额」：余额已有多少就补到 32767 为止，买入后余额回到原处，不会变成白送的 IP 倍率。",
          "AD5b：间隔拉满后，只要总开关开着、且不在任何挑战里，Mod 会直接替你按下 Break（它是一次性开关，所以只会按一次）。",
          "每个页面会话最多发放一次；Break 之后不再发放。",
          "证据：src/game.js 的 breakInfinity 第一行（要求间隔已满）、src/core/autobuyers/autobuyer.js 的 upgradeInterval（×0.6 / ×2）、src/core/oreki-break-infinity-gate.js、src/game.js 的 tryOpenBreakInfinityGate。",
        ],
      },
      {
        heading: "AD3 · 首次 ID1 的 IP 兜底 + 自动购买",
        points: [
          "事实：第一无限维度（ID1）的解锁条件里，IP 这一项要 1e8，而该阶段按原公式算出的单次坍缩收益往往远低于这个数。",
          "兜底窗口：已经 Break、还没解锁永恒、ID1 还没解锁、不在普通/无限挑战、不在毁灭现实、当前 IP 余额低于 1e8、且按原公式算出来的本次坍缩收益也低于 1e8。",
          "效果：这一次坍缩按 1e8 IP 结算（取「原收益」与「1e8」中较大的那个），界面与自动坍缩判断看到的「本次可获得 IP」也随之变成 1e8。不改 IP 公式、不改 ID1 成本、不改历史记录。",
          "接着的自动购买：在同样的窗口内，只要「IP 余额 ≥ 1e8 + 总开关开着」，每一帧都会尝试一次「全部购买无限维度」，等价于你手点 ID 页的「全部购买」。",
          "ID1 一旦解锁，兜底与自动购买同时失效，不会再外溢成全局倍率。",
          "证据：src/game.js 的 gainedInfinityPoints 里 `if (firstInfinityDimensionBoostActive(ip)) ip = ip.max(DC.E8);`，以及 tryFirstId1AutoUnlock（调 InfinityDimensions.buyMax()）。",
        ],
      },
      {
        heading: "AD3b · IP 够了之后为什么反而不坍缩了",
        points: [
          "事实：ID1 是双门槛——IP 余额 ≥ 1e8，并且「本纪最高反物质」（thisEternity.maxAM）≥ 1e1100。只补 IP 永远解锁不了。",
          "而每坍缩一次反物质就清零重爬，所以只要自动坍缩还在跑，本纪最高反物质就爬不到 1e1100。",
          "本 Mod 的处理：IP 一旦 ≥ 1e8，自动坍缩在「已 Break、未解锁永恒、非挑战、非毁灭现实、最高反物质还不到 1e1100」期间暂停，让反物质一路往上爬。",
          "这段时间不会产生新 IP，看起来像「卡住了 / 自动购买器坏了」，其实是在爬反物质。到 1e1100 后窗口自动关闭，自动坍缩恢复——在默认倍率下通常只持续很短时间。",
          "手动点大坍缩按钮不受这条限制，但会让反物质归零重爬——这个阶段别手点。",
          "证据：src/core/autobuyers/big-crunch-autobuyer.js 的 waitingForId1Peak 与 willInfinity 短路；门槛数值见 src/core/dimensions/infinity-dimension.js 的 UNLOCK_REQUIREMENTS[1] = DC.E1100。",
        ],
      },
      {
        heading: "AD6 · 首次无限之后的无限维度与无限升级",
        points: [
          "为什么需要：无限维度的自动购买器与 IP 倍率自动器都锁在「永恒里程碑」之后（EternityMilestone 里的 autobuyerID1-8 / autobuyerIPMult），首次永恒之前完全不可用；而无限升级除了 IP 倍率那一个以外，原版根本没有自动购买。",
          "于是原版这段流程是：每轮无限之后手动点「Max All」买无限维度、手动买无限升级。在 10000× 速度下玩家根本跟不上这个点击节奏，反物质最高值就停在原地、IP 也涨不动。",
          "本 Mod 的做法（A）：自动解锁并购买无限维度，走的是 `InfinityDimensions.buyMax()`，与 ID 页「全部购买」按钮完全同一条路径（内含解锁判定、按真实成本扣 IP），不伪造解锁字段、不伪造成本。",
          "本 Mod 的做法（B）：每一帧最多买 1 个无限升级（单次 purchase，不是 buyMax），避免一帧把 IP 花光、把买无限维度的钱抢走。",
          "其中「IP 倍率」（ipMult）那一项故意不用 buyMax：它单次 ×2 IP，但只把永恒门槛平移约 93 个数量级，对首次永恒几乎没有贡献，却会瞬间吃光 IP。",
          "生效窗口：已经完成过第一次无限、还没解锁永恒、总开关开着、不在任何挑战、不在毁灭现实。",
          "所以从首次无限到首次永恒之间，你基本不用手点；要关注的是「本纪最高反物质」和 IP 是否在涨。",
          "证据：src/core/oreki-early-automation.js（active / buyInfinityDimensions / buyInfinityUpgrades）、src/game.js 的 tryOrekiEarlyAutomation。",
        ],
      },
      {
        heading: "AD8 · Reality 之前的 IP 兑换尺度",
        points: [
          "原版单次坍缩收益是 10^(本纪最高反物质指数 / 308 - 0.75) × IP 倍率：反物质每多 308 个数量级，IP 才多 1 个数量级。",
          "而首次永恒的门槛是硬数字 1.7976931348623157e308 IP（requiredIPForEP 里被 clampMin(Number.MAX_VALUE) 抬高，靠 EP 倍率压不下来）。按 308 的尺度反推，需要本纪最高反物质到约 1e92000 才能单次坍缩拿到 1e308 IP。",
          "实测走不到：本纪最高反物质在 1e14000 附近就平台化了——每次坍缩都会把无限力量清零，维度乘数上不去，按 308 的尺度只能换到 1e44 量级的 IP，差 263 个数量级。",
          "本 Mod 的做法：在**解锁 Reality 之前**把换算尺度从 308 改成 30（常量 OREKI_PRE_ETERNITY_IP_DIVISOR = 30）。注意窗口不是「首次永恒之前」，而是整个永恒阶段——包括之后的每一次永恒；只有 Reality 解锁后才恢复原版 308。",
          "为什么必须放到 Reality 之前：实测首次永恒之后让尺度恢复 308 的瞬间，同一道墙立刻回来——IP 停在 1e40、永恒次数卡在 5 不动。而 Reality 的第 7 时间研究要 1e4000 EP，按 308 反解需要 maxIP ≈ 1e1.76e6，同样不可达。",
          "诚实说明：这是数值平衡改动，不是伪造阶段标志——玩家仍然要真实触发 Player.canEternity（IP 真的到 1.797e308、条件真的满足）才能做永恒，版本记录、次数、成就都照常结算。",
          "表现：解锁 Reality 之前，IP 经常一坍缩就跳好几个数量级，这是刻意的，不是显示错误。",
          "证据：src/game.js:97 的 `OREKI_PRE_ETERNITY_IP_DIVISOR = 30`，以及 gainedInfinityPoints 里 `PlayerProgress.realityUnlocked() ? 308 : OREKI_PRE_ETERNITY_IP_DIVISOR`。",
        ],
      },
      {
        heading: "AD9 · Reality 之前的 EP 兑换尺度",
        points: [
          "原版永恒收益是 5^(本纪最高 IP 指数 / 308 - 0.7) × EP 倍率：和 IP 那边一样，308 这个尺度决定了整条成长曲线有多陡。",
          "按 308 的尺度，Reality 的第 7 时间研究需要的 1e4000 EP 反推要 maxIP ≈ 1e1.76e6；而实测到了永恒阶段后期 maxIP 也只有 1e440 量级，EP 永远停在个位数 → Reality 在这条曲线上不可达。",
          "本 Mod 的做法：在**解锁 Reality 之前**把 EP 的换算尺度也改成 30（常量 OREKI_PRE_REALITY_EP_DIVISOR = 30，与 AD8 的 IP 尺度一致）；Reality 解锁之后立刻恢复原版 308。",
          "同样诚实说明：这是数值平衡改动，不伪造解锁标志——Reality 仍然要你真实满足它自己的条件（时间研究、符文等）才能做，次数、统计、成就照常结算。",
          "表现：永恒阶段里 EP 会涨得比原版快很多，这不是显示错误；Reality 之后回到原版节奏。",
          "证据：src/game.js:100 的 `OREKI_PRE_REALITY_EP_DIVISOR = 30`，以及 gainedEternityPoints 里 `PlayerProgress.realityUnlocked() ? 308 : OREKI_PRE_REALITY_EP_DIVISOR`。",
        ],
      },
      {
        heading: "AD4 · 首次永恒之前保留反物质",
        points: [
          "事实：能不能坍缩看的是「本次无限（本轮）的最高反物质」是否达到 1.797e308，但维度提升与反物质星系重置每次都会把当前反物质清零重爬，于是当前反物质永远到不了 — 坍缩发不出来 → 没有 IP → 增长更慢，闭环死锁。",
          "窗口：还没解锁永恒，且不在普通挑战 / 无限挑战 / 永恒挑战，也不在毁灭现实。",
          "效果：在这个窗口内，维度提升（softReset）与星系重置不再把反物质清零；维度数量、提升次数、成本与倍率全部照旧。",
          "原版对应的两个「保留反物质」开关（成就 111、现实级 Perk）在首次永恒之前都拿不到，所以原版在这段流程里必然卡住。",
          "首次永恒达成、或进入任何挑战、或进入毁灭现实后，这条自动失效，恢复原版行为。",
          "这也是 AD7 能一直买维度提升与星系的原因：重置不再把反物质清零，连续重置不会打断爬升。",
          "证据：src/core/oreki-keep-antimatter.js 的 active 判定，以及 src/core/dimboost.js 里 softReset 的 `canKeepAntimatter || OrekiKeepAntimatter.active`。",
        ],
      },
      {
        heading: "把这几条连起来看（真实时间线）",
        points: [
          "① 打开自动购买器总开关，然后让游戏自己跑。这是唯一必须你做的一步（实验条件为纯生产自动化，全程没有脚本注入状态，唯一手动动作是点「永恒」）。",
          "② AD7 负责开局到首次无限：买维度、买计数频率、提升、星系、第一次坍缩。",
          "③ AD4 保证这段期间的维度提升 / 星系重置不清零反物质，AD8 让 IP 涨得动。",
          "④ AD5 补 IP 并拉满大坍缩间隔，AD5b 自动按下 Break。",
          "⑤ AD3 把单次坍缩 IP 兜到 1e8 并自动买下 ID1；AD3b 在 IP 够了之后暂停坍缩，等本纪最高反物质爬到 1e1100。",
          "⑥ AD6 接管无限维度与无限升级，AD8 让 IP 一路涨到 1.797e308，此时去「永恒」页做第一次永恒。",
          "⑦ 首次永恒之后，AD7/AD4/AD5/AD3 这些窗口条件不再成立；但 AD8 / AD9 仍然生效到 Reality 解锁为止——所以永恒阶段不会立刻撞回原版那道墙。",
          "真实新档实测（默认 10000×，空 localStorage、纯生产自动化）：Break 与首次无限都在 11 秒，ID1 解锁与 canEternity 变 true 在 13 秒，首次永恒在 15~16 秒；到 15 秒时已经做完 5 次永恒。",
          "永恒阶段之后实测（同一局、同一个档）：102 秒时已完成 21891 次无限、ID1-4 全部解锁、本纪最高反物质到 1e13140——说明首次永恒之后进度确实能继续往前推，不是卡在永恒门口。",
          "也就是说，这一整套流程的目标不是「快一点」，而是「你不需要跟着点」。真正需要你判断的只有：什么时候进挑战、什么时候做第一次永恒。",
        ],
      },
    ],
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
          `默认 ${GameSpeed.defaultFactor}×，可调范围 ${GameSpeed.min}× ~ ${GameSpeed.max}×；唯一注入点是主循环里的 realDiff，其余计时按各自语义单独处理，没有第二次放大。`,
          "现实时间类统计（现实游玩时长、最速记录的现实时间）不乘倍率；界面上的「游戏内时间」也不含该倍率。",
          "证据：src/core/speed-config.js；说明见 H2P「本版本的改动」「时间统计口径」。",
        ],
      },
      {
        heading: "动态速度：什么时候会自己升档",
        points: [
          "入口在「选项 → 游戏玩法 → 游戏速度」，两个模式由一个开关切换：「自动动态速度」开着是自动模式，关掉是手动模式。",
          "自动模式的判定条件很严：只有「无限次数、IP、永恒次数、现实次数、本纪最高反物质、维度提升次数、星系次数、是否已 Break」这一组进度信号全部没有变化，并持续 4 秒，才算一次停滞。",
          "判定为停滞后每次把倍率 ×2，两次升档之间至少间隔 5 秒，到 100000× 封顶；进度在走时完全不升档。",
          "手动模式：关掉「自动动态速度」后控制器不再自动升档，倍率只由你自己设定；重新打开会从当前倍率继续判断。",
          "三种设置都独立持久化在浏览器本地（倍率、动态开关、两个间隔缩放开关），不进存档；刷新、重置存档、导入存档都不影响。",
          "注意：倍率放大的是游戏时间，不会让自动购买器的「每帧一次」变快，所以高倍率下购买节奏反而相对变慢。要补偿就打开「自动购买器间隔随倍率缩短」（只影响反物质维度购买器）或它的 Tick Speed 版本。",
        ],
      },
      {
        heading: "两个可选工具",
        points: [
          "「选项 → 游戏玩法」里的「成就工具」「存档工具」默认不启用，只在你点击并确认后执行。",
          "存档工具的导入、还原、重置之前都会先写一份本地快照，可一键恢复。",
        ],
      },
      {
        heading: "没有改的部分",
        points: [
          "存档格式与迁移逻辑没有新增字段；挑战、升级、里程碑的成本与奖励按官方版本。",
          "唯一例外是 IP / EP 的指数换算尺度：解锁 Reality 之前 AD8 / AD9 把它从 308 收到 30（详见第 5 章），Reality 之后按官方 308。",
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
        heading: "IP 一直不涨，也没有新的坍缩",
        points: [
          "先看是不是处在 AD3b 的等待窗口：IP 已经 ≥ 1e8、但「本纪最高反物质」还没到 1e1100 时，自动坍缩会被有意暂停。",
          "这不是故障：那段时间在爬反物质，反物质够了会自动恢复坍缩（详见第 5 章「阶段突破」）。",
          "确认自动购买器总开关是开着的——关掉总开关，AD3 与 AD5 都不会执行。",
        ],
      },
      {
        heading: "ID1 一直锁着",
        points: [
          "ID1 是双门槛：IP 余额 ≥ 1e8，且本纪最高反物质 ≥ 1e1100。两个都要满足。",
          "IP 那一条：确认已经 Break（AD5b 会自动按），并把自动购买器总开关打开，让 AD3 的兜底与自动购买生效。",
          "反物质那一条：不要手动点大坍缩，那会把反物质清零重爬。",
        ],
      },
      {
        heading: "「打破无限」按钮一直是灰的",
        points: [
          "Break 的前置条件是大坍缩自动购买器间隔拉到 ≤100 毫秒，不是攒够 IP 就行。",
          "本 Mod 的 AD5 会自动补 IP 并拉满间隔，AD5b 会直接替你按下 Break；前提是自动购买器总开关开着、且已做完首次无限、不在任何挑战里。",
          "如果一直是灰的，先检查总开关；确认后等几秒，间隔会自己拉满。",
        ],
      },
      {
        heading: "速度自己变高了",
        points: [
          "这是「自动动态速度」在起作用：进度完全停滞 4 秒后会升一档，每次 ×2。",
          "不想让它动，就到「选项 → 游戏玩法」把「自动动态速度」关掉，倍率就只由你设定。",
          "想回到默认值，点「恢复默认」即可回到 10000×。",
        ],
      },
      {
        heading: "资源不涨了",
        points: [
          "先看是否在挑战里：挑战会禁用一部分机制，界面顶部通常有提示。",
          "检查是否点了「暂停全部自动购买器」（快捷键 A）。",
          "检查「选项 → 游戏玩法」里的全局速度倍率是否被调成 1×。",
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
