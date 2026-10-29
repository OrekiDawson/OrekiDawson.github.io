import { openExternalLink } from "../../utility/open-external-link.js";
import { STEAM } from "../../env.js";

export default {
  name: "NewsTicker",
  data() {
    return {
      enableAnimation: false,
      // [Oreki R33] 用户要求 Web 版关闭新闻：不得显示新闻入口、新闻内容，
      // 也不得为新闻保留可见空白区域。
      // 做法：根节点 v-if 直接不渲染 —— Vue 2 会渲染一个空注释节点，
      // 参与 flex 布局时尺寸为 0，因此不会留下可见空白。
      // 不用 `display:none` / `visibility:hidden` / 高度置 0 的原因：
      // 那三种都会保留 DOM 与定时器，滚动动画仍在跑（浪费性能），
      // 且后续调样式容易把空白又露出来。
      // 副作用：`prepareNextMessage()` 里 `this.$refs.line === undefined` 会早返回，
      // 定时器链自然终止，不会产生空转。
      orekiNewsDisabled: true,
    };
  },
  computed: {
    lineClass() {
      return this.enableAnimation ? undefined : "c-disable-ticker-animation";
    }
  },
  beforeCreate() {
    this.recentTickers = [];
  },
  mounted() {
    document.addEventListener("visibilitychange", () => this.restart.bind(this));
    this.restart();
  },
  beforeDestroy() {
    this.clearTimeouts();
  },
  methods: {
    update() {
      if (this.currentNews?.dynamic) {
        this.$refs.line.innerHTML = this.currentNews.text;
      }
      this.enableAnimation = player.options.news.includeAnimated;
    },
    restart() {
      if (!GameUI.initialized) {
        setTimeout(this.restart.bind(this), 100);
        return;
      }
      this.clearTimeouts();
      if (document.hidden) {
        return;
      }
      this.prepareNextMessage();
    },
    clearTimeouts() {
      clearTimeout(this.delayTimeout);
      clearTimeout(this.scrollTimeout);
    },
    prepareNextMessage() {
      const line = this.$refs.line;
      if (line === undefined) return;

      // Prevent tickers from repeating if they aren't unlocked or were seen recently
      const canShow = news => (news.unlocked ?? true) && !this.recentTickers.includes(news.id) && (!news.id.startsWith("t") || player.options.news.chineseNews);

      if (nextNewsMessageId && GameDatabase.news.find(message => message.id === nextNewsMessageId)) {
        this.currentNews = GameDatabase.news.find(message => message.id === nextNewsMessageId);
        nextNewsMessageId = undefined;
      } else if (this.currentNews && this.currentNews.id === "a236") {
        this.currentNews = GameDatabase.news
          .filter(message => message.isAdvertising && canShow(message))
          .randomElement();
      } else {
        const isAI = Math.random() < player.options.news.AIChance;
        this.currentNews = GameDatabase.news
          .filter(message => message.id.includes("ai") === isAI)
          .filter(message => canShow(message))
          .randomElement();
      }

      this.recentTickers.push(this.currentNews.id);
      while (this.recentTickers.length > player.options.news.repeatBuffer) this.recentTickers.shift();

      if (this.currentNews.reset) {
        this.currentNews.reset();
      }

      let text = this.currentNews.text;
      if (STEAM) {
        window.openNewsLink = openExternalLink;
        text = text.replace(
          /href=['"]([^"']+)['"]/gu,
          "href onClick='window.openNewsLink(\"$1\"); return false;'"
        );
      }
      line.innerHTML = text;

      line.style["transition-duration"] = "0ms";
      if (this.currentNews?.id === "a244" || this.currentNews?.id === "ai63") {
        line.style.transform = "translateX(-100%)";
      } else {
        line.style.transform = "translateX(0)";
      }

      const DELAY = 1000;
      this.delayTimeout = setTimeout(this.scrollMessage.bind(this), DELAY);
    },
    scrollMessage() {
      const line = this.$refs.line;

      // SCROLL_SPEED is in pixels per second
      const SCROLL_SPEED = player.options.news.speed * 100;
      const scrollDuration = (this.$refs.ticker.clientWidth + line.clientWidth) / SCROLL_SPEED;

      line.style["transition-duration"] = `${scrollDuration}s`;
      if (this.currentNews && this.currentNews.id === "a244") {
        line.style.transform = "translateX(0)";
      } else {
        line.style.transform = "translateX(-100%)";
      }

      NewsHandler.addSeenNews(this.currentNews.id);
      if (NewsHandler.uniqueTickersSeen >= 50) Achievement(22).unlock();

      this.scrollTimeout = setTimeout(this.prepareNextMessage.bind(this), scrollDuration * 1000);
    },
    onLineClick() {
      if (this.currentNews.onClick === undefined) {
        return;
      }
      SecretAchievement(24).unlock();
      const updatedText = this.currentNews.onClick();
      if (updatedText !== undefined) {
        this.$refs.line.innerHTML = updatedText;
      }
    }
  },
  template: `
  <div
    v-if="!orekiNewsDisabled"
    ref="ticker"
    class="c-news-ticker"
  >
    <span
      ref="line"
      class="c-news-line c-news-ticker__line"
      :class="lineClass"
      @click="onLineClick"
    />
  </div>
  `
};