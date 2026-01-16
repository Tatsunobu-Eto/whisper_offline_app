@echo off
setlocal

set "PATH=%~dp0app\backend\cuBLAS.and.cuDNN_CUDA12_win_v3;%PATH%"

echo ==========================================
echo   Offline STT System - Web Launcher
echo ==========================================

cd /d %~dp0

set VENV_PYTHON=app\backend\.venv\Scripts\python.exe
set APP_MAIN=main.py

if not exist "%VENV_PYTHON%" (
    echo [ERROR] Virtual environment not found. 
    echo Please run 'setup.bat' first to initialize the environment.
    pause
    exit /b
)

echo.
echo Step 1: Starting Backend Server...
cd app\backend
:: Run backend in a separate window
start "STT Backend" ".venv\Scripts\python.exe" "%APP_MAIN%"
cd ..\..

echo Step 2: Starting Frontend (Web)...
cd app\frontend
:: Run frontend in a separate window
start "STT Frontend" cmd /k "npm run dev"
cd ..\..

echo Step 3: Opening Browser...
:: Wait a bit for Vite to start
timeout /t 3 >nul
start http://localhost:5173

echo.
echo ==========================================
echo   System started successfully!
echo   Web Interface: http://localhost:5173
echo ==========================================
pause
exit /b
