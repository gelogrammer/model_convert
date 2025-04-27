"""
Run script for the Flask application.
"""

import os
from app import app, socketio

if __name__ == '__main__':
    # Create models directory if it doesn't exist
    os.makedirs('models', exist_ok=True)
    print("Starting Speech Emotion Recognition backend server...")
    
    # Start the Socket.IO server
    socketio.run(app, host='0.0.0.0', port=5001, debug=True)
