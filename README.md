# Oreki Edition · 在线游戏站

**无限就在一个网址之外。**

[进入游戏：oreki.net](https://oreki.net/) · [中文 Wiki](https://wiki.oreki.net/) · [下载 Android 版](https://github.com/OrekiDawson/AD-Oreki-Edition-Android/releases)

这里是《反物质维度》Oreki Edition 的 Web 游戏发布站。打开浏览器即可开始你的反物质旅程，不需要从这个仓库下载文件或自行编译。

## 为什么还有一个网站仓库？

游戏的开发与网站的交付是两件事：

- [Web 源码仓库](https://github.com/OrekiDawson/AD-Oreki-Edition-Web) 负责玩法、教程、界面和测试。
- 本仓库保存供 GitHub Pages 发布的静态游戏文件，是经过检查的 Web 源码同步结果，不维护第二套游戏逻辑。

如果你想改变游戏，去源码仓库；如果你只是想玩，点击上方的网站链接即可。

## 本地预览

需要 Node.js。在仓库根目录运行：

```bash
node serve.mjs 8080
```

浏览器访问 <http://127.0.0.1:8080/>。预览不代表线上发布或游戏行为已验收。

## 关于存档与反馈

浏览器站点数据可能随设备、浏览器或清理操作而变化。请在迁移或清除数据前备份游戏存档。

游戏机制、界面问题及功能建议请到 [Web Issues](https://github.com/OrekiDawson/AD-Oreki-Edition-Web/issues) 反馈；站点部署问题可在 [本仓 Issues](https://github.com/OrekiDawson/OrekiDawson.github.io/issues) 提交。

维护者请参阅 [部署规则](AGENTS.md) 与 [Web 开发规则](https://github.com/OrekiDawson/AD-Oreki-Edition-Web/blob/main/AGENTS.md)，从已验证的源码同步静态文件并进行线上检查，不在部署副本直接修补游戏功能。

## 来源与许可

感谢 [Antimatter Dimensions](https://github.com/IvarK/AntimatterDimensionsSourceCode) 的作者与贡献者。详细归属见 [NOTICE.md](NOTICE.md)，软件许可见 [LICENSE](LICENSE) 和 [MOD-LICENSE](MOD-LICENSE)。

游戏在浏览器里，故事在下一次重置里。
