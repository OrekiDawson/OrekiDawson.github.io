import ModalWrapperChoice from "./ModalWrapperChoice.js";
import {
  getTutorialStageSnapshot,
  TUTORIAL_CHAPTERS,
  TUTORIAL_LOCKED_PREFIX,
} from "../../core/oreki-tutorial.js";

/**
 * AD: Oreki Edition — 内置教程弹窗
 *
 * 纯展示：只读取游戏状态，不写 player，也不改任何开关。
 * 阶段判定在 update() 里按「每 N 帧一次 + 状态签名未变就提前返回」的方式做，
 * 不会每帧重写 DOM；弹窗关闭后组件被销毁，开销归零。
 */
export default {
  name: "OrekiTutorialModal",
  components: {
    ModalWrapperChoice,
  },
  data() {
    return {
      chapters: TUTORIAL_CHAPTERS,
      index: 0,
      stage: getTutorialStageSnapshot(),
      stageSig: "",
      frameTick: 0,
      lockedPrefix: TUTORIAL_LOCKED_PREFIX,
    };
  },
  computed: {
    chapter() {
      return this.chapters[this.index];
    },
    isFirst() {
      return this.index === 0;
    },
    isLast() {
      return this.index === this.chapters.length - 1;
    },
  },
  created() {
    this.stageSig = this.stageSignature(this.stage);
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
    },
    stageSignature(stage) {
      return `${stage.key}|${stage.rows.map(row => row.status).join(",")}`;
    },
    goTo(index) {
      if (index < 0 || index >= this.chapters.length) return;
      this.index = index;
    },
    prevChapter() {
      this.goTo(this.index - 1);
    },
    nextChapter() {
      this.goTo(this.index + 1);
    },
    close() {
      EventHub.dispatch(GAME_EVENT.CLOSE_MODAL);
    },
  },
  template: `
  <ModalWrapperChoice
    :show-confirm="false"
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
        <nav class="c-oreki-tut__nav">
          <button
            v-for="(item, i) in chapters"
            :key="item.key"
            class="c-oreki-tut__nav-btn"
            :class="{ 'c-oreki-tut__nav-btn--active': i === index }"
            @click="goTo(i)"
          >
            <span class="c-oreki-tut__nav-index">{{ i + 1 }}</span>
            <span class="c-oreki-tut__nav-title">{{ item.title }}</span>
          </button>
        </nav>
        <div class="c-oreki-tut__main">
          <div class="c-oreki-tut__head">
            <span class="c-oreki-tut__head-title">{{ chapter.title }}</span>
            <span class="c-oreki-tut__head-subtitle">{{ chapter.subtitle }}</span>
          </div>
          <div class="c-oreki-tut__scroll">
            <div
              v-if="chapter.kind === 'stages'"
              class="c-oreki-tut__current"
            >
              <div class="c-oreki-tut__current-label">
                当前阶段
              </div>
              <div class="c-oreki-tut__current-name">
                {{ stage.name }}
              </div>
              <div class="c-oreki-tut__current-focus">
                {{ stage.focus }}
              </div>
              <ul class="c-oreki-tut__points">
                <li
                  v-for="(step, si) in stage.nextSteps"
                  :key="'step' + si"
                >
                  {{ step }}
                </li>
              </ul>
            </div>
            <div
              v-if="chapter.kind === 'stages'"
              class="c-oreki-tut__stages"
            >
              <div
                v-for="row in stage.rows"
                :key="row.key"
                class="c-oreki-tut__stage-row"
                :class="'c-oreki-tut__stage-row--' + row.status"
              >
                <div class="c-oreki-tut__stage-top">
                  <span class="c-oreki-tut__stage-name">{{ row.name }}</span>
                  <span
                    class="c-oreki-tut__stage-status"
                    :class="'c-oreki-tut__stage-status--' + row.status"
                  >
                    {{ row.statusText }}
                  </span>
                </div>
                <div class="c-oreki-tut__stage-focus">
                  <span
                    v-if="row.status === 'locked'"
                    class="c-oreki-tut__lock"
                  >{{ lockedPrefix }}</span>{{ row.focus }}
                </div>
              </div>
            </div>
            <section
              v-for="section in chapter.sections"
              :key="section.heading"
              class="c-oreki-tut__section"
            >
              <div class="c-oreki-tut__section-title">
                {{ section.heading }}
              </div>
              <ul class="c-oreki-tut__points">
                <li
                  v-for="(point, pi) in section.points"
                  :key="'p' + pi"
                >
                  {{ point }}
                </li>
              </ul>
            </section>
          </div>
          <div class="c-oreki-tut__footer">
            <button
              class="o-primary-btn c-oreki-tut__nav-move"
              :class="{ 'c-oreki-tut__nav-move--disabled': isFirst }"
              @click="prevChapter"
            >
              上一章
            </button>
            <span class="c-oreki-tut__counter">{{ index + 1 }} / {{ chapters.length }}</span>
            <button
              class="o-primary-btn c-oreki-tut__nav-move"
              :class="{ 'c-oreki-tut__nav-move--disabled': isLast }"
              @click="nextChapter"
            >
              下一章
            </button>
          </div>
        </div>
      </div>
    </div>
  </ModalWrapperChoice>
  `
};
