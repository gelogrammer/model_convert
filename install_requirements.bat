@echo off
echo Installing required Python packages for Speech Emotion Recognition...
echo.

pip install -r backend/requirements.txt

echo.
echo Installation complete. Now you can run run_backend.bat to start the server.
pause 