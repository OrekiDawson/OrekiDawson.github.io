import ModalWrapperChoice from "./ModalWrapperChoice.js";

export default {
  name: "RespecIAPModal",
  components: {
    ModalWrapperChoice
  },
  methods: {
    returnedSTDCount() {
      let std = 0;
      for (const purchase of ShopPurchase.all) {
        if (purchase.config.instantPurchase) continue;
        std += purchase.purchases * purchase.cost;
      }
      return std;
    },
    handleYesClick() {
      ShopPurchaseData.respecAll();
      EventHub.ui.offAll(this);
    }
  },
  template: `
  <ModalWrapperChoice
    option="respecIAP"
    @confirm="handleYesClick"
  >
    <template #header>
      你将要重置商店购买项
    </template>
    <div
      class="c-modal-message__text"
      data-v-respec-iap-modal
    >
      确定要重置商店购买项吗？这不会花掉任何东西，并会退还你为所有提供永久倍率的购买项花掉的
      {{ returnedSTDCount() }}
      <img
        src="./public/images/std_coin.png"
        class="o-shop-button-button__img"
        data-v-respec-iap-modal
      > STD 硬币。
      <br>
      <br>
      花在离线进度与符文外观上的不会退还。符文外观套装是永久的，购买后不会丢失、也不会被重置。
      <br>
      <br>
      <b
        class="o-warning"
        data-v-respec-iap-modal
       >除非你购买更多 STD 硬币，否则无法再次重置。</b>
    </div>
  </ModalWrapperChoice>
  `
};