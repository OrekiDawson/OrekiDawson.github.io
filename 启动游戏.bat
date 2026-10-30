@echo off
chcp 65001 >nul
cd /d "%~dp0"
title AD: Oreki Edition

echo.
echo   AD: Oreki Edition
echo   ----------------------------------------
echo   正在启动本地服务器...
echo.

where node >nul 2>nul
if %errorlevel%==0 (
    node serve.mjs 8080
    goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "" http://127.0.0.1:8080/
    python -m http.server 8080 --bind 127.0.0.1
    goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
    start "" http://127.0.0.1:8080/
    py -m http.server 8080 --bind 127.0.0.1
    goto :eof
)

echo   没找到 Node.js 或 Python。
echo.
echo   这个游戏必须通过 http:// 打开（浏览器不允许 file:// 加载 ES 模块），
echo   所以需要一个本地静态服务器。任选一种：
echo.
echo     1) 安装 Node.js（https://nodejs.org），然后双击本文件
echo     2) 安装 Python（https://python.org），然后双击本文件
echo     3) 用 VS Code 的 Live Server 插件打开 index.html
echo.
pause
