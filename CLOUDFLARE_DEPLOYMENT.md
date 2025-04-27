# Deploying to Cloudflare

This guide explains how to deploy your Speech Emotion Recognition application to Cloudflare.

## Overview

The deployment consists of two parts:
1. Frontend - deployed to Cloudflare Pages
2. Backend - deployed to another service (due to WebSocket and ML requirements)

## Frontend Deployment (Cloudflare Pages)

### Prerequisites
- A Cloudflare account
- Node.js and npm installed locally
- Cloudflare CLI (Wrangler) installed: `npm install -g wrangler`

### Steps

1. **Login to Cloudflare**
   ```
   wrangler login
   ```

2. **Update environment variables**
   - Edit `.env.production` to set your backend URL
   - Make sure your backend URL is the public URL where your backend is deployed

3. **Build and deploy**
   ```
   cd frontend
   npm run build
   wrangler pages deploy dist
   ```

4. **Configure environment variables in Cloudflare Dashboard**
   - Navigate to your Cloudflare Pages project
   - Go to Settings > Environment variables
   - Add `VITE_BACKEND_URL` with your backend URL

## Backend Deployment

Since the backend uses WebSockets, TensorFlow, and other requirements that don't work well on Cloudflare Workers, it should be deployed to a service like:

### Options for Backend Deployment:
1. **Railway.app** - Supports Python and WebSockets
2. **Render.com** - Good support for Python apps
3. **Heroku** - Classic option for Flask applications
4. **DigitalOcean App Platform** - Full support for WebSockets

### Example: Deploying to Railway

1. **Sign up for Railway**
   - Create an account at [railway.app](https://railway.app)

2. **Install Railway CLI**
   ```
   npm i -g @railway/cli
   ```

3. **Login to Railway**
   ```
   railway login
   ```

4. **Initialize Railway project**
   ```
   cd backend
   railway init
   ```

5. **Add your environment variables**
   ```
   railway variables set PORT=5000 DEBUG=false
   ```

6. **Deploy your app**
   ```
   railway up
   ```

7. **Get your backend URL**
   - Copy the domain from the Railway dashboard
   - Update your frontend's `.env.production` with this URL
   - Redeploy frontend if necessary

## CORS Configuration

Ensure your backend allows requests from your Cloudflare Pages domain:

```python
# In your app.py
from flask_cors import CORS

# Update this with your actual Cloudflare Pages domain
CORS(app, origins=["https://your-app.pages.dev"])
```

## Handling Model Files

For model files (SER.h5 and ASR.pth):

1. **Option 1: Include with deployment**
   - Add them to your repository (might hit size limits)
   - Upload them during deployment

2. **Option 2: Use cloud storage**
   - Upload models to S3/Cloudflare R2/Google Cloud Storage
   - Have your backend download them on startup

## Troubleshooting

- **WebSocket Connection Issues**: Ensure your hosting provider supports WebSockets
- **CORS Errors**: Verify your backend has proper CORS headers for your frontend domain
- **Model Loading Errors**: Check if your deployment platform supports the required memory for your models

## Monitoring and Scaling

- Set up monitoring using your hosting provider's tools
- Consider adding logging to track usage and errors
- For high traffic, you might need to scale your backend services 