# Deploying Your Application to Render

This guide provides detailed instructions for deploying both the backend (Python Flask) and frontend (React) components of your Speech Emotion Recognition application to Render.com.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Backend Deployment](#backend-deployment)
3. [Frontend Deployment](#frontend-deployment)
4. [Environment Variables](#environment-variables)
5. [Handling ML Models](#handling-ml-models)
6. [Socket.IO Configuration](#socketio-configuration)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

- A [Render.com](https://render.com) account
- Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)
- Your project structure with separate backend and frontend directories
- ML models (SER.h5 and ASR.pth) accessible for deployment

## Backend Deployment

The backend is a Python Flask application with Socket.IO that will be deployed as a Web Service on Render.

### Steps:

1. **Log in to Render**
   - Go to [dashboard.render.com](https://dashboard.render.com)
   - Sign in with your account

2. **Create a New Web Service**
   - Click on "New" from the dashboard
   - Select "Web Service"

3. **Connect Your Repository**
   - Connect your GitHub/GitLab/Bitbucket account if not already done
   - Select the repository containing your application

4. **Configure the Web Service**
   - Name: `speech-emotion-recognition-backend` (or choose your own name)
   - Root Directory: `backend` (since your backend code is in this folder)
   - Environment: `Python 3`
   - Region: Choose the closest to your expected users
   - Branch: `main` (or your default branch)
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app --worker-class eventlet --workers 1 --timeout 120`
   - Select plan: At least 1GB RAM for ML models (Standard plan or higher)

5. **Set Environment Variables**
   - Scroll down to the "Environment" section
   - Add all the environment variables from your `.env` file
   - Add `PYTHON_VERSION=3.9.18` to ensure compatibility

6. **Advanced Options**
   - Click "Advanced" and add the following:
   - Health Check Path: `/api/health`
   - Auto-Deploy: Enable if you want automatic deployments on git push

7. **Deploy**
   - Click "Create Web Service"
   - Render will start the build and deployment process, which may take several minutes
   - Render will provide a URL like `https://speech-emotion-recognition-backend.onrender.com`

## Frontend Deployment

The frontend is a React/TypeScript application built with Vite that will be deployed as a Static Site on Render.

### Steps:

1. **Log in to Render**
   - Go to [dashboard.render.com](https://dashboard.render.com)
   - Sign in with your account

2. **Create a New Static Site**
   - Click on "New" from the dashboard
   - Select "Static Site"

3. **Connect Your Repository**
   - Select the same repository as before

4. **Configure the Static Site**
   - Name: `speech-emotion-recognition-frontend` (or choose your own name)
   - Root Directory: `frontend` (since your frontend code is in this folder)
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist` (where Vite outputs the built files)
   - Select an appropriate plan (the free plan works for static sites)

5. **Set Environment Variables**
   - Add any environment variables needed for the build
   - **IMPORTANT**: Add `VITE_API_URL=https://your-backend-url.onrender.com` (replace with your actual backend URL)
   - If any other variables from your `.env` file are needed, add them with the `VITE_` prefix

6. **Deploy**
   - Click "Create Static Site"
   - Render will start the build and deployment process
   - Render will provide a URL like `https://speech-emotion-recognition-frontend.onrender.com`

## Environment Variables

### Backend Environment Variables
Make sure to set these in the Render dashboard for your backend service:

```
FLASK_ENV=production
PORT=10000
TRANSFORMERS_API_KEY=your_huggingface_token (if applicable)
```

Add any other variables from your `.env` file that the application requires.

### Frontend Environment Variables
For the frontend build, set these in the Render dashboard:

```
VITE_API_URL=https://your-backend-url.onrender.com
```

## Handling ML Models

Your application uses two ML models: `SER.h5` (for emotion recognition) and `ASR.pth` (for speech recognition). There are several approaches to handle these during deployment:

### Option 1: Include Models in Git Repository (Recommended for Smaller Models)

If your models are small enough (< 100MB combined), include them in your Git repository in the `backend/models/` directory.

### Option 2: Download Models During Build (Recommended for Larger Models)

For larger models, create a `build.sh` script in your backend directory:

```bash
#!/bin/bash
# Create models directory
mkdir -p models

# Download models from a storage service (example using wget)
wget -O models/SER.h5 https://your-storage-service.com/path-to-SER.h5
wget -O models/ASR.pth https://your-storage-service.com/path-to-ASR.pth

# Install requirements
pip install -r requirements.txt
```

Then set your build command to:
```
chmod +x build.sh && ./build.sh
```

### Option 3: Use Persistent Disk

For very large models, consider using Render's Persistent Disk option (available on higher-tier plans).

## Socket.IO Configuration

Your application uses Socket.IO for real-time communication. To ensure it works correctly on Render:

1. **Backend Configuration**:
   - Make sure to use `eventlet` as the worker class for Gunicorn (as specified in the start command)
   - The Socket.IO server must be configured with correct CORS settings

2. **Update CORS Settings in Your Code**:
   ```python
   # In app.py, update your CORS configuration:
   CORS(app, origins=["https://your-frontend-url.onrender.com"])
   
   # And update Socket.IO CORS settings:
   socketio = SocketIO(app, cors_allowed_origins=["https://your-frontend-url.onrender.com"], async_mode='eventlet')
   ```

3. **Frontend Configuration**:
   - Make sure your Socket.IO client points to the correct backend URL:
   ```typescript
   const socket = io(import.meta.env.VITE_API_URL, {
     path: '/socket.io',
     transports: ['websocket']
   });
   ```

## Troubleshooting

### Common Backend Issues

1. **Dependencies Not Installing**
   - Check if your `requirements.txt` has the correct versions
   - TensorFlow and PyTorch can be problematic; consider using CPU-only versions to reduce size

2. **Application Not Starting**
   - Check the logs in the Render dashboard
   - Make sure you're using the correct Gunicorn worker class (eventlet)
   - If you see "Address already in use" errors, adjust your Socket.IO configuration

3. **Model Loading Problems**
   - Check file paths in your code (`models/SER.h5` and `models/ASR.pth`)
   - Ensure models are properly uploaded or downloaded during build
   - Consider a higher plan with more RAM if facing memory issues (2GB+ recommended)

4. **Socket.IO Connection Issues**
   - Check CORS settings in both backend and frontend
   - Try forcing WebSocket transport in the frontend client
   - Ensure your Socket.IO client version matches the server version

### Common Frontend Issues

1. **Build Failures**
   - Check the build logs in the Render dashboard
   - Ensure all dependencies are correctly specified in package.json
   - Fix any TypeScript or linting errors

2. **API Connection Issues**
   - Verify the `VITE_API_URL` is set correctly
   - Check for any hardcoded localhost URLs in your code
   - Ensure you're using HTTPS for both frontend and backend

3. **Socket.IO Not Connecting**
   - Check browser console for connection errors
   - Verify the Socket.IO URL is correct and using HTTPS
   - Try different transport options if WebSocket fails

---

## Additional Resources

- [Render Documentation for Web Services](https://render.com/docs/web-services)
- [Render Documentation for Static Sites](https://render.com/docs/static-sites)
- [Deploying a Flask Application on Render](https://render.com/docs/deploy-flask)
- [Socket.IO Documentation](https://socket.io/docs/v4/) 