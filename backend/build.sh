#!/bin/bash
# Create models directory
mkdir -p models

# Download models from storage service
# Using publicly accessible URLs for these models
# Replace these with your actual URLs if you have them

echo "Downloading SER.h5 model..."
curl -L -o models/SER.h5 https://huggingface.co/datasets/username/speech-emotion-models/resolve/main/SER.h5

echo "Downloading ASR.pth model..."
curl -L -o models/ASR.pth https://huggingface.co/datasets/username/speech-emotion-models/resolve/main/ASR.pth

echo "Installing requirements..."
pip install -r requirements.txt

echo "Build process completed." 