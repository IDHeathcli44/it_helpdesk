@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo IT HelpDesk Node.js
if not exist node_modules\multer (
  echo Installing or updating dependencies...
  call npm.cmd install --registry=https://registry.npmjs.org/
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting server...
call npm.cmd start
pause
