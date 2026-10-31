// ---------------------------------------------------------------------------
// 自动生成，请勿手改。
// 源文件：src/core/oreki-route-model.json（唯一内容源，由 team-lead 维护）
// 生成器：node scripts/gen_spec_module.mjs
// 校验：  node scripts/gen_spec_module.mjs --check
// ---------------------------------------------------------------------------

const data = {
  "schemaVersion": 1,
  "specId": "oreki-route-optimizer",
  "updatedAt": "2026-10-30",
  "note": "多路线择优的唯一模型源。Web 与 Android 共读本文件，禁止任何一端另写一套评分规则。本文件只描述「怎么评、怎么选、什么时候允许换」；「怎么买」在 oreki-smart-strategy.json，两层严格分离。",
  "layering": {
    "routeLayer": "本文件：识别可行路线 → 硬性过滤 → 评分 → 选出当前最优路线 → 拆成步骤序列",
    "executionLayer": "oreki-smart-strategy.json：把当前步骤变成真实购买/挑战/重置调用",
    "monitorLayer": "观察实际增长与预测偏差，回写本文件的 calibration",
    "rule": "三层不得互相争夺购买权限。只有执行层能调用购买 API；路由层只产出决策对象，不直接买东西。"
  },
  "evaluation": {
    "objective": "最小化「预计剩余现实墙钟秒数」，不是最大化当前倍率或资源量",
    "dimensions": [
      {
        "id": "remainingWallClock",
        "title": "预计剩余通关时间",
        "weight": 0.45,
        "unit": "秒",
        "direction": "min"
      },
      {
        "id": "unlockSpeed",
        "title": "解锁效率",
        "weight": 0.15,
        "unit": "解锁个数/小时",
        "direction": "max"
      },
      {
        "id": "longTermGain",
        "title": "长期收益",
        "weight": 0.12,
        "unit": "后续阶段倍率提升",
        "direction": "max"
      },
      {
        "id": "resourceCost",
        "title": "资源成本",
        "weight": 0.08,
        "unit": "关键资源占比",
        "direction": "min"
      },
      {
        "id": "challengeReward",
        "title": "挑战收益",
        "weight": 0.07,
        "unit": "永久增益数",
        "direction": "max"
      },
      {
        "id": "resetCost",
        "title": "重置成本",
        "weight": 0.06,
        "unit": "额外重置次数",
        "direction": "min"
      },
      {
        "id": "risk",
        "title": "失败风险",
        "weight": 0.05,
        "unit": "软锁/卡关概率",
        "direction": "min"
      },
      {
        "id": "complexity",
        "title": "执行复杂度",
        "weight": 0.02,
        "unit": "手动步骤数",
        "direction": "min"
      }
    ],
    "note": "权重是第一版先验，必须靠 calibration 回写修正。禁止把权重当成客观真理写进注释。",
    "tieBreak": "预计耗时差距 < 15% 时，优先选执行复杂度更低、风险更低的那条（稳定优先于极限）"
  },
  "calibration": {
    "note": "预计耗时的唯一合法来源是实测分段耗时，不是公式推导。下列基线来自 R40 真新档两条 run，见 web/_tools/_r40/R40-分段耗时预算.md",
    "baseline": [
      {
        "segment": "开局 → EC 全满",
        "seconds": 28.5,
        "share": 0.04
      },
      {
        "segment": "等待 V 解锁",
        "seconds": 456,
        "share": 0.64
      },
      {
        "segment": "V → IU15 + 莱特拉",
        "seconds": 12.1,
        "share": 0.017
      },
      {
        "segment": "IU25 + 莱特拉 tier8",
        "seconds": 217.5,
        "share": 0.3
      },
      {
        "segment": "进入佩勒",
        "seconds": 714.1,
        "share": 1
      }
    ],
    "hardFacts": [
      "到佩勒入口只需约 714 秒（11.9 分钟），时间不是瓶颈",
      "「等待 V 解锁」占 64%，是唯一值得优化的大段——任何路线切换先问它能不能缩短这 456 秒",
      "180 分钟预算里，佩勒之后的终局段有约 160 分钟余量"
    ],
    "confidence": {
      "measured": "有实测数据支撑的段（上述 5 段）",
      "extrapolated": "由相邻段线性外推，标注 confidence=0.5",
      "unknown": "无任何数据，confidence=0，且必须在界面显示「无法估算」而不是编一个数"
    },
    "errorTracking": "每次真实通关后记录「预测 vs 实际」的绝对误差与百分比，回写本段，用于下一轮修正权重"
  },
  "filter": {
    "note": "第一层硬性过滤。任一条命中即淘汰该路线，不进入评分。",
    "rules": [
      {
        "id": "prereqMissing",
        "title": "前置未满足",
        "how": "读原版 requirement()/isUnlocked，不猜"
      },
      {
        "id": "challengeConflict",
        "title": "违反当前挑战规则",
        "how": "挑战进行中时禁用会破坏条件的动作"
      },
      {
        "id": "keyResourceBroke",
        "title": "破坏关键资源条件",
        "how": "会花光下一解锁所需资源"
      },
      {
        "id": "pointlessReset",
        "title": "无意义重置",
        "how": "重置后进度不增长（同阶段同资源量重复重置）"
      },
      {
        "id": "softLockRisk",
        "title": "可能软锁",
        "how": "已知死锁链，如末日前未买 keepAutobuyers 就停掉末日循环"
      },
      {
        "id": "missingFeature",
        "title": "依赖不存在的功能",
        "how": "路线引用了未实现的动作 id"
      }
    ]
  },
  "routes": [
    {
      "id": "eternity-ec-first",
      "stageScope": [
        "eternityTimeStudy",
        "eternityChallenges",
        "dilation"
      ],
      "title": "先刷永恒挑战再推时间之理",
      "steps": [
        "刷 EC 拿永久增益",
        "买时间之理",
        "推时间研究树"
      ],
      "why": "EC 奖励是永久增益，越早拿越早复利",
      "risk": "若 EC 入口资源不够会空转"
    },
    {
      "id": "eternity-tt-first",
      "stageScope": [
        "eternityTimeStudy",
        "eternityChallenges",
        "dilation"
      ],
      "title": "先堆时间之理再回头刷挑战",
      "steps": [
        "堆 EP 换时间之理",
        "买关键研究",
        "再回头刷 EC"
      ],
      "why": "研究到手后 EC 更快",
      "risk": "可能把 EC 拖到后面撞上现实重置清空"
    },
    {
      "id": "reality-glyph-first",
      "stageScope": [
        "reality",
        "glyphs",
        "realityTree"
      ],
      "title": "先刷符文再推现实升级",
      "steps": [
        "刷高等级符文",
        "装备择优",
        "买现实升级"
      ],
      "why": "符文等级决定后续全局倍率上限",
      "risk": "低等级阶段刷符文的边际收益很低"
    },
    {
      "id": "reality-machine-first",
      "stageScope": [
        "reality",
        "glyphs",
        "realityTree"
      ],
      "title": "先攒现实机器再刷符文",
      "steps": [
        "重复现实攒机器",
        "买现实升级",
        "再刷符文"
      ],
      "why": "机器解锁的升级能放大符文收益",
      "risk": "重复现实次数多，重置成本高"
    },
    {
      "id": "celestial-nav-order",
      "stageScope": [
        "celestialsTeresa",
        "celestialsEffarig",
        "celestialsEnslaved",
        "celestialsV",
        "celestialsRa",
        "laitela"
      ],
      "title": "按导航顺序推进天神",
      "steps": [
        "特蕾莎",
        "鹿颈长",
        "无名氏",
        "薇",
        "太阳神",
        "莱特拉"
      ],
      "why": "每位天神的解锁以前一位为前提",
      "risk": "薇的三项要求都读 records.thisReality，重置会清零"
    },
    {
      "id": "celestial-parallel-v",
      "stageScope": [
        "celestialsTeresa",
        "celestialsEffarig",
        "celestialsEnslaved",
        "celestialsV",
        "celestialsRa",
        "laitela"
      ],
      "title": "在推进其他天神时并行做薇的三项",
      "steps": [
        "主流推进天神",
        "同时满足薇的三项记录"
      ],
      "why": "薇的三项需要长时间同一次现实内累积，与其他天神并行能省墙钟",
      "risk": "任何一次现实重置都会清零薇的进度"
    },
    {
      "id": "pelle-shard-loop",
      "stageScope": [
        "doomed"
      ],
      "title": "末日循环攒碎片 → 买 keepAutobuyers → 拉满间隔 → 再末日开 break",
      "steps": [
        "armageddon 循环",
        "碎片到 5e6",
        "买 keepAutobuyers",
        "真实 IP 拉满间隔",
        "再末日一次"
      ],
      "why": "这是原版 reality.js:750 写死的通路，也是唯一不伪造状态的通路",
      "risk": "顺序错了（先末日再买）判定发生在买之前，break 不会开，白等一轮"
    },
    {
      "id": "pelle-grow-only",
      "stageScope": [
        "doomed"
      ],
      "title": "不末日、只囤产量",
      "steps": [
        "持续增长反物质"
      ],
      "why": "看起来不用重置，心理上更省",
      "risk": "已实测证伪：remnants 只在 armageddon 增加，不末日则碎片恒 0，keepAutobuyers 永远买不起，break 永不开，endState 封顶 0.75。这条应被 filter.softLockRisk 直接淘汰"
    }
  ],
  "stability": {
    "note": "防止频繁切换。这三条比评分本身更重要——一个老是改主意的系统比一个笨系统更难用。",
    "minImprovementRatio": 0.15,
    "noteOnThreshold": "新路线预计耗时必须比当前路线低 15% 以上才允许切换；差距在 15% 以内一律留在原路线",
    "cooldownSeconds": 300,
    "noteOnCooldown": "两次切换之间至少间隔 300 秒现实时间，避免来回横跳",
    "switchOnlyWhen": [
      "当前路线失效（前置丢了 / 挑战规则变了 / 关键资源不足）",
      "新路线实测增长显著优于预测（偏差超过 30%）",
      "出现全新解锁使原路线不再最优"
    ],
    "neverSwitchFor": [
      "短暂的资源波动",
      "单次购买失败",
      "界面切页或存档加载",
      "预测模型的微小抖动"
    ],
    "preserveProgress": "切换路线不得丢弃已完成步骤；只切换「接下来做什么」，不回滚已完成的事"
  },
  "replan": {
    "triggers": [
      "新解锁（新页签/新挑战/新天神）",
      "关键升级价格变化跨越数量级",
      "实际增长速度低于预测 30% 以上",
      "出现新的阻塞条件",
      "进入或退出挑战"
    ],
    "period": "常规 60 秒一次；触发条件命中时立即重算",
    "notFrameByFrame": "禁止逐帧全量重算"
  },
  "interface": {
    "note": "双端必须实现同一组查询方法，供界面层调用。界面不参与决策。",
    "methods": [
      {
        "name": "getCurrentRouteId",
        "returns": "string"
      },
      {
        "name": "getCurrentRouteTitle",
        "returns": "string"
      },
      {
        "name": "getAlternativeRoutes",
        "returns": "string[]（含被淘汰原因）"
      },
      {
        "name": "getSelectionReason",
        "returns": "string"
      },
      {
        "name": "getEstimatedRemainingSeconds",
        "returns": "number|null（null = 无法估算，界面显示「无法估算」）"
      },
      {
        "name": "getCurrentStep",
        "returns": "string"
      },
      {
        "name": "getLastSwitchReason",
        "returns": "string|null"
      },
      {
        "name": "getBlockers",
        "returns": "string[]"
      }
    ]
  },
  "ui": {
    "items": [
      "当前游戏阶段",
      "当前主要目标",
      "当前选定路线",
      "其他可行路线（含淘汰原因）",
      "选择该路线的原因",
      "预计剩余耗时（含置信度）",
      "当前执行步骤",
      "路线切换原因",
      "当前阻塞条件"
    ],
    "language": "简体中文，与智能自动购买器面板同一套术语",
    "defaultMode": "自动择优；保留手动指定路线"
  }
};

export default data;
