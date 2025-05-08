# Deployment Troubleshooting

This document records the troubleshooting steps taken for deploying the Speech Emotion Recognition API to Render.

## Issues and Solutions

### Issue 1: Incompatible Python Dependencies

**Error:**
```
ERROR: Could not find a version that satisfies the requirement numpy==1.21.2 
```

**Solution:**
- Updated requirements.txt to use newer versions compatible with Python 3.11
- Updated runtime.txt to explicitly use Python 3.11.11

### Issue 2: Flask/Werkzeug Compatibility Error

**Error:**
```
ImportError: cannot import name 'url_quote' from 'werkzeug.urls'
```

**Solution:**
- Changed Flask to version 2.0.1
- Added explicit Werkzeug version 2.0.1 to ensure compatibility
- Updated related Flask dependencies

### Issue 3: Start Command Mismatch

**Error:**
The server was trying to run with eventlet worker class for app.py, but the render.yaml was configured for minimal_app.py

**Solution:**
- Created a debug app to diagnose the environment
- Updated render.yaml to explicitly use debug_app.py with --log-level debug for more information

## Current Testing Approach

1. Starting with minimal dependencies (Flask, gunicorn, etc.)
2. Using a debug app to inspect the environment
3. Gradually adding more functionality after the basic deployment works

## Next Steps After Successful Deployment

1. Add TensorFlow and other ML dependencies back
2. Upload model files to the deployed instance
3. Update the start command to use the full app.py with eventlet 
4. Test all functionality step by step 