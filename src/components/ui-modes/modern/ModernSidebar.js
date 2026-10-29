import ModernSidebarCurrency from "./ModernSidebarCurrency.js";
import ModernTabButton from "./ModernTabButton.js";

// [Oreki R33] Web 侧栏唯一顺序来源。见下方 `tabs()` 的说明：
// 只做渲染层排序与白名单，不改 tab 对象、不改 id、不碰存档。
const OREKI_WEB_TAB_ORDER = [
  "dimensions",
  "automation",
  "challenges",
  "infinity",
  "eternity",
  "reality",
  "celestials",
  "achievements",
  "statistics",
  "options",
];

export default {
  name: "ModernSidebar",
  components: {
    ModernSidebarCurrency,
    ModernTabButton
  },
  data() {
    return {
      isHidden: false,
      tabVisMap: {}
    };
  },
  computed: {
    // [Oreki R33] Web 侧栏严格 10 项且顺序固定（用户 2026-10-29 要求）：
    //   维度 · 自动化 · 挑战 · 无限 · 永恒 · 现实 · 天神 · 成就 · 统计数据 · 选项
    // 为什么不在 `secret-formula/tabs.js` 里删对象或改 `id`：
    //   1. tab 的 `id` 参与存档持久化（隐藏页签状态按 id 记），改 id 会让已有存档的
    //      「隐藏了哪些页」错位 —— 属于会碰存档的改动；
    //   2. 直接删 `shop` 对象会让 `Tab.shop` 一类引用断链。
    // 所以这里只做「渲染层白名单 + 显式顺序」：tab 对象全部保留，只决定怎么显示。
    // Web 没有「商店」与「信息」入口，因此白名单里不含 shop —— 它不会出现在侧栏，
    // 也不会为它保留空白。
    tabs() {
      const byKey = new Map(Tabs.newUI.map(t => [t.key, t]));
      return OREKI_WEB_TAB_ORDER.map(key => byKey.get(key)).filter(Boolean);
    }
  },
  methods: {
    update() {
      this.isHidden = AutomatorData.isEditorFullscreen;
      // 按 key 记录可见性：顺序被打散后不能用下标对齐，否则「维度」会拿到
      // 别的页签的可见性，表现为某些页该出现却没出现。
      this.tabVisMap = Object.fromEntries(Tabs.newUI.map(t => [t.key, t.isAvailable]));
    },
  },
  template: `
  <div
    v-if="!isHidden"
    class="c-modern-sidebar"
  >
    <ModernSidebarCurrency />
    <template
      v-for="tab in tabs"
    >
      <ModernTabButton
        v-if="tabVisMap[tab.key]"
        :key="tab.name"
        :tab="tab"
      />
    </template>
  </div>
  `
};