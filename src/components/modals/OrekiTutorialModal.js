import ModalWrapperChoice from "./ModalWrapperChoice.js";
import {
  findTutorialEntry,
  getChapterGaps,
  getTutorialStageSnapshot,
  getTutorialStartIndex,
  TUTORIAL_APPENDICES,
  TUTORIAL_CHAPTERS,
  TUTORIAL_LOCKED_PREFIX,
  TUTORIAL_SCHEMA_VERSION,
  TutorialReadingPosition,
} from "../../core/oreki-tutorial.js";
import { ensureTutorialStyles } from "../tutorial/OrekiTutorialStyles.js";
import { renderTutorialMarkdown } from "../tutorial/oreki-tutorial-markdown.js";

/**
 * 上次读到的位置；没有记录、或那一章/那篇附录已经被删掉时，退回「当前阶段」定位的章节。
 * @returns {{kind: "chapter"|"appendix", index: number, resumed: boolean}}
 */
function resolveInitialIndex() {
  const savedId = TutorialReadingPosition.chapterId;
  if (savedId) {
    const hit = findTutorialEntry(savedId);
    if (hit) return { ...hit, resumed: true };
  }
  return { kind: "chapter", index: getTutorialStartIndex(), resumed: false };
}

/**
 * AD: Oreki Edition — 内置教程弹窗
 *
 * 纯展示：只读取游戏状态，不写 player，也不改任何开关。
 * 正文全部来自 src/core/oreki-tutorial-data.json（经 oreki-tutorial.js 暴露），
 * 本组件只负责排版，不写任何一句正文。
 *
 * 行为约定：
 * - 打开时定位到「当前阶段」对应的章节（getTutorialStartIndex），不再固定停在第 1 章；
 * - 切章时把内容区 scrollTop 归零；
 * - 被更高优先级的弹窗顶掉时（组件销毁再重建）回到上次的章节**和**滚动位置；
 * - 所属阶段未解锁时，正文顶部显示 TUTORIAL_LOCKED_PREFIX，不把没解锁的机制写成可用；
 * - 阶段判定按「每 15 帧一次 + 状态签名未变就提前返回」执行，不每帧重写 DOM。
 */
export default {
  name: "OrekiTutorialModal",
  components: {
    ModalWrapperChoice,
  },
  data() {
    ensureTutorialStyles();
    const initial = resolveInitialIndex();
    return {
      chapters: TUTORIAL_CHAPTERS,
      appendices: TUTORIAL_APPENDICES,
      schemaVersion: TUTORIAL_SCHEMA_VERSION,
      // index 始终指向章；appendixIndex >= 0 表示当前在看附录（正文与章节互斥）
      index: initial.kind === "chapter" ? initial.index : getTutorialStartIndex(),
      appendixIndex: initial.kind === "appendix" ? initial.index : -1,
      stage: getTutorialStageSnapshot(),
      stageSig: "",
      frameTick: 0,
      lockedPrefix: TUTORIAL_LOCKED_PREFIX,
      // 用户手动点过目录（或从上次位置续读）之后就不再让自动定位抢走焦点
      navigated: initial.resumed,
      // 只有「续读」才恢复滚动位置；正常打开一律从章首开始
      resumeScroll: initial.resumed ? TutorialReadingPosition.scrollTop : 0,
    };
  },
  computed: {
    chapter() {
      return this.chapters[this.index] || this.chapters[0];
    },
    /** 当前正在看的附录；null 表示在看章节 */
    appendix() {
      if (this.appendixIndex < 0) return null;
      return this.appendices[this.appendixIndex] || null;
    },
    isAppendix() {
      return this.appendix !== null;
    },
    appendixHtml() {
      return this.appendix ? renderTutorialMarkdown(this.appendix.body) : "";
    },
    headTitle() {
      return this.appendix ? this.appendix.title : this.chapter.title;
    },
    headSubtitle() {
      // 附录与主线无关，副标题直接写明，避免玩家以为读附录会推进阶段
      return this.appendix ? "附录 · 不参与主线进度" : this.chapter.subtitle;
    },
    /** 跨组件重建时记的是这个 id：章是 chNN，附录是 apx_xxx */
    currentId() {
      return this.appendix ? this.appendix.id : this.chapter.id;
    },
    isFirst() {
      return this.isAppendix ? this.appendixIndex === 0 : this.index === 0;
    },
    isLast() {
      return this.isAppendix
        ? this.appendixIndex === this.appendices.length - 1
        : this.index === this.chapters.length - 1;
    },
    chapterStage() {
      // 用已经算好的 stage 快照，避免每次渲染再判定一遍阶段
      if (!this.chapter.stageKey) return null;
      const row = this.stage.rows.find(item => item.key === this.chapter.stageKey);
      return row ? { status: row.status, statusText: row.statusText, name: row.name } : null;
    },
    isLocked() {
      return this.chapterStage !== null && this.chapterStage.status === "locked";
    },
    stageDots() {
      // 目录里每个章节的状态点：只为「属于某个阶段」的章节显示
      const map = {};
      for (const row of this.stage.rows) map[row.key] = row.status;
      return map;
    },
    hasSteps() {
      return Array.isArray(this.chapter.steps) && this.chapter.steps.length > 0;
    },
    hasBuyOrder() {
      return Array.isArray(this.chapter.buyOrder) && this.chapter.buyOrder.length > 0;
    },
    hasNumbers() {
      return Array.isArray(this.chapter.numbers) && this.chapter.numbers.length > 0;
    },
    hasTraps() {
      return Array.isArray(this.chapter.traps) && this.chapter.traps.length > 0;
    },
    hasTable() {
      const table = this.chapter.table;
      return Boolean(table && Array.isArray(table.head) && Array.isArray(table.rows)
        && table.head.length > 0 && table.rows.length > 0);
    },
    /** 草稿章（有 draft 标记且没有 steps）显示「本章正在编写中」占位卡 */
    chapterGaps() {
      return getChapterGaps(this.chapter);
    },
    showPlaceholder() {
      return Boolean(this.chapter.draft) && this.chapterGaps.pending.length > 0;
    },
  },
  created() {
    this.stageSig = this.stageSignature(this.stage);
    // 只用来区分「点 × / 点关闭教程」与「按 Esc」：
    //   × 与关闭教程都走 ModalWrapperChoice → CLOSE_MODAL；Esc 走 Modal.hideAll()，不派发事件。
    // 这个区别只对附录有意义（见 beforeDestroy）：附录是查阅型内容，收起来应该记住；
    // 章节是进度引导，关掉后下次按当前阶段定位。
    this.closedByCloseEvent = false;
    this.on$(GAME_EVENT.CLOSE_MODAL, () => {
      this.closedByCloseEvent = true;
    });
  },
  beforeDestroy() {
    // 被更高优先级弹窗顶掉时组件会销毁再重建；记下位置，回来接着读。
    //
    // 判据用「自己是否还在 ui.view.modal.queue 里」而不是只看 CLOSE_MODAL 事件：
    // Esc 走 hotkeys.js 的 Modal.hideAll()（清空队列但**不派发** CLOSE_MODAL），
    // 只靠事件会把「按 Esc 关掉」误判成「被顶掉」，下次打开又跳回上次那一章。
    //
    // 滚动位置不在这里读 `$refs.scroll.scrollTop`：销毁时 ref 可能已被清掉（实测拿到 0），
    // 所以改成滚动过程中就写进 TutorialReadingPosition，这里只负责在「不记」时清零。
    const keep = this.isStillQueued();
    // 附录额外享受「点 × 收起后仍记得」：玩家点开附录通常是查一张表，
    // 关掉再开会希望回到同一篇。章节不享受这条 —— 章节的「关掉后再打开」按当前阶段定位，
    // 这是之前验收过的行为（关掉 ch10 再打开不该粘在 ch10）。
    const remember = keep || (this.closedByCloseEvent && this.isAppendix);
    TutorialReadingPosition.chapterId = remember ? this.currentId : null;
    if (!remember) TutorialReadingPosition.scrollTop = 0;
  },
  mounted() {
    // 续读时回到上次那一行；正常打开从章首开始
    this.resetScroll(this.resumeScroll);
    // 窄屏（≤900px）目录是横向滚动条，打开时可能停在 scrollLeft=0，
    // 而当前章在可视带外 2800px 处：用户看不到自己读到哪一章。
    this.revealActiveNav();
  },
  methods: {
    update() {
      // 每 15 帧（约 4 次/秒）才重新判定一次阶段，避免每帧做无意义的重算
      this.frameTick += 1;
      if (this.frameTick % 15 !== 0) return;
      const next = getTutorialStageSnapshot();
      const sig = this.stageSignature(next);
      if (sig === this.stageSig) return;
      this.stageSig = sig;
      this.stage = next;
      // 玩家还没自己翻过章时，跟着阶段变化重新定位；看附录时不抢
      if (!this.navigated && !this.isAppendix) {
        this.index = getTutorialStartIndex();
        this.revealActiveNav();
      }
    },
    stageSignature(stage) {
      return `${stage.key}|${stage.rows.map(row => row.status).join(",")}`;
    },
    /**
     * 销毁瞬间自己是否还在弹窗队列里。
     * 在队列里 = 被更高优先级的弹窗顶掉（current 换人，队列没动）；
     * 不在队列里 = 玩家关掉了（× / 「关闭教程」 走 Modal.hide，Esc 走 Modal.hideAll，都会出队）。
     */
    isStillQueued() {
      if (typeof ui === "undefined" || !ui.view || !ui.view.modal) return false;
      const queue = ui.view.modal.queue;
      if (!Array.isArray(queue)) return false;
      const name = this.$options.name;
      return queue.some(item => item && item.component && item.component.name === name);
    },
    resetScroll(offset = 0) {
      this.$nextTick(() => {
        const box = this.$refs.scroll;
        if (box) box.scrollTop = offset;
      });
    },
    /**
     * 让目录里的当前项落在可视带内。
     *
     * 窄屏（`max-width: 900px`）下 `.c-oreki-tut__nav` 被改成 `flex-direction: row`
     * + `overflow-x: auto`，于是 18 章 + 7 篇附录铺成 5000px 长条。
     * 不主动滚动的话 scrollLeft 恒为 0，第 5 章以后的当前项都在屏幕外，
     * 玩家既看不出自己在哪一章，也没法从目录点回去。
     *
     * 横屏（矮视口）会还原成左侧竖列，这时要滚的是 scrollTop 而不是 scrollLeft，
     * 所以按「容器实际哪个方向溢出」决定轴，而不是按屏幕宽度猜。
     * 宽屏竖列同理走纵轴；两个方向都不溢出时这项是空操作。
     */
    revealActiveNav() {
      this.$nextTick(() => {
        const nav = this.$refs.nav;
        if (!nav) return;
        const btn = nav.querySelector(".c-oreki-tut__nav-btn--active");
        if (!btn) return;
        // 用 rect 差值而不是 offsetLeft：块的定位祖先不一定是 nav，rect 差值不依赖这条链
        const navRect = nav.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        const overY = nav.scrollHeight - nav.clientHeight;
        const overX = nav.scrollWidth - nav.clientWidth;
        if (overY > 2 && overX < 2) {
          // 纵向目录：把当前项滚到中间；比可视高度还高的按钮对齐上沿，至少露出章号与标题开头
          const fits = btnRect.height <= nav.clientHeight;
          const centered = nav.scrollTop + (btnRect.top - navRect.top) - (nav.clientHeight - btnRect.height) / 2;
          const topAligned = nav.scrollTop + (btnRect.top - navRect.top);
          nav.scrollTop = Math.min(Math.max(0, fits ? centered : topAligned), overY);
          return;
        }
        // 比可视带还宽的按钮（320 宽下「天神（一）：特蕾莎、鹿颈长、无名氏」这类长标题）
        // 居中会让两端各切掉一截，连章序号都看不见；改成对齐左沿，至少露出「第 N 章」和标题开头。
        const fits = btnRect.width <= nav.clientWidth;
        const centered = nav.scrollLeft + (btnRect.left - navRect.left) - (nav.clientWidth - btnRect.width) / 2;
        const leftAligned = nav.scrollLeft + (btnRect.left - navRect.left);
        nav.scrollLeft = Math.min(Math.max(0, fits ? centered : leftAligned), Math.max(0, overX));
      });
    },
    /** 滚动过程中就把位置记下来：销毁时 ref 可能已经没了，那时再读会拿到 0 */
    onScroll(event) {
      const box = event && event.target;
      if (box) TutorialReadingPosition.scrollTop = box.scrollTop;
    },
    goTo(index) {
      if (index < 0 || index >= this.chapters.length) return;
      this.navigated = true;
      this.index = index;
      this.appendixIndex = -1;
      TutorialReadingPosition.scrollTop = 0;
      this.resetScroll(0);
      this.revealActiveNav();
    },
    goToAppendix(index) {
      if (index < 0 || index >= this.appendices.length) return;
      this.navigated = true;
      this.appendixIndex = index;
      TutorialReadingPosition.scrollTop = 0;
      this.resetScroll(0);
      this.revealActiveNav();
    },
    prevPage() {
      if (this.isAppendix) return this.goToAppendix(this.appendixIndex - 1);
      return this.goTo(this.index - 1);
    },
    nextPage() {
      if (this.isAppendix) return this.goToAppendix(this.appendixIndex + 1);
      return this.goTo(this.index + 1);
    },
    backToCurrent() {
      this.navigated = false;
      this.appendixIndex = -1;
      this.index = getTutorialStartIndex();
      TutorialReadingPosition.scrollTop = 0;
      this.resetScroll(0);
      this.revealActiveNav();
    },
    stageLabelOf(chapter) {
      if (!chapter.stageKey) return null;
      return this.stageDots[chapter.stageKey] || null;
    },
    close() {
      EventHub.dispatch(GAME_EVENT.CLOSE_MODAL);
    },
  },
  template: `
  <ModalWrapperChoice
    :show-confirm="false"
    :use-enter-to-confirm="false"
    @cancel="close"
  >
    <template #header>
      内置教程
    </template>
    <template #cancel-text>
      关闭教程
    </template>
    <div class="c-oreki-tut">
      <div class="c-oreki-tut__layout">
        <nav
          ref="nav"
          class="c-oreki-tut__nav"
        >
          <button
            v-for="(item, i) in chapters"
            :key="item.id"
            class="c-oreki-tut__nav-btn"
            :class="{ 'c-oreki-tut__nav-btn--active': i === index }"
            @click="goTo(i)"
          >
            <span class="c-oreki-tut__nav-index">{{ i + 1 }}</span>
            <span class="c-oreki-tut__nav-title">{{ item.title }}</span>
            <span
              v-if="stageLabelOf(item)"
              class="c-oreki-tut__dot"
              :class="'c-oreki-tut__dot--' + stageLabelOf(item)"
            />
          </button>
          <div class="c-oreki-tut__nav-label">
            附录（不参与主线进度）
          </div>
          <button
            v-for="(apx, ai) in appendices"
            :key="apx.id"
            class="c-oreki-tut__nav-btn c-oreki-tut__nav-btn--apx"
            :class="{ 'c-oreki-tut__nav-btn--active': ai === appendixIndex }"
            @click="goToAppendix(ai)"
          >
            <span class="c-oreki-tut__nav-index">附</span>
            <span class="c-oreki-tut__nav-title">{{ apx.title }}</span>
          </button>
        </nav>
        <div class="c-oreki-tut__main">
          <div class="c-oreki-tut__head">
            <span class="c-oreki-tut__head-title">{{ headTitle }}</span>
            <span class="c-oreki-tut__head-subtitle">{{ headSubtitle }}</span>
          </div>
          <div
            ref="scroll"
            class="c-oreki-tut__scroll"
            @scroll="onScroll"
          >
            <div
              v-if="isAppendix"
              class="c-oreki-tut__md"
              v-html="appendixHtml"
            ></div>
            <template v-else>
            <div
              v-if="isLocked"
              class="c-oreki-tut__locked"
            >
              {{ lockedPrefix }}{{ chapterStage.name }}的机制现在还不能用，本章只是提前告诉你它长什么样。
            </div>
            <div
              v-if="chapter.draft && !showPlaceholder"
              class="c-oreki-tut__draft"
            >
              本章尚未写完（草稿），内容可能只有骨架。
            </div>
            <div
              v-if="showPlaceholder"
              class="c-oreki-tut__placeholder"
            >
              <div class="c-oreki-tut__placeholder-title">
                本章正在编写中
              </div>
              <div class="c-oreki-tut__placeholder-body">
                <p>
                  这一章只写到骨架，还没有可执行的操作步骤。下面是已经写好的部分，可以照它判断自己走到哪一步；缺的部分补完后会自动出现在这里，不需要你另找攻略。
                </p>
                <p>已有内容：{{ chapterGaps.ready.length ? chapterGaps.ready.join("、") : "无" }}</p>
                <p>还缺内容：{{ chapterGaps.pending.join("、") }}</p>
              </div>
            </div>
            <div class="c-oreki-tut__current">
              <div class="c-oreki-tut__current-label">
                你现在的阶段
              </div>
              <div class="c-oreki-tut__current-name">
                {{ stage.name }}
              </div>
              <div class="c-oreki-tut__current-focus">
                {{ stage.focus }}
              </div>
            </div>

            <section class="c-oreki-tut__block">
              <div class="c-oreki-tut__label">
                阶段目标
              </div>
              <div class="c-oreki-tut__text">
                {{ chapter.stageGoal }}
              </div>
            </section>

            <section class="c-oreki-tut__block">
              <div class="c-oreki-tut__label">
                进入条件
              </div>
              <div class="c-oreki-tut__text">
                {{ chapter.entry }}
              </div>
            </section>

            <section
              v-if="hasSteps"
              class="c-oreki-tut__block"
            >
              <div class="c-oreki-tut__label">
                具体操作
              </div>
              <ol class="c-oreki-tut__list">
                <li
                  v-for="(step, si) in chapter.steps"
                  :key="'step' + si"
                >
                  {{ step.text }}
                  <span
                    v-if="step.auto"
                    class="c-oreki-tut__auto"
                  >已自动化</span>
                </li>
              </ol>
            </section>

            <section
              v-if="hasBuyOrder"
              class="c-oreki-tut__block"
            >
              <div class="c-oreki-tut__label">
                购买优先级
              </div>
              <ol class="c-oreki-tut__list">
                <li
                  v-for="(item, bi) in chapter.buyOrder"
                  :key="'buy' + bi"
                >
                  {{ item }}
                </li>
              </ol>
            </section>

            <section
              v-if="chapter.automation"
              class="c-oreki-tut__block"
            >
              <div class="c-oreki-tut__label">
                自动化配置（哪些事不用你做）
              </div>
              <div class="c-oreki-tut__text">
                {{ chapter.automation }}
              </div>
            </section>

            <section
              v-if="chapter.challenges"
              class="c-oreki-tut__block"
            >
              <div class="c-oreki-tut__label">
                挑战攻略
              </div>
              <div class="c-oreki-tut__text">
                {{ chapter.challenges }}
              </div>
            </section>

            <section
              v-if="hasNumbers"
              class="c-oreki-tut__block"
            >
              <div class="c-oreki-tut__label">
                关键数值
              </div>
              <table class="c-oreki-tut__table">
                <tbody>
                  <tr
                    v-for="(num, ni) in chapter.numbers"
                    :key="'num' + ni"
                  >
                    <td class="c-oreki-tut__key">
                      {{ num.label }}
                    </td>
                    <td>
                      {{ num.value }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section
              v-if="hasTable"
              class="c-oreki-tut__block"
            >
              <div class="c-oreki-tut__label">
                对照表
              </div>
              <table class="c-oreki-tut__table">
                <thead>
                  <tr>
                    <th
                      v-for="(head, hi) in chapter.table.head"
                      :key="'th' + hi"
                    >
                      {{ head }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, ri) in chapter.table.rows"
                    :key="'tr' + ri"
                  >
                    <td
                      v-for="(cell, ci) in row"
                      :key="'td' + ci"
                    >
                      {{ cell }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="c-oreki-tut__block">
              <div class="c-oreki-tut__label">
                完成判据
              </div>
              <div class="c-oreki-tut__done">
                {{ chapter.done }}
              </div>
            </section>

            <section class="c-oreki-tut__block">
              <div class="c-oreki-tut__label">
                下一步
              </div>
              <div class="c-oreki-tut__text">
                {{ chapter.next }}
              </div>
            </section>

            <section
              v-if="hasTraps"
              class="c-oreki-tut__block"
            >
              <div class="c-oreki-tut__label">
                常见卡点
              </div>
              <ul class="c-oreki-tut__trap">
                <li
                  v-for="(trap, ti) in chapter.traps"
                  :key="'trap' + ti"
                >
                  {{ trap }}
                </li>
              </ul>
            </section>

            <section
              v-if="chapter.note"
              class="c-oreki-tut__block"
            >
              <div class="c-oreki-tut__text">
                {{ chapter.note }}
              </div>
            </section>
            </template>
          </div>
          <div class="c-oreki-tut__hint">
            按 Esc 或点右上角的 × 关闭本窗口；按 Enter 不会关闭，换章用下面的按钮。
          </div>
          <div class="c-oreki-tut__footer">
            <button
              class="o-primary-btn c-oreki-tut__nav-move"
              :class="{ 'c-oreki-tut__nav-move--disabled': isFirst }"
              @click="prevPage"
            >
              {{ isAppendix ? "上一篇" : "上一章" }}
            </button>
            <button
              class="o-primary-btn c-oreki-tut__nav-move"
              @click="backToCurrent"
            >
              回到当前进度
            </button>
            <span class="c-oreki-tut__counter">
              {{ isAppendix ? "附 " + (appendixIndex + 1) + " / " + appendices.length : (index + 1) + " / " + chapters.length }}
            </span>
            <button
              class="o-primary-btn c-oreki-tut__nav-move"
              :class="{ 'c-oreki-tut__nav-move--disabled': isLast }"
              @click="nextPage"
            >
              {{ isAppendix ? "下一篇" : "下一章" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </ModalWrapperChoice>
  `
};
