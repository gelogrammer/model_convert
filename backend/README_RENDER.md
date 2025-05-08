# Speech Emotion Recognition API - Render Deployment

This README provides instructions for deploying the Speech Emotion Recognition API to Render.

## Deployment

1. The main configuration for Render deployment is in the `render.yaml` file in the root directory.
2. Make sure to set the following environment variables in the Render dashboard:
   - `SER_MODEL_URL`: URL to download the SER.h5 model
   - `ASR_MODEL_URL`: URL to download the ASR.pth model

## Required Files

The following files are used for Render deployment:
- `backend/requirements.txt`: Lists all the Python dependencies
- `backend/runtime.txt`: Specifies the Python version
- `backend/Procfile`: Specifies the command to run the application
- `backend/render_setup.py`: Script to download models during deployment

## Model Management

The models (SER.h5 and ASR.pth) are not included in the repository due to their size. There are two ways to handle this:

1. **Environment Variables**: Set `SER_MODEL_URL` and `ASR_MODEL_URL` to point to locations where the models can be downloaded.
2. **Manual Upload**: After deployment, upload the models to the models directory via SFTP or Render's shell.

## Health Check

The API provides a health check endpoint at `/api/health` which returns a status message to confirm the API is running.

## WebSocket Support

This deployment is configured to support WebSocket connections using Socket.IO, which requires the `--worker-class eventlet` flag for Gunicorn.

## Troubleshooting

If you encounter issues:
1. Check the Render logs for any errors
2. Verify the models are available in the models directory
3. Ensure all environment variables are set correctly 