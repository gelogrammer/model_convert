# Deploying the Backend to Railway

This guide explains how to deploy the Speech Emotion Recognition backend to Railway.

## Prerequisites

1. Create a [Railway account](https://railway.app/)
2. Install the Railway CLI: `npm i -g @railway/cli`
3. Login to Railway: `railway login`

## Deployment Steps

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Initialize a new Railway project:
   ```
   railway init
   ```

3. Create a new project when prompted.

4. Add your environment variables:
   ```
   railway variables set PORT=5000 DEBUG=false
   ```

5. Deploy your application:
   ```
   railway up
   ```

6. After deployment, get your backend URL:
   ```
   railway domain
   ```

7. Update the frontend environment variables with your backend URL:
   - Go to the Cloudflare Pages dashboard
   - Select your project (talktwanalyzer)
   - Navigate to Settings > Environment variables
   - Add `VITE_BACKEND_URL` with your Railway backend URL

## Model Files

Since your model files (SER.h5 and ASR.pth) are large, you have two options:

1. **Include them in your deployment**:
   - Simply keep them in your repository
   - Railway will deploy them with your code

2. **Store them in cloud storage**:
   - Upload to a service like AWS S3 or Cloudflare R2
   - Modify your code to download them on startup

## Monitoring

You can monitor your Railway app through the Railway dashboard. It provides logs, metrics, and other helpful information for debugging.

## Troubleshooting

- If you see WebSocket connection errors, ensure that Railway is not blocking WebSocket connections
- If the model fails to load, check the Railway logs for details
- If CORS errors occur, verify that your backend CORS settings include your Cloudflare Pages URL 