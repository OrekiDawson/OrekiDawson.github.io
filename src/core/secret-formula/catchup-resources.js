import { DC } from "../constants.js";

export const catchupResources = [
  {
    name: "反物质维度",
    id: 0,
    requiredStage: PROGRESS_STAGE.PRE_INFINITY,
    description: `每个反物质维度持续生产前一级的维度，最低级的反物质维度生产反物质。`
  },
  {
    name: "计数频率",
    id: 1,
    openH2pEntry: "计数频率",
    requiredStage: PROGRESS_STAGE.PRE_INFINITY,
    description: `计数频率升级使反物质维度生产其他反物质维度或反物质时，如同时间加速流逝。`
  },
  {
    name: "自动购买器",
    id: 2,
    requiredStage: PROGRESS_STAGE.PRE_INFINITY,
    description: `自动购买器是游戏内置机制，在可购买时自动为反物质维度购买升级。`
  },
  {
    name: "维度提升",
    id: 3,
    requiredStage: PROGRESS_STAGE.PRE_INFINITY,
    description: `维度提升通过重置所有反物质维度和计数频率获得，当最高可用反物质维度达到特定数量时触发。维度提升将为你的反物质维度提供倍数加成。`
  },
  {
    name: "反物质星系",
    id: 4,
    requiredStage: PROGRESS_STAGE.PRE_INFINITY,
    description: `反物质星系通过重置反物质维度和维度提升获得。它们会以累乘的方式提升计数频率升级的效果。`
  },
  {
    name: "无限",
    id: 5,
    requiredStage: PROGRESS_STAGE.EARLY_INFINITY,
    description: () => `无限是第一个主要的重置层级。达到 ${format(Number.MAX_VALUE, 2)} 反物质后，
      你可以重置此前的一切，换取新内容与新资源。`
  },
  {
    name: "无限点数",
    id: 6,
    openH2pEntry: "无限",
    requiredStage: PROGRESS_STAGE.EARLY_INFINITY,
    description: `无限点数是完成首次无限之后的主要资源。它们可用于购买在无限重置后依然保留的功能。`
  },
  {
    name: "普通挑战",
    id: 7,
    openH2pEntry: "普通挑战",
    requiredStage: PROGRESS_STAGE.EARLY_INFINITY,
    description: () => `挑战要求你在更苛刻的条件下达到 ${format(Number.MAX_VALUE, 2)} 反物质。
      完成挑战可以升级你的自动购买器。`
  },
  {
    name: "打破无限",
    id: 8,
    requiredStage: PROGRESS_STAGE.BREAK_INFINITY,
    description: () => `将大坍缩自动购买器升级到满级后，你就能超过 ${format(Number.MAX_VALUE, 2)} 反物质，
      反物质越多，获得的无限点数越多。`
  },
  {
    name: "无限维度",
    id: 9,
    requiredStage: PROGRESS_STAGE.BREAK_INFINITY,
    description: `无限维度像反物质维度一样以级联方式生产。最低阶的无限维度生产无限之力，
      为所有反物质维度提供巨额倍数加成。`
  },
  {
    name: "无限挑战",
    id: 10,
    requiredStage: PROGRESS_STAGE.BREAK_INFINITY,
    description: () => `无限挑战是目标高于 ${format(Number.MAX_VALUE, 2)} 反物质的新挑战。
      完成它们可获得升级与产量加成。`
  },
  {
    name: "复制器",
    id: 11,
    requiredStage: PROGRESS_STAGE.REPLICANTI,
    description: () => `复制器是一种会随时间自我生产的资源，为所有无限维度提供倍数加成。
      复制器达到 ${format(Number.MAX_VALUE, 2)} 后，可重置为 ${formatInt(1)} 换取一个
      不增加反物质星系成本的额外星系。它们也会在每次无限后重置。`
  },
  {
    name: "永恒",
    id: 12,
    requiredStage: PROGRESS_STAGE.EARLY_ETERNITY,
    description: () => `永恒是第二个主要的重置层级。达到 ${format(Number.MAX_VALUE, 2)} 无限点数后，
      你可以重置此前的一切，换取新内容与新资源。`
  },
  {
    name: "永恒点数",
    id: 13,
    openH2pEntry: "永恒",
    requiredStage: PROGRESS_STAGE.EARLY_ETERNITY,
    description: `永恒点数是完成首次永恒之后的主要资源，其数量取决于完成永恒时的无限点数。`
  },
  {
    name: "时间研究",
    id: 14,
    requiredStage: PROGRESS_STAGE.EARLY_ETERNITY,
    description: `时间研究是一组类似技能树的升级，每次永恒之后都可以自由重新分配，且不损失任何资源。
      树的某些区域存在限制，禁止你同时选择特定的研究。`
  },
  {
    name: "永恒里程碑",
    id: 15,
    requiredStage: PROGRESS_STAGE.EARLY_ETERNITY,
    description: `永恒里程碑是内置的自动化与便利功能，只需完成更多永恒即可解锁，无需消耗任何资源。`
  },
  {
    name: "时间维度",
    id: 16,
    requiredStage: PROGRESS_STAGE.EARLY_ETERNITY,
    description: `时间维度同样以级联方式相互生产，最低阶的时间维度生产时间碎片。
      时间碎片会为你提供额外的计数频率升级，且不会提高用反物质购买的计数频率升级的成本。`
  },
  {
    name: "永恒挑战",
    id: 17,
    requiredStage: PROGRESS_STAGE.ETERNITY_CHALLENGES,
    description: `永恒挑战是修改过的永恒，需要在其中达到无限点数目标才能完成。
      每个挑战最多可完成五次，每次重复都会更难，但奖励也更强。`
  },
  {
    name: "时间膨胀",
    id: 18,
    requiredStage: PROGRESS_STAGE.EARLY_DILATION,
    description: () => `时间膨胀是修改过的永恒，其中计数频率与所有维度倍数都会被大幅削弱。
      完成膨胀永恒可获得超光速粒子。`
  },
  {
    name: "超光速粒子",
    id: 19,
    openH2pEntry: "时间膨胀",
    requiredStage: PROGRESS_STAGE.EARLY_DILATION,
    description: () => `超光速粒子是一种无法通过挂机积累的资源，你需要在膨胀永恒中获得更多反物质才能增加其数量。
      超光速粒子会生产膨胀时间。`
  },
  {
    name: "现实",
    id: 20,
    requiredStage: PROGRESS_STAGE.EARLY_REALITY,
    description: () => `现实是第三个也是最后一个主要的重置层级。达到 ${format(DC.E4000)} 永恒点数后，
      你可以重置此前的一切，换取新内容并解锁新资源。`
  },
  {
    name: "现实机器",
    id: 21,
    openH2pEntry: "现实",
    requiredStage: PROGRESS_STAGE.EARLY_REALITY,
    description: `现实机器是完成首次现实之后的主要资源，其数量取决于完成现实时的永恒点数。`
  },
  {
    name: "复兴树",
    id: 22,
    requiredStage: PROGRESS_STAGE.EARLY_REALITY,
    description: `复兴树是类似永恒里程碑的可解锁功能，主要侧重于便利与自动化。
      它们使用复兴点购买，复兴点在每次现实后获得。`
  },
  {
    name: "符文",
    id: 23,
    requiredStage: PROGRESS_STAGE.EARLY_REALITY,
    description: `符文是只能装备的升级，且只能在两次现实之间更换。每次现实你都可以从多个随机新符文中
      选择一个；可选项的平均品质取决于你在该次现实中部分资源达到的高度。`
  },
  {
    name: "自动机",
    id: 24,
    openH2pEntry: "自动机总览",
    requiredStage: PROGRESS_STAGE.EARLY_REALITY,
    description: `自动机是一项内置功能，使用脚本语言；配合足够的升级与复兴点，最终可以完全自动地完成现实。`
  },
  {
    name: "黑洞",
    id: 25,
    requiredStage: PROGRESS_STAGE.EARLY_REALITY,
    description: `黑洞会以周期循环的方式加速整个游戏的运行。它影响截至此处的一切内容，
      效果相当于把游戏多开了相同长度的时间。`
  },
  {
    name: "特蕾莎",
    id: 26,
    requiredStage: PROGRESS_STAGE.TERESA,
    description: `特蕾莎是第一位天神，她的现实更难，并会根据完成度大幅提升符文献祭的效果。
      她解锁的升级侧重于测试与更轻松地自动化现实。`
  },
  {
    name: "鹿颈长",
    id: 27,
    requiredStage: PROGRESS_STAGE.EFFARIG,
    description: `鹿颈长是第二位天神，他的现实会限制你的符文并施加递增的削弱，但每到达一个新的重置层级都会给予奖励。
      他解锁的升级侧重于自动选择与筛选大量获得的符文，需使用名为遗迹碎片的新资源购买。`
  },
  {
    name: "无名氏",
    id: 28,
    openH2pEntry: "无名氏",
    requiredStage: PROGRESS_STAGE.ENSLAVED,
    description: `无名氏是第三位天神，其现实极其严苛，带有一长串削弱，但能为那些找到办法通关的人解锁超立方体。
      他们还会改造你的黑洞，使其能够存储时间。`
  },
  {
    name: "存储时间",
    id: 29,
    openH2pEntry: "无名氏",
    requiredStage: PROGRESS_STAGE.ENSLAVED,
    description: `你的黑洞能以两种方式存储时间。充能可以让你保存加速过的时间，之后再以一次跳进的形式释放。
      存储现实时间则允许你用真实时间来模拟现实（获得该次现实的资源，但按倍数放大），
      或用来代替离线进度。`
  },
  {
    name: "超立方体",
    id: 30,
    requiredStage: PROGRESS_STAGE.ENSLAVED,
    description: `无限维度无法无限购买，除第八阶外都存在购买次数的硬上限。每个超立方体都会永久大幅提高该上限。`
  },
  {
    name: "薇",
    id: 31,
    requiredStage: PROGRESS_STAGE.V,
    description: `薇是第四位天神，她的现实经过修改，类似特蕾莎的现实，但只有在其中把资源推进到特定里程碑才能获得奖励。
      她会给予名为空间定理的新资源，让你可以购买额外的时间研究且不受路线限制。`
  },
  {
    name: "太阳神",
    id: 32,
    requiredStage: PROGRESS_STAGE.RA,
    description: `太阳神是第五位天神，其现实会依据你在其中的资源总量生产名为记忆块的新资源。
      他们的重心是把前四位天神的旧升级与主题取来加以强化，并补上自动化与便利性上的一些最后空缺。`
  },
  {
    name: "记忆",
    id: 33,
    openH2pEntry: "太阳神",
    requiredStage: PROGRESS_STAGE.RA,
    description: `太阳神掌控着前四位天神，会依据记忆块数量随时间生产记忆。
      这些记忆用于提升前几位天神的等级，达到特定等级即可获得升级。`
  },
  {
    name: "充能无限升级",
    id: 34,
    openH2pEntry: "太阳神",
    requiredStage: PROGRESS_STAGE.RA,
    description: `特蕾莎的记忆让你可以充能无限升级，效果类似但强度显著提升。充能哪些升级只能在两次现实之间更改。`
  },
  {
    name: "符文炼金",
    id: 35,
    requiredStage: PROGRESS_STAGE.RA,
    description: `鹿颈长的记忆解锁符文炼金，它使用符文献祭的变体提供许多小幅加成。
      以此方式献祭符文获得的资源必须在反应中相互结合，才能完全提升其效果。`
  },
  {
    name: "强化黑洞",
    id: 36,
    openH2pEntry: "太阳神",
    requiredStage: PROGRESS_STAGE.RA,
    description: `无名氏的记忆会强化充能，使存储的游戏时间超过实际流逝的游戏时间。释放现在也可以重复并自动进行。`
  },
  {
    name: "更难的薇",
    id: 37,
    openH2pEntry: "太阳神",
    requiredStage: PROGRESS_STAGE.RA,
    description: `薇的记忆会解锁薇原本现实的修改版，目标更难，并带来一组名为三位一体研究的新时间研究。`
  },
  {
    name: "虚幻机器",
    id: 38,
    requiredStage: PROGRESS_STAGE.IMAGINARY_MACHINES,
    description: () => `虚幻机器是一种新资源，在达到 ${format(DC.E1000)} 现实机器时解锁。
      它们会被动生产，上限取决于你在历史最远的一次现实中所能获得的现实机器数量。`
  },
  {
    name: "莱特拉",
    id: 39,
    requiredStage: PROGRESS_STAGE.LAITELA,
    description: `莱特拉是第六位天神，其现实的完成条件经过修改，并会依据你达到它的速度给出递增的奖励。
      其解锁的新功能大多与名为暗物质的资源有关。`
  },
  {
    name: "连续统",
    id: 40,
    requiredStage: PROGRESS_STAGE.LAITELA,
    description: `连续统是一种修改过的生产方式，让你的反物质维度可以像购买了小数额升级那样生产，
      而无需真正购买它们。`
  },
  {
    name: "暗物质维度",
    id: 41,
    openH2pEntry: "莱特拉",
    requiredStage: PROGRESS_STAGE.LAITELA,
    description: `暗物质维度是级联生产，但基于刻而非连续生产。最低阶生产暗物质，所有阶都会生产暗能量。`
  },
  {
    name: "维度重置机制",
    id: 42,
    openH2pEntry: "莱特拉",
    requiredStage: PROGRESS_STAGE.LAITELA,
    description: `暗物质维度可以通过两种方式重置。湮灭会重置你的所有维度，换取对所有暗物质维度的永久倍数加成。
      飞升会提升产量，但会重置单个维度的时间间隔。`
  },
  {
    name: "奇点",
    id: 43,
    requiredStage: PROGRESS_STAGE.LAITELA,
    description: `暗能量可用于生产奇点，奇点会依据其总量提供加成。
      生产奇点时，超过凝聚阈值的多余暗能量会被浪费。`
  },
  {
    name: "佩勒",
    id: 44,
    requiredStage: PROGRESS_STAGE.PELLE,
    description: `佩勒是第七位也是最后一位天神，会永久地使你的游戏陷入注定毁灭，把你抛入一个无法逃离的、
      极其艰难的现实。`
  },
  {
    name: "末日",
    id: 45,
    openH2pEntry: "佩勒",
    requiredStage: PROGRESS_STAGE.PELLE,
    description: `末日是佩勒专属的重置，你可以随时进行。它会把你在这个注定毁灭的现实中的进度重置到起点，
      但会给予残骸，残骸会生产现实碎片。`
  },
  {
    name: "佩勒冲击与裂痕",
    id: 46,
    openH2pEntry: "佩勒冲击",
    requiredStage: PROGRESS_STAGE.PELLE,
    description: `在佩勒中达到特定进度里程碑时，可能会发生一次冲击，为注定毁灭的现实永久追加一项削弱。
      每次冲击都会伴随一道裂痕，裂痕是一项机制，让你可以排干另一种资源来换取加成。
      这些都是永久的，并在末日之后依然保持解锁。`
  },
];
