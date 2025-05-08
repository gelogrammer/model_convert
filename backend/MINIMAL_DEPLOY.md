# Minimal Deployment Approach

This document explains the minimal deployment approach used for the initial deployment of the Speech Emotion Recognition API to Render.

## Why a Minimal Approach?

The full application has several dependencies that can be challenging to install in a cloud environment:

1. TensorFlow and PyTorch for machine learning
2. Librosa for audio processing
3. Large model files (SER.h5 and ASR.pth)

To ensure a successful initial deployment, we're starting with a minimal version that:

1. Uses only essential Flask dependencies
2. Provides basic API endpoints for health checks
3. Doesn't require the machine learning models

## Files for Minimal Deployment

- `minimal_app.py`: A simplified Flask application with just the essential endpoints
- `requirements.txt`: Reduced to include only the necessary packages
- `Procfile`: Updated to use the minimal app
- `render.yaml`: Configured for the minimal deployment

## Upgrading to Full Deployment

Once the minimal deployment is successful, you can upgrade to the full application by:

1. Adding the TensorFlow and PyTorch dependencies back to requirements.txt
2. Uploading the model files to the models directory
3. Updating the Procfile and render.yaml to use the full app.py
4. Redeploying the application

## Testing the Deployment

The minimal deployment provides the following endpoints:

- `/`: Basic information about the minimal app
- `/api/health`: Health check endpoint

You can use these to verify that the deployment is working correctly before upgrading to the full application. 