"""
Render setup script to download model files if they don't exist.
This script can be called before starting the server.
"""

import os
import sys
import requests
from pathlib import Path
import time
import numpy as np

# Directory where models will be stored
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")

# Create models directory if it doesn't exist
os.makedirs(MODELS_DIR, exist_ok=True)

def download_file(url, destination):
    """
    Download a file from a URL to a destination path.
    """
    try:
        print(f"Downloading {url} to {destination}...")
        
        # Stream the download to handle large files
        with requests.get(url, stream=True) as r:
            r.raise_for_status()
            total_size = int(r.headers.get('content-length', 0))
            
            # Show progress for large files
            downloaded = 0
            with open(destination, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        
                        # Print progress for large files
                        if total_size > 10_000_000:  # 10 MB
                            percent = (downloaded / total_size) * 100
                            sys.stdout.write(f"\rDownload progress: {percent:.1f}%")
                            sys.stdout.flush()
            
            if total_size > 10_000_000:
                print()  # New line after progress
                
        print(f"Download complete: {destination}")
        return True
    except Exception as e:
        print(f"Error downloading file: {e}")
        return False

def create_dummy_ser_model():
    """
    Create a dummy SER model for testing purposes when download fails
    """
    try:
        import tensorflow as tf
        from tensorflow.keras.models import Sequential
        from tensorflow.keras.layers import Dense, Input
        
        print("Creating dummy SER model...")
        
        # Create a simple model
        model = Sequential([
            Input(shape=(180,)),
            Dense(128, activation='relu'),
            Dense(64, activation='relu'),
            Dense(7, activation='softmax')  # 7 emotions
        ])
        
        model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
        
        # Save the model
        ser_model_path = os.path.join(MODELS_DIR, "SER.h5")
        model.save(ser_model_path)
        
        print(f"Dummy SER model created and saved to {ser_model_path}")
        return True
    except Exception as e:
        print(f"Error creating dummy SER model: {e}")
        return False

def create_dummy_asr_model():
    """
    Create a dummy ASR model for testing purposes when download fails
    """
    try:
        import torch
        import torch.nn as nn
        
        print("Creating dummy ASR model...")
        
        # Create a simple model
        class SimpleASR(nn.Module):
            def __init__(self):
                super(SimpleASR, self).__init__()
                self.fc1 = nn.Linear(13, 32)
                self.relu = nn.ReLU()
                self.fc2 = nn.Linear(32, 11)
            
            def forward(self, x):
                x = self.fc1(x)
                x = self.relu(x)
                x = self.fc2(x)
                return x
        
        model = SimpleASR()
        
        # Save the model
        asr_model_path = os.path.join(MODELS_DIR, "ASR.pth")
        torch.save(model.state_dict(), asr_model_path)
        
        print(f"Dummy ASR model created and saved to {asr_model_path}")
        return True
    except Exception as e:
        print(f"Error creating dummy ASR model: {e}")
        return False

def setup_models():
    """
    Check if models exist, if not download them from storage.
    Replace the URLs with your actual model storage locations.
    """
    # Example model URLs - replace with your actual storage URLs
    model_urls = {
        "SER.h5": os.environ.get("SER_MODEL_URL", ""),
        "ASR.pth": os.environ.get("ASR_MODEL_URL", "")
    }
    
    # Check and download each model if URLs are provided
    for model_name, url in model_urls.items():
        model_path = os.path.join(MODELS_DIR, model_name)
        
        # Skip if model exists
        if os.path.exists(model_path):
            print(f"Model {model_name} already exists at {model_path}")
            continue
        
        # If URL provided, try to download
        if url:
            print(f"Model {model_name} not found, downloading...")
            success = download_file(url, model_path)
            
            if success:
                print(f"Successfully downloaded {model_name}")
                continue
            else:
                print(f"Failed to download {model_name}, will create dummy model")
        else:
            print(f"No URL provided for {model_name}, will create dummy model")
        
        # If download failed or no URL provided, create dummy model
        if model_name == "SER.h5":
            create_dummy_ser_model()
        elif model_name == "ASR.pth":
            create_dummy_asr_model()
    
    # List models directory to confirm what we have
    print("\nAvailable models:")
    for file in os.listdir(MODELS_DIR):
        file_path = os.path.join(MODELS_DIR, file)
        size_mb = os.path.getsize(file_path) / (1024 * 1024)
        print(f"- {file} ({size_mb:.2f} MB)")

if __name__ == "__main__":
    print("Running Render setup script...")
    setup_models()
    print("Setup complete.") 