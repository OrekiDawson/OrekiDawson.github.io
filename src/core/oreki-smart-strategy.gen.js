// ---------------------------------------------------------------------------
// 自动生成，请勿手改。
// 源文件：src/core/oreki-smart-strategy.json（唯一内容源，由 team-lead 维护）
// 生成器：node scripts/gen_spec_module.mjs
// 校验：  node scripts/gen_spec_module.mjs --check
// ---------------------------------------------------------------------------

const data = {
  "schemaVersion": 1,
  "specId": "oreki-smart-autobuyer",
  "updatedAt": "2026-10-30",
  "note": "智能自动购买器的唯一策略源。Web 与 Android 共读本文件，禁止任何一端另写一套策略。规则是数据，两端各自实现解释器；策略不要写进代码。",
  "conventions": {
    "conditionGrammar": "见 condition-grammar 段；两端解释器必须实现同一套算子，语义以本段为准",
    "evaluationPeriod": "不得逐帧全量求值。默认 1 秒一次；状态变化（解锁/进入挑战/阶段切换）立即重算",
    "manualOverride": "玩家手动操作后 60 秒内不得被自动策略覆盖同一目标，见 manualOverride",
    "failSafe": "任一条件求值抛错时，策略层必须整体停机并回落到 lastKnownGoodStrategy，禁止抛到主循环",
    "stagePrecedence": "阶段识别按 precedence 取最大者胜，不按数组顺序、不按文案。两个阶段同时命中且 precedence 相等 ⇒ 视为 spec 缺陷，解释器必须 fail closed（返回 degraded，不猜）。doomed 最高：毁灭态下其它阶段的判据全部无意义。",
    "blockerDetection": "blockers 只放「能由叶子机器判定」的阻塞状态，detect 必须是 conditionGrammar 表达式。没有对应叶子的建议放进 advisories —— 不允许用自然语言字符串冒充条件，那会让解释器无法求值又看不出是空的。"
  },
  "conditionGrammar": {
    "operators": [
      "all",
      "any",
      "not"
    ],
    "leaves": [
      "progress.infinityUnlocked",
      "progress.eternityUnlocked",
      "progress.realityUnlocked",
      "player.break",
      "player.infinities",
      "player.eternities",
      "player.realities",
      "challenge.normalRunning",
      "challenge.infinityRunning",
      "challenge.eternityRunning",
      "celestial.teresaUnlocked",
      "pelle.doomed",
      "pelle.canArmageddon",
      "autobuyer.bigCrunchMaxedInterval",
      "reality.shards",
      "pelle.keepAutobuyersBought",
      "player.dimensionBoosts",
      "game.endState"
    ],
    "comparators": [
      "gte",
      "lt",
      "eq",
      "gt",
      "lte"
    ],
    "shape": "叶子写作 { \"leaf\": \"player.infinities\", \"op\": \"gte\", \"value\": 16 }；组合写作 { \"all\": [...] } / { \"any\": [...] } / { \"not\": {...} }",
    "rule": "叶子名必须来自 leaves 列表。新增叶子必须先在本文件登记，两端各自实现取值，禁止一端私自加"
  },
  "stages": [
    {
      "id": "early",
      "title": "初始维度阶段",
      "detect": {
        "all": [
          {
            "not": {
              "leaf": "progress.infinityUnlocked"
            }
          },
          {
            "leaf": "player.dimensionBoosts",
            "op": "lt",
            "value": 1
          }
        ]
      },
      "goal": "unlock-first-infinity",
      "strategy": "growth",
      "precedence": 20,
      "note": "「初始维度」：还没买过任何维度提升，就靠 IM1 往上堆。"
    },
    {
      "id": "preInfinity",
      "title": "无限前准备阶段",
      "detect": {
        "all": [
          {
            "not": {
              "leaf": "progress.infinityUnlocked"
            }
          },
          {
            "leaf": "player.dimensionBoosts",
            "op": "gte",
            "value": 1
          }
        ]
      },
      "goal": "unlock-first-infinity",
      "strategy": "fastUnlock",
      "precedence": 30,
      "note": "「无限前」：已经有维度提升、正在攒第一个反物质星系，还没做出第一次无限。"
    },
    {
      "id": "infinity",
      "title": "无限阶段",
      "detect": {
        "all": [
          {
            "leaf": "progress.infinityUnlocked"
          },
          {
            "not": {
              "leaf": "progress.eternityUnlocked"
            }
          }
        ]
      },
      "goal": "unlock-eternity",
      "strategy": "infinityOptimize",
      "precedence": 40
    },
    {
      "id": "challenges",
      "title": "普通挑战与无限挑战",
      "detect": {
        "any": [
          {
            "leaf": "challenge.normalRunning"
          },
          {
            "leaf": "challenge.infinityRunning"
          }
        ]
      },
      "goal": "finish-current-challenge",
      "strategy": "challengeClear",
      "precedence": 80
    },
    {
      "id": "eternity",
      "title": "永恒阶段",
      "detect": {
        "all": [
          {
            "leaf": "progress.eternityUnlocked"
          },
          {
            "not": {
              "leaf": "progress.realityUnlocked"
            }
          },
          {
            "not": {
              "leaf": "challenge.eternityRunning"
            }
          }
        ]
      },
      "goal": "unlock-reality",
      "strategy": "eternityPush",
      "precedence": 50
    },
    {
      "id": "timeStudy",
      "title": "时间研究与永恒挑战",
      "detect": {
        "leaf": "challenge.eternityRunning"
      },
      "goal": "finish-current-challenge",
      "strategy": "challengeClear",
      "precedence": 90
    },
    {
      "id": "reality",
      "title": "现实阶段",
      "detect": {
        "all": [
          {
            "leaf": "progress.realityUnlocked"
          },
          {
            "not": {
              "leaf": "celestial.teresaUnlocked"
            }
          }
        ]
      },
      "goal": "unlock-celestials",
      "strategy": "realityPush",
      "precedence": 60
    },
    {
      "id": "celestials",
      "title": "Celestial 各阶段",
      "detect": {
        "all": [
          {
            "leaf": "celestial.teresaUnlocked"
          },
          {
            "not": {
              "leaf": "pelle.doomed"
            }
          }
        ]
      },
      "goal": "unlock-doomed",
      "strategy": "celestial",
      "precedence": 70
    },
    {
      "id": "doomed",
      "title": "Pelle 与 Doom 终局阶段",
      "detect": {
        "leaf": "pelle.doomed"
      },
      "goal": "reach-end-state",
      "strategy": "pelleEndgame",
      "precedence": 100
    }
  ],
  "goals": [
    {
      "id": "unlock-first-infinity",
      "title": "达成第一次无限",
      "done": {
        "leaf": "player.infinities",
        "op": "gte",
        "value": 1
      },
      "strategy": "growth"
    },
    {
      "id": "unlock-eternity",
      "title": "解锁永恒",
      "done": {
        "leaf": "progress.eternityUnlocked"
      },
      "strategy": "infinityOptimize"
    },
    {
      "id": "finish-current-challenge",
      "title": "完成当前挑战",
      "done": "挑战自身的完成判据（由执行层读取原版状态，不在本文件重复定义）",
      "strategy": "challengeClear"
    },
    {
      "id": "unlock-reality",
      "title": "解锁现实",
      "done": {
        "leaf": "progress.realityUnlocked"
      },
      "strategy": "eternityPush"
    },
    {
      "id": "unlock-celestials",
      "title": "解锁天神",
      "done": {
        "leaf": "celestial.teresaUnlocked"
      },
      "strategy": "realityPush"
    },
    {
      "id": "unlock-doomed",
      "title": "解锁毁灭现实",
      "done": {
        "leaf": "pelle.doomed"
      },
      "strategy": "celestial"
    },
    {
      "id": "reach-end-state",
      "title": "达成终局（反物质 1e1000）",
      "done": "GameEnd.endState >= 1（判据唯一来源 src/core/celestials/pelle/game-end.js:60，目标 E = 1000）",
      "strategy": "pelleEndgame"
    }
  ],
  "strategies": [
    {
      "id": "growth",
      "title": "初始成长策略",
      "when": {
        "not": {
          "leaf": "progress.infinityUnlocked"
        }
      },
      "priority": [
        "buyDimension",
        "buyTickspeed",
        "buyDimBoost",
        "buyGalaxy",
        "sacrifice"
      ],
      "guards": [
        "不花光反物质以致买不起下一次维度提升",
        "献祭前确认倍数高于当前持有"
      ]
    },
    {
      "id": "fastUnlock",
      "title": "快速解锁策略",
      "when": {
        "leaf": "progress.infinityUnlocked"
      },
      "priority": [
        "buyRestart",
        "buyDimension",
        "buyUpgrade",
        "crunch"
      ],
      "guards": [
        "解锁优先于收益",
        "不买与解锁无关的永久升级"
      ]
    },
    {
      "id": "challengeClear",
      "title": "挑战完成策略",
      "when": {
        "any": [
          {
            "leaf": "challenge.normalRunning"
          },
          {
            "leaf": "challenge.infinityRunning"
          },
          {
            "leaf": "challenge.eternityRunning"
          }
        ]
      },
      "priority": [
        "challengeSpecificOrder",
        "buyAllowedOnly",
        "crunchWhenDone"
      ],
      "guards": [
        "禁止沿用普通阶段购买顺序",
        "禁止购买挑战规则禁用的项目",
        "禁止消耗完成挑战所需的关键资源",
        "不得伪造完成状态，必须走原版结算"
      ]
    },
    {
      "id": "infinityOptimize",
      "title": "无限资源优化策略",
      "when": {
        "leaf": "progress.infinityUnlocked"
      },
      "priority": [
        "buyInfinityUpgrade",
        "buyInfinityDimension",
        "runChallengeIfRewardBlocks",
        "crunch"
      ],
      "guards": [
        "不为当前倍率最大化而牺牲通关速度",
        "解锁优先"
      ]
    },
    {
      "id": "eternityPush",
      "title": "永恒推进策略",
      "when": {
        "leaf": "progress.eternityUnlocked"
      },
      "priority": [
        "buyTimeTheorem",
        "buyTimeStudy",
        "buyEternityUpgrade",
        "buyDilationStudy",
        "eternity"
      ],
      "guards": [
        "买时间之理前确认不会卡住下一个必买研究",
        "永恒重置前确认里程碑不掉档"
      ]
    },
    {
      "id": "realityPush",
      "title": "现实推进策略",
      "when": {
        "leaf": "progress.realityUnlocked"
      },
      "priority": [
        "equipBestGlyph",
        "buyRealityUpgrade",
        "buyRealityMachine",
        "runReality"
      ],
      "guards": [
        "符文按等级与效果择优，不按固定槽位",
        "现实重置前确认不破坏下一个必买前置"
      ]
    },
    {
      "id": "celestial",
      "title": "Celestial 专项策略",
      "when": {
        "leaf": "celestial.teresaUnlocked"
      },
      "priority": [
        "celestialSpecificOrder",
        "spendUnlockResource",
        "advanceCelestialNav"
      ],
      "guards": [
        "每位天神单独判定，禁止一套顺序套六个",
        "进入天神前确认前置资源足够"
      ]
    },
    {
      "id": "pelleEndgame",
      "title": "Pelle 终局策略",
      "when": {
        "leaf": "pelle.doomed"
      },
      "priority": [
        "armageddonLoopForShards",
        "buyPelleKeepAutobuyers",
        "maxBigCrunchIntervalWithRealIP",
        "armageddonOnceMoreToSetBreak",
        "growAntimatterTo1e1000"
      ],
      "guards": [
        "禁止直接写 player.break，必须由原版 reality.js:750 在末日结算时置真",
        "禁止凭空发放 IP（末日态一律不发一次性补贴）",
        "禁止修改 endState 目标值",
        "顺序必须是「先买后末日」：先买 keepAutobuyers 与拉满间隔，再末日一次"
      ]
    }
  ],
  "blockers": [
    {
      "id": "intervalNotMaxed",
      "title": "大坍缩自动器间隔未拉满",
      "detect": {
        "not": {
          "leaf": "autobuyer.bigCrunchMaxedInterval"
        }
      },
      "advice": "打破无限要求间隔 <= 100。需要累计 32767 IP 逐级购买 15 次。",
      "source": "src/core/autobuyers/autobuyer.js:165-177"
    },
    {
      "id": "shardsTooLow",
      "title": "现实碎片不足 5e6，买不起 keepAutobuyers",
      "detect": {
        "all": [
          {
            "leaf": "pelle.doomed"
          },
          {
            "leaf": "reality.shards",
            "op": "lt",
            "value": 5000000
          }
        ]
      },
      "advice": "碎片只来自末日：remnants 仅在 armageddon() 增加。不要停掉末日循环。",
      "source": "src/core/secret-formula/celestials/pelle-upgrades.js:73",
      "note": "realityShards 在非毁灭态读出来恒为 0，那是「读不到」不是「没有」，所以判定必须先要求 pelle.doomed。"
    }
  ],
  "manualOverride": {
    "holdSeconds": 60,
    "scope": "同一目标（goal id）",
    "note": "玩家手动执行了某目标对应的动作后，该目标 60 秒内不受自动策略驱动；其他目标照常。目的是「我点了就别跟我抢」"
  },
  "advisories": [
    {
      "id": "challengeRewardMissing",
      "title": "下一个解锁要求某项挑战奖励",
      "advice": "先去把该挑战做掉，不要在主线里硬堆资源",
      "source": "各阶段 requirement()",
      "note": "这条无法用叶子判定：原版各阶段 requirement() 的判据形态各异，没有统一的「下一个解锁需要哪个挑战奖励」查询入口。因此它只是提示文案，不参与阻塞判定。"
    }
  ]
};

export default data;
