import ModalWrapperChoice from "./ModalWrapperChoice.js";
import { OrekiSaveTool } from "../../core/oreki-tools.js";

export default {
  name: "OrekiSaveModal",
  components: {
    ModalWrapperChoice
  },
  data() {
    return {
      info: {},
      backupInfo: null,
      importText: "",
      importAcknowledged: false,
      resetArmed: false,
      resetTimer: 0,
      status: "",
      statusKind: "info",
    };
  },
  computed: {
    backupText() {
      if (!this.backupInfo) return "尚无备份";
      const d = this.backupInfo.date;
      const pad = n => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
        + `（${formatInt(this.backupInfo.length)} 字符${this.backupInfo.reason ? `，${this.backupInfo.reason}` : ""}）`;
    },
    canImport() {
      return this.importAcknowledged && this.importText.trim().length > 10;
    },
  },
  created() {
    this.refresh();
  },
  destroyed() {
    clearTimeout(this.resetTimer);
  },
  methods: {
    refresh() {
      this.info = OrekiSaveTool.getInfo();
      this.backupInfo = OrekiSaveTool.getBackupInfo();
    },
    setStatus(message, kind = "info") {
      this.status = message;
      this.statusKind = kind;
    },
    doBackup() {
      const r = OrekiSaveTool.makeBackup("manual");
      if (r.ok) {
        this.setStatus("已保存一份本地快照", "ok");
        GameUI.notify.success("已保存本地快照");
      } else {
        this.setStatus(r.message, "bad");
        GameUI.notify.error(r.message);
      }
      this.refresh();
    },
    doRestore() {
      if (!this.backupInfo) {
        this.setStatus("还没有备份，无法恢复", "bad");
        return;
      }
      const r = OrekiSaveTool.restoreBackup();
      if (r.ok) {
        this.setStatus(r.message, "ok");
        GameUI.notify.success(r.message);
      } else {
        this.setStatus(r.message, "bad");
        GameUI.notify.error(r.message);
      }
    },
    doExportClipboard() {
      copyToClipboard(OrekiSaveTool.exportText());
      this.setStatus("已将存档文本复制到剪贴板", "ok");
      GameUI.notify.success("已复制存档到剪贴板");
    },
    doExportFile() {
      try {
        const text = OrekiSaveTool.exportText();
        const stamp = new Date().toISOString().replace(/[:.]/gu, "-").slice(0, 19);
        download(`AD Oreki Edition 存档 ${stamp}.txt`, text);
        this.setStatus("已下载存档文件", "ok");
      } catch (e) {
        this.setStatus(`下载失败：${e && e.message ? e.message : e}`, "bad");
      }
    },
    doImport() {
      if (!this.canImport) {
        this.setStatus("请粘贴存档文本并勾选确认", "bad");
        return;
      }
      const r = OrekiSaveTool.importText(this.importText);
      this.setStatus(r.message, r.ok ? "ok" : "bad");
      if (r.ok) {
        GameUI.notify.success(r.message);
        this.importText = "";
        this.importAcknowledged = false;
        this.refresh();
      } else {
        GameUI.notify.error(r.message);
      }
    },
    armReset() {
      if (this.resetArmed) {
        this.resetArmed = false;
        clearTimeout(this.resetTimer);
        OrekiSaveTool.resetWithBackup();
        GameUI.notify.info("存档已重置（重置前状态已自动备份）");
        this.refresh();
        return;
      }
      this.resetArmed = true;
      this.resetTimer = setTimeout(() => {
        this.resetArmed = false;
      }, 5000);
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
      存档工具
    </template>
    <div class="c-oreki-tool">
      <div class="c-oreki-tool__hint">
        这里的所有操作都只在本机进行：不会上传到任何服务器，也不会经由第三方网站处理。
        导入、还原、重置之前都会自动写一份本地快照。
      </div>

      <table class="c-oreki-tool__info">
        <tbody>
          <tr><td>存档名称</td><td>{{ info.saveName }}</td></tr>
          <tr><td>槽位</td><td>第 {{ info.slot }} 号</td></tr>
          <tr><td>存档版本</td><td>v{{ info.version }}（当前游戏 v{{ info.currentVersion }}）</td></tr>
          <tr><td>游戏内时间 / 现实时间</td><td>{{ info.totalTime }} / {{ info.realTime }}</td></tr>
          <tr><td>反物质</td><td>{{ info.antimatter }}</td></tr>
          <tr><td>无限点数 / 永恒数 / 现实数</td><td>{{ info.infinityPoints }} / {{ info.eternities }} / {{ info.realities }}</td></tr>
          <tr><td>成就</td><td>{{ info.achievements }}</td></tr>
          <tr><td>隐藏成就</td><td>{{ info.secretAchievements }}</td></tr>
          <tr><td>当前游戏倍率</td><td>×{{ info.speedFactor }}（独立保存，不受存档操作影响）</td></tr>
        </tbody>
      </table>

      <div class="c-oreki-tool__hint">
        本地快照：{{ backupText }}
      </div>

      <div class="c-oreki-tool__buttons">
        <button class="o-primary-btn c-oreki-tool__btn" @click="doBackup">
          立即备份
        </button>
        <button class="o-primary-btn c-oreki-tool__btn" @click="doRestore">
          恢复快照
        </button>
        <button class="o-primary-btn c-oreki-tool__btn" @click="doExportClipboard">
          复制存档文本
        </button>
        <button class="o-primary-btn c-oreki-tool__btn" @click="doExportFile">
          下载存档文件
        </button>
      </div>

      <div class="c-oreki-tool__section">
        <div class="c-oreki-tool__label">导入存档</div>
        <textarea
          v-model="importText"
          class="c-oreki-tool__textarea"
          rows="4"
          placeholder="在此粘贴存档文本…导入前会先自动备份当前存档"
        />
        <label class="c-oreki-tool__ack">
          <input v-model="importAcknowledged" type="checkbox">
          <span>我已了解导入会覆盖当前存档（覆盖前的状态会被自动备份）。</span>
        </label>
        <button
          class="o-primary-btn c-oreki-tool__btn"
          :class="{ 'c-oreki-tool__btn--disabled': !canImport }"
          @click="doImport"
        >
          导入
        </button>
      </div>

      <div class="c-oreki-tool__section">
        <div class="c-oreki-tool__label">重置存档</div>
        <div class="c-oreki-tool__hint">
          重置会把这个槽位清空为新游戏。重置前会自动备份，可用上方「恢复快照」找回。
        </div>
        <button
          class="o-primary-btn c-oreki-tool__btn c-oreki-tool__btn--danger"
          @click="armReset"
        >
          {{ resetArmed ? "再点一次确认重置" : "重置当前存档" }}
        </button>
      </div>

      <div
        v-if="status"
        class="c-oreki-tool__status"
        :class="'c-oreki-tool__status--' + statusKind"
      >
        {{ status }}
      </div>
    </div>
  </ModalWrapperChoice>
  `
};
