import OpenModalHotkeysButton from "../../OpenModalHotkeysButton.js";
import OptionsButton from "../../OptionsButton.js";
import PrimaryToggleButton from "../../PrimaryToggleButton.js";
import SliderComponent from "../../SliderComponent.js";
import { GameSpeed } from "../../../core/speed-config.js";

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
    };
  },
  computed: {
    speedFactorText() {
      return GameSpeed.format(this.speedFactor);
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