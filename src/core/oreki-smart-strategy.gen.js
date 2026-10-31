// ---------------------------------------------------------------------------
// 自动生成，请勿手改。
// 源文件：src/core/oreki-smart-strategy.json（唯一内容源，由 team-lead 维护）
// 生成器：node scripts/gen_spec_module.mjs
// 校验：  node scripts/gen_spec_module.mjs --check
// ---------------------------------------------------------------------------

const data = {
  "schemaVersion": 1,
  "specId": "oreki-smart-autobuyer",
  "updatedAt": "2026-10-31",
  "revision": "R44-A：阶段识别从 9 段扩到 20 段，覆盖 13 个进度节点；goals 从 7 条扩到 18 条且全部可求值；leaves 从 18 个扩到 34 个。所有阶段 detect 互相判定不相交（不再是「同时命中靠 precedence 决胜」），precedence 只作为防御性的最终裁决。",
  "note": "智能自动购买器的唯一策略源。Web 与 Android 共读本文件，禁止任何一端另写一套策略。规则是数据，两端各自实现解释器；策略不要写进代码。",
  "conventions": {
    "conditionGrammar": "见 condition-grammar 段；两端解释器必须实现同一套算子，语义以本段为准",
    "evaluationPeriod": "不得逐帧全量求值。默认 1 秒一次；状态变化（解锁/进入挑战/阶段切换）立即重算",
    "manualOverride": "玩家手动操作后 60 秒内不得被自动策略覆盖同一目标，见 manualOverride",
    "failSafe": "任一条件求值抛错时，策略层必须整体停机并回落到 lastKnownGoodStrategy，禁止抛到主循环",
    "stagePrecedence": "阶段识别的第一原则是「各阶段 detect 逻辑不相交」——本文件的 20 个阶段两两不可能同时为真（每个阶段的 detect 里都显式写了对相邻阶段的取反，见各段 note 的「互斥依据」）。precedence 只作为防御性裁决：若日后有人改坏了互斥性导致两段同时命中，取 precedence 最大者；若两段 precedence 还相等 ⇒ 视为 spec 缺陷，解释器必须 fail closed（返回 degraded，不猜）。doomed 最高：毁灭态下其它阶段的判据全部无意义。",
    "stageGranularity": "阶段按「当前存档的真实状态」切分，不按时间、不按固定脚本顺序：已解锁功能（页签能否打开）、所处重置层、已完成挑战、升级与研究状态、各天神解锁位、目标是否满足。玩家跳序或手动推进时，靠「谁解锁得最远谁说了算」自然重新识别，不需要写死顺序。",
    "blockerDetection": "blockers 只放「能由叶子机器判定」的阻塞状态，detect 必须是 conditionGrammar 表达式。没有对应叶子的建议放进 advisories —— 不允许用自然语言字符串冒充条件，那会让解释器无法求值又看不出是空的。",
    "goalEvaluability": "goals[].done 必须是可求值的 conditionGrammar 表达式（叶子/op/value 或 all/any/not 组合）。自然语言说明只允许放在 goals[].note 里，不允许放在 done 里 —— 放进去就等于「永远无法判定完成」。"
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
      "progress.dilationUnlocked",
      "player.break",
      "player.infinities",
      "player.eternities",
      "player.realities",
      "player.dimensionBoosts",
      "challenge.normalRunning",
      "challenge.infinityRunning",
      "challenge.eternityRunning",
      "challenge.normalCompleted",
      "challenge.infinityCompleted",
      "challenge.eternityCompletions",
      "timeStudy.studiesBought",
      "reality.upgradesBought",
      "reality.perksBought",
      "reality.perkPoints",
      "reality.glyphsEquipped",
      "automator.unlocked",
      "celestial.teresaUnlocked",
      "celestial.effarigUnlocked",
      "celestial.enslavedUnlocked",
      "celestial.vUnlocked",
      "celestial.raUnlocked",
      "celestial.laitelaUnlocked",
      "celestial.pelleUnlocked",
      "pelle.doomed",
      "pelle.canArmageddon",
      "autobuyer.bigCrunchMaxedInterval",
      "reality.shards",
      "pelle.keepAutobuyersBought",
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
      "coversNodes": [
        1
      ],
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
      "note": "【节点 1 开局与普通维度】还没买过任何维度提升，靠 IM1 往上堆。互斥依据：与 preInfinity 按 dimensionBoosts 在 1 处分开，两者都要求 !infinityUnlocked。"
    },
    {
      "id": "preInfinity",
      "coversNodes": [
        2
      ],
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
      "note": "【节点 2 第一次无限】已有维度提升、正在攒第一个无限（反物质 1.797e308）。互斥依据：见 early。"
    },
    {
      "id": "breakInfinity",
      "coversNodes": [
        3
      ],
      "title": "打破无限前阶段",
      "detect": {
        "all": [
          {
            "leaf": "progress.infinityUnlocked"
          },
          {
            "not": {
              "leaf": "player.break"
            }
          },
          {
            "not": {
              "leaf": "progress.eternityUnlocked"
            }
          },
          {
            "not": {
              "any": [
                {
                  "leaf": "challenge.normalRunning"
                },
                {
                  "leaf": "challenge.infinityRunning"
                }
              ]
            }
          }
        ]
      },
      "goal": "break-infinity",
      "strategy": "breakInfinityPush",
      "precedence": 55,
      "note": "【节点 3 打破无限】无限已解锁但 player.break 仍为 false。真实判据只有 player.break：它由原版 breakInfinity() 置真，前置是「大坍缩自动器间隔已拉到 ≤100」（src/game.js:77 第一行 `if (!Autobuyer.bigCrunch.hasMaxedInterval) return;`）。互斥依据：与 infinityDimensions 按 player.break 一真一假分开；与 challenges 按「有无挑战在跑」分开。"
    },
    {
      "id": "challenges",
      "coversNodes": [
        4
      ],
      "title": "普通挑战与无限挑战",
      "detect": {
        "all": [
          {
            "leaf": "progress.infinityUnlocked"
          },
          {
            "not": {
              "leaf": "progress.eternityUnlocked"
            }
          },
          {
            "any": [
              {
                "leaf": "challenge.normalRunning"
              },
              {
                "leaf": "challenge.infinityRunning"
              }
            ]
          }
        ]
      },
      "goal": "finish-current-challenge",
      "strategy": "challengeClear",
      "precedence": 66,
      "note": "【节点 4 无限维度与无限挑战】NC/IC 挑战正在跑。战斗期内策略必须是 challengeClear（禁止沿用普通阶段顺序）。互斥依据：infinityDimensions 显式取反了「有挑战在跑」；breakInfinity 同理。范围限定在永恒解锁之前 —— 永恒之后跑 NC/IC 极罕见，那时仍会命中无限期的兜底（infinityDimensions 要求 !eternityUnlocked，故不命中），实际由 eternity/timeStudy/dilation 承接，购买顺序交给挑战模块，语义不冲突。"
    },
    {
      "id": "infinityDimensions",
      "coversNodes": [
        4
      ],
      "title": "无限维度与永恒前置",
      "detect": {
        "all": [
          {
            "leaf": "progress.infinityUnlocked"
          },
          {
            "leaf": "player.break"
          },
          {
            "not": {
              "leaf": "progress.eternityUnlocked"
            }
          },
          {
            "not": {
              "any": [
                {
                  "leaf": "challenge.normalRunning"
                },
                {
                  "leaf": "challenge.infinityRunning"
                }
              ]
            }
          }
        ]
      },
      "goal": "unlock-eternity",
      "strategy": "infinityOptimize",
      "precedence": 60,
      "note": "【节点 4 的另一半：无限维度本身】已打破无限、没有挑战在跑，正在刷 ID/无限升级直到永恒解锁。互斥依据：见 breakInfinity / challenges。"
    },
    {
      "id": "eternity",
      "coversNodes": [
        5
      ],
      "title": "第一次永恒之后（研究树未起）",
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
          },
          {
            "not": {
              "leaf": "progress.dilationUnlocked"
            }
          },
          {
            "leaf": "timeStudy.studiesBought",
            "op": "lt",
            "value": 1
          }
        ]
      },
      "goal": "build-time-study",
      "strategy": "eternityPush",
      "precedence": 70,
      "note": "【节点 5 第一次永恒】刚拿到第一个永恒，时间研究一棵都没买（timeStudy.studiesBought = 0）。互斥依据：与 timeStudy 按 studiesBought 在 1 处分开；两者都要求「非 EC、未解锁膨胀、未解锁现实」。"
    },
    {
      "id": "timeStudy",
      "coversNodes": [
        6
      ],
      "title": "时间维度与时间研究",
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
          },
          {
            "not": {
              "leaf": "progress.dilationUnlocked"
            }
          },
          {
            "leaf": "timeStudy.studiesBought",
            "op": "gte",
            "value": 1
          }
        ]
      },
      "goal": "unlock-dilation",
      "strategy": "eternityPush",
      "precedence": 75,
      "note": "【节点 6 时间维度、时间研究】已在买时间研究、未解锁膨胀。R44 修的就是这一段：旧 spec 用 `challenge.eternityRunning` 当 detect，等于「时间研究阶段 == 正在跑 EC」，不跑 EC 时永远进不去。现在真判据是 timeStudy.studiesBought（player.timestudy.studies.length），与 EC 完全解耦。互斥依据：见 eternity / dilation。"
    },
    {
      "id": "eternityChallenges",
      "coversNodes": [
        7
      ],
      "title": "永恒挑战",
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
            "leaf": "challenge.eternityRunning"
          }
        ]
      },
      "goal": "finish-current-challenge",
      "strategy": "challengeClear",
      "precedence": 82,
      "note": "【节点 7 永恒挑战】与「时间研究」彻底分开：研究树阶段要求 !challenge.eternityRunning，EC 阶段只要求 eternityRunning。互斥依据：两者对 eternityRunning 的取值相反，且都要求 eternityUnlocked && !realityUnlocked。"
    },
    {
      "id": "dilation",
      "coversNodes": [
        8
      ],
      "title": "时间膨胀",
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
          },
          {
            "leaf": "progress.dilationUnlocked"
          }
        ]
      },
      "goal": "unlock-reality",
      "strategy": "dilationPush",
      "precedence": 80,
      "note": "【节点 8 时间膨胀】膨胀研究 1（TimeStudy.dilation）已买 —— 判据就是原版 PlayerProgress.dilationUnlocked()（player-progress.js:53 → TimeStudy.dilation.isBought）。到第一次现实之前都在这一段：买膨胀研究 2~6、买时间维度 1~8、把 maxEP 指数推过 4000。互斥依据：与 timeStudy 按 progress.dilationUnlocked 一真一假分开。"
    },
    {
      "id": "reality",
      "coversNodes": [
        9
      ],
      "title": "第一次现实",
      "detect": {
        "all": [
          {
            "leaf": "progress.realityUnlocked"
          },
          {
            "not": {
              "leaf": "celestial.teresaUnlocked"
            }
          },
          {
            "leaf": "player.realities",
            "op": "lte",
            "value": 1
          },
          {
            "not": {
              "leaf": "pelle.doomed"
            }
          }
        ]
      },
      "goal": "start-reality-loop",
      "strategy": "realityPush",
      "precedence": 62,
      "note": "【节点 9 第一次现实】现实刚解锁、只做过 1 次现实（player.realities <= 1）。这一段的目标是「把现实变成循环」，不是「买齐升级」。互斥依据：与 glyphs / realityTree 按 player.realities 是否 >= 2 分开。"
    },
    {
      "id": "glyphs",
      "coversNodes": [
        10
      ],
      "title": "符文装备与现实升级",
      "detect": {
        "all": [
          {
            "leaf": "progress.realityUnlocked"
          },
          {
            "not": {
              "leaf": "celestial.teresaUnlocked"
            }
          },
          {
            "leaf": "player.realities",
            "op": "gte",
            "value": 2
          },
          {
            "not": {
              "leaf": "automator.unlocked"
            }
          },
          {
            "not": {
              "leaf": "pelle.doomed"
            }
          }
        ]
      },
      "goal": "buy-all-reality-upgrades",
      "strategy": "realityPush",
      "precedence": 58,
      "note": "【节点 10 符文 / 现实升级】已进入现实循环，现实升级还没买齐、自动机还没解锁。符文必须先装备（equipBestGlyph 排第一）才有全局倍率，所以这一段用 realityPush 的原序。互斥依据：与 realityTree 按 automator.unlocked 一真一假分开；与 reality 按 realities 分开。"
    },
    {
      "id": "realityTree",
      "coversNodes": [
        10
      ],
      "title": "复兴树与黑洞",
      "detect": {
        "all": [
          {
            "leaf": "progress.realityUnlocked"
          },
          {
            "not": {
              "leaf": "celestial.teresaUnlocked"
            }
          },
          {
            "leaf": "player.realities",
            "op": "gte",
            "value": 2
          },
          {
            "leaf": "automator.unlocked"
          },
          {
            "not": {
              "leaf": "pelle.doomed"
            }
          }
        ]
      },
      "goal": "grow-reality-tree",
      "strategy": "realityTreePush",
      "precedence": 56,
      "note": "【节点 10 复兴树】复兴节点（Perk，player.reality.perks）已经买到能给足自动机点数的程度（原版 player.automatorUnlocked 为真，automator-points.js）。这一段与 glyphs 的优先级完全不同：符文/现实升级是「花 RM」，复兴节点是「花每次现实发的复兴点数」，且复兴节点没有自动化入口。互斥依据：见 glyphs。"
    },
    {
      "id": "celestialsTeresa",
      "coversNodes": [
        11
      ],
      "title": "天神·特蕾莎",
      "detect": {
        "all": [
          {
            "leaf": "progress.realityUnlocked"
          },
          {
            "leaf": "celestial.teresaUnlocked"
          },
          {
            "not": {
              "leaf": "celestial.effarigUnlocked"
            }
          },
          {
            "not": {
              "leaf": "pelle.doomed"
            }
          }
        ]
      },
      "goal": "unlock-effarig",
      "strategy": "celestial",
      "precedence": 86,
      "note": "【节点 11 天神系列第一段】特蕾莎已解锁、鹿颈长未解锁。特蕾莎的解锁判据是原版成就 147「购买所有现实升级」（teresa.js:11-13），页签条件是 Teresa.isUnlocked（tabs.js:403）。互斥依据：六段天神 + 莱特拉 + 佩勒全部按「已解锁的最高位」串联，每段都取反了下一段。"
    },
    {
      "id": "celestialsEffarig",
      "coversNodes": [
        11
      ],
      "title": "天神·鹿颈长",
      "detect": {
        "all": [
          {
            "leaf": "progress.realityUnlocked"
          },
          {
            "leaf": "celestial.effarigUnlocked"
          },
          {
            "not": {
              "leaf": "celestial.enslavedUnlocked"
            }
          },
          {
            "not": {
              "leaf": "pelle.doomed"
            }
          }
        ]
      },
      "goal": "unlock-enslaved",
      "strategy": "celestial",
      "precedence": 88,
      "note": "【节点 11 第二段】鹿颈长页签条件 = TeresaUnlocks.effarig.isUnlocked（tabs.js:436），即在特蕾莎处花遗迹碎片买下解锁位。互斥依据：见 celestialsTeresa。"
    },
    {
      "id": "celestialsEnslaved",
      "coversNodes": [
        11
      ],
      "title": "天神·无名氏",
      "detect": {
        "all": [
          {
            "leaf": "progress.realityUnlocked"
          },
          {
            "leaf": "celestial.enslavedUnlocked"
          },
          {
            "not": {
              "leaf": "celestial.vUnlocked"
            }
          },
          {
            "not": {
              "leaf": "pelle.doomed"
            }
          }
        ]
      },
      "goal": "unlock-v",
      "strategy": "celestial",
      "precedence": 90,
      "note": "【节点 11 第三段】无名氏页签条件 = EffarigUnlock.eternity.isUnlocked（tabs.js:447），即鹿颈长的「永恒阶段」完成。互斥依据：见 celestialsTeresa。"
    },
    {
      "id": "celestialsV",
      "coversNodes": [
        11
      ],
      "title": "天神·薇",
      "detect": {
        "all": [
          {
            "leaf": "progress.realityUnlocked"
          },
          {
            "leaf": "celestial.vUnlocked"
          },
          {
            "not": {
              "leaf": "celestial.raUnlocked"
            }
          },
          {
            "not": {
              "leaf": "pelle.doomed"
            }
          }
        ]
      },
      "goal": "unlock-ra",
      "strategy": "celestial",
      "precedence": 92,
      "note": "【节点 11 第四段】薇页签条件 = 成就 151（tabs.js:457）。互斥依据：见 celestialsTeresa。"
    },
    {
      "id": "celestialsRa",
      "coversNodes": [
        11
      ],
      "title": "天神·太阳神",
      "detect": {
        "all": [
          {
            "leaf": "progress.realityUnlocked"
          },
          {
            "leaf": "celestial.raUnlocked"
          },
          {
            "not": {
              "leaf": "celestial.laitelaUnlocked"
            }
          },
          {
            "not": {
              "leaf": "pelle.doomed"
            }
          }
        ]
      },
      "goal": "unlock-laitela",
      "strategy": "celestial",
      "precedence": 94,
      "note": "【节点 11 第五段】太阳神页签条件 = VUnlocks.raUnlock.isUnlocked（tabs.js:466），即在薇处花空间定理解锁。注意不要用 Ra.isUnlocked（= V.spaceTheorems >= 36，那是 Ra 内部解锁，比页签更晚）。互斥依据：见 celestialsTeresa。"
    },
    {
      "id": "laitela",
      "coversNodes": [
        12
      ],
      "title": "莱特拉",
      "detect": {
        "all": [
          {
            "leaf": "progress.realityUnlocked"
          },
          {
            "leaf": "celestial.laitelaUnlocked"
          },
          {
            "not": {
              "leaf": "celestial.pelleUnlocked"
            }
          },
          {
            "not": {
              "leaf": "pelle.doomed"
            }
          }
        ]
      },
      "goal": "unlock-pelle",
      "strategy": "celestial",
      "precedence": 96,
      "note": "【节点 12 莱特拉】判据 = Laitela.isUnlocked（laitela.js:34-36 → ImaginaryUpgrade(15).isBought），页签同判（tabs.js:475）。这一段是暗物质维度 / 熵 / 难度层的长段，所以独立成段，不再塞进「Celestial 各阶段」的兜底里。互斥依据：与 pelle 按 pelleUnlocked 分开；与 celestialsRa 按 laitelaUnlocked 分开。"
    },
    {
      "id": "pelle",
      "coversNodes": [
        13
      ],
      "title": "佩勒（未毁灭）",
      "detect": {
        "all": [
          {
            "leaf": "progress.realityUnlocked"
          },
          {
            "leaf": "celestial.pelleUnlocked"
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
      "precedence": 98,
      "note": "【节点 13 佩勒·毁灭前】判据 = Pelle.isUnlocked（pelle.js:120-122 → ImaginaryUpgrade(25).isBought），页签同判（tabs.js:485）。毁灭前与毁灭后策略完全不同（前者还要继续成长，后者是碎片循环），所以必须分开。"
    },
    {
      "id": "doomed",
      "coversNodes": [
        13
      ],
      "title": "Pelle 与 Doom 终局阶段",
      "detect": {
        "leaf": "pelle.doomed"
      },
      "goal": "reach-end-state",
      "strategy": "pelleEndgame",
      "precedence": 100,
      "note": "【节点 13 佩勒·毁灭后】唯一判据是 Pelle.isDoomed。毁灭态下其它一切阶段判据都无意义，所以 precedence 最高。"
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
      "id": "break-infinity",
      "title": "打破无限（大坍缩间隔拉到 100 并点下 Break Infinity）",
      "done": {
        "leaf": "player.break"
      },
      "strategy": "breakInfinityPush",
      "note": "判据是原版自己的 player.break，由 breakInfinity() 置真；间隔判据见 blockers.intervalNotMaxed。"
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
      "title": "完成当前挑战（原版结算出口）",
      "done": {
        "not": {
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
        }
      },
      "strategy": "challengeClear",
      "note": "R44 之前这里是一句中文说明字符串，无法求值（永远判不出完成）。现在的判据是「当前没有任何挑战在跑」：挑战一完成，原版结算并自动退出挑战，player.challenge.*.current 归 0（normal-challenges.js:165-167 / eternity-challenge.js:297-299），所以这条与「本挑战已结算」等价。「下一个该打哪个」由执行层按 challenge.normalCompleted / infinityCompleted / eternityCompletions 三个计数选，本文件不写死顺序。"
    },
    {
      "id": "build-time-study",
      "title": "建起时间研究树（买下第一棵研究）",
      "done": {
        "leaf": "timeStudy.studiesBought",
        "op": "gte",
        "value": 1
      },
      "strategy": "eternityPush"
    },
    {
      "id": "unlock-dilation",
      "title": "解锁时间膨胀（买下膨胀研究 1）",
      "done": {
        "leaf": "progress.dilationUnlocked"
      },
      "strategy": "eternityPush",
      "note": "膨胀研究 1 的成本是 12900 时间之理（dilation-time-study.js:55 totalTimeTheoremRequirement），是本 MOD 缩放后的真实门槛。"
    },
    {
      "id": "unlock-reality",
      "title": "解锁现实（买下膨胀研究 6）",
      "done": {
        "leaf": "progress.realityUnlocked"
      },
      "strategy": "dilationPush"
    },
    {
      "id": "start-reality-loop",
      "title": "把现实变成循环（完成第 2 次现实）",
      "done": {
        "leaf": "player.realities",
        "op": "gte",
        "value": 2
      },
      "strategy": "realityPush"
    },
    {
      "id": "buy-all-reality-upgrades",
      "title": "买齐一次性现实升级（= 成就 147 的唯一判据）",
      "done": {
        "leaf": "reality.upgradesBought",
        "op": "gte",
        "value": 20
      },
      "strategy": "realityPush",
      "note": "20 = 一次性现实升级条数（reality-upgrades.js:144 注释「必须真的买齐 20 个一次性 RU」）。达成后原版 RealityUpgrades.allBought 为真，成就 147 解锁，特蕾莎出现。"
    },
    {
      "id": "grow-reality-tree",
      "title": "复兴树买到 12 个节点且自动机已解锁",
      "done": {
        "all": [
          {
            "leaf": "automator.unlocked"
          },
          {
            "leaf": "reality.perksBought",
            "op": "gte",
            "value": 12
          }
        ]
      },
      "strategy": "realityTreePush",
      "note": "12 取自教程第 12 章的目标（「已买复兴节点 ≥ 12 个」）。复兴节点每条固定 1 复兴点数，点数 = clamp(floor(现实次数^(1/3)), 1, 20) 再乘倍数（reality.js 的 perkPoints 发放），所以这一段的目标是「多跑现实 + 按连线买」。"
    },
    {
      "id": "unlock-effarig",
      "title": "解锁鹿颈长",
      "done": {
        "leaf": "celestial.effarigUnlocked"
      },
      "strategy": "celestial"
    },
    {
      "id": "unlock-enslaved",
      "title": "解锁无名氏（完成鹿颈长的永恒阶段）",
      "done": {
        "leaf": "celestial.enslavedUnlocked"
      },
      "strategy": "celestial"
    },
    {
      "id": "unlock-v",
      "title": "解锁薇",
      "done": {
        "leaf": "celestial.vUnlocked"
      },
      "strategy": "celestial"
    },
    {
      "id": "unlock-ra",
      "title": "解锁太阳神",
      "done": {
        "leaf": "celestial.raUnlocked"
      },
      "strategy": "celestial"
    },
    {
      "id": "unlock-laitela",
      "title": "解锁莱特拉",
      "done": {
        "leaf": "celestial.laitelaUnlocked"
      },
      "strategy": "celestial"
    },
    {
      "id": "unlock-pelle",
      "title": "解锁佩勒",
      "done": {
        "leaf": "celestial.pelleUnlocked"
      },
      "strategy": "celestial"
    },
    {
      "id": "unlock-doomed",
      "title": "进入毁灭现实（按下大灾变）",
      "done": {
        "leaf": "pelle.doomed"
      },
      "strategy": "celestial"
    },
    {
      "id": "reach-end-state",
      "title": "达成终局（反物质 1e1000，endState 过 1）",
      "done": {
        "leaf": "game.endState",
        "op": "gte",
        "value": 1
      },
      "strategy": "pelleEndgame",
      "note": "判据唯一来源 src/core/celestials/pelle/game-end.js:60，目标 E = 1000（即 1e1000）。R44 之前这里是一句中文说明字符串，解释器只能返回 done=null（面板永远显示「无法判定」）；现在改成对 game.endState 的可求值比较。注意 game.endState 不是单调进度值：isGameEnd 之后 additionalEnd 会继续涨（game-end.js:88-91），所以它只能回答「过没过线」。"
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
      "id": "breakInfinityPush",
      "title": "打破无限推进策略",
      "when": {
        "all": [
          {
            "leaf": "progress.infinityUnlocked"
          },
          {
            "not": {
              "leaf": "player.break"
            }
          }
        ]
      },
      "priority": [
        "buyBigCrunchInterval",
        "crunch",
        "buyInfinityDimension",
        "buyInfinityUpgrade"
      ],
      "guards": [
        "间隔升级走原版 upgradeInterval()，不伪造 interval 数值",
        "禁止直接写 player.break，必须由原版 breakInfinity() 置真",
        "拉满间隔前不要把 IP 花在会拖慢 32767 累计的项目上"
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
      "id": "dilationPush",
      "title": "时间膨胀推进策略",
      "when": {
        "leaf": "progress.dilationUnlocked"
      },
      "priority": [
        "buyDilationStudy",
        "startDilation",
        "buyDilationUpgrade",
        "buyTimeStudy",
        "eternity"
      ],
      "guards": [
        "膨胀研究 6 是解锁现实的唯一通路，优先于任何收益型研究",
        "膨胀中的反物质指数由膨胀符文决定，不靠堆反物质",
        "启动膨胀前确认速子粒子不会被立刻清空"
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
      "id": "realityTreePush",
      "title": "复兴树推进策略",
      "when": {
        "leaf": "automator.unlocked"
      },
      "priority": [
        "equipBestGlyph",
        "buyRealityUpgrade",
        "buyRealityPerk",
        "runReality"
      ],
      "guards": [
        "复兴节点只能买与已买节点相邻的，不能跳着买",
        "复兴节点没有任何自动化入口（本项目无对应 API 封装），执行层不代劳",
        "现实升级与复兴节点抢的是两种不同货币（RM / 复兴点数），不要互相等待"
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
  "routeBindings": [
    {
      "route": "eternity-tt-first",
      "verbs": [
        "buyTimeTheorem",
        "buyTimeStudy",
        "eternity"
      ],
      "advances": [
        "buyTimeStudy"
      ],
      "note": "spec 原序。研究树是解锁现实的唯一通路，节流在 oreki-eternity-automation.js 内部，本绑定不改节流。"
    },
    {
      "route": "eternity-ec-first",
      "verbs": [
        "eternity",
        "buyTimeTheorem",
        "buyTimeStudy"
      ],
      "advances": [
        "eternity"
      ],
      "note": "先重置拿 EC 永久增益。只有预计耗时能证明它更快时才允许切（15% 阈值）。"
    },
    {
      "route": "reality-glyph-first",
      "verbs": [
        "equipBestGlyph",
        "buyRealityUpgrade",
        "runReality"
      ],
      "advances": [
        "runReality"
      ],
      "note": "spec 原序（runReality 本来就在最后）。"
    },
    {
      "route": "reality-machine-first",
      "verbs": [
        "buyRealityUpgrade",
        "equipBestGlyph",
        "runReality"
      ],
      "advances": [
        "runReality"
      ],
      "note": "先把现实机器攒出的升级买掉，再装符文。"
    },
    {
      "route": "celestial-nav-order",
      "verbs": [
        "celestialSpecificOrder",
        "spendUnlockResource",
        "advanceCelestialNav"
      ],
      "advances": [],
      "note": "三个动词全部 delegated，本绑定不产生任何代劳，只用于路线层识别「当前走法等于导航顺序」。"
    },
    {
      "route": "pelle-shard-loop",
      "verbs": [
        "armageddonLoopForShards",
        "buyPelleKeepAutobuyers",
        "maxBigCrunchIntervalWithRealIP",
        "armageddonOnceMoreToSetBreak",
        "growAntimatterTo1e1000"
      ],
      "advances": [],
      "note": "五个动词全部 delegated：相位机由 OrekiEndgameAutomation.driveDoomed() 独占，本绑定只描述顺序。"
    }
  ],
  "routeBindingsNote": "【Oreki R42】路线层的动词绑定。route-model.json 只描述「怎么评、怎么选」，本段描述「每条路线该怎么买」—— 与 route-model.layering 的分层约定一致。硬约束：绑定里的动词必须已经出现在对应 strategy.priority 里，否则解释器直接丢弃；本段永远不能引入新的购买权。没有绑定、或绑定在当前策略下无有效动词的路线，会被 filter.missingFeature 淘汰并在面板写原因（当前：celestial-parallel-v 与 pelle-grow-only 两条）。",
  "advisories": [
    {
      "id": "challengeRewardMissing",
      "title": "下一个解锁要求某项挑战奖励",
      "advice": "先去把该挑战做掉，不要在主线里硬堆资源",
      "source": "各阶段 requirement()",
      "note": "这条无法用叶子判定：原版各阶段 requirement() 的判据形态各异，没有统一的「下一个解锁需要哪个挑战奖励」查询入口。因此它只是提示文案，不参与阻塞判定。"
    },
    {
      "id": "perksHaveNoAutomation",
      "title": "复兴节点没有自动化入口",
      "advice": "复兴树必须手点：本项目没有买复兴节点的封装，执行层不会代劳。点数每跑一次现实就发一次，边刷现实边点。",
      "source": "src/core/perks.js（只有 Perk(id).purchase()，仓库内无任何自动调用点）",
      "note": "不是阻塞项，是能力缺口；用叶子无法表达「缺功能」。"
    }
  ]
};

export default data;
