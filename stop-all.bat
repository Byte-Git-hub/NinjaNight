@echo off
chcp 65001 >nul

echo 褰撳墠 node 杩涚▼:
tasklist /FI "IMAGENAME eq node.exe" /FO TABLE
echo.

set /p CONFIRM="纭鏉€鎺夋墍鏈?node 杩涚▼锛熶細褰卞搷鍏跺畠 Node 椤圭洰 (Y/N): "
if /i not "%CONFIRM%"=="Y" (
  echo 宸插彇娑?  pause
  exit /b 0
)

taskkill /F /IM node.exe
echo.
echo 瀹屾垚銆?pause
