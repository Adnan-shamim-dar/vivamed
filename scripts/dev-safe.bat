@echo off
REM Safe development wrapper for Windows: Kill old processes, verify port free, then start dev server

setlocal enabledelayedexpansion
set PORT=9997
set MAX_WAIT=20
set ELAPSED=0

echo 🧹 Starting safe dev server...
echo.

REM Step 1: Kill ALL Node processes
echo 🛑 Step 1: Killing all Node.js processes...
taskkill /F /IM node.exe /T 2>nul
taskkill /F /IM nodemon.exe /T 2>nul
timeout /t 2 /nobreak >nul

REM Step 2: Force kill any stragglers holding the port
echo 🔓 Step 2: Forcing port %PORT% to release...
:wait_loop
netstat -ano | findstr :%PORT% >nul 2>&1
if !errorlevel! equ 0 (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr :%PORT%') do (
    taskkill /PID %%A /F 2>nul
  )
  timeout /t 1 /nobreak >nul
  set /a ELAPSED=!ELAPSED!+1
  if !ELAPSED! lss %MAX_WAIT% goto wait_loop
)

REM Step 3: Verify port is free
timeout /t 2 /nobreak >nul
netstat -ano | findstr :%PORT% >nul 2>&1
if !errorlevel! equ 0 (
  echo ❌ ERROR: Port %PORT% is still in use!
  echo Try: netstat -ano ^| findstr :%PORT%
  exit /b 1
)
echo ✅ Port %PORT% is now free
echo.

REM Step 4: Start dev server
echo 🚀 Step 4: Starting dev server with nodemon...
cd /d "%~dp0\.."
call npm run dev
