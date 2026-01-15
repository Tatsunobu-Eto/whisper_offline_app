@echo off
setlocal
echo ==========================================
echo   Offline STT System - Initial Setup
echo ==========================================

cd /d %~dp0

:: 1. Check Python installation (Must be 3.10.x for offline wheels)
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not found in your system PATH.
    echo Please install Python 3.10.x before running this setup.
    pause
    exit /b
)

python -c "import sys; exit(0 if sys.version_info[:2] == (3, 10) else 1)"
if %errorlevel% neq 0 (
    echo [ERROR] Python 3.10.x is required for the provided offline packages.
    echo Detected version:
    python --version
    echo Please install Python 3.10.x.
    pause
    exit /b
)

echo.
echo.
echo Step 1: Creating Virtual Environment...
cd app\backend
if not exist ".venv" (
    echo Executing: python -m venv .venv
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b
    )
    echo Virtual environment created.
) else (
    echo Virtual environment already exists. Skipping.
)

echo.
echo.
echo Step 2: Installing dependencies from offline packages...
if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment python.exe not found.
    pause
    exit /b
)

:: Use the venv python directly and ensure --no-index is used to stay offline
.venv\Scripts\python.exe -m pip install --no-index --find-links=..\..\offline_packages -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b
)

echo.
echo Step 3: Frontend is already bundled with node_modules.
echo No additional frontend installation needed for offline use.

echo.
echo Step 4: Verifying installation...
.venv\Scripts\python.exe -c "import faster_whisper; print('Faster-Whisper OK')"
.venv\Scripts\python.exe -c "import fastapi; print('FastAPI OK')"

echo.
echo ==========================================
echo   Setup completed successfully!
echo   You can now use start.bat to run.
echo ==========================================
pause
exit /b
