import Loading from "../../../../modules/vue-loading.js";

import Payments from "../../../core/payments.js";

import { STEAM } from "../../../env.js";
import { SteamRuntime } from "../../../steam/index.js";

import PrimaryButton from "../../PrimaryButton.js";
import ShopButton from "./ShopButton.js";

export default {
  name: "ShopTab",
  components: {
    ShopButton,
    Loading,
    PrimaryButton,
  },
  data() {
    return {
      availableSTD: 0,
      spentSTD: 0,
      isLoading: false,
      IAPsEnabled: false,
      creditsClosed: false,
      loggedIn: false,
      username: "",
      canRespec: false,
      respecTimeStr: "",
    };
  },
  computed: {
    STEAM() {
      return STEAM;
    },
    purchases() {
      return ShopPurchase.all;
    },
    enableText() {
      return `内购：${this.IAPsEnabled ? "已启用" : "已禁用"}`;
    },
    respecText() {
      if (!this.loggedIn) return "尚未登录！";
      if (!this.canRespec) return "暂无可用的重置！(购买 STD 或距上次重置等待 3 天)";
      return null;
    },
    hiddenName() {
      return player.options.hideGoogleName;
    }
  },
  methods: {
    update() {
      this.availableSTD = ShopPurchaseData.availableSTD;
      this.spentSTD = ShopPurchaseData.spentSTD;
      this.isLoading = Boolean(player.IAP.checkoutSession.id);
      this.IAPsEnabled = player.IAP.enabled;
      this.creditsClosed = GameEnd.creditsEverClosed;
      this.loggedIn = Cloud.loggedIn;
      this.username = Cloud.user?.displayName;
      this.canRespec = ShopPurchaseData.canRespec;
      if (!ShopPurchaseData.respecAvailable && !this.canRespec) {
        this.respecTimeStr = ShopPurchaseData.timeUntilRespec.toStringShort();
      }
    },
    showStore() {
      if (STEAM && !SteamRuntime.isActive) return;
      if (this.creditsClosed) return;
      SecretAchievement(33).unlock();
      if (this.loggedIn) Modal.shop.show();
      else Modal.message.show("未登录时无法购买 STD 硬币。");
    },
    onCancel() {
      Payments.cancelPurchase(false);
    },
    respec() {
      if (this.creditsClosed || !this.loggedIn || !this.canRespec) return;
      ShopPurchaseData.respecRequest();
    },
    toggleEnable() {
      if (ShopPurchaseData.availableSTD < 0) return;
      player.IAP.enabled = !player.IAP.enabled;
      if (ShopPurchaseData.isIAPEnabled) Speedrun.setSTDUse(true);
    },
    respecClass() {
      return {
        "o-primary-btn--subtab-option": true,
        "o-pelle-disabled-pointer": this.creditsClosed,
        "o-primary-btn--disabled": !this.loggedIn || !this.canRespec
      };
    }
  },
  template: `
  <div
    class="tab shop"
    data-v-shop-tab
  >
    <div
      class="c-shop-disclaimer"
      data-v-shop-tab
    >
      免责声明：这些内容对推进游戏并非必需，仅为支持开发者。游戏在不进行任何内购的情况下也是平衡的。
    </div>
    <div>
      注意：由于法律原因，在 Android、Steam 和网页版进行的商店购买相互独立，且无法转移。
    </div>
    <div
      class="c-subtab-option-container"
      data-v-shop-tab
    >
      <PrimaryButton
        class="o-primary-btn--subtab-option"
        :class="{ 'o-pelle-disabled-pointer': creditsClosed }"
        label="禁用内购："
        @click="toggleEnable()"
        data-v-shop-tab
      >
        {{ enableText }}
      </PrimaryButton>
      <PrimaryButton
        v-if="!STEAM"
        v-tooltip="respecText"
        :class="respecClass()"
        @click="respec()"
        data-v-shop-tab
      >
        重置商店
      </PrimaryButton>
    </div>
    <div v-if="loggedIn && !canRespec && !STEAM">
      距离可用重置还剩：{{ respecTimeStr }}
    </div>
    <div
      v-if="loggedIn"
      class="c-login-info"
      data-v-shop-tab
    >
      <template v-if="STEAM">
        已登录：{{ username }}。
      </template>
      <template v-else>
        <span v-if="hiddenName">已登录。<i>（名称已隐藏）</i></span>
        <span v-else>已登录：{{ username }}。</span>
        <button
          class="o-shop-button-button"
          onclick="GameOptions.logout()"
          data-v-shop-tab
        >
          断开 Google 账号
        </button>
      </template>
    </div>
    <div
      v-else
      class="c-login-info"
      data-v-shop-tab
    >
      你必须先登录才能购买 STD 硬币或使用这些升级。
      <button
        class="o-shop-button-button"
        onclick="GameOptions.login()"
        data-v-shop-tab
      >
        使用 Google 登录
      </button>
    </div>
    <div
      class="c-shop-header"
      data-v-shop-tab
    >
      <span>你拥有 {{ availableSTD }}</span>
      <img
        src="./public/images/std_coin.png"
        class="c-shop-header__img"
        data-v-shop-tab
      >
      <button
        class="o-shop-button-button"
        :class="{ 'o-shop-button-button--disabled': !loggedIn }"
        @click="showStore()"
        data-v-shop-tab
      >
        购买更多
      </button>
    </div>
    注意：本页所有数字有意不受你的记数法设置影响
    <div
      class="l-shop-buttons-container"
      data-v-shop-tab
    >
      <ShopButton
        v-for="purchase in purchases"
        :key="purchase.key"
        :purchase="purchase"
        data-v-shop-tab
      />
    </div>
    <loading
      :active="isLoading"
      :can-cancel="true"
      :on-cancel="onCancel"
      :is-full-page="true"
      data-v-shop-tab
    />
  </div>
  `
};