@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Vocab Lab
where node >nul 2>nul
if errorlevel 1 goto nonode
echo.
echo  ===== Vocab Lab 生词本 =====
echo.
echo  电脑上打开:  http://127.0.0.1:5180/index.html
echo  手机 / iPad 打开下面「同网段设备」那一行地址（需要同一个 Wi-Fi）
echo.
echo  关闭这个窗口 = 停止服务
echo.
node tools\serve.js 5180
pause
exit /b
:nonode
echo.
echo  没有找到 Node.js。
echo  电脑上可以直接双击 index.html 使用（Chrome / Edge）。
echo  想让手机访问，请先安装 Node.js: https://nodejs.org
echo.
pause
exit /b
