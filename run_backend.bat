@echo off
echo Starting Speech Emotion Recognition Backend Server...
echo.
echo This will start the server on http://localhost:5001
echo.
echo If you see any errors, make sure:
echo 1. You have Python installed
echo 2. You have installed all requirements (pip install -r backend/requirements.txt)
echo.
cd backend
python run.py
pause 