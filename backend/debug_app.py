"""
Debug Flask application to troubleshoot deployment.
"""

import os
import sys
import glob
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit

# Initialize Flask app
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Configure Socket.IO with permissive CORS settings
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='eventlet',
    ping_timeout=60,
    ping_interval=25,
    logger=True,
    engineio_logger=True
)

@app.route('/', methods=['GET'])
def home():
    """Home endpoint with debug info"""
    # Get environment info
    python_version = sys.version
    files_in_dir = glob.glob('*.py')
    environment_vars = {k: v for k, v in os.environ.items() if not k.startswith('_')}
    
    # Create debug response
    debug_info = {
        "status": "ok",
        "message": "Debug app running",
        "python_version": python_version,
        "files_in_directory": files_in_dir,
        "current_directory": os.getcwd(),
        "environment_variables": environment_vars
    }
    
    return jsonify(debug_info)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "ok", 
        "message": "Debug app running",
        "version": "debug-1.0"
    })

@app.route('/api/initialize', methods=['POST', 'GET'])
def initialize_model():
    """Mock initialize endpoint for the frontend"""
    return jsonify({
        "status": "success", 
        "message": "Debug mode: No models loaded",
        "emotions": ["neutral", "happy", "sad", "angry", "fearful", "disgusted", "surprised"]
    })

@app.route('/api/analyze', methods=['POST'])
def analyze_audio():
    """Mock analyze endpoint for frontend testing"""
    return jsonify({
        "status": "success",
        "message": "Debug mode: No analysis performed",
        "emotion": "neutral",
        "confidence": 0.8,
        "probabilities": {
            "neutral": 0.8,
            "happy": 0.05,
            "sad": 0.05,
            "angry": 0.03,
            "fearful": 0.03,
            "disgusted": 0.02,
            "surprised": 0.02
        }
    })

# Socket.IO event handlers
@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('connected', {'status': 'connected'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('audio_stream')
def handle_audio_stream(data):
    """Mock audio stream handler for websocket testing"""
    emit('emotion_result', {
        'status': 'success',
        'message': 'Debug mode: No real-time analysis performed',
        'emotion': 'neutral',
        'confidence': 0.8
    })

if __name__ == '__main__':
    # Get the port from the environment variable or use default
    port = int(os.environ.get('PORT', 5001))
    
    # Print startup message
    print(f"Starting debug server on port {port}")
    
    # Start the server with Socket.IO
    socketio.run(app, host='0.0.0.0', port=port) 