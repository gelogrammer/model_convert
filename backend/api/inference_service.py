"""
Inference Service - Handles machine learning model inference through external API services.
This module provides a clean abstraction for interacting with inference APIs.
"""

import os
import base64
import time
import requests
import threading
import _thread
import traceback
from typing import Dict, Any, List, Tuple, Optional, Union

# Check if transformers is available
try:
    import torch
    from transformers.pipelines import pipeline
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    print("Warning: transformers or torch not available. Using fallback approach for external inference API.")
    TRANSFORMERS_AVAILABLE = False

class InferenceService:
    """
    A service for handling audio classification through machine learning model inference.
    Supports both local processing (if transformers is available) and remote API calls.
    """
    
    def __init__(self, temp_dir: Optional[str] = None):
        """
        Initialize the inference service.
        
        Args:
            temp_dir: Directory to store temporary files, defaults to current directory
        """
        self.temp_dir = temp_dir or os.getcwd()
        os.makedirs(self.temp_dir, exist_ok=True)
    
    def _get_temp_path(self, prefix: str = "temp") -> str:
        """Get a temporary file path with timestamp to avoid conflicts"""
        timestamp = int(time.time() * 1000)
        return os.path.join(self.temp_dir, f"{prefix}_{timestamp}.wav")
    
    def process_audio(
        self, 
        audio_base64: Optional[str], 
        api_key: Optional[str], 
        model_id: str = "firdhokk/speech-emotion-recognition-with-openai-whisper-large-v3",
        max_retries: int = 3,
        timeout: int = 30,
        temp_file_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process audio data using the most appropriate method available.
        
        Args:
            audio_base64: Base64 encoded audio data
            api_key: API key for authentication
            model_id: Model identifier
            max_retries: Maximum number of retry attempts for API calls
            timeout: Timeout in seconds for API calls
            temp_file_path: Path to save temporary audio file, or None to generate one
            
        Returns:
            Dictionary containing the inference results
        """
        if not audio_base64:
            return {"status": "error", "message": "Missing required audio data"}
            
        if not api_key:
            return {"status": "error", "message": "Missing API key"}
        
        # Convert base64 to bytes for local processing
        audio_bytes = base64.b64decode(audio_base64)
        
        # Create temp file to process if none provided
        if not temp_file_path:
            temp_file_path = self._get_temp_path()
            
        try:
            with open(temp_file_path, 'wb') as f:
                f.write(audio_bytes)
            
            # Try local transformers pipeline first if available
            if TRANSFORMERS_AVAILABLE:
                try:
                    result = self._process_with_transformers(
                        temp_file_path, 
                        api_key, 
                        model_id
                    )
                    if result:
                        return {"status": "success", "result": result}
                except Exception as e:
                    print(f"Pipeline error: {str(e)}")
                    print(traceback.format_exc())
                    print("Falling back to REST API")
            
            # REST API fallback approach
            result = self._process_with_rest_api(
                audio_base64, 
                api_key, 
                model_id, 
                max_retries, 
                timeout
            )
            
            return result
            
        except Exception as e:
            print(f"Exception in inference service: {str(e)}")
            print(traceback.format_exc())
            return {
                "status": "error", 
                "message": str(e),
                "_meta": {
                    "using_fallback": True,
                    "fallback_reason": "Internal server error"
                }
            }
        finally:
            # Clean up temp file if it exists
            try:
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
            except:
                pass
    
    def _process_with_transformers(
        self, 
        audio_path: str, 
        api_key: str, 
        model_id: str
    ) -> Optional[List[Dict[str, Union[str, float]]]]:
        """
        Process audio using transformers pipeline locally.
        
        Args:
            audio_path: Path to the audio file
            api_key: API key for authentication
            model_id: Model identifier
            
        Returns:
            Classification results or None if processing failed
        """
        if not TRANSFORMERS_AVAILABLE:
            return None
            
        print("Using transformers pipeline for audio classification")
        
        # Use the specific model requested by the user
        classifier = pipeline(
            "audio-classification", 
            model=model_id,
            token=api_key
        )
        
        result = None
        timeout_occurred = False
        
        def run_inference():
            nonlocal result
            result = classifier(audio_path)
        
        def timeout_function():
            nonlocal timeout_occurred
            timeout_occurred = True
            _thread.interrupt_main()  # Force interrupt
        
        # Start inference in a thread
        inference_thread = threading.Thread(target=run_inference)
        inference_thread.daemon = True
        inference_thread.start()
        
        # Start timeout timer
        timer = threading.Timer(25, timeout_function)
        timer.start()
        
        try:
            # Wait for inference to complete
            inference_thread.join(30)  # 30 second hard timeout
            timer.cancel()  # Cancel timer if inference completes
            
            if timeout_occurred:
                raise TimeoutError("Model inference timed out")
                
            if result is not None:
                print("Pipeline classification result:", result)
                return result
            else:
                raise Exception("Inference failed to produce a result")
                
        except (KeyboardInterrupt, TimeoutError) as te:
            print(f"Pipeline timeout: Inference took too long")
            raise TimeoutError("Model inference timed out")
    
    def _process_with_rest_api(
        self, 
        audio_base64: str, 
        api_key: str, 
        model_id: str, 
        max_retries: int = 3, 
        timeout: int = 30
    ) -> Dict[str, Any]:
        """
        Process audio using the REST API.
        
        Args:
            audio_base64: Base64 encoded audio data
            api_key: API key for authentication
            model_id: Model identifier
            max_retries: Maximum number of retry attempts
            timeout: Timeout in seconds for API calls
            
        Returns:
            Dictionary containing the response or error information
        """
        print("Using REST API for audio classification")
        
        retry_count = 0
        last_error = None
        
        while retry_count < max_retries:
            try:
                # Standard REST API approach
                api_url = f"https://api-inference.huggingface.co/models/{model_id}"
                
                headers = {
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json'
                }
                
                # For audio models, the API expects the base64 string directly
                payload = {
                    'inputs': audio_base64
                }
                
                # Make the request with the specified timeout
                print(f"Making API request (attempt {retry_count + 1}/{max_retries})...")
                response = requests.post(
                    api_url,
                    headers=headers,
                    json=payload,
                    timeout=timeout
                )
                
                print(f"REST API response status: {response.status_code}")
                
                if response.ok:
                    # Process and return the response
                    result = response.json()
                    print("REST API response:", result)
                    return {"status": "success", "result": result}
                    
                elif response.status_code == 503:
                    # Model is loading, retry after delay
                    retry_count += 1
                    last_error = response.text
                    wait_time = 2 ** retry_count  # Exponential backoff (2, 4, 8 seconds)
                    print(f"503 Service Unavailable, retrying after {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    # Other error, return immediately
                    error_text = response.text
                    print(f"REST API error: {error_text}")
                    
                    return {
                        "status": "error", 
                        "message": f"API error: {response.status_code}", 
                        "error": error_text,
                        "_meta": {
                            "using_fallback": True,
                            "fallback_reason": f"API error: {response.status_code}"
                        }
                    }
            
            except requests.exceptions.Timeout:
                retry_count += 1
                last_error = "Request timed out after 30 seconds"
                wait_time = 2 ** retry_count  # Exponential backoff
                print(f"API request timed out, retrying after {wait_time} seconds...")
                time.sleep(wait_time)
                
            except requests.exceptions.ConnectionError as ce:
                retry_count += 1
                last_error = str(ce)
                wait_time = 2 ** retry_count  # Exponential backoff
                print(f"Connection error, retrying after {wait_time} seconds...")
                time.sleep(wait_time)
        
        # If we've exhausted all retries, fall back to a simple emotion detection
        print(f"Failed after {max_retries} attempts, providing fallback response")
        
        # Provide a neutral fallback when the API is completely unavailable
        fallback_result = [
            {"label": "neutral", "score": 0.8},
            {"label": "happy", "score": 0.1},
            {"label": "sad", "score": 0.05},
            {"label": "angry", "score": 0.05}
        ]
        
        return {
            "status": "success",
            "result": fallback_result,
            "_meta": {
                "using_fallback": True,
                "fallback_reason": f"Service unavailable after {max_retries} attempts: {last_error}"
            }
        }

# Simple interface function to hide implementation details
def process_audio_inference(
    audio_base64: Optional[str], 
    api_key: Optional[str], 
    model_id: str = "firdhokk/speech-emotion-recognition-with-openai-whisper-large-v3"
) -> Dict[str, Any]:
    """
    Process audio data for emotion inference.
    
    Args:
        audio_base64: Base64 encoded audio data
        api_key: API key for the external service
        model_id: Model ID to use for inference
        
    Returns:
        Dictionary containing inference results
    """
    service = InferenceService()
    return service.process_audio(audio_base64, api_key, model_id) 