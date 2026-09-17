@echo off
cd /d "%~dp0"
if not exist logs mkdir logs

for /f "tokens=1-3 delims=/-. " %%a in ("%date%") do set D=%%a%%b%%c
set T=%time::=%
set T=%T: =0%
set T=%T:.=%
set LOGFILE=logs\prod-%D%-%T%.log

echo ============================================
echo  NinjaNight 生产构建 + 启动
echo ============================================
echo.
echo [1/2] 构建中...
call npm run build
if errorlevel 1 (
  echo.
  echo 构建失败，已退出。
  pause
  exit /b 1
)

echo.
echo [2/2] 启动生产服务... 日志: %LOGFILE%
echo.
powershell -NoProfile -NoExit -Command "npm start 2>&1 | Tee-Object -FilePath '%LOGFILE%'"
