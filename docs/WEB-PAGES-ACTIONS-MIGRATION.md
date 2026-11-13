# Web Pages 官方部署切换清单（R105）

本仓新增 `.github/workflows/deploy-approved-web.yml`。它从 Web 仓精确 SHA 拉取文件，并独立核实对应 CI 的 **main/push、Node checks、Mobile Chromium smoke** 均成功后，构建静态 Artifact 交给 GitHub Pages 官方部署。它**不修改 Pages main**。

## 切换前

1. 在本仓 Settings → Pages 把 **Build and deployment → Source** 调整为 **GitHub Actions**。没有该设置时，官方部署可能失败；不能把工作流合并等同于已经切换生产。
2. 检查 `github-pages` Environment 的分支与权限限制，维护者审核后允许运行。
3. 保护本仓 `main` 和 Web 仓 `main`：禁止绕过 PR/必要 CI 的未经审核提交；若当前套餐不支持组织 Rulesets，请如实标 BLOCKED，不要假称受保护。
4. Web 仓 `web-production` environment 添加受限 `PAGES_DEPLOY_TOKEN`（仅目标 Pages 仓，Actions: write）；也可先在本仓通过手动 workflow_dispatch 发起精确 SHA + CI Run ID 的发布，不需要跨仓 Token。
5. Web 仓发布入口会调用本仓 workflow_dispatch。Web 工作流成功**只表示请求已提交**；本仓工作流和线上烟测均 PASS 才代表正式上线。

## 发布和回退

1. Web 提交在 main 对应成功的 push CI Run，确认 Node 和移动 Chromium Job 的结论。
2. 在 Web `deploy.yml` 输入 **完整 40 位 SHA**；或在本仓手动运行 `deploy-approved-web.yml`，同时填写真实 Web CI Run ID。
3. 本仓再次检查相同身份，暂存 Pages-only 文件、复制 Web src/modules/public，验证域名、静态资源和 JS 语法，生成 `deployment.json`，上传 Artifact 后使用 `deploy-pages` 部署。
4. 检查 `https://oreki.net/deployment.json` 的 `web_sha`、`web_ci_run_id` 和 `src/main.js` 可访问。本工作流自带最低限度的线上验证。与真实游戏阶段相关的上线仍需要人工/专用移动浏览器验收证据。
5. 如需回滚，向**之前已通过 CI 的 SHA + 其对应 CI Run ID**重新执行部署，绝不回推未经验证的旧构建目录。

## 两项显式阻断

- 当前仓库 Pages Source/Environment 配置及跨仓密钥由账户管理权限控制，提交工作流**不会自动设置**。
- 直接 Push 旧 Pages main 的发布旁路，必须通过切换 Pages Source 与仓库规则共同关闭；仅增加 CI 文件不能堵住旧路。

不泄露 Tokens；不得把一次 dispatch 当成上线 PASS。
