@echo off
chcp 65001 >nul
cls
echo ============================================================
echo  JCTNT Server - Starting...
echo ============================================================
echo.
echo  [1/3] Checking Python...
python --version
if errorlevel 1 (
    echo  ERROR: Python not found! Install Python 3.10+
    pause
    exit /b 1
)
echo.
echo  [2/3] Checking dependencies...
pip show flask >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Flask not installed!
    echo  Run: pip install -r requirements.txt
    pause
    exit /b 1
)
echo  OK: All dependencies installed
echo.
echo  [3/3] Starting server...
echo ============================================================
echo.
echo  Server running on:
echo   - http://localhost:5000
echo   - http://127.0.0.1:5000
echo.
echo  Press CTRL+C to stop the server
echo ============================================================
echo.

python app.py

echo.
echo ============================================================
echo  Server stopped.
echo ============================================================
pause
