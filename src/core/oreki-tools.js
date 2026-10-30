/**
 * AD: Oreki Edition — 可选工具集
 *
 * 设计原则：
 * 1. 一切功能都是「用户主动点击 + 二次确认」才执行，绝不自动运行、绝不后台改写存档。
 * 2. 成就解锁一律走游戏自带的 Achievement(id).unlock()，不直接位运算改存档字段，
 *    这样成就带来的联动（自动购买器加速、UI 变化、速度跑计时、成就倍率失效）都由原逻辑处理。
 * 3. 存档相关操作一律复用 GameStorage 的导入/导出/重置通道，保证版号检查与迁移逻辑不被绕过。
 * 4. 所有破坏性操作前都会自动写一份本工具自己的快照（独立 localStorage 键），可一键还原。
 */

const SAVE_BACKUP_KEY = "oreki-save-backup";

export const OrekiAchievementTool = {
  get normalAll() {
    return Achievements.all;
  },
  get secretAll() {
    return SecretAchievements.all;
  },
  get normalTotal() {
    return this.normalAll.length;
  },
  get secretTotal() {
    return this.secretAll.length;
  },
  get normalUnlocked() {
    return this.normalAll.countWhere(a => a.isUnlocked);
  },
  get secretUnlocked() {
    return this.secretAll.countWhere(a => a.isUnlocked);
  },
  get normalIdRange() {
    const ids = this.normalAll.map(a => a.id).sort((a, b) => a - b);
    return [ids[0], ids[ids.length - 1]];
  },
  get secretIdRange() {
    const ids = this.secretAll.map(a => a.id).sort((a, b) => a - b);
    return [ids[0], ids[ids.length - 1]];
  },

  getPool(scope) {
    if (scope === "secret") return this.secretAll;
    if (scope === "all") return [...this.normalAll, ...this.secretAll];
    return this.normalAll;
  },

  /**
   * 解锁指定范围内的成就。
   * @param {object} opts
   * @param {"normal"|"secret"|"all"} opts.scope
   * @param {number} opts.from 起始 ID（含）
   * @param {number} opts.to 结束 ID（含）
   * @returns {{unlocked:number, already:number, considered:number}}
   */
  unlockRange({ scope, from, to }) {
    // 只遍历游戏实际存在的成就集合，因此不可能写入无效 ID
    const pool = this.getPool(scope);
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    let unlocked = 0;
    let already = 0;
    let considered = 0;
    for (const achievement of pool) {
      if (achievement.id < lo || achievement.id > hi) continue;
      considered++;
      if (achievement.isUnlocked) {
        already++;
        continue;
      }
      // silent = true：批量解锁时不刷上百条通知
      achievement.unlock(true, true);
      unlocked++;
    }
    if (unlocked > 0) Achievements._power.invalidate();
    return { unlocked, already, considered };
  },

  /** 统计如果执行会发生什么（用于确认弹窗预览，不做任何写入） */
  preview({ scope, from, to }) {
    const pool = this.getPool(scope);
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    let pending = 0;
    let done = 0;
    for (const achievement of pool) {
      if (achievement.id < lo || achievement.id > hi) continue;
      if (achievement.isUnlocked) done++;
      else pending++;
    }
    return { pending, done };
  }
};

export const OrekiSaveTool = {
  get backupKey() { return SAVE_BACKUP_KEY; },

  /** 当前存档概览，只读 */
  getInfo() {
    const save = player;
    return {
      saveName: save.options.saveFileName || "（未命名）",
      slot: GameStorage.currentSlot + 1,
      version: save.version,
      currentVersion: Player.defaultStart.version,
      // 与统计页口径一致：游戏内时间已剔除本 Mod 的全局速度倍率，现实时间单独列出
      totalTime: TimeSpan.fromMilliseconds(totalInGameTimeMs()).toStringShort(),
      realTime: Time.realTimePlayed.toStringShort(),
      antimatter: format(save.antimatter, 2, 2),
      infinityPoints: format(save.infinityPoints, 2, 2),
      eternities: format(save.eternities, 2, 2),
      realities: format(save.realities, 2, 2),
      achievements: `${OrekiAchievementTool.normalUnlocked} / ${OrekiAchievementTool.normalTotal}`,
      secretAchievements: `${OrekiAchievementTool.secretUnlocked} / ${OrekiAchievementTool.secretTotal}`,
      speedFactor: GameSpeed.format(),
    };
  },

  /** 工具自有快照信息（不含完整存档文本） */
  getBackupInfo() {
    try {
      const raw = window.localStorage.getItem(SAVE_BACKUP_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        date: new Date(parsed.date),
        length: parsed.data ? parsed.data.length : 0,
        reason: parsed.reason || "",
      };
    } catch (e) {
      return null;
    }
  },

  /** 写一份工具快照（覆盖上一份）。返回是否成功 */
  makeBackup(reason = "manual") {
    try {
      const data = GameSaveSerializer.serialize(player);
      window.localStorage.setItem(SAVE_BACKUP_KEY, JSON.stringify({ date: Date.now(), data, reason }));
      return { ok: true, date: new Date() };
    } catch (e) {
      return { ok: false, message: `无法写入本地备份：${e && e.message ? e.message : e}` };
    }
  },

  /** 用工具快照还原（走官方导入通道，含版号检查与迁移） */
  restoreBackup() {
    const raw = window.localStorage.getItem(SAVE_BACKUP_KEY);
    if (!raw) return { ok: false, message: "还没有任何备份" };
    let data;
    try {
      data = JSON.parse(raw).data;
    } catch (e) {
      return { ok: false, message: "备份内容已损坏，无法读取" };
    }
    if (!data) return { ok: false, message: "备份内容为空" };
    // 还原前先备份当前状态，避免"还原错了就回不去"
    this.makeBackup("before-restore");
    GameStorage.import(data);
    return { ok: true, message: "已从备份还原" };
  },

  exportText() {
    return GameStorage.exportModifiedSave();
  },

  /** 校验并导入文本；失败时不改动任何东西 */
  importText(text) {
    const trimmed = String(text || "").trim();
    if (trimmed.length < 10) return { ok: false, message: "内容太短，不像是有效存档" };
    let parsed;
    try {
      parsed = GameSaveSerializer.deserialize(trimmed);
    } catch (e) {
      return { ok: false, message: "无法解析：不是有效的存档文本" };
    }
    let checkResult = "";
    try {
      checkResult = GameStorage.checkPlayerObject(parsed);
    } catch (e) {
      checkResult = `校验异常：${e && e.message ? e.message : e}`;
    }
    if (checkResult !== "") return { ok: false, message: `存档校验未通过：${checkResult}` };
    const version = parsed.version;
    const current = Player.defaultStart.version;
    if (typeof version === "number" && version > current) {
      return { ok: false, message: `存档版本（${version}）高于当前游戏版本（${current}），拒绝导入` };
    }
    this.makeBackup("before-import");
    GameStorage.import(trimmed);
    return { ok: true, message: `已导入存档${typeof version === "number" && version < current ? `（由 v${version} 迁移到 v${current}）` : ""}` };
  },

  /** 重置当前存档（先自动备份） */
  resetWithBackup() {
    this.makeBackup("before-reset");
    GameStorage.hardReset();
    return { ok: true };
  }
};

export function installOrekiTools(target = window) {
  target.OrekiAchievementTool = OrekiAchievementTool;
  target.OrekiSaveTool = OrekiSaveTool;
}

installOrekiTools();
