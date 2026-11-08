// ---------------------------------------------------------------------------
// [R96] 智能大坍缩决策（Web 侧，与 Android OrekiCrunchPolicy 语义等价）
//
// 玩家反馈：自动大坍缩在大部分时间里只是打断成长。这里把「要不要坍缩」从
// 固定节奏改成目标驱动；所有判据来自原版真实状态，不写时间点、不以重置次数
// 作为性能依据。
//
// 规则优先级（与 Android 完全一致）：
//   1. 挑战运行中 → 放行（挑战结算优先）
//   2. 未 Break     → 放行（首次 Break 前坍缩是攒 IP 的唯一入口）
//   3. 已有永恒     → 放行（后续由阶段目标决定）
//   4. 永恒前：下一个未解锁无限维度「IP 已够、只差反物质峰值」→ 阻止
//   5. 其余        → 放行
//
// 只读，不修改玩家设置；节奏仍由原版自动器执行。
// ---------------------------------------------------------------------------

const TAG = "OREKI_CRUNCH_DEC";
let lastKey = null;

function throttleLog(decision) {
  const key = `${decision.allow}:${decision.reason}`;
  if (key === lastKey) return;
  lastKey = key;
  console.info(`[${TAG}] allow=${decision.allow} reason=${decision.reason}`);
}

export class OrekiCrunchPolicy {
  static decide() {
    let decision;
    try {
      decision = this.evaluate();
    } catch (e) {
      decision = { allow: false, reason: `exception:${e && e.name ? e.name : "unknown"}` };
    }
    throttleLog(decision);
    return decision;
  }

  static evaluate() {
    if (NormalChallenge.isRunning || InfinityChallenge.isRunning) {
      return { allow: true, reason: "challenge-running" };
    }
    if (!player.break) return { allow: true, reason: "pre-break-ip" };
    if (PlayerProgress.eternityUnlocked()) return { allow: true, reason: "post-eternity" };

    const pending = this.nextLockedDimension();
    if (pending === null) return { allow: true, reason: "default" };

    const maxAM = player.records.thisEternity.maxAM;
    if (maxAM.gte(pending.peakRequirement)) {
      return { allow: true, reason: "id-peak-reached" };
    }
    if (Currency.infinityPoints.value.gte(pending.ipRequirement)) {
      return { allow: false, reason: "id-peak-wait" };
    }
    return { allow: true, reason: "id-ip-farm" };
  }

  static nextLockedDimension() {
    for (let tier = 1; tier <= 8; tier++) {
      const id = InfinityDimension(tier);
      if (id.isUnlocked) continue;
      return { tier, peakRequirement: id.requirement, ipRequirement: id.ipRequirement };
    }
    return null;
  }
}
