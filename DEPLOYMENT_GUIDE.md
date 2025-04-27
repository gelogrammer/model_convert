# Deployment Guide for Speech Emotion Recognition App

This guide will help you deploy your Speech Emotion Recognition application.

## Current Status

- ✅ Frontend deployed to Cloudflare Pages: https://a3f65a7b.talktwanalyzer.pages.dev
- ⚠️ Backend still needs to be deployed to a compatible service

## Deployment Architecture

This application consists of two parts:
1. **Frontend**: React + Vite application (deployed to Cloudflare Pages)
2. **Backend**: Flask + Socket.IO application with ML models (needs a Python-compatible host)

## Frontend Deployment (Completed)

The frontend has been successfully deployed to Cloudflare Pages:

1. Built with: `npm run build`
2. Deployed with: `wrangler pages deploy dist`
3. URL: https://a3f65a7b.talktwanalyzer.pages.dev

## Backend Deployment Options

Since the backend uses WebSockets, TensorFlow, and PyTorch, it needs to be deployed to a service that supports these technologies. Cloudflare Workers is not suitable for this type of backend.

### Option 1: Railway (Recommended)

1. Create an account at [Railway](https://railway.app/)
2. Create a new project from GitHub:
   - Connect your GitHub repository
   - Select the repository
   - Configure the deployment settings:
     - Root Directory: `backend`
     - Build Command: `pip install -r requirements.txt`
     - Start Command: `gunicorn run:app --worker-class eventlet -w 1 --log-file -`

3. Set environment variables:
   - `PORT`: 5000
   - `DEBUG`: false

4. After deployment, get your domain from the Railway dashboard

### Option 2: Render

1. Create an account at [Render](https://render.com/)
2. Create a new Web Service:
   - Connect your repository
   - Configure the service:
     - Name: `speech-emotion-recognition-backend`
     - Root Directory: `backend`
     - Build Command: `pip install -r requirements.txt`
     - Start Command: `gunicorn run:app --worker-class eventlet -w 1 --log-file -`

3. Set environment variables:
   - `PORT`: 5000
   - `DEBUG`: false

### Option 3: Self-Hosting

If you prefer to self-host:

1. Set up a server with Python 3.10
2. Install dependencies: `pip install -r requirements.txt`
3. Run with gunicorn: `gunicorn run:app --worker-class eventlet -w 1 --bind 0.0.0.0:5000`
4. Use a reverse proxy like Nginx to handle HTTPS and WebSocket connections

## Connecting Frontend to Backend

After deploying the backend, you need to update the frontend to use the backend URL:

1. In the Cloudflare Pages dashboard:
   - Go to your project (talktwanalyzer)
   - Navigate to Settings > Environment variables
   - Add `VITE_BACKEND_URL` with your backend URL (e.g., https://your-backend.railway.app)

2. Trigger a new deployment of your frontend

## Handling Model Files

Your model files (SER.h5 and ASR.pth) are quite large. You have two options:

1. **Include with deployment** (simpler but may slow down deployment)
   - Keep them in your repository
   - They'll be deployed with your code

2. **Use cloud storage** (more complex but better for deployment)
   - Upload models to S3/Cloudflare R2/etc.
   - Modify backend code to download on startup

## Troubleshooting

- **WebSocket Connection Issues**: Ensure your hosting provider supports WebSockets
- **CORS Errors**: Make sure backend CORS settings include your Cloudflare Pages URL
- **Model Loading Errors**: Check if your hosting platform has enough memory for models

## Next Steps

1. Deploy the backend using one of the options above
2. Update the frontend environment variables with your backend URL
3. Test the complete application 