"""
Run script for the Flask application.
"""

import os
import sys
from flask import request
from app import app, socketio

# Create models directory if it doesn't exist
os.makedirs('models', exist_ok=True)
print("Starting Speech Emotion Recognition backend server...")

# CORS middleware to ensure headers are properly set
@app.after_request
def after_request(response):
    # Get the origin from the request
    origin = request.headers.get('Origin', '')
    
    # Allowed domains - update this list as needed
    allowed_origins = [
        'https://a4bfa875.talktwanalyzer.pages.dev',
        'https://2ef4f3ff.talktwanalyzer.pages.dev',
        'https://fa06b053.talktwanalyzer.pages.dev',
        'https://535a4872.talktwanalyzer.pages.dev',
        'https://talktwanalyzer.pages.dev',
        'http://localhost:3000'
    ]
    
    # Check if the origin is in our allowed list
    if origin in allowed_origins:
        response.headers.add('Access-Control-Allow-Origin', origin)
    else:
        # For development, allow any origin
        response.headers.add('Access-Control-Allow-Origin', '*')
    
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

# Ensure the application is importable by Gunicorn
application = app

if __name__ == '__main__':
    # Use PORT from environment variable for cloud deployment compatibility
    port = int(os.environ.get('PORT', 5000))
    
    # Start the Socket.IO server
    socketio.run(app, host='0.0.0.0', port=port, debug=os.environ.get('DEBUG', 'True').lower() == 'true')
else:
    # For WSGI servers like Gunicorn
    os.makedirs('models', exist_ok=True)
