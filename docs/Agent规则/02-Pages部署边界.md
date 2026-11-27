# Pages部署边界细则

> 承接原根 AGENTS.md 对应章节的有效规则。代码路径默认相对于仓库根目录；共性规则以 Workspace 最新权威版本为准。返回[规则入口](../../AGENTS.md)。

## 2. Pages 部署边界

### 2.1 静态部署副本技术规则

- 本仓仅是 `https://oreki.net` 的静态部署副本，**不是游戏源码入口**；任何游戏业务、教程或 GUI 修改先在 `AD-Oreki-Edition-Web` 完成并验证。
- 保持 `CNAME`、`.nojekyll`、`index.html`、`src/`、`public/` 及依赖路径正确；不保存个人密钥、OAuth、Cookie 或测试存档，不加入第二套游戏实现。
- 只有获得明确授权、且 Web 源码 SHA、静态文件完整性、CI/受保护部署门禁与回滚路径核验通过后，才能同步并部署。禁止手动覆盖生产资源、未经验证回滚或以本地预览替代线上验收。
- 正式部署核对首页、模块 404、样式、移动浏览器、存档出入、阶段界面和关键运行时错误，报告实际线上 SHA 与 `PASS/FAIL/BLOCKED/NOT RUN`。
- 源码侧权威约束参见 [Web AGENTS.md](https://github.com/OrekiDawson/AD-Oreki-Edition-Web/blob/main/AGENTS.md)。

