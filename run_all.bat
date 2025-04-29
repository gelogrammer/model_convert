@echo off
echo Starting Speech Emotion Recognition Application...
echo.
echo This will start both the backend and frontend servers.
echo.

REM Check if Python is installed
where python >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Python is not installed or not in PATH. Please install Python and try again.
    goto :error
)

REM Check if Node.js is installed
where node >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Node.js is not installed or not in PATH. Please install Node.js and try again.
    goto :error
)

REM Check that required model files exist
if not exist "backend\models\SER.h5" (
    echo SER.h5 model file not found in backend\models directory
    echo Copying from root directory if available...
    
    if exist "SER.h5" (
        mkdir backend\models 2>nul
        copy SER.h5 backend\models\
        echo Copied SER.h5 to backend\models
    ) else (
        echo Please ensure SER.h5 exists in the project root or backend\models directory
        goto :error
    )
)

if not exist "backend\models\ASR.pth" (
    echo ASR.pth model file not found in backend\models directory
    echo Copying from root directory if available...
    
    if exist "ASR.pth" (
        mkdir backend\models 2>nul
        copy ASR.pth backend\models\
        echo Copied ASR.pth to backend\models
    ) else (
        echo Please ensure ASR.pth exists in the project root or backend\models directory
        goto :error
    )
)

REM Check backend dependencies using our Python script
echo Running dependency check...
cd backend
python check_dependencies.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Dependency check failed. Please fix the issues reported above.
    echo If you need to install dependencies, run: pip install -r requirements.txt
    cd ..
    goto :error
)
cd ..

REM Check npm dependencies
echo Checking frontend dependencies...
cd frontend
if not exist "node_modules" (
    echo Installing frontend dependencies...
    npm install
    if %ERRORLEVEL% NEQ 0 (
        echo Failed to install frontend dependencies. Please run 'npm install' in the frontend directory manually.
        cd ..
        goto :error
    )
)
cd ..

REM Try starting backend with port check
echo Checking if port 5001 is available...
powershell -Command "$portInUse = Get-NetTCPConnection -LocalPort 5001 -ErrorAction SilentlyContinue; if ($portInUse) { Write-Host 'Warning: Port 5001 is already in use. The backend server may not start properly.' }"

REM Start backend server in a new window with visible output
echo Starting backend server...
start "SER Backend" cmd /k "cd backend && python run.py"

REM Wait for backend to initialize
echo Waiting for backend to initialize (15 seconds)...
timeout /t 15 /nobreak > nul

REM Check if backend is running by attempting a connection
powershell -Command "try { $response = Invoke-WebRequest -Uri http://localhost:5001/api/health -TimeoutSec 2; Write-Host 'Backend server is running!' } catch { Write-Host 'Warning: Backend server is not responding. Check the backend window for errors.' }"

REM Start frontend server in a new window
echo Starting frontend server...
start "SER Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Application started!
echo.
echo Backend: http://localhost:5001
echo Frontend: http://localhost:3000
echo.
echo If you're seeing connection errors in the frontend:
echo 1. Make sure the backend server window shows "Starting Speech Emotion Recognition backend server..."
echo 2. Check the backend window for any Python errors
echo 3. Ensure port 5001 is not being used by another application
echo 4. Try running the backend and frontend separately with:
echo    - run_backend.bat
echo    - run_frontend.bat
echo.
echo Close this window to stop all servers.
echo.

REM Keep this window open to keep child processes alive
pause
exit /b 0

:error
echo.
echo Failed to start application!
pause
exit /b 1 