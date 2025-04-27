# Railway Deployment Guide

This guide provides instructions for deploying the Speech Emotion Recognition backend to Railway.

## Fixed Issues

The following issues have been fixed in the codebase to make it compatible with Railway:

1. **PyAudio Dependency**: Removed as it requires system-level dependencies not available in cloud environments.
2. **Large ML Libraries**: Using smaller CPU-only versions of TensorFlow and PyTorch.
3. **Audio Processing**: Updated to use SoundFile as a fallback when PyAudio is not available.
4. **Gunicorn Configuration**: Updated Procfile to correctly use the Socket.IO application.
5. **Application Structure**: Fixed to expose the correct application object for Gunicorn.

## Deployment Steps

1. **Push the code to your GitHub repository**
   Make sure all the fixed files are committed and pushed.

2. **Create a new Railway project**
   - Sign up/login to [Railway](https://railway.app/)
   - Create a new project from GitHub
   - Select your repository
   - Choose "Deploy from GitHub"

3. **Configure the deployment**
   - Root Directory: `backend`
   - Environment: Python
   - Build Command: `pip install -r requirements.txt`
   - Start Command: (leave as is, it will use the Procfile)

4. **Set environment variables**
   - Click on the "Variables" tab
   - Add the following variables:
     - `PORT`: `5000` (or let Railway set it)
     - `DEBUG`: `false`

5. **Deploy**
   - Click "Deploy" and wait for the build to complete

## Verifying the Deployment

1. **Check build logs**
   - Review the logs to make sure there are no errors during the build process
   - Verify that all dependencies were installed correctly

2. **Test the backend API**
   - Get your Railway domain from the "Settings" tab
   - Test the health endpoint: `https://<your-railway-domain>/api/health`
   - It should return: `{"status": "ok", "message": "Speech Emotion Recognition API is running"}`

3. **Connect your frontend**
   - Update your Cloudflare Pages environment variable:
     - In Cloudflare Pages dashboard, set `VITE_BACKEND_URL` to your Railway domain

## Troubleshooting

If you encounter issues:

1. **Check logs for specific error messages**
   - Railway provides detailed logs for build and runtime errors

2. **Memory issues**
   - If the app crashes due to memory limits, consider upgrading your Railway plan
   - The ML models require significant memory

3. **CORS issues**
   - Make sure your Railway domain is added to the CORS origins in app.py

4. **WebSocket connection issues**
   - Verify that Railway is correctly handling WebSocket connections
   - Check browser console for connection errors 