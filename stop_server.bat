@echo off
chcp 65001 >nul
echo ============================================================
echo  JCTNT Server - Stopping...
echo ============================================================
echo.

:: Find PID listening on port 5000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    set PID=%%a
)

if not defined PID (
    echo  No process found on port 5000.
    echo  Server is already stopped or running on a different port.
    goto end
)

echo  Found process on port 5000 ^(PID: %PID%^)
taskkill /F /PID %PID% >nul 2>&1

if errorlevel 1 (
    echo  ERROR: Could not stop process %PID%. Try running as Administrator.
) else (
    echo  Server stopped successfully.
)

:end
echo.
echo ============================================================
pause
