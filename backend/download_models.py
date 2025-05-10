#!/usr/bin/env python3
"""
Download model files for deployment from Google Drive.
"""

import os
import requests
import sys
import re

def get_confirm_token(response):
    """Get the confirmation token from Google Drive response"""
    for key, value in response.cookies.items():
        if key.startswith('download_warning'):
            return value
    return None

def download_file_from_google_drive(file_id, destination):
    """Download a file from Google Drive using its file ID"""
    URL = "https://docs.google.com/uc?export=download"
    
    session = requests.Session()
    
    print(f"Downloading {os.path.basename(destination)} from Google Drive...")
    
    try:
        # First request to get the confirmation token
        response = session.get(URL, params={'id': file_id}, stream=True)
        token = get_confirm_token(response)
        
        if token:
            params = {'id': file_id, 'confirm': token}
            response = session.get(URL, params=params, stream=True)
        
        # Get file size for progress reporting if available
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(destination, 'wb') as f:
            for chunk in response.iter_content(chunk_size=32768):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    # Print progress
                    progress = int(50 * downloaded / total_size) if total_size > 0 else 0
                    sys.stdout.write(f"\r[{'=' * progress}{' ' * (50-progress)}] {downloaded}/{total_size} bytes")
                    sys.stdout.flush()
        
        print(f"\nSuccessfully downloaded {os.path.basename(destination)}")
        return True
    except Exception as e:
        print(f"Error downloading {os.path.basename(destination)}: {e}")
        return False

def extract_file_id_from_url(url):
    """Extract file ID from Google Drive URL"""
    # Pattern for folder links
    folder_pattern = r'folders/([a-zA-Z0-9_-]+)'
    folder_match = re.search(folder_pattern, url)
    
    # Pattern for direct file links
    file_pattern = r'file/d/([a-zA-Z0-9_-]+)'
    file_match = re.search(file_pattern, url)
    
    if folder_match:
        return folder_match.group(1), 'folder'
    elif file_match:
        return file_match.group(1), 'file'
    else:
        return None, None

def main():
    # Create models directory if it doesn't exist
    os.makedirs('models', exist_ok=True)
    
    # Define model file IDs and local paths
    models = {
        'SER.h5': {
            'file_id': '1TxX6vK8yY6JE5iIVak_1O8Pb2qqXoVJa',  # Direct link: https://drive.google.com/file/d/1TxX6vK8yY6JE5iIVak_1O8Pb2qqXoVJa/view
            'path': 'models/SER.h5'
        },
        'ASR.pth': {
            'file_id': '16fmCdblYar4_3_maRsY_0ESKKOi3zh3z',  # Direct link: https://drive.google.com/file/d/16fmCdblYar4_3_maRsY_0ESKKOi3zh3z/view
            'path': 'models/ASR.pth'
        }
    }
    
    # Download each model
    success = True
    for model_name, model_info in models.items():
        if not download_file_from_google_drive(model_info['file_id'], model_info['path']):
            success = False
    
    # Exit with appropriate status code
    if success:
        print("All models downloaded successfully")
        sys.exit(0)
    else:
        print("Failed to download some models")
        sys.exit(1)

if __name__ == "__main__":
    main() 