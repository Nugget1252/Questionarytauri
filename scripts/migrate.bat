@echo off
echo ============================================================
echo Google Drive to GitHub Releases Migration Tool
echo ============================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not installed or not in PATH!
    echo Please install Python from https://www.python.org/downloads/
    pause
    exit /b 1
)

echo Installing dependencies...
python -m pip install gdown requests -q

echo.
echo Running migration script...
echo.
python "%~dp0migrate_to_github.py" %*

echo.
pause
