"""
Check dependencies for Speech Emotion Recognition backend.
This script checks if all required Python packages are installed.
"""

import os
import sys
import importlib.util

def check_dependency(module_name):
    """Check if a Python module is installed."""
    module_spec = importlib.util.find_spec(module_name)
    return module_spec is not None

def check_file_exists(file_path):
    """Check if a file exists."""
    return os.path.isfile(file_path)

def main():
    """Main function to check dependencies."""
    print("Checking Python dependencies for Speech Emotion Recognition backend...")
    
    # List of required packages
    required_packages = [
        "flask",
        "flask_cors",
        "flask_socketio",
        "numpy",
        "tensorflow",
        "librosa",
        "pyaudio",
        "matplotlib",
        "eventlet",
        "torch"
    ]
    
    # Check each package
    missing_packages = []
    for package in required_packages:
        if not check_dependency(package):
            missing_packages.append(package)
    
    # Check model files
    models_dir = os.path.join(os.path.dirname(__file__), "models")
    os.makedirs(models_dir, exist_ok=True)
    
    required_models = [
        os.path.join(models_dir, "SER.h5"),
        os.path.join(models_dir, "ASR.pth")
    ]
    
    missing_models = []
    for model_path in required_models:
        if not check_file_exists(model_path):
            missing_models.append(os.path.basename(model_path))
    
    # Report results
    if missing_packages:
        print("\nMissing required packages:")
        for package in missing_packages:
            print(f"  - {package}")
        print("\nPlease install them using:")
        print("pip install -r requirements.txt")
        return False
    
    if missing_models:
        print("\nMissing required model files:")
        for model in missing_models:
            print(f"  - {model}")
        print("\nPlease ensure these files are in the backend/models directory.")
        return False
    
    print("\nAll dependencies and model files are present!")
    return True

if __name__ == "__main__":
    success = main()
    if not success:
        sys.exit(1) 