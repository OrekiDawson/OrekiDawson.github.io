import ModalCloseButton from "./ModalCloseButton.js";
import { OrekiTutorial } from "../tutorial/OrekiTutorial.js";

// [Oreki R37] 教程页是「虚拟 h2p 页签」：组装在页签列表最前面，不写进 GameDatabase，
// 因此原版的 id / 搜索索引 / 其它引用全部不受影响。
const safeCall = (fn, fallback = false) => {
  try {
    return fn();
  } catch (e) {
    return fallback;
  }
};

export default {
  name: "H2PModal",
  components: {
    ModalCloseButton,
  },
  data() {
    return {
      tabId: 0,
      searchValue: "",
    };
  },
  computed: {
    // [Oreki R37] 教程排第一，其余沿用 GameDatabase.h2p.tabs 的原顺序
    allTabs() {
      return [OrekiTutorial.tab, ...GameDatabase.h2p.tabs];
    },
    activeTab: {
      get() {
        return this.allTabs[this.tabId] ?? this.allTabs[0];
      },
      set(tab) {
        // 不用 tab.id 索引：虚拟页签的 id 不参与原版 id 空间，改用对象身份定位
        const index = this.allTabs.indexOf(tab);
        this.tabId = index < 0 ? 0 : index;
      }
    },
    matchingTabs() {
      const query = (this.searchValue || "").trim();
      const results = query === ""
        ? this.allTabs.map(tab => ({ tab, relevance: 1.5 }))
        : GameDatabase.h2p.search(query);
      const filtered = results.filter(searchObj => searchObj.tab.isUnlocked());
      // 教程页不在原版模糊搜索索引里，这里单独按文本包含匹配，命中时固定排最前。
      // 注意：空查询时 results 已经包含教程页（来自 allTabs），不能再 unshift 一次，
      // 否则页签列表会出现两条「新手教程」。
      const alreadyHasTutorial = filtered.some(searchObj => searchObj.tab === OrekiTutorial.tab);
      if (!alreadyHasTutorial && OrekiTutorial.matches(query)) {
        filtered.unshift({ tab: OrekiTutorial.tab, relevance: 0 });
      }
      return filtered;
    },
    topThreshold() {
      const list = this.matchingTabs;
      if (list.length === 0) return 0.5;
      return Math.min(list[Math.min(list.length - 1, 4)].relevance + 0.01, 0.5);
    }
  },
  created() {
    const unlockedTabs = this.allTabs.filter(tab => tab.isUnlocked());
    const tab = this.$viewModel.tab;
    const subtab = `${tab}/${this.$viewModel.subtab}`;
    const matchedEntry = unlockedTabs.find(h2pTab => h2pTab.tab === subtab || h2pTab.tab === tab);
    // [Oreki R37] 新档（还没到第一次无限）打开帮助时直接落在教程页，
    // 老玩家仍然沿用原版的「跳到当前页签对应条目」行为。
    const isNewPlayer = !safeCall(() => PlayerProgress.infinityUnlocked());
    const fallback = isNewPlayer ? OrekiTutorial.tab : (matchedEntry || unlockedTabs[0]);
    this.activeTab = ui.view.h2pForcedTab || fallback;
    ui.view.h2pForcedTab = undefined;
    // Force-show the H2P info initally regardless of tab while the tooltip for the H2P button is still active
    if (Tutorial.emphasizeH2P()) this.activeTab = OrekiTutorial.tab;
  },
  mounted() {
    this.$refs.input.select();
  },
  methods: {
    setActiveTab(tab) {
      this.activeTab = tab;
      document.getElementById("h2p-body").scrollTop = 0;
    },
    isFirstIrrelevant(idx) {
      const matches = this.matchingTabs;
      const searchObjThis = matches[idx];
      const searchObjOther = matches[idx - 1];

      return idx > 0 &&
        searchObjThis.relevance >= this.topThreshold &&
        searchObjOther.relevance < this.topThreshold;
    }
  },
  template: `
  <div class="l-h2p-modal">
    <ModalCloseButton @click="emitClose" />
    <div class="l-h2p-header">
      <div class="c-h2p-title">
        游戏帮助
      </div>
    </div>
    <div class="l-h2p-container">
      <div class="l-h2p-search-tab">
        <input
          ref="input"
          v-model="searchValue"
          placeholder="输入待搜索的内容"
          class="c-h2p-search-bar"
          @keyup.esc="emitClose"
        >
        <div class="l-h2p-tab-list">
          <div
            v-for="(searchObj, searchObjId) in matchingTabs"
            :key="searchObj.tab.name"
            class="o-h2p-tab-button"
            :class="{
              'o-h2p-tab-button--selected': searchObj.tab === activeTab,
              'o-h2p-tab-button--relevant': searchObj.relevance < topThreshold,
              'o-h2p-tab-button--first-irrelevant': isFirstIrrelevant(searchObjId)
            }"
            @click="setActiveTab(searchObj.tab)"
            data-v-h2p-modal
          >
            {{ searchObj.tab.alias }}
          </div>
        </div>
      </div>
      <div class="l-h2p-info">
        <div class="c-h2p-body--title">
          {{ activeTab.name }}
        </div>
        <div
          id="h2p-body"
          class="l-h2p-body c-h2p-body"
          v-html="activeTab.info()"
        />
      </div>
    </div>
  </div>
  `
};