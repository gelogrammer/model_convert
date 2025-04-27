@echo off
echo Starting Speech Emotion Recognition Application...
echo.
echo This will start both the backend and frontend servers.
echo.
echo 1. Starting backend server in a new window...
start cmd /k run_backend.bat
echo.
echo 2. Starting frontend server in a new window...
start cmd /k run_frontend.bat
echo.
echo Application started! The frontend should open in your browser shortly.
echo If it doesn't, please go to http://localhost:3000 manually.
echo.
echo Press any key to exit this window...
pause 