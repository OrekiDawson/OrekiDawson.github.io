/**
 * AD: Oreki Edition — 内置教程的常驻入口
 *
 * 为什么需要这个文件：
 * 教程弹窗原本只挂在「选项 → 游戏玩法 → 内置教程」这样一个三层深的按钮上，
 * 手机上要先把选项页往下滚约 1000px 才看得到。教程的价值在于「卡住时随手能查」，
 * 埋在那里等于没有入口。
 *
 * 做法：在页面里注入一个固定定位的「教程」按钮（样式见 public/stylesheets/oreki.css
 * 的 .c-oreki-tut-entry），任何页签、任何滚动位置都点得到，并且：
 * - 只调用已有的 Modal.orekiTutorial.show()，不复制弹窗逻辑、不写任何游戏状态；
 * - z-index 低于 .l-modal-overlay（6），弹窗打开时按钮被遮罩盖住，不会抢焦点；
 * - 重复调用 installTutorialEntry() 不会重复插入（按 id 去重）；
 * - 不修改 index.html 与其它组件，纯运行时注入，删掉本文件即成原状。
 */

/** 注入按钮的固定 id，用于去重与测试断言 */
export const TUTORIAL_ENTRY_ID = "oreki-tutorial-entry";

function openTutorialModal() {
  try {
    const modal = window.Modal && window.Modal.orekiTutorial;
    if (!modal) return false;
    modal.show();
    return true;
  } catch (e) {
    return false;
  }
}

function createEntryButton(doc) {
  const button = doc.createElement("button");
  button.id = TUTORIAL_ENTRY_ID;
  button.type = "button";
  button.className = "c-oreki-tut-entry";
  button.title = "内置教程（简体中文，随时可看）";
  button.setAttribute("aria-label", "打开内置教程");

  const icon = doc.createElement("span");
  icon.className = "c-oreki-tut-entry__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "?";

  const label = doc.createElement("span");
  label.className = "c-oreki-tut-entry__label";
  label.textContent = "教程";

  button.append(icon, label);
  button.addEventListener("click", event => {
    // 按钮固定在视口上，点它不应该触发底下的游戏元素（例如坍缩按钮）
    event.preventDefault();
    event.stopPropagation();
    openTutorialModal();
  });
  return button;
}

/**
 * 注入常驻入口。可重复调用。
 * @returns {HTMLButtonElement|null} 已存在的或新插入的按钮；环境不支持时返回 null
 */
export function installTutorialEntry(doc = typeof document === "undefined" ? null : document) {
  if (!doc || !doc.body) return null;
  const existing = doc.getElementById(TUTORIAL_ENTRY_ID);
  if (existing) return existing;
  const button = createEntryButton(doc);
  doc.body.appendChild(button);
  return button;
}

/** DOM 就绪后再注入：模块可能在文档解析完成前被求值，此时 body 还不存在，必须等 DOMContentLoaded */
export function scheduleTutorialEntry(doc = typeof document === "undefined" ? null : document) {
  if (!doc) return;
  // body 已存在且文档不在解析中 → 直接插入；否则挂到 DOMContentLoaded，且只挂一次
  if (doc.body && doc.readyState !== "loading") {
    installTutorialEntry(doc);
    return;
  }
  doc.addEventListener("DOMContentLoaded", () => installTutorialEntry(doc), { once: true });
}
