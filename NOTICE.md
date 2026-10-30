# 署名与来源（NOTICE）

本项目 **AD: Oreki Edition** 是基于他人成果二次开发的个人非商业 Mod，不主张对下列任何上游代码或译文的所有权。

## 1. 游戏本体

- 原始游戏：**Antimatter Dimensions** — 作者 Hevipelle（IvarK）
  <https://github.com/IvarK/AntimatterDimensionsSourceCode>
  许可：MIT License
- 汉化基线（本项目的代码底座）：**ADChinese** — 作者 aquamarine309
  <https://github.com/aquamarine309/ADChinese>
  许可：MIT License + 见仓库内 `MOD-LICENSE`
  ADChinese 的中文字符串系参考《反物质维度》Android 版中文社区翻译整理、校对与补全而成，
  其 `MOD-LICENSE` 声明译文整合、校对与 ESM 模块化重构部分的著作权归 aquamarine309 所有。
- 加速玩法参考：**ADfaster** — 作者 WYXkk
  <https://github.com/WYXkk/ADfaster>
  许可：MIT License
  本项目将 ADfaster 的全局速度因子设计（`getGlobalSpeedFactor()`）移植到 ADChinese 代码基线上，
  并按本项目需求改造为可运行时配置的倍率系统。

## 2. 本项目新增的部分

- `src/core/speed-config.js`：可配置全局速度倍率（校验、持久化、模拟期冻结）
- `public/stylesheets/oreki.css`：新增界面样式
- 设置页中的「游戏速度」区块
- 后续新增的成就工具与存档工具

## 3. 许可

本项目整体继续以 MIT License 分发（见 `LICENSE`）。
上游的版权声明与许可条款继续对相应部分生效，不得移除。

## 4. 声明

本项目为个人学习与自用目的的非官方修改版，与原作者 Hevipelle、aquamarine309、WYXkk 均无隶属关系，
未获其背书。请勿将本项目用于商业用途。
