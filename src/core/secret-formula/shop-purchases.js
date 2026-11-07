import { STEAM } from "../../env.js";

// NOTE: IF ANY COSTS ARE CHANGED HERE, THEY ALSO NEED TO BE CHANGED ON THE BACKEND TOO
export const shopPurchases = {
  dimPurchases: {
    key: "dimPurchases",
    cost: 30,
    description: "永久使所有反物质维度倍数翻倍。",
    multiplier: purchases => Math.pow(2, purchases),
    formatEffect: x => `×${x > 1000 ? Notation.scientific.formatDecimal(new Decimal(x), 2) : x.toFixed(0)}`,
  },
  allDimPurchases: {
    key: "allDimPurchases",
    cost: 60,
    description: () => {
      const dims = ["反物质"];
      if (InfinityDimension(1).isUnlocked || PlayerProgress.eternityUnlocked()) dims.push("无限");
      if (PlayerProgress.eternityUnlocked()) dims.push("时间");
      return `使所有维度倍数翻倍（${makeEnumeration(dims)}；累乘至 ×32 后改为累加）。永久生效。`;
    },
    multiplier: purchases => (purchases > 4 ? 32 + (purchases - 5) * 2 : Math.pow(2, purchases)),
    formatEffect: x => `×${x.toFixed(0)}`,
  },
  IPPurchases: {
    key: "IPPurchases",
    cost: 40,
    description: "使所有来源的无限点数收益翻倍。（累加）",
    multiplier: purchases => (purchases === 0 ? 1 : 2 * purchases),
    formatEffect: x => `×${x.toFixed(0)}`,
    isUnlocked: () => PlayerProgress.infinityUnlocked(),
    lockText: "无限",
  },
  replicantiPurchases: {
    key: "replicantiPurchases",
    cost: 60,
    description: "使复制器收益提高 50%。（累加）",
    multiplier: purchases => (purchases === 0 ? 1 : 1 + 0.5 * purchases),
    formatEffect: x => `×${x.toFixed(1)}`,
    isUnlocked: () => Replicanti.areUnlocked || PlayerProgress.eternityUnlocked(),
    lockText: "复制器",
  },
  EPPurchases: {
    key: "EPPurchases",
    cost: 50,
    description: "使所有来源的永恒点数收益变为三倍。（累加）",
    multiplier: purchases => (purchases === 0 ? 1 : 3 * purchases),
    formatEffect: x => `×${x.toFixed(0)}`,
    isUnlocked: () => PlayerProgress.eternityUnlocked(),
    lockText: "永恒",
  },
  dilatedTimePurchases: {
    key: "dilatedTimePurchases",
    cost: 40,
    description: "使膨胀时间收益提高 50%。（累加）",
    multiplier: purchases => (purchases === 0 ? 1 : 1 + 0.5 * purchases),
    formatEffect: x => `×${x.toFixed(1)}`,
    isUnlocked: () => PlayerProgress.dilationUnlocked() || PlayerProgress.realityUnlocked(),
    lockText: "时间膨胀",
  },
  RMPurchases: {
    key: "RMPurchases",
    cost: 60,
    description: "使现实机器收益提高 100%。（累加）",
    multiplier: purchases => purchases + 1,
    formatEffect: x => `×${x.toFixed(0)}`,
    isUnlocked: () => PlayerProgress.realityUnlocked(),
    lockText: "现实",
  },
  smallTimeSkip: {
    key: "smallTimeSkip",
    cost: 10,
    description: "获得相当于 6 小时的离线产量。（自动购买器不会全速运行）",
    instantPurchase: true,
    onPurchase: () => {
      shop.purchaseTimeSkip();
    }
  },
  bigTimeSkip: {
    key: "bigTimeSkip",
    cost: 20,
    description: "获得相当于 24 小时的离线产量。（自动购买器不会全速运行）",
    instantPurchase: true,
    onPurchase: () => {
      shop.purchaseLongerTimeSkip();
    }
  },
  singleCosmeticSet: {
    key: "singleCosmeticSet",
    cost: 20,
    description: "解锁一套你选择的符文外观套装",
    instantPurchase: true,
    onPurchase: () => {
      // The actual unlocks are handled in the ShopPurchaseData object, so we just show notifications here
      GameUI.notify.info(
        `你已购买“${GlyphAppearanceHandler.chosenFromModal.name}”符文外观套装！`,
        10000);
      GlyphAppearanceHandler.chosenFromModal = null;
      GlyphAppearanceHandler.applyNotification();
    },
    isUnlocked: () => PlayerProgress.realityUnlocked(),
    lockText: "现实",
  },
  allCosmeticSets: {
    key: "allCosmeticSets",
    cost: () => {
      // Both of these are also on the payment backend, which would need to be changed as well
      const baseCost = 420;
      const totalSets = Object.keys(GameDatabase.reality.glyphCosmeticSets).length;

      // Using this instead of the actual set count maintains consistency with the backend price,
      // at the cost of the frontend UI being wrong for cheated saves
      const currentSetCount = GlyphAppearanceHandler.expectedSetCount;
      return Math.floor(baseCost * (totalSets - currentSetCount) / totalSets);
    },
    description: "一次性解锁其余所有符文外观套装",
    instantPurchase: true,
    onPurchase: () => {
      // The actual unlocks are handled in the ShopPurchaseData object, so we just show notifications here
      GameUI.notify.info(`你已解锁所有符文外观套装！`, 15000);
      GlyphAppearanceHandler.applyNotification();
    },
    isUnlocked: () => PlayerProgress.realityUnlocked(),
    lockText: "现实",
  },
};

if (STEAM) {
  delete shopPurchases.allCosmeticSets;
}
