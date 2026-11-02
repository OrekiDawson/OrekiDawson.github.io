import ModalWrapperChoice from "./ModalWrapperChoice.js";
import { OrekiAchievementTool } from "../../core/oreki-tools.js";

export default {
  name: "OrekiAchievementModal",
  components: {
    ModalWrapperChoice
  },
  data() {
    return {
      scope: "normal",
      from: 1,
      to: 1,
      acknowledged: false,
      lastResult: null,
    };
  },
  computed: {
    scopeOptions() {
      return [
        { key: "normal", label: "普通成就" },
        { key: "secret", label: "隐藏成就" },
        { key: "all", label: "全部成就" },
      ];
    },
    idRange() {
      if (this.scope === "secret") return OrekiAchievementTool.secretIdRange;
      if (this.scope === "all") {
        const n = OrekiAchievementTool.normalIdRange;
        const s = OrekiAchievementTool.secretIdRange;
        return [Math.min(n[0], s[0]), Math.max(n[1], s[1])];
      }
      return OrekiAchievementTool.normalIdRange;
    },
    preview() {
      return OrekiAchievementTool.preview({ scope: this.scope, from: this.from, to: this.to });
    },
    progressText() {
      return `当前进度：普通 ${OrekiAchievementTool.normalUnlocked}/${OrekiAchievementTool.normalTotal}，`
        + `隐藏 ${OrekiAchievementTool.secretUnlocked}/${OrekiAchievementTool.secretTotal}`;
    },
    canConfirm() {
      return this.acknowledged && this.preview.pending > 0;
    },
  },
  watch: {
    scope() {
      this.resetRangeToFull();
      this.lastResult = null;
    },
  },
  created() {
    this.resetRangeToFull();
  },
  methods: {
    resetRangeToFull() {
      const [lo, hi] = this.idRange;
      this.from = lo;
      this.to = hi;
    },
    selectScope(key) {
      this.scope = key;
    },
    doUnlock() {
      if (!this.acknowledged) {
        GameUI.notify.error("请先勾选下方的确认项");
        return;
      }
      const result = OrekiAchievementTool.unlockRange({ scope: this.scope, from: this.from, to: this.to });
      this.lastResult = result;
      if (result.unlocked > 0) {
        GameUI.notify.success(`已解锁 ${formatInt(result.unlocked)} 个成就`);
      } else {
        GameUI.notify.info("所选范围内没有需要解锁的成就");
      }
      EventHub.dispatch(GAME_EVENT.CLOSE_MODAL);
    },
    cancel() {
      EventHub.dispatch(GAME_EVENT.CLOSE_MODAL);
    },
  },
  template: `
  <ModalWrapperChoice
    :confirm-fn="doUnlock"
    :show-confirm="canConfirm"
    @cancel="cancel"
  >
    <template #header>
      成就工具
    </template>
    <div class="c-oreki-tool">
      <div class="c-oreki-tool__warning">
        <b>请注意：</b>此工具会直接改变你的成就进度，属于"作弊式"便利功能。
        成就是游戏体验的一部分，解锁后无法区分"真解锁"与"工具解锁"，
        并且会同时改变成就倍率、自动购买器加速等联动效果。
        本工具默认关闭、不会自动运行，仅在你主动点击并确认后执行。
      </div>

      <div class="c-oreki-tool__row">
        <span class="c-oreki-tool__label">范围</span>
        <span class="c-oreki-tool__scopes">
          <button
            v-for="opt in scopeOptions"
            :key="opt.key"
            class="o-primary-btn c-oreki-tool__scope-btn"
            :class="{ 'c-oreki-tool__scope-btn--active': scope === opt.key }"
            @click="selectScope(opt.key)"
          >
            {{ opt.label }}
          </button>
        </span>
      </div>

      <div class="c-oreki-tool__row">
        <span class="c-oreki-tool__label">ID 范围</span>
        <input
          v-model.number="from"
          class="c-oreki-tool__num"
          type="number"
          :min="idRange[0]"
          :max="idRange[1]"
          aria-label="起始成就 ID"
        >
        <span class="c-oreki-tool__dash">~</span>
        <input
          v-model.number="to"
          class="c-oreki-tool__num"
          type="number"
          :min="idRange[0]"
          :max="idRange[1]"
          aria-label="结束成就 ID"
        >
        <button class="o-primary-btn c-oreki-tool__mini-btn" @click="resetRangeToFull">
          全范围
        </button>
      </div>

      <div class="c-oreki-tool__hint">
        将解锁 <b>{{ formatInt(preview.pending) }}</b> 个成就（该范围内已有 {{ formatInt(preview.done) }} 个）。
      </div>
      <div class="c-oreki-tool__hint">
        {{ progressText }}
      </div>

      <label class="c-oreki-tool__ack">
        <input v-model="acknowledged" type="checkbox">
        <span>我已了解此操作会改变正常游戏进度与成就体验，并自愿继续。</span>
      </label>

      <div v-if="lastResult" class="c-oreki-tool__hint">
        上次结果：解锁 {{ formatInt(lastResult.unlocked) }} 个，已存在 {{ formatInt(lastResult.already) }} 个。
      </div>
    </div>
    <template #confirm-text>
      解锁
    </template>
  </ModalWrapperChoice>
  `
};
