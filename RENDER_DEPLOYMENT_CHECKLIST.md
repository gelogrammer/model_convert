# Render Deployment Checklist

Use this checklist to ensure you have completed all the necessary steps for deploying your Speech Emotion Recognition application to Render.

## Before Deployment

### Backend Preparation
- [ ] Ensure your Flask application runs without errors locally
- [ ] Verify all required dependencies are in `requirements.txt`
- [ ] Confirm `runtime.txt` specifies the correct Python version (3.9.18)
- [ ] Check that `Procfile` contains the correct startup command
- [ ] Decide how to handle ML models (repository or external storage)
- [ ] Run `prepare_models_for_deployment.ps1` (Windows) or `prepare_models_for_deployment.sh` (Unix) to prepare models
- [ ] Update CORS settings in `app.py` to allow your frontend domain
- [ ] Make sure `.env` values are documented (for Render environment variables)

### Frontend Preparation
- [ ] Ensure your React application builds without errors locally
- [ ] Test the production build with `npm run build` and `npm run preview`
- [ ] Check for any hardcoded backend URLs (should use environment variables)
- [ ] Verify Socket.IO connection uses environment variables
- [ ] Confirm all environment variables are listed in `.env.example`

### Repository
- [ ] Commit all necessary changes to your Git repository
- [ ] Push your changes to GitHub/GitLab/Bitbucket
- [ ] Ensure your repository is accessible to Render

## Deployment Steps

### Backend Deployment
- [ ] Create a new Web Service on Render
- [ ] Connect to your repository
- [ ] Set Root Directory to `backend`
- [ ] Set Environment to Python 3
- [ ] Set Build Command (either `pip install -r requirements.txt` or script path)
- [ ] Set Start Command to `gunicorn app:app --worker-class eventlet --workers 1 --timeout 120`
- [ ] Set all environment variables from your `.env` file
- [ ] Add `PYTHON_VERSION=3.9.18` environment variable
- [ ] Set Health Check Path to `/api/health`
- [ ] Select appropriate plan (at least 1GB RAM for ML models)
- [ ] Deploy and note the URL for your backend service

### Frontend Deployment
- [ ] Create a new Static Site on Render
- [ ] Connect to your repository
- [ ] Set Root Directory to `frontend`
- [ ] Set Build Command to `npm install && npm run build`
- [ ] Set Publish Directory to `dist`
- [ ] Add environment variable `VITE_API_URL=[your-backend-url]`
- [ ] Add any other required environment variables
- [ ] Deploy and note the URL for your frontend service

## Post-Deployment

### Testing
- [ ] Test the backend API endpoints via the Render URL
- [ ] Verify the frontend can connect to the backend
- [ ] Check that Socket.IO connections work properly
- [ ] Test audio recording and emotion recognition functionality
- [ ] Verify model predictions are working correctly

### Debugging
- [ ] Check Render logs for any errors
- [ ] Verify environment variables are correctly set
- [ ] Ensure CORS is properly configured
- [ ] Test WebSocket connections

### Final Steps
- [ ] Set up automatic deployments if desired
- [ ] Configure custom domain if needed
- [ ] Document the deployment URLs and process
- [ ] Share the application URL with team/users

## Useful Commands

```bash
# Test backend locally
cd backend
pip install -r requirements.txt
python app.py

# Test frontend locally
cd frontend
npm install
npm run dev

# Build frontend for production
cd frontend
npm run build
npm run preview
``` 