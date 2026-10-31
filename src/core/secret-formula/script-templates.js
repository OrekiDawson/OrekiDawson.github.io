import { AutobuyerInputFunctions } from "../../components/tabs/autobuyers/AutobuyerInput.js";
// 模板名与 ScriptTemplate 的 switch 分支共用同一份常量，避免两侧各写一份字符串后漂移
// （历史上数据用英文名、switch 用中文名，导致「创建模板」必然抛 Unrecognized template name）。
import { SCRIPT_TEMPLATE_NAMES } from "../automator/script-templates.js";

export const automatorTemplates = {
  /**
    * List of possible data types to dynamically generate in script templates, assumed to be only string or boolean
    * {
    *  @property {String} name              String to be used as a key for entries in this object
    *  @property {String[]} boolDisplay     Strings to be displayed for true/false states for boolean inputs. If
    *   undefined, assumed to be a non-boolean input
    *  @property {Function} isValidString   A function used to test if an input string is formatted properly or not
    *  @property {Function} map             A function to be used to map the inputs to their actual values
    *   which are stored in the param object. If undefined, assumed to be no mapping
    * }
    */
  paramTypes: [
    {
      name: "tree",
      isValidString: str => {
        const validImport = TimeStudyTree.isValidImportString(str);
        const preset = str.match(/^(NAME (.{1,4})|ID (\d))$/u);
        const validPreset = preset ? (
          player.timestudy.presets.some(p => p.name === preset[2]) ||
          (Number(preset[3]) > 0 && Number(preset[3]) < 7)
        ) : false;
        return validImport || validPreset;
      },
    },
    {
      name: "integer",
      isValidString: str => AutobuyerInputFunctions.int.tryParse(str),
      map: x => Math.round(parseInt(x, 10)),
    },
    {
      name: "decimal",
      isValidString: str => AutobuyerInputFunctions.decimal.tryParse(str),
      map: x => AutobuyerInputFunctions.decimal.tryParse(x),
    },
    {
      name: "boolean",
      boolDisplay: ["是", "否"],
    },
    {
      name: "nowait",
      boolDisplay: ["继续前进", "继续购买时间研究"],
    },
    {
      name: "mode",
      boolDisplay: ["最高点数的 X 倍", "距上次的秒数"],
      map: x => (x ? "mult" : "time"),
    },
  ],
  /**
    * List automator script templates, primarily used here for formatting the player UI prompts appropriately
    * so that all of the required fields show up in the proper input formats. Actual script formatting requires
    * additionally writing a method to be called in the constructor of the ScriptTemplate class
    * {
    *  @property {String} name          Name of script template, also used as a key within the constructor for
    *   ScriptTemplate objects
    *  @property {String} description   Text description of what the template does when used in the automator
    *  @property {Object[]} inputs      Fields of the param object which need to be filled for the template to
    *   have all the information it needs. Contains the name of the field, the type (drawn from paramTypes above),
    *   and a prompt to be shown in the UI end
    *  @property {Function} warnings    Function which checks the current game state and potentially provides
    *   warnings based on some possibly common cases which may lead to undesired behavior
    * }
    */
  scripts: [
    {
      name: SCRIPT_TEMPLATE_NAMES.climbEP,
      description: `该脚本将反复进行永恒操作，每次永恒时尝试重新购买时间研究树。需配置无限自动购买器和永恒自动购买器。脚本将持续循环，直至达到最终永恒点数目标值。`,
      inputs: [
        { name: "treeStudies", type: "tree", prompt: "或直接输入你的时间研究" },
        { name: "treeNowait", type: "nowait", prompt: "缺少研究时的行为" },
        { name: "finalEP", type: "decimal", prompt: "目标永恒点数" },
        { name: "autoInfMode", type: "mode", prompt: "无限自动购买器模式" },
        { name: "autoInfValue", type: "decimal", prompt: "无限自动购买器阈值" },
        { name: "autoEterMode", type: "mode", prompt: "永恒自动购买器模式" },
        { name: "autoEterValue", type: "decimal", prompt: "永恒自动购买器阈值" },
      ],
      warnings: () => {
        const list = [];
        if (!RealityUpgrade(10).isBought) {
          list.push(`若永恒次数不足 ${formatInt(100)} 次，此脚本将无法正确配置自动购买器模式。建议在开始现实前，先获取现实升级「${RealityUpgrade(10).name}」。`);
        }
        // Telemechanical Process (TD/5xEP autobuyers)
        if (!RealityUpgrade(13).isBought) {
          list.push(`缺少现实升级“${RealityUpgrade(13).name}”时，此模板的表现可能不佳`);
        }
        if (!Perk.ttBuySingle.isBought) {
          list.push(`缺少复兴树节点“${Perk.ttBuySingle.label}”且无法自行产生时间之理时，此模板的表现可能不佳`);
        }
        return list;
      },
    },
    {
      name: SCRIPT_TEMPLATE_NAMES.grindEternities,
      description: `该脚本会先购买指定的时间研究树，然后反复快速永恒。自动无限会被设为“最高点数的 X 倍”
        并指定大坍缩次数，自动永恒则会尽快触发。脚本会持续循环，直至达到目标永恒次数。`,
      inputs: [
        { name: "treeStudies", type: "tree", prompt: "或直接输入你的时间研究" },
        { name: "treeNowait", type: "nowait", prompt: "缺少研究时的行为" },
        { name: "crunchesPerEternity", type: "integer", prompt: "每次永恒的大坍缩次数" },
        { name: "eternities", type: "decimal", prompt: "目标永恒次数" },
      ],
      warnings: () => {
        const list = [];
        // Eternal flow (eternity generation)
        if (RealityUpgrade(14).isBought) {
          list.push(`由于已有现实升级“${RealityUpgrade(14).name}”，你大概不需要用这个模板`);
        }
        return list;
      },
    },
    {
      name: SCRIPT_TEMPLATE_NAMES.grindInfinities,
      description: `该脚本会购买指定的时间研究树，然后把自动购买器配置成刷无限次数。脚本会持续循环，
        直至达到目标无限次数；目标也可以设为“储存的无限次数”，这种情况下它会先拿满全部无限次数，
        再进行一次永恒。`,
      inputs: [
        { name: "treeStudies", type: "tree", prompt: "或直接输入你的时间研究" },
        { name: "treeNowait", type: "nowait", prompt: "缺少研究时的行为" },
        { name: "infinities", type: "decimal", prompt: "目标无限次数" },
        { name: "isBanked", type: "boolean", prompt: "目标按储存的无限次数计算？" },
      ],
      warnings: () => {
        const list = [];
        if (!Perk.achievementGroup5.isBought) {
          list.push(`本次现实开始时你不会有成就“${Achievement(131).name}”，刷无限次数的收益可能比预期低，
            因为在此之前无限次数无法储存`);
        }
        // Boundless flow (infinity generation)
        if (RealityUpgrade(11).isBought) {
          list.push(`由于已有现实升级“${RealityUpgrade(11).name}”，你大概不需要用这个模板`);
        }
        return list;
      },
    },
    {
      name: SCRIPT_TEMPLATE_NAMES.completeEC,
      description: `该脚本会购买指定的时间研究树，然后解锁指定的永恒挑战。接着按你指定的设置配置无限自动
        购买器并进入该永恒挑战，最后等到完成次数达到目标值再触发永恒，从而完成挑战。`,
      inputs: [
        { name: "treeStudies", type: "tree", prompt: "或直接输入你的时间研究" },
        { name: "treeNowait", type: "nowait", prompt: "缺少研究时的行为" },
        { name: "ec", type: "integer", prompt: "永恒挑战编号" },
        { name: "completions", type: "integer", prompt: "目标完成次数" },
        { name: "autoInfMode", type: "mode", prompt: "无限自动购买器模式" },
        { name: "autoInfValue", type: "decimal", prompt: "无限自动购买器阈值" },
      ],
      warnings: () => {
        const list = [];
        if (!Perk.studyECRequirement.isBought) {
          list.push(`由于还有次级资源要求，永恒挑战可能无法稳定解锁；建议先解锁复兴树节点
            “${Perk.studyECRequirement.label}”再使用此模板`);
        }
        if (!Perk.studyECBulk.isBought) {
          list.push(`在不能批量完成永恒挑战时使用此模板，脚本会很长、更慢也更难改。如果你要用，
            建议在解锁复兴树节点“${Perk.studyECBulk.label}”后回来简化脚本`);
        }
        return list;
      },
    },
    {
      name: SCRIPT_TEMPLATE_NAMES.unlockDilation,
      description: `该脚本会反复进行永恒，每次永恒时尝试重新购买时间研究树。需要为永恒自动购买器提供设置；
        无限自动购买器会被关闭。脚本会一直循环到凑齐解锁时间膨胀所需的时间之理总量，然后解锁时间膨胀。`,
      inputs: [
        { name: "treeStudies", type: "tree", prompt: "或直接输入你的时间研究" },
        { name: "treeNowait", type: "nowait", prompt: "缺少研究时的行为" },
        { name: "finalEP", type: "decimal", prompt: "目标永恒点数" },
        { name: "autoEterMode", type: "mode", prompt: "永恒自动购买器模式" },
        { name: "autoEterValue", type: "decimal", prompt: "永恒自动购买器阈值" },
      ],
      warnings: () => {
        const list = [];
        // Telemechanical Process (TD/5xEP autobuyers)
        if (!RealityUpgrade(13).isBought) {
          list.push(`缺少现实升级“${RealityUpgrade(13).name}”时，此模板的表现可能不佳`);
        }
        if (!Perk.ttBuySingle.isBought) {
          list.push(`缺少复兴树节点“${Perk.ttBuySingle.label}”且无法自行产生时间之理时，此模板的表现可能不佳`);
        }
        return list;
      },
    },
  ]
};
