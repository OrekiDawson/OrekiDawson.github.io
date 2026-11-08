// AD: Oreki Edition — 极简本地静态服务器
// 用途：index.html 用 <script type="module"> 加载，浏览器不允许在 file:// 下加载 ES 模块，
//       所以必须通过 http:// 访问。这个脚本不依赖任何 npm 包。
//
// 用法：node serve.mjs [端口]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(ROOT, rel);

  // 防目录穿越
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("找不到文件：" + rel);
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
});

server.on("error", e => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n端口 ${PORT} 已被占用。换个端口试试：node serve.mjs ${PORT + 1}\n`);
  } else {
    console.error(e);
  }
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`\n  AD: Oreki Edition`);
  console.log(`  已经在 ${url} 启动，浏览器会自动打开。`);
  console.log(`  关掉这个窗口即可停止服务器。\n`);
  // 尽量自动打开浏览器；失败也不影响服务
  const cmd = process.platform === "win32" ? `start "" "${url}"`
    : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
});
