import { forbiddenConstantPatterns } from "../../../core/automator/index.js";

export default {
  name: "AutomatorDefineSingleEntry",
  props: {
    constant: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      oldAlias: "",
      aliasString: "",
      valueString: "",
    };
  },
  computed: {
    maxNameLength() {
      return AutomatorData.MAX_ALLOWED_CONSTANT_NAME_LENGTH;
    },
    maxValueLength() {
      return AutomatorData.MAX_ALLOWED_CONSTANT_VALUE_LENGTH;
    },
  },
  created() {
    this.aliasString = this.constant;
    this.oldAlias = this.aliasString;
    this.valueString = player.reality.automator.constants[this.aliasString];
  },
  methods: {
    // We combine error checking from both input fields together and only show one of them because showing multiple
    // errors at once is unnecessary and results in some bad UI overlapping
    currentError() {
      if (!this.aliasString) return null;

      const isValidName = this.aliasString.match(/^[a-zA-Z_][a-zA-Z_0-9]*$/u);
      const alreadyExists = Object.keys(player.reality.automator.constants).includes(this.aliasString) &&
        this.aliasString !== this.oldAlias;
      // Use toLowerCase() in order to check against key words in a case-insensitive manner; all the stored regex
      // patterns in forbiddenConstantPatterns which get meaningfully checked against are a mixture of lowercase
      // letters and regex metacharacters
      const hasCommandConflict = forbiddenConstantPatterns.some(p => {
        const matchObj = this.aliasString.toLowerCase().match(p);
        return matchObj ? matchObj[0] === this.aliasString.toLowerCase() : false;
      });
      const shadowsPrototype = ["constructor", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable",
        "toLocaleString", "toString", "toValueOf"].some(p => this.aliasString.match(p));

      if (!isValidName) return "常量的名称必须是字母或数字，没有空格，且不能以数字开头。";
      if (alreadyExists) return "你已使用此名称定义了一个常量";
      if (hasCommandConflict) return "以下常量名称与指令关键字冲突";
      if (shadowsPrototype) return "常量的名称不能与内置JavaScript原型属性名相同";

      if (!this.valueString) return "以下常量的值不能为空";

      const isNumber = this.valueString.match(/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/u);
      // Note: Does not do validation for studies existing
      const isStudyString = TimeStudyTree.isValidImportString(this.valueString);

      if (!isNumber && !isStudyString) return "以下常量的值必须是一个数字或时间研究字符串";
      return null;
    },
    errorTooltip() {
      const error = this.currentError();
      if (!error) return undefined;
      return {
        content:
          `<div class="c-block-automator-error">
          <div>${error}</div>
        </div>`,
        html: true,
        trigger: "manual",
        show: true,
        classes: ["general-tooltip"]
      };
    },
    handleFocus(focus) {
      if (focus || this.currentError()) return;
      if (!this.aliasString) AutomatorBackend.deleteConstant(this.oldAlias);
      else if (!this.oldAlias) AutomatorBackend.addConstant(this.aliasString, this.valueString);
      else if (this.oldAlias === this.aliasString) AutomatorBackend.modifyConstant(this.aliasString, this.valueString);
      else AutomatorBackend.renameConstant(this.oldAlias, this.aliasString);
      this.oldAlias = this.aliasString;

      // This makes scripts respond immediately to newly-defined constants if the player types them into the
      // script before defining them here
      AutomatorData.recalculateErrors();
      if (player.reality.automator.type === AUTOMATOR_TYPE.BLOCK) BlockAutomator.parseTextFromBlocks();
    },
    deleteConstant() {
      AutomatorBackend.deleteConstant(this.aliasString);
      this.oldAlias = "";
      this.aliasString = "";
      this.valueString = "";
    }
  },
  template: `
  <div
    class="l-single-definition-container"
    data-v-automator-define-single-entry
  >
    <input
      v-model="aliasString"
      class="c-define-textbox c-alias"
      :class="{ 'l-limit-textbox' : aliasString.length === maxNameLength }"
      placeholder="新增常量…"
      :maxlength="maxNameLength"
      @focusin="handleFocus(true)"
      @focusout="handleFocus(false)"
      data-v-automator-define-single-entry
    >
    <span
      v-if="aliasString"
      v-tooltip="errorTooltip()"
      class="o-arrow-padding"
      data-v-automator-define-single-entry
    >
      🠈
    </span>
    <input
      v-if="aliasString"
      v-model="valueString"
      class="c-define-textbox c-value"
      :class="{ 'l-limit-textbox' : valueString && valueString.length === maxValueLength }"
      placeholder="常量的值…"
      :maxlength="maxValueLength"
      @focusin="handleFocus(true)"
      @focusout="handleFocus(false)"
      data-v-automator-define-single-entry
    >
    <button
      v-if="aliasString"
      v-tooltip="'删除该常量'"
      class="c-delete-button fas fa-eraser"
      @click="deleteConstant"
      data-v-automator-define-single-entry
    />
  </div>
  `
};
