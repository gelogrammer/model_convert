"""
Run script for the Flask application.
"""

import os
import sys
from app import app, socketio

# Create models directory if it doesn't exist
os.makedirs('models', exist_ok=True)
print("Starting Speech Emotion Recognition backend server...")

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
