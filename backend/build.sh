#!/bin/bash
# Create models directory
mkdir -p models

# Upgrade pip first
echo "Upgrading pip..."
pip install --upgrade pip

# Create empty model files for testing
echo "Creating placeholder model files..."
touch models/SER.h5
touch models/ASR.pth

echo "Installing specific packages needed for the web server..."
pip install gunicorn==20.1.0 werkzeug==2.0.3 eventlet==0.33.3

echo "Installing requirements..."
pip install -r requirements.txt

# Verify gunicorn installation
if ! command -v gunicorn &> /dev/null; then
    echo "Gunicorn not found, installing directly..."
    pip install gunicorn==20.1.0
fi

# Double check Werkzeug version to ensure compatibility
echo "Checking Werkzeug version..."
pip list | grep Werkzeug

# Make sure eventlet is installed
echo "Ensuring eventlet is installed..."
pip install eventlet==0.33.3 --force-reinstall

echo "Checking installed packages..."
pip list | grep -E "gunicorn|flask-socketio|python-socketio|eventlet"

echo "Build process completed." 