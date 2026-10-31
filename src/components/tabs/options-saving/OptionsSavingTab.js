import AutosaveIntervalSlider from "./AutosaveIntervalSlider.js";
import OpenModalHotkeysButton from "../../OpenModalHotkeysButton.js";
import OptionsButton from "../../OptionsButton.js";
import PrimaryToggleButton from "../../PrimaryToggleButton.js";
import SaveFileName from "./SaveFileName.js";

import { STEAM } from "../../../env.js";

export default {
  name: "OptionsSavingTab",
  components: {
    AutosaveIntervalSlider,
    OpenModalHotkeysButton,
    OptionsButton,
    PrimaryToggleButton,
    SaveFileName
  },
  data() {
    return {
      cloudAvailable: false,
      cloudEnabled: false,
      forceCloudOverwrite: false,
      showCloudModal: false,
      syncSaveIntervals: false,
      showTimeSinceSave: false,
      hideGoogleName: false,
      loggedIn: false,
      userName: "",
      canSpeedrun: false,
      inSpeedrun: false,
      creditsClosed: false,
      canModifySeed: false,
    };
  },
  computed: {
    modalTooltip() {
      return `当检测到你可能不希望覆盖云存档的情况时，若此选项开启，游戏将显示包含详细信息的弹窗。`;
    },
    overwriteTooltip() {
      if (this.showCloudModal) return "由于当前会显示弹窗，此设置不起作用。";
      return this.forceCloudOverwrite
        ? `无论何种情况，你的本地存档都会覆盖云存档。`
        : `存在存档冲突时，你的本地存档将无法保存到云端。`;
    },
    STEAM() {
      return STEAM;
    }
  },
  watch: {
    cloudEnabled(newValue) {
      player.options.cloudEnabled = newValue;
    },
    forceCloudOverwrite(newValue) {
      player.options.forceCloudOverwrite = newValue;
    },
    showCloudModal(newValue) {
      player.options.showCloudModal = newValue;
    },
    syncSaveIntervals(newValue) {
      player.options.syncSaveIntervals = newValue;
    },
    showTimeSinceSave(newValue) {
      player.options.showTimeSinceSave = newValue;
    },
    hideGoogleName(newValue) {
      player.options.hideGoogleName = newValue;
    }
  },
  methods: {
    update() {
      const options = player.options;
      this.cloudAvailable = Cloud.isAvailable;
      this.cloudEnabled = options.cloudEnabled;
      this.forceCloudOverwrite = options.forceCloudOverwrite;
      this.showCloudModal = options.showCloudModal;
      this.syncSaveIntervals = options.syncSaveIntervals;
      this.showTimeSinceSave = options.showTimeSinceSave;
      this.hideGoogleName = options.hideGoogleName;
      this.loggedIn = Cloud.loggedIn;
      this.canSpeedrun = player.speedrun.isUnlocked;
      this.inSpeedrun = player.speedrun.isActive;
      this.canModifySeed = Speedrun.canModifySeed();
      this.creditsClosed = GameEnd.creditsEverClosed;
      if (!this.loggedIn) return;
      this.userName = Cloud.user.displayName;
    },
    importAsFile(event) {
      // This happens if the file dialog is canceled instead of a file being selected
      if (event.target.files.length === 0) return;

      const reader = new FileReader();
      reader.onload = function() {
        // File importing behavior should use the behavior on the existing and to-be-overwritten save instead of the
        // settings in the to-be-imported save. This is largely because the former is more easily edited by the player,
        // and in contrast with the import-as-string case which allows the player to choose.
        // Note: Do not move this into GameStorage.import, as this would cause the offline progress choice in the text
        // import modal (the only other place GameStorage.import is called) to always be overridden
        GameStorage.offlineEnabled = player.options.offlineProgress;
        GameStorage.offlineTicks = player.options.offlineTicks;
        GameStorage.import(reader.result);
      };
      reader.readAsText(event.target.files[0]);
    },
    openSeedModal() {
      if (this.canModifySeed) {
        Modal.modifySeed.show();
      } else {
        Modal.message.show(`你无法再修改符文随机种子了：本次运行中，符文随机数生成器已经用来生成过
          至少一个符文。`);
      }
    }
  },
  template: `
  <div class="l-options-tab">
    <div class="l-options-grid">
      <div class="l-options-grid__row">
        <OptionsButton
          class="o-primary-btn--option_font-x-large"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          onclick="GameStorage.export()"
        >
          导出存档
        </OptionsButton>
        <OptionsButton
          class="o-primary-btn--option_font-x-large"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          onclick="Modal.import.show()"
        >
          导入存档
        </OptionsButton>
        <OptionsButton
          class="o-primary-btn--option_font-x-large"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          onclick="Modal.hardReset.show()"
        >
          重置游戏
        </OptionsButton>
      </div>
      <div class="l-options-grid__row">
        <OptionsButton
          class="o-primary-btn--option_font-x-large"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          onclick="GameStorage.save(false, true)"
        >
          保存游戏
        </OptionsButton>
        <OptionsButton
          class="o-primary-btn--option_font-x-large"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          onclick="Modal.loadGame.show()"
        >
          选择存档
        </OptionsButton>
        <AutosaveIntervalSlider
          :min="10"
          :max="60"
          :interval="1"
        />
      </div>
      <div class="l-options-grid__row">
        <OptionsButton
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          onclick="GameStorage.exportAsFile()"
        >
          以文件形式导出
        </OptionsButton>
        <OptionsButton
          class="c-file-import-button"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
        >
          <input
            class="c-file-import"
            type="file"
            accept=".txt"
            @change="importAsFile"
          >
          <label for="file">导入存档文件</label>
        </OptionsButton>
        <PrimaryToggleButton
          v-model="showTimeSinceSave"
          class="o-primary-btn--option l-options-grid__button"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          label="显示距上次存档的时间："
        />
      </div>
      <div class="l-options-grid__row">
        <OptionsButton
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          onclick="Modal.backupWindows.show()"
        >
          打开自动备份存档菜单
        </OptionsButton>
        <SaveFileName />
      </div>
      <div class="l-options-grid__row">
        <OptionsButton
          v-if="canSpeedrun"
          class="o-primary-btn--option_font-x-large"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          onclick="Modal.enterSpeedrun.show()"
        >
          开始速通
        </OptionsButton>
        <OptionsButton
          v-if="inSpeedrun"
          :class="{
            'o-pelle-disabled-pointer': creditsClosed,
            'o-primary-btn--disabled': !canModifySeed
          }"
          @click="openSeedModal()"
        >
          修改符文随机种子
        </OptionsButton>
      </div>
      <OpenModalHotkeysButton />
    </div>
    <h2
      v-if="cloudAvailable"
      class="c-cloud-options-header"
    >
      <span v-if="hideGoogleName">已登录 Google <i>（名称已隐藏）</i></span>
      <span v-else-if="loggedIn">已登录：{{ userName }}</span>
      <span v-else>未登录</span>
    </h2>
    <div v-if="loggedIn">
      <span v-if="cloudEnabled">云存档将每 10 分钟自动进行一次。</span>
      <span v-else>此存档已禁用云存档。</span>
    </div>
    <div
      v-if="cloudAvailable"
      class="l-options-grid"
    >
      <div
        v-if="!STEAM"
        class="l-options-grid__row"
      >
        <OptionsButton
          v-if="loggedIn"
          onclick="GameOptions.logout()"
        >
          断开 Google 账号并禁用云存档
        </OptionsButton>
        <OptionsButton
          v-else
          v-tooltip="'这会将你的 Google 账号与反物质维度存档关联起来'"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          onclick="GameOptions.login()"
        >
          使用 Google 登录以启用云存档
        </OptionsButton>
        <PrimaryToggleButton
          v-if="loggedIn"
          v-model="hideGoogleName"
          v-tooltip="'出于隐私考虑，将在界面中隐藏你的 Google 账号名称。不影响存档与读档。'"
          class="o-primary-btn--option l-options-grid__button"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          label="隐藏 Google 账号名称："
        />
      </div>
      <div
        v-if="loggedIn"
        class="l-options-grid__row"
      >
        <OptionsButton
          onclick="GameOptions.cloudSave()"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
        >
          云存档保存
        </OptionsButton>
        <OptionsButton
          onclick="GameOptions.cloudLoad()"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
        >
          云存档读取
        </OptionsButton>
        <PrimaryToggleButton
          v-model="syncSaveIntervals"
          class="o-primary-btn--option l-options-grid__button"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          label="云存档前强制保存本地："
        />
      </div>
      <div
        v-if="loggedIn"
        class="l-options-grid__row"
      >
        <PrimaryToggleButton
          v-model="cloudEnabled"
          class="o-primary-btn--option l-options-grid__button"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          label="自动云存档/读档："
        />
        <PrimaryToggleButton
          v-model="showCloudModal"
          v-tooltip="modalTooltip"
          class="o-primary-btn--option l-options-grid__button"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          label="可能出现存档冲突时显示弹窗："
        />
        <PrimaryToggleButton
          v-model="forceCloudOverwrite"
          v-tooltip="overwriteTooltip"
          class="o-primary-btn--option l-options-grid__button"
          :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
          label="存在冲突时强制云存档："
        />
      </div>
    </div>
  </div>
  `
};