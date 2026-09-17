@echo off
cd /d "%~dp0"
if not exist logs mkdir logs

for /f "tokens=1-3 delims=/-. " %%a in ("%date%") do set D=%%a%%b%%c
set T=%time::=%
set T=%T: =0%
set T=%T:.=%

echo ============================================
echo  NinjaNight 开发环境一键启??echo ============================================
echo 时间?? %D%-%T%
echo.

netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
  echo [跳过] :3000 已被占用
) else (
  echo [启动] Server...
  start "NinjaNight-Server" powershell -NoProfile -NoExit -Command "chcp 65001 >$null; npm run dev:server 2>&1 | Tee-Object -FilePath 'logs/server-%D%-%T%.log' -Encoding utf8"
  timeout /t 2 /nobreak >nul
)

netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
  echo [跳过] :5173 已被占用
) else (
  echo [启动] Client...
  start "NinjaNight-Client" powershell -NoProfile -NoExit -Command "chcp 65001 >$null; npm run dev 2>&1 | Tee-Object -FilePath 'logs/client-%D%-%T%.log' -Encoding utf8"
)

echo.
echo 启动完成。访?? http://localhost:5173
echo 日志目录: logs\
echo.
timeout /t 3 /nobreak >nul
