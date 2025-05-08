"""
Debug Flask application to troubleshoot deployment.
"""

import os
import sys
import glob
from flask import Flask, jsonify

# Initialize Flask app
app = Flask(__name__)

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

if __name__ == '__main__':
    # Get the port from the environment variable or use default
    port = int(os.environ.get('PORT', 5001))
    
    # Print startup message
    print(f"Starting debug server on port {port}")
    
    # Start the server
    app.run(host='0.0.0.0', port=port) 