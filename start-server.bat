@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist logs mkdir logs

for /f "tokens=1-3 delims=/-. " %%a in ("%date%") do set D=%%a%%b%%c
set T=%time::=%
set T=%T: =0%
set T=%T:.=%
set LOGFILE=logs\server-%D%-%T%.log

echo Server 鏃ュ織: %LOGFILE%
echo.
powershell -NoProfile -NoExit -Command "chcp 65001 >$null; npm run dev:server 2>&1 | Tee-Object -FilePath '%LOGFILE%' -Encoding utf8"
