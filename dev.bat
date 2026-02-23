@echo off
:: Qualys2Human - Dev Server Manager
:: Usage: dev.bat [start|stop|restart|status]

if "%~1"=="" goto :help
if /i "%~1"=="start" goto :start
if /i "%~1"=="stop" goto :stop
if /i "%~1"=="restart" goto :restart
if /i "%~1"=="status" goto :status
goto :help

:start
    echo [Q2H] Starting dev servers...
    echo.
    :: Start backend in its own window
    start "Q2H-Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn q2h.main:app --host 127.0.0.1 --port 8000 --reload"
    :: Start frontend in its own window
    start "Q2H-Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
    echo [Q2H] Servers starting...
    echo.
    echo   Backend  : http://127.0.0.1:8000
    echo   API docs : http://127.0.0.1:8000/docs
    echo   Frontend : http://localhost:3000
    echo.
    echo   Two windows opened: "Q2H-Backend" and "Q2H-Frontend"
    echo   Use: dev.bat stop  to close both
    goto :eof

:stop
    echo [Q2H] Stopping dev servers...
    taskkill /FI "WINDOWTITLE eq Q2H-Backend*" /T /F >nul 2>&1
    taskkill /FI "WINDOWTITLE eq Q2H-Frontend*" /T /F >nul 2>&1
    echo [Q2H] Stopped.
    goto :eof

:restart
    call :stop
    timeout /t 2 /nobreak >nul
    call :start
    goto :eof

:status
    echo.
    tasklist /FI "WINDOWTITLE eq Q2H-Backend*" 2>nul | find "cmd" >nul
    if %errorlevel% equ 0 (
        echo   [backend]  Running
    ) else (
        echo   [backend]  Stopped
    )
    tasklist /FI "WINDOWTITLE eq Q2H-Frontend*" 2>nul | find "cmd" >nul
    if %errorlevel% equ 0 (
        echo   [frontend] Running
    ) else (
        echo   [frontend] Stopped
    )
    echo.
    goto :eof

:help
    echo.
    echo   Qualys2Human Dev Server
    echo.
    echo   Usage: dev.bat [command]
    echo.
    echo     start    Start backend + frontend (each in its own window)
    echo     stop     Stop everything
    echo     restart  Restart everything
    echo     status   Show running status
    echo.
    goto :eof
