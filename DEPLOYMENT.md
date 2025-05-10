# Deployment Guide: Model Conversion App

This guide will walk you through deploying:
1. Backend to Render
2. Frontend to Cloudflare Pages

## Prerequisites

- Git repository with your code
- Render account (https://render.com)
- Cloudflare account (https://dash.cloudflare.com/sign-up)
- Hugging Face API key

## Part 1: Backend Deployment to Render

### 1. Prepare your backend

1. Make sure your `backend/.env` file contains all necessary environment variables:
   ```
   VITE_BACKEND_URL=https://your-render-service-name.onrender.com
   VITE_SUPABASE_URL=https://pztstrmccavxrgccvmjq.supabase.co
   VITE_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6dHN0cm1jY2F2eHJnY2N2bWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5MzExNDEsImV4cCI6MjA2MTUwNzE0MX0.a3fTAAaTip_DenzWBWBoTjRD-ARiZRdXqmwE7Rgz6Yg
   VITE_HUGGINGFACE_API_KEY=your_huggingface_api_key
   ```

2. Update your `requirements.txt` for Python 3.11 compatibility:
   - Open `backend/requirements.txt`
   - Update NumPy version: Change `numpy==1.21.2` to `numpy>=1.26.0`
   - Update TensorFlow version: Change `tensorflow==2.15.0` to `tensorflow>=2.15.0`
   - Update other packages if needed to ensure compatibility with Python 3.11

   Sample updated requirements.txt:
   ```
   flask==2.0.1
   flask-cors==3.0.10
   flask-socketio==5.3.6
   numpy>=1.26.0
   tensorflow>=2.15.0
   librosa>=0.8.1
   matplotlib>=3.7.2
   python-engineio==4.8.0
   python-socketio==5.10.0
   eventlet==0.33.3
   torch>=1.9.1
   requests==2.31.0
   transformers>=4.38.0
   soundfile==0.10.3.post1
   scipy>=1.7.1
   python-dotenv==0.19.0
   gunicorn==20.1.0
   ```

3. Alternatively, specify Python 3.10 in a `runtime.txt` file:
   ```
   python-3.10.13
   ```

4. Ensure you have `Procfile` in the backend directory with:
   ```
   web: gunicorn app:app --timeout 120
   ```
   Note: The increased timeout helps with model loading.

5. Push all changes to your Git repository

### 2. Deploy to Render

1. Create a new Render account or log in at https://render.com
2. Click "New +" and select "Web Service"
3. Connect your GitHub/GitLab repository
4. Configure your web service:
   - **Name**: Choose a name (e.g., model-convert-backend)
   - **Root Directory**: `backend`
   - **Runtime**: Python 3.10 (recommended for best compatibility)
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app --timeout 120`
   - **Instance Type**: Standard (512 MB RAM recommended as the free tier may have insufficient memory for ML models)

5. Add environment variables:
   - Click on "Environment" tab
   - Add the following variables:
     ```
     VITE_BACKEND_URL=https://your-render-service-name.onrender.com
     VITE_SUPABASE_URL=https://pztstrmccavxrgccvmjq.supabase.co
     VITE_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6dHN0cm1jY2F2eHJnY2N2bWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5MzExNDEsImV4cCI6MjA2MTUwNzE0MX0.a3fTAAaTip_DenzWBWBoTjRD-ARiZRdXqmwE7Rgz6Yg
     VITE_HUGGINGFACE_API_KEY=your_huggingface_api_key
     PORT=10000
     ```

6. Advanced options:
   - Under "Advanced" settings, increase the **Health Check Path** timeout if your service takes time to start
   - Consider enabling "Auto-Deploy" for automatic deployments when you push to your repository

7. For larger models and deployments:
   - Consider upgrading to a paid plan for more resources
   - Enable persistent disk for storing uploaded files and model data

8. Click "Create Web Service"
9. Wait for the deployment to complete (this may take several minutes)
10. Once deployed, note your service URL (e.g., https://model-convert-backend.onrender.com)
11. Test your deployment by visiting `https://your-service-name.onrender.com/api/health`

### Dealing with Common Render Deployment Issues:

1. **Package Incompatibility**: If you see errors with package versions:
   - Use the fixed requirements.txt with werkzeug==2.0.3 for Flask 2.0.1
   - Or use the alternative requirements with Flask 2.2.3

2. **TensorFlow Issues**: If TensorFlow fails to install or load:
   - Replace `tensorflow>=2.15.0` with `tensorflow-cpu>=2.15.0` in requirements.txt
   - On free tier, consider using TensorFlow Lite or Hugging Face API as alternatives

3. **Memory Limitations**: If your app crashes due to memory limits:
   - Upgrade to a paid plan with more RAM (at least 512MB recommended)
   - Optimize model loading to reduce memory usage
   - Use model quantization techniques to reduce model size

4. **Slow Cold Starts**: The free tier sleeps after inactivity
   - Set up a ping service to keep your service active
   - Implement lazy loading for models to improve startup time

### 3. Important: Handling Model Files

The application requires model files (`SER.h5` and `ASR.pth`) to function correctly. There are two ways to handle this:

#### Option 1: Include Models in Git Repository (Recommended for smaller models)

1. Create a `models` directory in your backend folder if it doesn't exist:
   ```bash
   mkdir -p backend/models
   ```

2. Copy your model files to this directory:
   ```bash
   cp SER.h5 backend/models/
   cp ASR.pth backend/models/
   ```

3. Add these files to your Git repository:
   ```bash
   git add backend/models/SER.h5 backend/models/ASR.pth
   git commit -m "Add model files for deployment"
   git push
   ```

4. Render will clone your repository with the models included.

#### Option 2: Use Cloud Storage for Models (For larger models)

If your models are too large for Git, set up a download script:

1. Create a script in your backend folder to download models during deployment:
   ```python
   # backend/download_models.py
   import os
   import requests
   
   os.makedirs('models', exist_ok=True)
   
   # Download SER model
   ser_url = "YOUR_CLOUD_STORAGE_URL/SER.h5"
   response = requests.get(ser_url)
   with open('models/SER.h5', 'wb') as f:
       f.write(response.content)
   
   # Download ASR model
   asr_url = "YOUR_CLOUD_STORAGE_URL/ASR.pth"
   response = requests.get(asr_url)
   with open('models/ASR.pth', 'wb') as f:
       f.write(response.content)
   
   print("Models downloaded successfully")
   ```

2. Update your Build Command on Render to include the download step:
   ```
   pip install -r requirements.txt && python download_models.py
   ```

3. Make sure to upload your models to a cloud storage service (Google Drive, AWS S3, etc.) and update the URLs in the script.

## Part 2: Frontend Deployment to Cloudflare Pages

### 1. Prepare your frontend

1. Update `frontend/.env` with your production backend URL:
   ```
   VITE_BACKEND_URL=https://your-render-service-name.onrender.com
   VITE_SUPABASE_URL=https://pztstrmccavxrgccvmjq.supabase.co
   VITE_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6dHN0cm1jY2F2eHJnY2N2bWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5MzExNDEsImV4cCI6MjA2MTUwNzE0MX0.a3fTAAaTip_DenzWBWBoTjRD-ARiZRdXqmwE7Rgz6Yg
   VITE_HUGGINGFACE_API_KEY=your_huggingface_api_key
   ```

2. Create a `.env.production` file in the frontend directory with the same content
3. Test your build locally:
   ```bash
   cd frontend
   npm run build
   ```
4. Commit and push your changes to your repository

### 2. Deploy to Cloudflare Pages

1. Sign up for or log in to Cloudflare (https://dash.cloudflare.com/)
2. Go to "Pages" from the dashboard
3. Click "Create a project" and select "Connect to Git"
4. Connect your GitHub/GitLab repository
5. Configure your build:
   - **Project name**: Choose a name (e.g., model-convert)
   - **Production branch**: main (or your default branch)
   - **Framework preset**: Vite
   - **Build command**: npm run build
   - **Build output directory**: dist
   - **Root directory**: frontend

6. Add environment variables:
   - Click "Environment variables"
   - Add the same variables as in your `.env` file:
     ```
     VITE_BACKEND_URL=https://your-render-service-name.onrender.com
     VITE_SUPABASE_URL=https://pztstrmccavxrgccvmjq.supabase.co
     VITE_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6dHN0cm1jY2F2eHJnY2N2bWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5MzExNDEsImV4cCI6MjA2MTUwNzE0MX0.a3fTAAaTip_DenzWBWBoTjRD-ARiZRdXqmwE7Rgz6Yg
     VITE_HUGGINGFACE_API_KEY=your_huggingface_api_key
     ```

7. Click "Save and Deploy"
8. Wait for the deployment to complete
9. Once deployed, your app will be accessible at `https://your-project-name.pages.dev`

### 3. Troubleshooting Frontend Deployment

- **Build Failures**: If your build fails, check build logs for specific errors
- **CORS Issues**: Ensure your backend allows requests from your Cloudflare domain
- **Environment Variables**: Verify environment variables are properly set in Cloudflare
- **Socket.IO Connection**: If using Socket.IO, ensure your frontend connects to the correct backend URL

## Part 3: Configure CORS and Custom Domain (Optional)

### 1. Update Backend CORS Settings

Modify your backend/app.py file to allow your Cloudflare domain:

```python
# Configure CORS
CORS(app, origins=[
    "https://your-project-name.pages.dev",
    "https://your-custom-domain.com"  # If you have a custom domain
])

# Configure Socket.IO
socketio = SocketIO(app, cors_allowed_origins=[
    "https://your-project-name.pages.dev", 
    "https://your-custom-domain.com"  # If you have a custom domain
], async_mode='eventlet')
```

### 2. Set Up Custom Domain (Optional)

#### For Cloudflare Pages:
1. Go to your Pages project
2. Click on "Custom domains"
3. Follow the instructions to add your domain

#### For Render:
1. Go to your Web Service
2. Click on "Settings"
3. Go to "Custom Domains"
4. Follow the instructions to add your domain

## Part 4: Additional Considerations

### 1. Monitor Resources on Render

The free tier of Render has limitations. Monitor your usage to ensure:
- You don't exceed CPU/memory limits
- Service doesn't "spin down" when inactive (paid plans stay active)

### 2. Environment Variables Security

- Never commit `.env` files with sensitive information to your repository
- Use environment variables in your deployment platforms for sensitive data

### 3. Database Migration (If Applicable)

If you're using a database:
1. Ensure your database is accessible from Render
2. Update connection strings in your environment variables

### 4. Scaling and Performance

- Consider upgrading to paid plans for production applications
- Implement caching for frequently accessed data
- Optimize API calls between frontend and backend

## Part 5: Testing Your Deployment

1. Visit your Cloudflare Pages URL
2. Test all functionality to ensure it works as expected
3. Check browser console for any errors
4. Verify API calls are successful between frontend and backend
5. Test audio processing and model conversion features

## Conclusion

Your application should now be successfully deployed with:
- Backend running on Render
- Frontend hosted on Cloudflare Pages
- All environment variables correctly configured
- CORS properly set up for communication between services

For any issues, check the logs in your respective deployment platforms and review the troubleshooting sections above. 