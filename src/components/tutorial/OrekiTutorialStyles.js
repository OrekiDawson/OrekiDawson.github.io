/**
 * AD: Oreki Edition — 教程正文的补充样式（运行时注入一次）
 *
 * 为什么不用 public/stylesheets/oreki.css：
 *   本轮的写权限只在教程相关的 core / components 文件里，不动全局样式表。
 *   这些类只在教程正文里出现，注入一次即可，重复调用按 id 去重。
 *
 * 约定：类名沿用 c-oreki-tut__ 前缀，与 oreki.css 里已有的教程样式同族，
 * 颜色全部走项目已有的 CSS 变量（--color-reality / --color-good / --color-bad），
 * 不写死色值，避免亮暗主题下不可读。
 */

export const TUTORIAL_STYLE_ID = "oreki-tutorial-injected-style";

const CSS = `
.c-oreki-tut__scroll { overflow-x: hidden; }
/* 关闭方式的提示：只要「能找到」，不抢视觉注意力，所以压小字号、压透明度 */
.c-oreki-tut__hint {
  margin: 0.2rem 0 0.4rem;
  font-size: 1rem;
  line-height: 1.4;
  opacity: 0.55;
}
.c-oreki-tut__block { margin: 0 0 0.9rem; }
.c-oreki-tut__label {
  margin-bottom: 0.25rem;
  font-size: 1.15rem;
  font-weight: bold;
  letter-spacing: 0.02em;
  color: var(--color-reality);
}
.c-oreki-tut__text { font-size: 1.25rem; line-height: 1.6; overflow-wrap: anywhere; }
.c-oreki-tut__list {
  margin: 0;
  padding-left: 1.6rem;
  font-size: 1.25rem;
  line-height: 1.6;
}
.c-oreki-tut__list li { margin-bottom: 0.35rem; }
.c-oreki-tut__auto {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0 0.4rem;
  font-size: 1rem;
  line-height: 1.5;
  color: var(--color-good);
  white-space: nowrap;
  border: 0.1rem solid var(--color-good);
  border-radius: 0.3rem;
}
.c-oreki-tut__table {
  width: 100%;
  font-size: 1.15rem;
  line-height: 1.5;
  border-collapse: collapse;
}
.c-oreki-tut__table th,
.c-oreki-tut__table td {
  padding: 0.3rem 0.5rem;
  text-align: left;
  vertical-align: top;
  border-bottom: 0.1rem solid rgb(255 255 255 / 12%);
  /* 360px 实测：1.7976931348623157e308 这类长数值会把单元格撑到 159px，
     整张表 318px > 容器 314px，页面右侧出现横向滚动条。允许任意断行即可。 */
  overflow-wrap: anywhere;
  word-break: break-word;
}
.c-oreki-tut__table th { font-weight: bold; color: var(--color-reality); }
/* 原来是 nowrap，窄屏下会把「标签」列顶成固定 32% 且不可压缩，连带把数值列挤出容器 */
.c-oreki-tut__key { width: 32%; }
.c-oreki-tut__src {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.95rem;
  opacity: 0.55;
  word-break: break-all;
}
/* 360px 实测：src/core/dimboost.js:100-107 在西文长串上仍撑出 4px，
   和单元格的 anywhere 一起兜住，保证窄屏不出横向滚动条 */
.c-oreki-tut__src,
.c-oreki-tut__text,
.c-oreki-tut__list,
.c-oreki-tut__trap,
.c-oreki-tut__done,
.c-oreki-tut__placeholder-body { overflow-wrap: anywhere; }
/* 正文里的西文长标识符（如 1e10500、oreki-instant-challenges.js）不给任何元素
   撑宽容器的机会：教程容器本身也裁掉横向溢出，纵向滚动不受影响。
   __scroll 必须单独写：overflow-y: auto 会把 overflow-x 一并算成 auto，
   内容一旦超宽就会出现横向滚动条（360px 实测 ch02/ch03 各有一条）。 */
.c-oreki-tut { max-width: 100%; overflow-x: hidden; }
.c-oreki-tut__scroll { overflow-x: hidden; }
.c-oreki-tut__placeholder {
  margin: 0 0 0.9rem;
  padding: 0.8rem 1rem;
  font-size: 1.2rem;
  line-height: 1.6;
  background: rgb(255 255 255 / 5%);
  border: 0.1rem solid var(--color-reality);
  border-radius: 0.4rem;
}
.c-oreki-tut__placeholder-title {
  margin-bottom: 0.4rem;
  font-size: 1.3rem;
  font-weight: bold;
  color: var(--color-reality);
}
.c-oreki-tut__placeholder-body p { margin: 0 0 0.4rem; }
.c-oreki-tut__placeholder-body p:last-child { margin-bottom: 0; }
.c-oreki-tut__trap {
  margin: 0 0 0.9rem;
  padding: 0.6rem 0.8rem;
  font-size: 1.2rem;
  line-height: 1.55;
  background: rgb(255 255 255 / 4%);
  border-left: 0.4rem solid var(--color-bad);
  border-radius: 0.4rem;
}
.c-oreki-tut__trap li { margin-bottom: 0.3rem; }
.c-oreki-tut__locked {
  margin-bottom: 0.8rem;
  padding: 0.5rem 0.8rem;
  font-size: 1.15rem;
  color: var(--color-bad);
  border: 0.1rem solid var(--color-bad);
  border-radius: 0.4rem;
}
.c-oreki-tut__done {
  padding: 0.5rem 0.8rem;
  font-size: 1.2rem;
  line-height: 1.55;
  border: 0.1rem solid var(--color-good);
  border-radius: 0.4rem;
}
.c-oreki-tut__draft {
  margin-bottom: 0.8rem;
  font-size: 1.1rem;
  font-style: italic;
  opacity: 0.7;
}
.c-oreki-tut__dot {
  flex: 0 0 auto;
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 50%;
}
.c-oreki-tut__dot--entered { background: var(--color-good); }
.c-oreki-tut__dot--available { background: var(--color-reality); }
.c-oreki-tut__dot--locked { border: 0.1rem solid rgb(255 255 255 / 35%); }
.c-oreki-tut__details { margin: 0 0 0.6rem; }
/* 目录里的「附录」分组标题：它不是按钮，只是分隔，所以压小、压淡、不可点 */
.c-oreki-tut__nav-label {
  margin: 0.8rem 0 0.2rem;
  font-size: 1.05rem;
  letter-spacing: 0.02em;
  opacity: 0.6;
}
/* 附录按钮与章节按钮同形，但用虚线边区分「不是主线」 */
.c-oreki-tut__nav-btn--apx { border-style: dashed; }
/* ── 附录正文（Markdown 渲染结果）────────────────────────────────────
   表格复用 .c-oreki-tut__table，列表复用 .c-oreki-tut__list，
   这里只补标题、段落、行内代码、分隔线。字号与正文一致，避免两套排版。 */
.c-oreki-tut__md { font-size: 1.25rem; line-height: 1.6; }
.c-oreki-tut__md h2 { margin: 1.2rem 0 0.6rem; font-size: 1.45rem; color: var(--color-reality); }
.c-oreki-tut__md h3 { margin: 1.1rem 0 0.5rem; font-size: 1.3rem; color: var(--color-reality); }
.c-oreki-tut__md-p { margin: 0 0 0.7rem; overflow-wrap: anywhere; }
.c-oreki-tut__md code {
  padding: 0 0.25rem;
  font-size: 1.1rem;
  background: rgb(255 255 255 / 10%);
  border-radius: 0.2rem;
  word-break: break-all;
}
.c-oreki-tut__md hr {
  margin: 1rem 0;
  border: 0;
  border-top: 0.1rem solid rgb(255 255 255 / 15%);
}
.c-oreki-tut__md table { margin: 0 0 0.9rem; }
.c-oreki-tut__md ul,
.c-oreki-tut__md ol { margin: 0 0 0.9rem; }.c-oreki-tut__summary {
  padding: 0.4rem 0.2rem;
  font-size: 1.3rem;
  font-weight: bold;
  cursor: pointer;
  color: var(--color-reality);
}
.c-oreki-tut__summary--current { color: var(--color-good); }
`;

/**
 * 注入教程补充样式。可重复调用。
 * @param {Document|null} doc
 */
export function ensureTutorialStyles(doc = typeof document === "undefined" ? null : document) {
  if (!doc || !doc.head) return;
  if (doc.getElementById(TUTORIAL_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = TUTORIAL_STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
