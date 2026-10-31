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

// [Oreki R42-C] 手机断点：与 public/stylesheets/oreki.css 的 `@media (max-width: 640px)` 一致。
// 只有窄屏才启用「抽屉」模式；桌面 / 平板仍用常驻侧栏，布局一字不动。
const NARROW_QUERY = "(max-width: 640px)";

export default {
  name: "ModernSidebar",
  components: {
    ModernSidebarCurrency,
    ModernTabButton
  },
  data() {
    return {
      isHidden: false,
      tabVisMap: {},
      // 抽屉是否展开。桌面端恒为 false 且不参与渲染。
      drawerOpen: false,
      // 由 matchMedia 驱动，而不是监听 resize：同一份断点定义只写一次。
      isNarrow: false,
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
  mounted() {
    // matchMedia 在某些测试环境/旧 WebView 里不存在，缺了就退化成「永不抽屉」，
    // 也就是回到 R41 的常驻侧栏，不会白屏。
    if (typeof window === "undefined" || !window.matchMedia) return;
    this.mediaQuery = window.matchMedia(NARROW_QUERY);
    this.isNarrow = this.mediaQuery.matches;
    this.onMediaChange = event => {
      this.isNarrow = event.matches;
      // 旋屏到宽屏时抽屉概念不存在，必须复位，否则回到窄屏会「默认展开」挡内容。
      if (!event.matches) this.drawerOpen = false;
    };
    if (this.mediaQuery.addEventListener) this.mediaQuery.addEventListener("change", this.onMediaChange);
    else if (this.mediaQuery.addListener) this.mediaQuery.addListener(this.onMediaChange);
  },
  beforeDestroy() {
    if (!this.mediaQuery) return;
    if (this.mediaQuery.removeEventListener) this.mediaQuery.removeEventListener("change", this.onMediaChange);
    else if (this.mediaQuery.removeListener) this.mediaQuery.removeListener(this.onMediaChange);
  },
  methods: {
    update() {
      this.isHidden = AutomatorData.isEditorFullscreen;
      // 按 key 记录可见性：顺序被打散后不能用下标对齐，否则「维度」会拿到
      // 别的页签的可见性，表现为某些页该出现却没出现。
      this.tabVisMap = Object.fromEntries(Tabs.newUI.map(t => [t.key, t.isAvailable]));
    },
    toggleDrawer() {
      this.drawerOpen = !this.drawerOpen;
    },
    closeDrawer() {
      // 选完页签立刻收起：不收起的话抽屉会一直盖住刚切过去的内容。
      if (this.isNarrow) this.drawerOpen = false;
    }
  },
  template: `
  <div
    v-if="!isHidden"
    class="c-oreki-nav"
  >
    <button
      v-if="isNarrow"
      type="button"
      class="c-oreki-nav__toggle"
      :class="{ 'c-oreki-nav__toggle--open': drawerOpen }"
      :aria-expanded="drawerOpen ? 'true' : 'false'"
      aria-controls="oreki-sidebar"
      aria-label="打开页签导航"
      @click.stop="toggleDrawer"
    >
      <i
        class="fas"
        :class="drawerOpen ? 'fa-xmark' : 'fa-bars'"
        aria-hidden="true"
      />
    </button>
    <div
      v-if="isNarrow && drawerOpen"
      class="c-oreki-nav__scrim"
      aria-hidden="true"
      @click.stop="closeDrawer"
    />
    <div
      id="oreki-sidebar"
      class="c-modern-sidebar"
      :class="{
        'c-modern-sidebar--drawer': isNarrow,
        'c-modern-sidebar--open': drawerOpen
      }"
    >
      <ModernSidebarCurrency />
      <template
        v-for="tab in tabs"
      >
        <ModernTabButton
          v-if="tabVisMap[tab.key]"
          :key="tab.name"
          :tab="tab"
          @click.native="closeDrawer"
        />
      </template>
    </div>
  </div>
  `
};
