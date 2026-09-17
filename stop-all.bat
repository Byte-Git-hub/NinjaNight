@echo off

echo 当前 node 进程:
tasklist /FI "IMAGENAME eq node.exe" /FO TABLE
echo.

set /p CONFIRM="确认杀掉所有 node 进程？会影响其它 Node 项目 (Y/N): "
if /i not "%CONFIRM%"=="Y" (
  echo 已取消
  pause
  exit /b 0
)

taskkill /F /IM node.exe
echo.
echo 完成。
pause
