@echo off
echo Starting Real-Time Speech Emotion Recognition Application...
echo.
echo This version includes enhanced real-time feedback and visualization.
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
echo Tips for best results:
echo - Use a good quality microphone
echo - Speak clearly and naturally
echo - Watch the audio visualization to ensure your voice is being detected
echo - The green "Speaking" indicator should appear when you talk
echo.
echo Press any key to exit this window...
pause 