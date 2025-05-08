"""
Minimal Flask application for deployment testing on Render.
"""

import os
from flask import Flask, jsonify
from flask_cors import CORS

# Initialize Flask app
app = Flask(__name__)
CORS(app)

@app.route('/', methods=['GET'])
def home():
    """Home endpoint"""
    return jsonify({
        "status": "ok", 
        "message": "Speech Emotion Recognition API minimal version is running",
        "info": "This is a minimal version for testing deployment. Use the /api/health endpoint for status."
    })

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "ok", 
        "message": "Speech Emotion Recognition API minimal version is running",
        "version": "0.1.0-minimal"
    })

if __name__ == '__main__':
    # Get the port from the environment variable or use default
    port = int(os.environ.get('PORT', 5001))
    
    # Print startup message
    print(f"Starting minimal server on port {port}")
    
    # Start the server
    app.run(host='0.0.0.0', port=port) 