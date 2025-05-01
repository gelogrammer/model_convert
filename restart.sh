#!/bin/bash

# Kill existing servers
echo "Stopping existing servers..."
pkill -f "python run.py" || true
pkill -f "npm run dev" || true

# Start backend
echo "Starting backend server..."
cd backend
python run.py &
cd ..

# Wait for backend to initialize
sleep 2

# Start frontend with environment variables
echo "Starting frontend server..."
cd frontend
npm run dev &
cd ..

echo "Both servers restarted!" 