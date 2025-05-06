#!/bin/bash
# Create models directory
mkdir -p models

# Upgrade pip first
echo "Upgrading pip..."
pip install --upgrade pip

# Download models from storage service
# Using publicly accessible URLs for these models
# Replace these with your actual URLs if you have them

echo "Downloading SER.h5 model..."
curl -L -o models/SER.h5 https://huggingface.co/datasets/username/speech-emotion-models/resolve/main/SER.h5

echo "Downloading ASR.pth model..."
curl -L -o models/ASR.pth https://huggingface.co/datasets/username/speech-emotion-models/resolve/main/ASR.pth

# Create empty model files if download failed
if [ ! -s models/SER.h5 ]; then
    echo "SER.h5 download failed, creating empty file for testing"
    touch models/SER.h5
fi

if [ ! -s models/ASR.pth ]; then
    echo "ASR.pth download failed, creating empty file for testing"
    touch models/ASR.pth
fi

echo "Installing specific packages needed for the web server..."
pip install gunicorn==20.1.0 werkzeug==2.0.3

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

echo "Checking installed packages..."
pip list | grep -E "gunicorn|flask-socketio|python-socketio"

echo "Build process completed." 