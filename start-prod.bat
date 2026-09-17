@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist logs mkdir logs

for /f "tokens=1-3 delims=/-. " %%a in ("%date%") do set D=%%a%%b%%c
set T=%time::=%
set T=%T: =0%
set T=%T:.=%
set LOGFILE=logs\prod-%D%-%T%.log

echo ============================================
echo  NinjaNight 鐢熶骇鏋勫缓 + 鍚姩
echo ============================================
echo.
echo [1/2] 鏋勫缓涓?..
call npm run build
if errorlevel 1 (
  echo.
  echo 鏋勫缓澶辫触锛屽凡閫€鍑恒€?  pause
  exit /b 1
)

echo.
echo [2/2] 鍚姩鐢熶骇鏈嶅姟... 鏃ュ織: %LOGFILE%
echo.
powershell -NoProfile -NoExit -Command "chcp 65001 >$null; npm start 2>&1 | Tee-Object -FilePath '%LOGFILE%' -Encoding utf8"
