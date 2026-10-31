import ModalWrapperChoice from "./ModalWrapperChoice.js";
import PrimaryButton from "../PrimaryButton.js";

// [Oreki R43-C] 确认短语改为简体中文：原来是英文 "Gotta Go Fast!"，
// 玩家必须在输入框里原样打出这串英文才能开始速通，属于「玩家可见英文残留」。
// 提示文案与判定共用这个常量，避免两边再次漂移。
const CONFIRM_PHRASE = "全速前进！";

/** 全角 / 半角感叹号都接受，首尾空白忽略；否则手机上打出感叹号会卡住玩家 */
function normalizePhrase(value) {
  return String(value ?? "")
    .trim()
    .replace(/[!！]/gu, "！");
}

export default {
  name: "SpeedrunModeModal",
  components: {
    PrimaryButton,
    ModalWrapperChoice,
  },
  data() {
    return {
      onInfoPage: true,
      name: "",
      confirmPhrase: "",
      requiredPhrase: CONFIRM_PHRASE,
    };
  },
  computed: {
    willStartRun() {
      return normalizePhrase(this.confirmPhrase) === CONFIRM_PHRASE;
    },
  },
  methods: {
    nextPage() {
      this.onInfoPage = false;
    },
    startRun() {
      if (!this.willStartRun) return;
      this.emitClose();
      Speedrun.prepareSave(Speedrun.generateName(this.name));
    },
  },
  template: `
  <ModalWrapperChoice
    :show-cancel="!onInfoPage && !willStartRun"
    :show-confirm="!onInfoPage && willStartRun"
    confirm-class="o-primary-btn--width-medium c-modal-hard-reset-btn c-modal__confirm-btn"
    @confirm="startRun"
  >
    <template #header>
      进入速通模式
    </template>
    <div
      v-if="onInfoPage"
      class="c-modal-message__text"
    >
      这会新建一个存档，并额外记录你在游戏各关键节点抵达时的时间。这些统计会显示在屏幕右下角，
      以及“统计数据”里的一个专属子页签中。
      <br>
      <br>
      几乎所有动画与确认弹窗都默认关闭，但你可以在进度到达相应节点之前随时修改这些设置。开始速通后，
      游戏会一直保持暂停，直到你的反物质发生变化，方便你先配置好所有设置再出发。为了避免在真正开始
      一次优化速通之前干等很久，少量成就会直接赠送。
      <br>
      <br>
      <i>
        速通模式没有额外内容。
      </i>
      <br>
      <br>
      <PrimaryButton
        class="o-primary-btn--width-medium c-modal-hard-reset-btn c-modal__confirm-btn"
        @click="nextPage"
      >
        继续
      </PrimaryButton>
    </div>
    <div
      v-else
      class="c-modal-message__text"
    >
      你可以在下面输入文字，为这次速通存档起名。它不影响任何游戏内容，只是把这一个存档标记成你的。
      留空则会随机生成一个名字。只要计时还没开始，点击速通信息框里的名字即可改名。
      <input
        ref="name"
        v-model="name"
        type="text"
        class="c-modal-input c-modal-hard-reset__input"
        @keyup.esc="emitClose"
      >
      <br>
      <br>
      速通存档可以像普通存档一样导入导出。导入一份速通存档会被标记为“分段速通”，因为导入导出让玩家
      可以分别优化游戏的不同段落。不导入的话，存档始终是“单段速通”。
      <br>
      <br>
      如果愿意，你也可以在开始速通之前到“选项”页修改符文随机种子。
      <br>
      <br>
      <div class="c-modal-hard-reset-danger">
        开始速通会把你的存档重置到游戏开头。少数内容会保留，例如全流程完成统计、视觉效果设置、
        自动机脚本与符文外观；除此之外，就相当于你刚刚通关、在制作人员名单界面选择了重新开始。
        请在下面输入“{{ requiredPhrase }}”以确认并（重新）开始速通。
      </div>
      <input
        ref="confirmPhrase"
        v-model="confirmPhrase"
        type="text"
        class="c-modal-input c-modal-hard-reset__input"
        @keyup.esc="emitClose"
      >
    </div>
    <template #confirm-text>
      开始速通
    </template>
    <template #cancel-text>
      取消
    </template>
  </ModalWrapperChoice>
  `
};