@echo off
echo Starting Speech Emotion Recognition Backend Server...
echo.
echo This will start the server on http://localhost:5001
echo.

REM Check if Python is installed
where python >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Error: Python is not installed or not in PATH. Please install Python and try again.
    goto :error
)

REM Check if required model files exist in models directory
if not exist "models\SER.h5" (
    echo SER.h5 model file not found in models directory
    
    REM Check if model exists in parent directory
    if exist "..\SER.h5" (
        echo Copying SER.h5 from parent directory...
        mkdir models 2>nul
        copy ..\SER.h5 models\
        echo Copied SER.h5 to models directory
    ) else (
        echo Error: SER.h5 model file not found. Please ensure it exists in the backend/models directory.
        goto :error
    )
)

if not exist "models\ASR.pth" (
    echo ASR.pth model file not found in models directory
    
    REM Check if model exists in parent directory
    if exist "..\ASR.pth" (
        echo Copying ASR.pth from parent directory...
        mkdir models 2>nul
        copy ..\ASR.pth models\
        echo Copied ASR.pth to models directory
    ) else (
        echo Error: ASR.pth model file not found. Please ensure it exists in the backend/models directory.
        goto :error
    )
)

REM Check if port 5001 is already in use
powershell -Command "$portInUse = Get-NetTCPConnection -LocalPort 5001 -ErrorAction SilentlyContinue; if ($portInUse) { Write-Host 'Warning: Port 5001 is already in use by another application. The server may not start properly.' }"

REM Check dependencies
echo Running dependency check...
python check_dependencies.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Dependency check failed. Please fix the issues reported above.
    echo.
    echo Try installing dependencies with:
    echo pip install -r requirements.txt
    goto :error
)

echo All checks passed. Starting backend server...
echo.
python run.py

goto :end

:error
echo.
echo Failed to start backend server. Please fix the issues above and try again.
pause
exit /b 1

:end
pause
exit /b 0 