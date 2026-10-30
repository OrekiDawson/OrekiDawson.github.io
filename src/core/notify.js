export const notify = (function() {
  const template = document.createElement("div");
  template.classList.add("o-notification");
  const enterAnimation = "a-notification--enter";
  const leaveAnimation = "a-notification--leave";

  /* ===== R36 通知洪水治理 =====
   * 根因：原版 notify 直接 appendChild，没有队列、没有上限、没有去重。
   * 高频事件（成就、自动购买、维度提升、现实相关）会把通知一路堆上去，
   * R35 实测峰值 72 条堆在右上角，遮挡 143% 视口，
   * 窄屏下还因为 `.o-notification { white-space: nowrap }` 横向溢出屏幕。
   *
   * 修法（只改这一份文件，所有调用方零改动）：
   *   1) 同时最多显示 MAX_VISIBLE = 4 条（R37 由 3 上调）；
   *   2) 同一文本重复 → 合并成一条并显示 ×N，不新增元素（去重）；
   *   3) 重要事件优先：现实/永恒/无限/黑洞/打击为高优先级，
   *      满员时挤掉最低优先级且最早的一条；
   *      低优先级（普通信息/自动化提示）满员时折叠进「还有 N 条」；
   *   4) 被折叠的条数汇总成一条可点击的汇总条，点击即清零。
   *
   * 优先级不影响任何玩法判定，只影响「谁先被看到 / 谁被折叠」。 */
  const MAX_VISIBLE = 4;
  const PRIORITY = {
    "o-notification--info": 0,
    "o-notification--automator": 0,
    "o-notification--success": 1,
    "o-notification--error": 1,
    "o-notification--infinity": 2,
    "o-notification--eternity": 2,
    "o-notification--black-hole": 2,
    "o-notification--reality": 3,
    "o-notification--strike": 3
  };

  /** 当前在屏的通知记录：{ el, text, cls, prio, count, timer, leaving } */
  const live = [];
  /** 被折叠掉的条数 */
  let overflowCount = 0;
  /** 折叠汇总条元素 */
  let overflowEl = null;

  function getContainer() {
    return document.getElementById("notification-container");
  }

  function renderOverflow() {
    const container = getContainer();
    if (!container) return;
    if (overflowCount <= 0) {
      if (overflowEl) {
        overflowEl.remove();
        overflowEl = null;
      }
      return;
    }
    if (!overflowEl) {
      overflowEl = document.createElement("div");
      overflowEl.classList.add("o-notification", "o-notification--overflow");
      overflowEl.addEventListener("click", () => {
        overflowCount = 0;
        renderOverflow();
      });
      // 容器是 column-reverse：firstChild 落在视觉最底部，不抢新通知的位置
      container.insertBefore(overflowEl, container.firstChild);
    }
    overflowEl.textContent = `还有 ${overflowCount} 条提示`;
  }

  /** 立即移除（不给离场动画），用于「被高优先级挤掉」的场合 */
  function removeEntry(entry) {
    const index = live.indexOf(entry);
    if (index !== -1) live.splice(index, 1);
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.el && entry.el.parentNode) entry.el.remove();
  }

  function leave(entry) {
    if (entry.leaving) return;
    entry.leaving = true;
    const index = live.indexOf(entry);
    if (index !== -1) live.splice(index, 1);
    if (entry.timer) clearTimeout(entry.timer);
    entry.el.classList.remove(enterAnimation);
    entry.el.classList.add(leaveAnimation);
    setTimeout(() => entry.el.remove(), 500);
  }

  function showNotification(text, elClass, duration = 2000) {
    if (!GameUI.initialized) {
      setTimeout(showNotification, 500, text, elClass, duration);
      return;
    }
    const container = getContainer();
    if (!container) return;

    // 1) 同文合并：重复的刷屏提示合成一条并显示次数，不新增元素
    const dup = live.find(entry => entry.text === text);
    if (dup) {
      dup.count++;
      dup.el.textContent = dup.count > 1 ? `${dup.text} ×${dup.count}` : dup.text;
      dup.el.classList.remove(enterAnimation, "o-notification--bumped");
      void dup.el.offsetWidth;
      dup.el.classList.add("o-notification--bumped");
      if (dup.timer) clearTimeout(dup.timer);
      dup.timer = setTimeout(() => leave(dup), duration);
      return;
    }

    const prio = PRIORITY[elClass] ?? 0;

    // 2) 满员时按优先级处理
    if (live.length >= MAX_VISIBLE) {
      let weakest = live[0];
      for (const entry of live) {
        if (entry.prio < weakest.prio) weakest = entry;
      }
      if (prio > weakest.prio) {
        // 重要事件：挤掉最低优先级且最早的一条
        removeEntry(weakest);
      } else {
        // 次要事件：折叠进汇总条
        overflowCount++;
        renderOverflow();
        return;
      }
    }

    // 3) 入队并显示
    const el = template.cloneNode();
    el.textContent = text;
    el.classList.add(elClass, enterAnimation);
    container.appendChild(el);

    const entry = {
      el,
      text,
      cls: elClass,
      prio,
      count: 1,
      timer: null,
      leaving: false
    };
    live.push(entry);

    let entered = false;
    function stopEnter() {
      if (entered) return;
      entered = true;
      el.classList.remove(enterAnimation);
    }
    setTimeout(() => stopEnter(), 500);
    entry.timer = setTimeout(() => leave(entry), duration);
    el.onclick = () => leave(entry);
  }
  return {
    success: (text, duration) => showNotification(text, "o-notification--success", duration),
    error: (text, duration) => showNotification(text, "o-notification--error", duration),
    info: (text, duration) => showNotification(text, "o-notification--info", duration),
    infinity: (text, duration) => showNotification(text, "o-notification--infinity", duration),
    eternity: (text, duration) => showNotification(text, "o-notification--eternity", duration),
    reality: (text, duration) => showNotification(text, "o-notification--reality", duration),
    automator: (text, duration) => showNotification(text, "o-notification--automator", duration),
    blackHole: (text, duration) => showNotification(text, "o-notification--black-hole", duration),
    strike: (text, duration) => showNotification(text, "o-notification--strike", duration),
    showBlackHoles: true
  };
}());
