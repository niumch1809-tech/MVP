@echo off
setlocal
cd /d "%~dp0"
echo Starting AI Cost Audit MVP on http://localhost:3000/
echo Keep this window open while using the site.
echo.
"C:\Program Files\nodejs\npm.cmd" run dev
pause
