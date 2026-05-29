@echo off
echo ==========================================
echo  Landmark Smart Route Planner - Startup
echo ==========================================
echo.

REM === STEP 1: Start MongoDB (detached) ===
echo [1/2] Starting MongoDB (detached from this window)...
set MONGOD_PATH=C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe
set DATA_DIR=%USERPROFILE%\mongodb-data
set LOG_FILE=%DATA_DIR%\mongod.log

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

REM Kill any old mongod processes
taskkill /F /IM mongod.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM Launch mongod as a completely detached process using wmic
wmic process call create "\"%MONGOD_PATH%\" --dbpath \"%DATA_DIR%\" --logpath \"%LOG_FILE%\" --logappend --port 27017 --bind_ip 127.0.0.1" >nul 2>&1

echo [1/2] MongoDB starting (check %LOG_FILE% for details)
echo [1/2] Waiting 10 seconds for MongoDB to be ready...
timeout /t 10 /nobreak >nul
echo [1/2] MongoDB should now be ready!
echo.

REM === STEP 2: Start Dev Servers ===
echo [2/2] Starting Landmark Dev Servers (Frontend + Backend)...
echo [2/2] Frontend: http://localhost:5173
echo [2/2] Backend:  http://localhost:5000
echo.
npm run dev
