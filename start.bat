@echo off
REM AI Medical Viva Trainer - Windows Launch Script
echo.
echo 🏥 Starting AI Medical Viva Trainer...
echo.

REM Check if node_modules exists
if not exist "node_modules" (
  echo 📦 Installing dependencies...
  call npm install
)

REM Check if data directory exists
if not exist "data" (
  echo 📁 Creating data directory...
  mkdir data
)

echo.
echo ✅ Starting server on http://localhost:5001
echo 📝 Press Ctrl+C to stop
echo.

npm start

pause
