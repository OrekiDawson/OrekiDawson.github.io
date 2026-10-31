import OpenModalHotkeysButton from "../../OpenModalHotkeysButton.js";
import OptionsButton from "../../OptionsButton.js";
import PrimaryToggleButton from "../../PrimaryToggleButton.js";
import SliderComponent from "../../SliderComponent.js";
import { GameSpeed } from "../../../core/speed-config.js";
import { OrekiSmartExecutor } from "../../../core/oreki-smart-executor.js";
import { OrekiSmartStrategy } from "../../../core/oreki-smart-strategy.js";

export default {
  name: "OptionsGameplayTab",
  components: {
    OpenModalHotkeysButton,
    OptionsButton,
    PrimaryToggleButton,
    SliderComponent
  },
  data() {
    return {
      offlineProgress: false,
      hibernationCatchup: false,
      hotkeys: false,
      offlineSlider: 0,
      offlineTicks: 0,
      automaticTabSwitching: false,
      infinityUnlocked: false,
      automatorUnlocked: false,
      automatorLogSize: 0,
      speedFactor: GameSpeed.factor,
      speedInput: String(GameSpeed.factor),
      speedPresets: [1, 10, 100, 1000, 10000, 100000],
      // 直接读 GameSpeed 的开关状态，不另设一份存档/本地状态
      scaleAutobuyerInterval: GameSpeed.scaleAutobuyerInterval,
      scaleTickspeedAutobuyerInterval: GameSpeed.scaleTickspeedAutobuyerInterval,
      // 动态速度模式：唯一来源仍是 GameSpeed，这里只做镜像供 UI 绑定
      dynamicSpeed: GameSpeed.isDynamic,
      // 智能自动购买器状态（七项 + 让路原因）。数值全部来自 OrekiSmartExecutor.debugState()，
      // 这里不推导、不估算 —— 算不出来就显示「无法判定」。
      smartRows: [],
      smartHold: "",
      smartNote: "",
      smartAt: 0,
    };
  },
  computed: {
    speedFactorText() {
      return GameSpeed.format(this.speedFactor);
    },
    dynamicSpeedLabel() {
      return GameSpeed.modeLabel;
    },
    dynamicSpeedHint() {
      return this.dynamicSpeed
        ? "进度连续停滞时会自动升档（每次 ×2，上限沿用倍率上限）；进度在走时不动"
        : "手动模式：倍率只由你设定，控制器不会自动升档";
    },
    speedHint() {
      return `默认 ${GameSpeed.format(GameSpeed.defaultFactor)}×，可调范围 ${GameSpeed.min}× ~ ${GameSpeed.max}×`;
    },
    speedStorageHint() {
      return "独立保存在浏览器本地：重置或导入存档都不会改变倍率";
    },
    sliderPropsOfflineTicks() {
      return {
        min: 22,
        max: 54,
        interval: 1,
        width: "100%",
        tooltip: false
      };
    },
    sliderPropsAutomatorLogSize() {
      return {
        min: 50,
        max: 500,
        interval: 50,
        width: "100%",
        tooltip: false
      };
    }
  },
  watch: {
    offlineProgress(newValue) {
      player.options.offlineProgress = newValue;
    },
    hibernationCatchup(newValue) {
      player.options.hibernationCatchup = newValue;
    },
    hotkeys(newValue) {
      player.options.hotkeys = newValue;
    },
    offlineSlider(newValue) {
      player.options.offlineTicks = this.parseOfflineSlider(newValue);
    },
    automaticTabSwitching(newValue) {
      player.options.automaticTabSwitching = newValue;
    },
    automatorLogSize(newValue) {
      player.options.automatorEvents.maxEntries = parseInt(newValue, 10);
    },
    // 开关状态唯一来源是 GameSpeed，这里只负责写回（含 localStorage 持久化）
    scaleAutobuyerInterval(newValue) {
      GameSpeed.setScaleAutobuyerInterval(newValue);
    },
    scaleTickspeedAutobuyerInterval(newValue) {
      GameSpeed.setScaleTickspeedAutobuyerInterval(newValue);
    },
    dynamicSpeed(newValue) {
      GameSpeed.setDynamic(newValue);
      this.speedFactor = GameSpeed.factor;
    },
  },
  // This puts the slider in the right spot on initialization
  created() {
    const ticks = player.options.offlineTicks;
    const exponent = Math.floor(Math.log10(ticks));
    const mantissa = (ticks / Math.pow(10, exponent)) - 1;
    this.offlineSlider = 9 * exponent + mantissa;
  },
  methods: {
    update() {
      const options = player.options;
      this.offlineProgress = options.offlineProgress;
      this.hibernationCatchup = options.hibernationCatchup;
      this.hotkeys = options.hotkeys;
      this.offlineTicks = player.options.offlineTicks;
      this.automaticTabSwitching = options.automaticTabSwitching;
      this.infinityUnlocked = PlayerProgress.current.isInfinityUnlocked;
      this.automatorUnlocked = Player.automatorUnlocked;
      this.automatorLogSize = options.automatorEvents.maxEntries;
      this.speedFactor = GameSpeed.factor;
      this.scaleAutobuyerInterval = GameSpeed.scaleAutobuyerInterval;
      this.scaleTickspeedAutobuyerInterval = GameSpeed.scaleTickspeedAutobuyerInterval;
      this.dynamicSpeed = GameSpeed.isDynamic;
      this.refreshSmartRows();
    },
    /**
     * [Oreki R40-S2] 智能自动购买器面板：七项 + 让路原因。
     * 数据只有 `OrekiSmartExecutor.debugState()` 一个来源；异常时整块显示「无法判定」，
     * 不回落到上次的值（上次的值已经过期，显示出来比不显示更误导）。
     */
    refreshSmartRows() {
      // 设置页的 update() 是 20 fps 调的，每帧重建 7 个对象会让这块每帧重渲染。
      // 面板信息本身只有「秒级」意义，节流到 500 ms 足够，且不影响「已暂停 N 秒」的准确性。
      const nowMs = Date.now();
      if (nowMs - this.smartAt < 500) return;
      this.smartAt = nowMs;
      const rows = [];
      let hold = "";
      let note = "";
      let s = null;
      let declaredBlockers = null;
      try {
        s = OrekiSmartExecutor.debugState();
        // 「无」与「坏」在 UI 上必须可区分：玩家看到「无」分不清是「检查过没有阻塞」
        // 还是「这个功能没做」。所以空态写成「无（已检查 N 项）」，N 取自 spec 的 blocker 条数。
        declaredBlockers = OrekiSmartStrategy.debugState().blockersDeclared ?? null;
      } catch (e) {
        s = null;
      }
      if (!s) {
        this.smartRows = [{ k: "状态", v: "无法判定（执行层未就绪）" }];
        this.smartHold = "";
        this.smartNote = "";
        return;
      }
      const fmtAgo = at => {
        if (!at) return "—";
        const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
        return `${sec} 秒前`;
      };
      const stageText = s.stage ? `${s.stage.title}（${s.stage.id}）` : "无法判定";
      const goalText = s.goal
        ? `${s.goal.title}${s.goal.done === true ? "（已完成）" : s.goal.done === false ? "（未完成）" : s.goal.done === null ? "（完成度无法判定）" : ""}`
        : "无法判定";
      const strategyText = s.strategy ? `${s.strategy.title}（${s.strategy.id}）` : "无法判定";
      const actionText = s.action
        ? `${s.action.label} → ${s.action.acted ? "已执行" : "无可买"}｜${s.action.source} ${fmtAgo(s.action.at)}`
        : "本层未动手（阶段模块在推进）";
      const nextText = s.next
        ? `${s.next.label}${s.next.policy === "owned" ? "" : `（${s.next.policy === "delegated" ? "归阶段模块" : s.next.policy === "unsupported" ? "原版无此入口" : "未登记"}）`}`
        : "—";
      const blockerText = s.blockers.length
        ? s.blockers.map(b => b.title).join("；")
        : (declaredBlockers === null ? "无（已检查项数无法读取）" : `无（已检查 ${declaredBlockers} 项）`);
      const switchText = s.lastSwitch
        ? `${s.lastSwitch.from ? `${s.lastSwitch.from} → ` : ""}${s.lastSwitch.to}（${fmtAgo(s.lastSwitch.at)}）`
        : "—";
      rows.push({ k: "① 阶段", v: stageText });
      rows.push({ k: "② 目标", v: goalText });
      rows.push({ k: "③ 策略", v: strategyText });
      rows.push({ k: "④ 正在执行", v: actionText });
      rows.push({ k: "⑤ 下一步", v: nextText });
      rows.push({ k: "⑥ 阻塞", v: blockerText });
      rows.push({ k: "⑦ 最近切换", v: switchText });
      if (s.manualHold) {
        // 让路必须写明原因和剩余时间：禁止静默暂停
        hold = `你刚刚手动操作过，已暂停 ${s.manualHold.remainSec} 秒（目标：${s.manualHold.goalId}）`;
      }
      if (s.degraded) {
        note = `策略层降级：${s.error || "未知错误"}（沿用上一次成功决策）`;
      } else if (s.blockers.length) {
        note = s.blockers[0].advice || "";
      }
      this.smartRows = rows;
      this.smartHold = hold;
      this.smartNote = note;
    },
    applySpeedValue(value) {
      const result = GameSpeed.set(value);
      if (!result.ok) {
        GameUI.notify.error(`倍率设置失败：${result.message}`);
        this.speedInput = String(GameSpeed.factor);
        return;
      }
      this.speedFactor = result.value;
      this.speedInput = String(result.value);
      if (result.persisted) {
        GameUI.notify.success(`游戏速度已设置为 ×${GameSpeed.format(result.value)}`);
      } else {
        GameUI.notify.error(result.message);
      }
    },
    applySpeed() {
      this.applySpeedValue(this.speedInput);
    },
    applySpeedPreset(value) {
      this.applySpeedValue(value);
    },
    resetSpeed() {
      const result = GameSpeed.resetDefault();
      this.speedFactor = GameSpeed.factor;
      this.speedInput = String(GameSpeed.factor);
      if (result.ok) GameUI.notify.info(`游戏速度已恢复默认 ×${GameSpeed.format(GameSpeed.defaultFactor)}`);
    },
    // Given the endpoints of 22-54, this produces 500, 600, ... , 900, 1000, 2000, ... , 1e6 ticks
    // It's essentially 10^(x/10) but with the mantissa spaced linearly instead of logarithmically
    parseOfflineSlider(str) {
      const value = parseInt(str, 10);
      return (1 + value % 9) * Math.pow(10, Math.floor(value / 9));
    },
    adjustSliderValueOfflineTicks(value) {
      this.offlineSlider = value;
      player.options.offlineTicks = this.parseOfflineSlider(value);
    },
    adjustSliderValueAutomatorLogSize(value) {
      this.automatorLogSize = value;
      player.options.automatorEvents.maxEntries = this.automatorLogSize;
    }
  },
  template: `
  <div class="l-options-tab">
    <div class="l-options-grid">
      <div class="l-options-grid__row c-oreki-speed">
        <div class="o-primary-btn o-primary-btn--option c-oreki-speed__info">
          <b>游戏速度：×{{ speedFactorText }}</b>
          <span class="c-oreki-speed__hint">{{ speedHint }}</span>
          <span class="c-oreki-speed__hint">{{ speedStorageHint }}</span>
        </div>
        <div class="o-primary-btn o-primary-btn--option c-oreki-speed__input">
          <b>自定义倍率</b>
          <input
            v-model="speedInput"
            class="c-oreki-speed__field"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            aria-label="自定义游戏速度倍率"
            @keydown.enter="applySpeed"
          >
        </div>
        <button
          class="o-primary-btn o-primary-btn--option c-oreki-speed__apply"
          @click="applySpeed"
        >
          应用倍率
        </button>
      </div>
      <div class="l-options-grid__row c-oreki-speed__presets">
        <button
          v-for="preset in speedPresets"
          :key="preset"
          class="o-primary-btn o-primary-btn--option c-oreki-speed__preset"
          @click="applySpeedPreset(preset)"
        >
          ×{{ preset }}
        </button>
        <button
          class="o-primary-btn o-primary-btn--option c-oreki-speed__preset"
          @click="resetSpeed"
        >
          恢复默认
        </button>
      </div>
      <div class="l-options-grid__row c-oreki-speed__autobuyer">
        <PrimaryToggleButton
          v-model="dynamicSpeed"
          class="o-primary-btn--option"
          label="自动动态速度"
        />
        <div class="o-primary-btn o-primary-btn--option c-oreki-speed__info">
          <b>{{ dynamicSpeedLabel }}</b>
          <span class="c-oreki-speed__hint">{{ dynamicSpeedHint }}</span>
        </div>
      </div>
      <div class="l-options-grid__row c-oreki-speed__autobuyer">
        <PrimaryToggleButton
          v-model="scaleAutobuyerInterval"
          class="o-primary-btn--option c-oreki-speed__autobuyer-toggle"
          label="自动购买器间隔随倍率缩短："
        />
        <div class="o-primary-btn o-primary-btn--option c-oreki-speed__info c-oreki-speed__autobuyer-hint">
          <b>仅影响反物质维度自动购买器</b>
          <span class="c-oreki-speed__hint">
            开启后，反物质维度自动购买器的购买间隔会按游戏速度倍率缩短，
            让购买节奏跟得上游戏时间；默认关闭，×1 时行为不变。
          </span>
        </div>
      </div>
      <div class="l-options-grid__row c-oreki-speed__autobuyer">
        <PrimaryToggleButton
          v-model="scaleTickspeedAutobuyerInterval"
          class="o-primary-btn--option c-oreki-speed__autobuyer-toggle c-oreki-speed__tickspeed-toggle"
          label="计数频率自动购买器间隔随倍率缩短："
        />
        <div class="o-primary-btn o-primary-btn--option c-oreki-speed__info c-oreki-speed__autobuyer-hint">
          <b>仅影响计数频率自动购买器</b>
          <span class="c-oreki-speed__hint">
            开启后，计数频率自动购买器的购买间隔会按游戏速度倍率缩短，
            让计数频率升级跟得上游戏时间；默认关闭，×1 时行为不变。
          </span>
        </div>
      </div>
      <div class="l-options-grid__row c-oreki-smart">
        <div class="o-primary-btn o-primary-btn--option c-oreki-smart__panel">
          <b>智能自动购买器</b>
          <span
            v-for="row in smartRows"
            :key="row.k"
            class="c-oreki-smart__line"
          >
            <span class="c-oreki-smart__key">{{ row.k }}</span>
            <span class="c-oreki-smart__value">{{ row.v }}</span>
          </span>
          <span
            v-if="smartHold"
            class="c-oreki-smart__line c-oreki-smart__line--hold"
          >{{ smartHold }}</span>
          <span
            v-if="smartNote"
            class="c-oreki-smart__line c-oreki-smart__line--note"
          >{{ smartNote }}</span>
        </div>
      </div>
      <div class="l-options-grid__row">
        <OptionsButton
          class="o-primary-btn--option"
          onclick="Modal.orekiAchievement.show()"
        >
          成就工具
        </OptionsButton>
        <OptionsButton
          class="o-primary-btn--option"
          onclick="Modal.orekiSave.show()"
        >
          存档工具
        </OptionsButton>
        <OptionsButton
          class="o-primary-btn--option"
          onclick="Modal.orekiTutorial.show()"
        >
          内置教程
        </OptionsButton>
      </div>
      <div class="l-options-grid__row">
        <OptionsButton
          class="o-primary-btn--option"
          onclick="Modal.confirmationOptions.show()"
        >
          打开确认选项
        </OptionsButton>
        <PrimaryToggleButton
          v-model="hotkeys"
          class="o-primary-btn--option l-options-grid__button"
          label="快捷键："
          on="启用"
          off="禁用"
        />
        <PrimaryToggleButton
          v-model="automaticTabSwitching"
          class="o-primary-btn--option l-options-grid__button l-toggle-button"
          label="自动切换标签页："
          data-v-options-gameplay-tab
        />
      </div>
      <div class="l-options-grid__row">
        <PrimaryToggleButton
          v-model="offlineProgress"
          class="o-primary-btn--option l-options-grid__button"
          label="离线进度："
        />
        <div class="o-primary-btn o-primary-btn--option o-primary-btn--slider l-options-grid__button">
          <b>离线时间间隔：{{ formatInt(offlineTicks) }}</b>
          <SliderComponent
            class="o-primary-btn--slider__slider"
            v-bind="sliderPropsOfflineTicks"
            :value="offlineSlider"
            @input="adjustSliderValueOfflineTicks($event)"
          />
        </div>
        <PrimaryToggleButton
          v-model="hibernationCatchup"
          class="o-primary-btn--option l-options-grid__button"
          label="将切后台的时间视为离线进度运行："
        />
      </div>
      <div class="l-options-grid__row">
        <div
          v-if="automatorUnlocked"
          class="o-primary-btn o-primary-btn--option o-primary-btn--slider l-options-grid__button"
        >
          <b>自动机日志上限：{{ formatInt(parseInt(automatorLogSize)) }}</b>
          <SliderComponent
            class="o-primary-btn--slider__slider"
            v-bind="sliderPropsAutomatorLogSize"
            :value="automatorLogSize"
            @input="adjustSliderValueAutomatorLogSize($event)"
          />
        </div>
      </div>
      <OpenModalHotkeysButton />
    </div>
  </div>
  `
};