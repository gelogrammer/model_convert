# Deploying the Speech Emotion Recognition API to Render

This guide explains how to deploy the Speech Emotion Recognition backend API to Render.

## Prerequisites

1. A Render account (https://render.com/)
2. Git repository with your code

## Deployment Steps

1. **Connect your repository to Render**
   - Create a new Web Service in Render
   - Connect your Git repository
   - Select the branch you want to deploy

2. **Configure the Web Service**
   - Environment: Python
   - Region: Choose the region closest to your users
   - Build Command: `pip install -r backend/requirements.txt`
   - Start Command: `cd backend && gunicorn --worker-class eventlet -w 1 app:app`
   - Plan: Select appropriate plan (Starter recommended for testing)

3. **Environment Variables**
   - Set `PORT` to `5001`
   - Set `PYTHON_VERSION` to `3.9.18`
   - Add any other required environment variables

## Important Notes

- The API will be accessible at the URL provided by Render
- The health check endpoint is available at `/api/health`
- The models directory is created automatically by the application
- Socket.IO connections require the `--worker-class eventlet` flag for proper functionality

## Troubleshooting

If you encounter issues with the deployment:

1. Check Render logs for any error messages
2. Ensure all dependencies are listed in `requirements.txt`
3. Verify that the start command is correct and points to your app
4. Make sure the port configuration matches between your code and Render settings

## Models

Note that the models (SER.h5 and ASR.pth) are not included in the Git repository due to their size. You'll need to manually upload them to the models directory on Render or set up a storage solution to download them at runtime. 