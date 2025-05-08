"""
Script to test deployment steps locally before pushing to Render.
"""

import os
import sys
import subprocess
import time

def main():
    """Run the deployment test"""
    print("Testing deployment steps...")
    
    # Create virtual environment
    print("\n1. Creating virtual environment...")
    subprocess.run(["python", "-m", "venv", "test_venv"], check=True)
    
    # Activate virtual environment (platform-specific)
    if sys.platform == "win32":
        activate_cmd = os.path.join("test_venv", "Scripts", "activate")
        activate_prefix = ""
    else:
        activate_cmd = os.path.join("test_venv", "bin", "activate")
        activate_prefix = "source "
    
    print(f"\n2. Please activate the virtual environment with: {activate_prefix}{activate_cmd}")
    input("Press Enter when you've activated the environment...")
    
    # Install requirements
    print("\n3. Installing minimal requirements...")
    subprocess.run(["pip", "install", "-r", "requirements-minimal.txt"], check=True)
    
    # Create models directory
    print("\n4. Creating models directory...")
    os.makedirs("models", exist_ok=True)
    
    # Test gunicorn
    print("\n5. Testing gunicorn startup...")
    try:
        # Start gunicorn process in the background
        print("Starting gunicorn with debug_app:app...")
        gunicorn_process = subprocess.Popen(
            ["gunicorn", "debug_app:app", "--log-level", "debug"], 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE
        )
        
        # Give it a moment to start
        time.sleep(2)
        
        # Check if process is still running
        if gunicorn_process.poll() is None:
            print("✅ Gunicorn process started successfully!")
            
            # Try to kill the process
            gunicorn_process.terminate()
            time.sleep(1)
            if gunicorn_process.poll() is None:
                gunicorn_process.kill()
            
            print("Gunicorn process terminated.")
        else:
            # Process exited - get exit code and output
            exit_code = gunicorn_process.poll()
            stdout, stderr = gunicorn_process.communicate()
            
            print(f"❌ Gunicorn process failed with exit code {exit_code}")
            print("STDOUT:")
            print(stdout.decode())
            print("STDERR:")
            print(stderr.decode())
    except Exception as e:
        print(f"Error during gunicorn test: {e}")
    
    print("\nDeployment test complete.")

if __name__ == "__main__":
    main() 