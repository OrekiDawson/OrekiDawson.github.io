import { DC } from "../../core/constants.js";

/**
 * [Oreki R37] 新手教程（Web）
 *
 * 为什么放在 components 而不是 `secret-formula/h2p.js`：
 *   h2p.js 属于「原版数据层」，本轮的写权限只在 components/**；而且教程要**按当前进度**
 *   动态高亮「你现在该做什么」，属于交互逻辑而不是静态资料。因此这里做成一个
 *   「虚拟的 h2p 页签」，由 H2PModal 组装到页签列表最前面，不写入 GameDatabase。
 *
 * 内容准则（R37 执行令）：
 *   1) 只写本版本真实存在的功能 —— 每条都能在代码里指到出处（见各章注释）；
 *   2) 不写「未实现 / 计划中」的东西；
 *   3) 章节顺序 = 玩家真实推进顺序，术语一律用游戏内既有中文（维度提升 / 反物质星系 /
 *      大坍缩 / 打破无限 / 时间定理 / 膨胀 / 符文 / 佩勒 …），不另造译名。
 */

const safe = (fn, fallback = false) => {
  try {
    return fn();
  } catch (e) {
    return fallback;
  }
};

const gt = (value, n) => safe(() => Decimal.gt(value, n), false);

/** 步骤清单：顺序就是推荐推进顺序；`done` 用真实存档状态判定，不写死任何进度。 */
const STEPS = [
  {
    id: "first-dim",
    text: "点「维度」页里第 1 个反物质维度的价格按钮（10 反物质），买下第一个维度",
    done: () => safe(() => AntimatterDimension(1).bought >= 1)
  },
  {
    id: "all-dims",
    text: "依次解锁第 2~8 个反物质维度；买到第 8 维度后产量会明显起飞",
    done: () => gt(safe(() => AntimatterDimension(8).amount, DC.D0), 0)
  },
  {
    id: "boost",
    text: "攒够反物质就点「维度提升」（按钮会显示当前需求），把全部维度的产量乘一个倍率",
    done: () => safe(() => player.dimensionBoosts >= 1)
  },
  {
    id: "galaxy",
    text: "第 8 维度达到需求数量后买「反物质星系」，它会按倍率提升全部维度",
    done: () => safe(() => player.galaxies >= 1)
  },
  {
    id: "infinity",
    text: "反物质顶到 1.8e308（界面显示为「无限」）后点「大坍缩」，完成第一次无限",
    done: () => safe(() => player.infinities.gt(0))
  },
  {
    id: "break",
    text: "在「无限」页用无限点数买「打破无限」，之后反物质可以突破上限",
    done: () => safe(() => player.break === true)
  },
  {
    id: "id",
    text: "用无限点数买无限维度（ID1 起），让无限点数开始自动增长",
    done: () => safe(() => InfinityDimension(1).isUnlocked)
  },
  {
    id: "eternity",
    text: "无限点数顶到 1.8e308（界面显示为「无限」）后点「永恒」，进入第二个重置层",
    done: () => safe(() => player.eternities.gt(0))
  },
  {
    id: "ts",
    text: "在「永恒」页用时间定理买时间研究、点出时间维度，把永久点数堆起来",
    done: () => safe(() => player.timestudy.studies.length > 0)
  },
  {
    id: "dilation",
    text: "在研究树里点出「时间膨胀」研究，解锁膨胀（Dilation）",
    done: () => safe(() => TimeStudy.dilation.isBought)
  },
  {
    id: "reality",
    text: "永久点数达到现实需求后点「现实」，进入第三个重置层",
    done: () => safe(() => player.realities.gt(0))
  },
  {
    id: "glyph",
    text: "现实后每次都会给符文：把符文装到空槽位里，效果立刻生效",
    done: () => safe(() => Glyphs.active.length > 0)
  },
  {
    id: "normal-challenge",
    text: "「挑战」页：先做普通挑战（首次无限后解锁），奖励是永久加成",
    done: () => safe(() => PlayerProgress.challengeCompleted())
  },
  {
    id: "inf-challenge",
    text: "再做无限挑战（目标高于无限上限）",
    done: () => safe(() => PlayerProgress.infinityChallengeCompleted())
  },
  {
    id: "eter-challenge",
    text: "最后做永恒挑战：限制最狠，但奖励直接改玩法",
    done: () => safe(() => EternityChallenge(1).completions > 0 || EternityChallenges.all.some(c => c.completions > 0))
  },
  {
    id: "celestial",
    text: "通关「天神」页的七位天神：特蕾莎 → 鹿颈长 → 无名氏 → 薇 → 太阳神 → 莱特拉 → 佩勒",
    done: () => safe(() => Pelle.isDoomed)
  }
];

/** 当前阶段：用真实存档判定，返回 0~6 的序号（只用于文案，不影响任何玩法）。 */
function currentStage() {
  if (safe(() => Pelle.isDoomed)) return 6;
  if (safe(() => player.realities.gt(0))) return 5;
  if (safe(() => player.eternities.gt(0))) return 4;
  if (safe(() => player.infinities.gt(0))) return 3;
  if (gt(safe(() => Currency.antimatter.value, DC.D0), 1e100)) return 2;
  if (safe(() => player.dimensionBoosts >= 1)) return 1;
  return 0;
}

const STAGE_NAMES = [
  "开局：反物质维度",
  "维度提升与反物质星系",
  "逼近第一次无限",
  "无限（无限点数）",
  "永恒（时间研究 / 膨胀）",
  "现实（符文 / 现实机器）",
  "后期天神与佩勒"
];

/** 下一步 = 第一条未完成的步骤（这就是「按当前进度高亮」的唯一判据）。 */
function nextStep() {
  return STEPS.find(step => !safe(step.done, false)) ?? STEPS[STEPS.length - 1];
}

const chapter = (title, body) => `<h3 class="c-oreki-tut__h3">${title}</h3><div class="c-oreki-tut__body">${body}</div>`;

const INF_TOKEN = "{{INF}}";
const infText = () => safe(() => format(Number.MAX_VALUE, 2), "1.80e308");
const fill = text => String(text).split(INF_TOKEN).join(infText());

/** 步骤太多会把弹窗撑成一屏列表：只显示「当前 + 后 4 步」，并给出「已完成 x/16」。 */
const VISIBLE_STEPS = 5;

function renderChecklist() {
  const next = nextStep();
  const states = STEPS.map(step => ({ step, done: safe(step.done, false) }));
  const doneCount = states.filter(s => s.done).length;
  const firstPending = states.findIndex(s => !s.done);
  const start = firstPending < 0
    ? Math.max(0, states.length - VISIBLE_STEPS)
    : Math.max(0, Math.min(firstPending, states.length - VISIBLE_STEPS));
  const visible = states.slice(start, start + VISIBLE_STEPS);
  const rows = visible.map(({ step, done }, offset) => {
    const index = start + offset + 1;
    const cls = ["c-oreki-tut__step", done ? "c-oreki-tut__step--done" : "",
      !done && step.id === next.id ? "c-oreki-tut__step--now" : ""].filter(Boolean).join(" ");
    const mark = done ? "✔" : (step.id === next.id ? "▶" : "○");
    return `<li class="${cls}"><span class="c-oreki-tut__mark">${mark}</span>`
      + `<span class="c-oreki-tut__steptext">${index}. ${fill(step.text)}</span></li>`;
  }).join("");
  const stage = currentStage();
  return `<div class="c-oreki-tut__now">
    <div class="c-oreki-tut__now-title">你现在该做什么</div>
    <div class="c-oreki-tut__now-stage">当前阶段：${STAGE_NAMES[stage]}　·　已完成 ${doneCount} / ${STEPS.length} 个里程碑</div>
    <div class="c-oreki-tut__now-next">▶ 下一步：${fill(next.text)}</div>
    <ol class="c-oreki-tut__steps">${rows}</ol>
    <div class="c-oreki-tut__hint">进度由存档状态自动判定（✔ = 已完成，▶ = 现在做这一条）；只列出最近的几步。</div>
  </div>`;
}

const ORIGIN = chapter("① 开局 30 秒：先买下第一个维度", `
<p>「维度」页有 8 个反物质维度。<b>反物质</b>是本金，维度是产能：第 1 维度花 10 反物质，买下后开始自己产反物质。</p>
<p>操作顺序：买第 1 维度 → 攒钱买第 2 维度 → 一路买到第 8 维度。价格按钮上写的就是当前花费，点一下即买。</p>
<p>买不动就等产量自己涨；本版有全局速度倍率（默认已加速），等待时间比原版短得多。</p>
`);

const DIM_RESET = chapter("② 维度、维度提升、反物质星系、大坍缩", `
<p><b>维度提升</b>：满足需求后点它，把全部反物质维度的产量按倍率提升（默认每层 ×2，可被无限升级、时间研究、符文进一步加强）。需求会随次数上涨。</p>
<p><b>反物质星系</b>：第 8 维度达到需求数量后可以买。它把全部维度的产量整体乘一个倍率，是前期最大的跳跃。</p>
<p><b>大坍缩（= 第一次无限）</b>：反物质顶到 1.8e308（界面上显示成「无限」）就会被强制坍缩，
重置反物质 / 维度 / 维度提升 / 星系，但会给你<b>无限点数（IP）</b>。这是本作第一个「重置层」。</p>
<p>记住一句话：<b>重置不是失败，是换一种货币继续变强</b>。每次重置后都会比以前更快回到原位。</p>
`);

const INFINITY = chapter("③ 无限：无限点数、打破无限、无限维度、复制器", `
<p>第一次无限之后：</p>
<ul>
<li><b>无限升级</b>（「无限」页）：用 IP 买，多数是永久加成，优先买能提高 IP 收入的。</li>
<li><b>打破无限</b>：用 IP 买下后，反物质可以超过 1.8e308，坍缩时按超出量给更多 IP。</li>
<li><b>无限维度（ID1~ID8）</b>：用 IP 买。ID1 负责产出 IP，后面的维度给前面的维度加成。</li>
<li><b>复制器（Replicanti）</b>：解锁后自动增长，可以换反物质星系；相关升级能让它反过来提高无限收益。</li>
<li><b>自动化</b>：本版在<b>第一次无限之后</b>就解锁「自动化」页里的自动购买器（原版要等挑战 10–12）。
打开后维度购买、维度提升、星系、大坍缩都可以交给它，你只负责决策。</li>
</ul>
`);

const ETERNITY = chapter("④ 永恒：时间维度、时间定理、时间研究、膨胀", `
<p>无限点数顶到 1.8e308（界面显示为「无限」）就能点<b>永恒</b>，拿到<b>永久点数（EP）</b>。</p>
<ul>
<li><b>时间维度（TD1~TD8）</b>：永恒页里用 EP 买，产出时间碎片，是这一阶段的主要产能。</li>
<li><b>时间研究</b>：用<b>时间定理（TT）</b>购买，研究树分「永恒」「膨胀」等分支，效果互相组合。</li>
<li><b>膨胀（Dilation）</b>：点出「时间膨胀」研究后解锁。它<b>不是</b>加速时钟，而是把维度倍率的指数开 0.75 次方（削弱产量），
换取时间碎片与膨胀专属内容，属于「用强度换新资源」。</li>
<li><b>永恒里程碑</b>：达成条件后永久保留某些自动购买器，减少重复操作。</li>
</ul>
<p>这一阶段的常见卡点不是等待，而是<b>购买顺序</b>：先把 8 个时间维度补满，再堆 EP 与 IP 倍率。</p>
`);

const REALITY = chapter("⑤ 现实：符文、现实机器、现实升级、黑洞", `
<p>EP 达到现实需求后点<b>现实</b>：重置到更早的层级，进入第三个重置层，并获得<b>现实机器（RM）</b>。</p>
<ul>
<li><b>符文（Glyph）</b>：每次现实会给若干符文供你选择。装到槽位里效果立刻生效；
不同种类（时间 / 膨胀 / 复制 / 无限 / 力量 / 现实）分别强化不同系统，等级越高越强。</li>
<li><b>现实升级</b>：用 RM 买，很多是「让某个系统重新可用 / 提高上限」的质变型升级。</li>
<li><b>机器 / 黑洞</b>：现实页里可以解锁黑洞与自动化相关内容，进一步压缩重复劳动。</li>
<li><b>符文炼金 / 符文选择</b>：后期用来把不需要的符文转成资源。</li>
</ul>
<p>符文是「配置」而不是「数值」：换一套符文就是换一种打法，卡住时先想想要不要换符文。</p>
`);

const CHALLENGES = chapter("⑥ 挑战：普通 → 无限 → 永恒", `
<p>「挑战」页分三档，完成条件都是「重新达到无限」，但会施加不同限制：</p>
<ul>
<li><b>普通挑战</b>：首次无限后解锁，限制维度 / 星系 / 价格等；奖励是永久的小幅加成。</li>
<li><b>无限挑战</b>：目标高于无限上限，必须打破无限才能完成；奖励通常是强力的机制型加成。</li>
<li><b>永恒挑战</b>：限制最狠（禁研究、禁维度等），奖励直接改变玩法。</li>
</ul>
<p>建议：能稳定无限之后，先把普通挑战清一遍（奖励永久生效），再推进无限挑战。
挑战进行中不影响你随时退出，直接重置即可放弃。</p>
`);

const LATEGAME = chapter("⑦ 后期：七位天神与佩勒", `
<p>「天神」页按顺序解锁，每一位都是一种独立的玩法层：</p>
<ol>
<li><b>特蕾莎</b>：用现实机器「倾注」换符文相关加成。</li>
<li><b>鹿颈长</b>：以符文与字形为核心的试炼。</li>
<li><b>无名氏</b>：存储与释放游戏时间的机制。</li>
<li><b>薇</b>：用「空间」目标推进的成就式挑战。</li>
<li><b>太阳神</b>：宠物与记忆系统，长期养成的产能。</li>
<li><b>莱特拉</b>：暗物质维度与熵，另一套独立的维度体系。</li>
<li><b>佩勒</b>：最终层「毁灭现实」—— 它会拿走你大部分能力，要求你从零重建。
进入佩勒前请<b>先导出存档备份</b>：这是不可逆的终局状态。</li>
</ol>
<p>天神之间不是纯线性：前置条件满足就会解锁下一位，卡住时回「天神」页看哪一位的按钮亮着。</p>
`);

const BASICS = chapter("⓪ 界面速查", `
<ul>
<li><b>左侧栏</b>：维度、自动化、挑战、无限、永恒、现实、天神、成就、统计数据、选项（随进度逐个出现）。</li>
<li><b>右上「?」</b>：就是本窗口，任何时候都能打开。</li>
<li><b>右上「i」</b>：版本 / 版权信息。</li>
<li><b>底部信息栏</b>：存档倒计时与本次游玩时间；「选项 → 存档」可以导入 / 导出存档，换设备前先导出。</li>
<li><b>通知</b>：右上角最多同时显示 4 条，同样的提示会合并成「×N」。</li>
</ul>
`);

const Honesty = `<div class="c-oreki-tut__note">
本页只描述当前版本真实存在的功能。遇到与本页不符的现象，以游戏内实际表现与「选项」里的设置为准；
本页不包含任何「计划中」的功能。
</div>`;

export const OrekiTutorial = {
  /** 供 H2PModal 组装的虚拟页签（结构与 h2p.js 的条目一致） */
  tab: {
    id: -1,
    name: "Oreki 新手教程",
    alias: "新手教程",
    isUnlocked: () => true,
    tags: ["tutorial", "guide", "新手", "教程", "入门", "oreki"],
    tab: "",
    info: () => OrekiTutorial.render()
  },

  stage() {
    return currentStage();
  },

  stageName() {
    return STAGE_NAMES[currentStage()];
  },

  nextStep() {
    const step = nextStep();
    return { text: step.text, done: safe(step.done, false) };
  },

  steps() {
    return STEPS.map(step => ({ id: step.id, text: step.text, done: safe(step.done, false) }));
  },

  /** 搜索命中：标题 / 章节名 / 步骤文本的简单包含匹配（h2p 的模糊搜索索引不覆盖本页） */
  matches(query) {
    const q = String(query || "").trim().toLowerCase();
    if (q === "") return true;
    const haystack = [
      "oreki 新手教程", "新手", "教程", "入门", "guide", "tutorial",
      ...STAGE_NAMES,
      ...STEPS.map(s => s.text)
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  },

  render() {
    return `<div class="c-oreki-tut">
      ${renderChecklist()}
      ${fill(BASICS)}
      ${fill(ORIGIN)}
      ${fill(DIM_RESET)}
      ${fill(INFINITY)}
      ${fill(ETERNITY)}
      ${fill(REALITY)}
      ${fill(CHALLENGES)}
      ${fill(LATEGAME)}
      ${Honesty}
    </div>`;
  }
};
