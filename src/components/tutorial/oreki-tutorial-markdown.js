/**
 * AD: Oreki Edition — 附录正文的极简 Markdown 渲染
 *
 * 为什么自己写：本项目没有打包器，也没有引入 markdown 库（`grep -rn "markdown\|marked" src/`
 * 只有 CodeMirror 内部字段名撞词）。附录正文只用到固定的几种写法，为此拉一个依赖不合适。
 *
 * 只支持附录里真实出现的语法（用脚本统计过 7 篇的正文）：
 *   `## ` / `### ` 标题、`| a | b |` 表格（第二行是 --- 分隔行）、`- ` 无序列表、
 *   `1. ` 有序列表、`---` 分隔线、`**粗体**`、`` `行内代码` ``、空行分段。
 *
 * 安全：先整体做 HTML 转义，再做行内标记替换 —— 正文是我们自己写的数据，但渲染层
 * 不应该假设「数据一定没有 `<script>`」。转义放在最前面，任何写进 JSON 的尖括号都变成字面量。
 *
 * 不支持的写法（链接、图片、嵌套列表、fenced code）会被当成普通段落原样显示，
 * 不会静默丢内容 —— 宁可显示得朴素，也不能让玩家看不到字。
 */

const ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/gu, ch => ESCAPE_MAP[ch]);
}

/** 行内标记：`**粗体**` 与 `` `代码` ``。输入必须已经过 escapeHtml。 */
function inline(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/`([^`]+)`/gu, "<code>$1</code>");
}

const TABLE_DIVIDER = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/u;

/** 把 `| a | b |` 拆成单元格；首尾的空串是行首行尾的竖线，丢掉。 */
function splitRow(line) {
  const cells = line.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|");
  return cells.map(cell => cell.trim());
}

/**
 * 把附录正文（Markdown 子集）渲染成 HTML 字符串。
 * @param {string} source
 * @returns {string}
 */
export function renderTutorialMarkdown(source) {
  const lines = String(source || "").replace(/\r\n/gu, "\n").split("\n");
  const out = [];
  let i = 0;

  const isBlockStart = line => {
    const t = line.trim();
    return t === ""
      || t === "---"
      || t.startsWith("### ")
      || t.startsWith("## ")
      || t.startsWith("|")
      || /^[-*]\s+/u.test(t)
      || /^\d+\.\s+/u.test(t);
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      i += 1;
      continue;
    }

    if (trimmed === "---") {
      out.push("<hr>");
      i += 1;
      continue;
    }

    if (trimmed.startsWith("### ") || trimmed.startsWith("## ")) {
      const level = trimmed.startsWith("### ") ? 3 : 2;
      out.push(`<h${level}>${inline(escapeHtml(trimmed.slice(level + 1).trim()))}</h${level}>`);
      i += 1;
      continue;
    }

    // 表格：连续的 `|` 行；第二行必须是分隔行，否则当普通段落
    if (trimmed.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].trim());
        i += 1;
      }
      const hasDivider = rows.length >= 2 && TABLE_DIVIDER.test(rows[1]);
      if (hasDivider) {
        const head = splitRow(rows[0]);
        const bodyRows = rows.slice(2).map(splitRow);
        const thead = `<thead><tr>${head.map(cell => `<th>${inline(escapeHtml(cell))}</th>`).join("")}</tr></thead>`;
        const tbody = `<tbody>${bodyRows.map(row =>
          `<tr>${row.map(cell => `<td>${inline(escapeHtml(cell))}</td>`).join("")}</tr>`).join("")}</tbody>`;
        out.push(`<table class="c-oreki-tut__table">${thead}${tbody}</table>`);
      } else {
        // 不是表格（例如正文里以竖线开头的句子），原样成段
        out.push(`<p>${inline(escapeHtml(rows.join(" ")))}</p>`);
      }
      continue;
    }

    // 无序列表
    if (/^[-*]\s+/u.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/u.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/u, ""));
        i += 1;
      }
      out.push(`<ul class="c-oreki-tut__list">${items.map(item =>
        `<li>${inline(escapeHtml(item))}</li>`).join("")}</ul>`);
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/u.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/u.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/u, ""));
        i += 1;
      }
      out.push(`<ol class="c-oreki-tut__list">${items.map(item =>
        `<li>${inline(escapeHtml(item))}</li>`).join("")}</ol>`);
      continue;
    }

    // 段落：吃到空行或下一个块开始
    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    if (paragraph.length > 0) {
      out.push(`<p class="c-oreki-tut__md-p">${inline(escapeHtml(paragraph.join(" ")))}</p>`);
    } else {
      // 兜底：本行是块开始但没被上面的分支吃掉（理论上不会发生），原样输出，避免死循环
      out.push(`<p class="c-oreki-tut__md-p">${inline(escapeHtml(trimmed))}</p>`);
      i += 1;
    }
  }

  return out.join("\n");
}
