@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist logs mkdir logs

for /f "tokens=1-3 delims=/-. " %%a in ("%date%") do set D=%%a%%b%%c
set T=%time::=%
set T=%T: =0%
set T=%T:.=%

echo ============================================
echo  NinjaNight 寮€鍙戠幆澧冧竴閿惎鍔?echo ============================================
echo 鏃堕棿鎴? %D%-%T%
echo.

netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
  echo [璺宠繃] :3000 宸茶鍗犵敤
) else (
  echo [鍚姩] Server...
  start "NinjaNight-Server" powershell -NoProfile -NoExit -Command "chcp 65001 >$null; npm run dev:server 2>&1 | Tee-Object -FilePath 'logs/server-%D%-%T%.log' -Encoding utf8"
  timeout /t 2 /nobreak >nul
)

netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul
if %errorlevel%==0 (
  echo [璺宠繃] :5173 宸茶鍗犵敤
) else (
  echo [鍚姩] Client...
  start "NinjaNight-Client" powershell -NoProfile -NoExit -Command "chcp 65001 >$null; npm run dev 2>&1 | Tee-Object -FilePath 'logs/client-%D%-%T%.log' -Encoding utf8"
)

echo.
echo 鍚姩瀹屾垚銆傝闂? http://localhost:5173
echo 鏃ュ織鐩綍: logs\
echo.
timeout /t 3 /nobreak >nul
