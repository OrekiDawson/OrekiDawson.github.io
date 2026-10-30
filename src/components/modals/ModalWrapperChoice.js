import ModalCloseButton from "./ModalCloseButton.js";
import ModalConfirmationCheck from "./ModalConfirmationCheck.js";
import PrimaryButton from "../PrimaryButton.js";

export default {
  name: "ModalWrapperChoice",
  components: {
    PrimaryButton,
    ModalConfirmationCheck,
    ModalCloseButton
  },
  props: {
    cancelClass: {
      type: String,
      required: false,
      default: "o-primary-btn--width-medium c-modal-message__okay-btn"
    },
    confirmClass: {
      type: String,
      required: false,
      default: "o-primary-btn--width-medium c-modal-message__okay-btn c-modal__confirm-btn"
    },
    showCancel: {
      type: Boolean,
      required: false,
      default: true
    },
    showConfirm: {
      type: Boolean,
      required: false,
      default: true
    },
    option: {
      type: String,
      required: false,
      default: undefined
    },
    confirmFn: {
      type: Function,
      required: false,
      default: undefined
    },
    cancelFn: {
      type: Function,
      required: false,
      default: undefined
    },
    /**
     * 是否把全局「确认弹窗」热键（Enter）接到 doConfirm。
     *
     * 默认 true，保持所有既有弹窗的行为不变。纯阅读类弹窗（按 Enter 并没有「确认」
     * 语义，只是误关）传 false —— 否则玩家读教程时随手按一下回车，弹窗就没了。
     */
    useEnterToConfirm: {
      type: Boolean,
      required: false,
      default: true
    }
  },
  created() {
    if (this.useEnterToConfirm) this.on$(GAME_EVENT.ENTER_PRESSED, this.doConfirm);
  },
  methods: {
    doConfirm() {
      if (this.confirmFn) this.confirmFn();
      else {
        this.$emit("confirm");
        EventHub.dispatch(GAME_EVENT.CLOSE_MODAL);
      }
    },
    doCancel() {
      if (this.cancelFn) this.cancelFn();
      else {
        this.$emit("cancel");
        EventHub.dispatch(GAME_EVENT.CLOSE_MODAL);
      }
    },
    closeModal() {
      EventHub.dispatch(GAME_EVENT.CLOSE_MODAL);
    }
  },
  template: `
  <div
    class="c-modal-message l-modal-content--centered"
    data-v-modal-wrapper-choice
  >
    <span
      class="c-modal__header"
      data-v-modal-wrapper-choice
    >
      <ModalCloseButton @click="closeModal" />
      <span
        v-if="$slots.header"
        class="c-modal__title"
        data-v-modal-wrapper-choice
      >
        <slot name="header" />
      </span>
    </span>


    <slot />

    <ModalConfirmationCheck
      v-if="option"
      :option="option"
      data-v-modal-wrapper-choice
    />

    <div
      class="l-modal-buttons"
      data-v-modal-wrapper-choice
    >
      <PrimaryButton
        v-if="showCancel"
        :class="cancelClass"
        @click="doCancel"
        data-v-modal-wrapper-choice
      >
        <slot name="cancel-text">
          取消
        </slot>
      </PrimaryButton>

      <slot name="extra-buttons" />

      <PrimaryButton
        v-if="showConfirm"
        :class="confirmClass"
        @click="doConfirm"
        data-v-modal-wrapper-choice
      >
        <slot name="confirm-text">
          确定
        </slot>
      </PrimaryButton>
    </div>
  </div>
  `
};