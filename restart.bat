@echo off
echo Stopping existing servers...
taskkill /F /IM python.exe /T 2>NUL
taskkill /F /IM node.exe /T 2>NUL

echo Starting backend server...
start cmd /k "cd backend && python run.py"

echo Waiting for backend to initialize...
timeout /t 2 /nobreak > NUL

echo Starting frontend server...
start cmd /k "cd frontend && npm run dev"

echo Both servers restarted! 