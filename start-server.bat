@echo off
cd /d "%~dp0"
if not exist logs mkdir logs

for /f "tokens=1-3 delims=/-. " %%a in ("%date%") do set D=%%a%%b%%c
set T=%time::=%
set T=%T: =0%
set T=%T:.=%
set LOGFILE=logs\server-%D%-%T%.log

echo Server ÈÕÖ¾: %LOGFILE%
echo.
powershell -NoProfile -NoExit -Command "npm run dev:server 2>&1 | Tee-Object -FilePath '%LOGFILE%'"
