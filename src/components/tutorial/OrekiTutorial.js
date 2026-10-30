import {
  getChapterGaps,
  getTutorialStageSnapshot,
  getTutorialStartIndex,
  TUTORIAL_CHAPTERS,
  TUTORIAL_LOCKED_PREFIX,
  TUTORIAL_SCHEMA_VERSION,
} from "../../core/oreki-tutorial.js";
import { ensureTutorialStyles } from "./OrekiTutorialStyles.js";

/**
 * [Oreki R37 / R40-G] 新手教程的「帮助页」形态（Web）
 *
 * 为什么放在 components 而不是 `secret-formula/h2p.js`：
 *   h2p.js 属于「原版数据层」，本轮的写权限只在 components/**；而且教程要**按当前进度**
 *   定位到「你现在该读哪一章」，属于交互逻辑而不是静态资料。因此这里做成一个
 *   「虚拟的 h2p 页签」，由 H2PModal 组装到页签列表最前面，不写入 GameDatabase。
 *
 * R40-G 改动：
 *   1. 正文全部来自 src/core/oreki-tutorial-data.json —— 本文件**不再硬编码任何一句正文**。
 *      以前这里有 7 段手写 HTML（ORIGIN / DIM_RESET / …），与 JSON 分叉的正是这一份。
 *   2. 每次渲染都拼 30 KB 字符串成本不低，而 H2PModal 的搜索框是 v-model 双向绑定，
 *      每敲一个键都会重新调用 info()（v-html 重新赋值）。所以这里按「阶段 + 当前章」
 *      做一次性缓存，只有进度真的变了才重建。
 *   3. 章节用 <details> 折叠，默认展开当前章 —— 不用改 H2PModal 就能实现「定位」。
 */

const esc = text => String(text ?? "")
  .replace(/&/gu, "&amp;")
  .replace(/</gu, "&lt;")
  .replace(/>/gu, "&gt;")
  .replace(/"/gu, "&quot;");

function paragraph(label, text) {
  if (!text) return "";
  return `<div class="c-oreki-tut__block">
    <div class="c-oreki-tut__label">${esc(label)}</div>
    <div class="c-oreki-tut__text">${esc(text)}</div>
  </div>`;
}

function listBlock(label, items, renderItem) {
  if (!Array.isArray(items) || items.length === 0) return "";
  const body = items.map((item, i) => `<li>${renderItem(item, i)}</li>`).join("");
  return `<div class="c-oreki-tut__block">
    <div class="c-oreki-tut__label">${esc(label)}</div>
    <ol class="c-oreki-tut__list">${body}</ol>
  </div>`;
}

function numbersBlock(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return "";
  const rows = numbers.map(num => `<tr>
      <td class="c-oreki-tut__key">${esc(num.label)}</td>
      <td>${esc(num.value)}<span class="c-oreki-tut__src">${esc(num.src)}</span></td>
    </tr>`).join("");
  return `<div class="c-oreki-tut__block">
    <div class="c-oreki-tut__label">关键数值</div>
    <table class="c-oreki-tut__table"><tbody>${rows}</tbody></table>
  </div>`;
}

function tableBlock(table) {
  if (!table || !Array.isArray(table.head) || !Array.isArray(table.rows)) return "";
  // 空表不要渲染成一个只有边框的空壳：头或体任一为空就当作没有表
  if (table.head.length === 0 || table.rows.length === 0) return "";
  const head = table.head.map(cell => `<th>${esc(cell)}</th>`).join("");
  const body = table.rows
    .map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="c-oreki-tut__block">
    <div class="c-oreki-tut__label">对照表</div>
    <table class="c-oreki-tut__table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  </div>`;
}

/**
 * 草稿章的占位卡。
 *
 * 触发条件：`draft === true` 且 `steps` 为空 —— 也就是正文还没进来的章节。
 * 这类章节直接渲染只有「阶段目标 / 进入条件 / 完成判据 / 下一步」四句话（实测 160~380 字），
 * 玩家点进去会以为教程加载失败。占位卡把「现在有什么、还缺什么」一次说清，不造假内容。
 */
function placeholderBlock(chapter) {
  const gaps = getChapterGaps(chapter);
  if (!chapter.draft || !gaps.pending.length) return "";
  const pending = gaps.pending.join("、");
  const ready = gaps.ready.length ? gaps.ready.join("、") : "无";
  return `<div class="c-oreki-tut__placeholder">
    <div class="c-oreki-tut__placeholder-title">本章正在编写中</div>
    <div class="c-oreki-tut__placeholder-body">
      <p>这一章只写到骨架，还没有可执行的操作步骤。下面是已经写好的部分，可以照它判断自己走到哪一步；缺的部分补完后会自动出现在这里，不需要你另找攻略。</p>
      <p>已有内容：${esc(ready)}</p>
      <p>还缺内容：${esc(pending)}</p>
    </div>
  </div>`;
}

function trapsBlock(traps) {
  if (!Array.isArray(traps) || traps.length === 0) return "";
  const body = traps.map(trap => `<li>${esc(trap)}</li>`).join("");
  return `<div class="c-oreki-tut__block">
    <div class="c-oreki-tut__label">常见卡点</div>
    <ul class="c-oreki-tut__trap">${body}</ul>
  </div>`;
}

/** 单章正文。withoutStageGoal=true 时省掉与顶部定位条重复的「阶段目标」。 */
function renderChapterBody(chapter) {
  return [
    paragraph("阶段目标", chapter.stageGoal),
    paragraph("进入条件", chapter.entry),
    listBlock("具体操作", chapter.steps, step =>
      `${esc(step.text)}${step.auto ? '<span class="c-oreki-tut__auto">已自动化</span>' : ""}`),
    listBlock("购买优先级", chapter.buyOrder, item => esc(item)),
    paragraph("自动化配置（哪些事不用你做）", chapter.automation),
    paragraph("挑战攻略", chapter.challenges),
    numbersBlock(chapter.numbers),
    tableBlock(chapter.table),
    `<div class="c-oreki-tut__block">
      <div class="c-oreki-tut__label">完成判据</div>
      <div class="c-oreki-tut__done">${esc(chapter.done)}</div>
    </div>`,
    paragraph("下一步", chapter.next),
    trapsBlock(chapter.traps),
    chapter.note ? `<div class="c-oreki-tut__block"><div class="c-oreki-tut__text">${esc(chapter.note)}</div></div>` : "",
  ].join("");
}

function renderAllChapters(currentIndex) {
  return TUTORIAL_CHAPTERS.map((chapter, index) => {
    const isCurrent = index === currentIndex;
    const locked = chapter.stageKey && stageRowOf(chapter.stageKey)?.status === "locked";
    const summaryClass = isCurrent
      ? "c-oreki-tut__summary c-oreki-tut__summary--current"
      : "c-oreki-tut__summary";
    const lockedBar = locked
      ? `<div class="c-oreki-tut__locked">${esc(TUTORIAL_LOCKED_PREFIX)}本章机制现在还不能用。</div>`
      : "";
    const placeholder = placeholderBlock(chapter);
    // 占位卡已经把「还没写完」说清楚了，再叠一条草稿条只是重复噪音
    const draftBar = chapter.draft && !placeholder
      ? `<div class="c-oreki-tut__draft">本章尚未写完（草稿）。</div>`
      : "";
    return `<details class="c-oreki-tut__details" ${isCurrent ? "open" : ""}>
      <summary class="${summaryClass}">${esc(chapter.title)}　<span style="font-size: 1.1rem; opacity: 0.7;">${esc(chapter.subtitle)}</span></summary>
      ${lockedBar}${draftBar}${placeholder}${renderChapterBody(chapter)}
    </details>`;
  }).join("");
}

let stageSnapshotCache = null;
function stageRowOf(stageKey) {
  if (!stageSnapshotCache) {
    try {
      stageSnapshotCache = getTutorialStageSnapshot();
    } catch (e) {
      stageSnapshotCache = { rows: [] };
    }
  }
  return stageSnapshotCache.rows.find(row => row.key === stageKey) || null;
}

/** 渲染结果缓存：key 覆盖所有会影响输出的进度信号 */
let renderCache = { key: null, html: "" };

function renderHint(currentChapter) {
  if (!currentChapter) return "";
  return `<div class="c-oreki-tut__now">
    <div class="c-oreki-tut__now-title">你现在应该读这一章</div>
    <div class="c-oreki-tut__now-stage">${esc(currentChapter.title)}　·　${esc(currentChapter.subtitle)}</div>
    <div class="c-oreki-tut__now-next">▶ 本章完成判据：${esc(currentChapter.done)}</div>
    <div class="c-oreki-tut__hint">下方默认展开的就是这一章；点章节标题可以折叠/展开。带「已自动化」标记的动作由本 MOD 代劳，你不需要执行。</div>
  </div>`;
}

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

  /** 当前应该读第几章（与教程弹窗的定位逻辑同一份判断） */
  startIndex() {
    try {
      return getTutorialStartIndex();
    } catch (e) {
      return 0;
    }
  },

  /** 搜索命中：章节标题 / 副标题 / 目标 / 判据 / 步骤文本的包含匹配 */
  matches(query) {
    const q = String(query || "").trim().toLowerCase();
    if (q === "") return true;
    const haystack = [
      "oreki 新手教程", "新手", "教程", "入门", "guide", "tutorial",
      ...TUTORIAL_CHAPTERS.flatMap(chapter => [
        chapter.title,
        chapter.subtitle,
        chapter.stageGoal,
        chapter.done,
        ...(chapter.steps || []).map(step => step.text),
      ]),
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  },

  /**
   * 渲染整个教程页（H2P 页签用）。
   * 结果按「阶段快照 + 当前章」缓存：H2PModal 的搜索框每敲一个键都会调这里。
   */
  render() {
    ensureTutorialStyles();
    let snapshot;
    try {
      snapshot = getTutorialStageSnapshot();
    } catch (e) {
      snapshot = { key: "early", rows: [] };
    }
    stageSnapshotCache = snapshot;
    const index = this.startIndex();
    const key = [
      TUTORIAL_SCHEMA_VERSION,
      snapshot.key,
      snapshot.rows.map(row => row.status).join(","),
      index,
      TUTORIAL_CHAPTERS.length,
    ].join("|");
    if (renderCache.key === key) return renderCache.html;

    const html = `<div class="c-oreki-tut">
      ${renderHint(TUTORIAL_CHAPTERS[index])}
      ${renderAllChapters(index)}
      <div class="c-oreki-tut__note">
        本页只描述当前版本真实存在的功能，每个数值都能在源码里找到出处（见「关键数值」的小字）。
        需要按章节翻页、或想从当前进度直接跳转时，点页面上的「教程」按钮打开教程窗口。
      </div>
    </div>`;
    renderCache = { key, html };
    return html;
  }
};
