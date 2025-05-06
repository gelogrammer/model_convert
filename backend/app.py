"""
Flask application for Real-Time Speech Emotion Recognition API.
"""

import os
import json
import io
import base64
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import requests
import time

# Initialize Flask app
app = Flask(__name__)

# Set up proper CORS handling for all routes
@app.after_request
def after_request(response):
    # Get the origin from the request headers
    origin = request.headers.get('Origin')
    
    # If origin is in the allowed origins, set it specifically
    if origin:
        response.headers.add('Access-Control-Allow-Origin', origin)
    else:
        # Fallback to wildcard only if no origin is specified
        response.headers.add('Access-Control-Allow-Origin', '*')
        
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# Configure CORS for Render deployment with specific origins approach
CORS(app, 
     origins=["*"],
     supports_credentials=True,
     allow_headers=["*"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     expose_headers=["Content-Type", "Authorization"])

# Configure Socket.IO with CORS for Render
# Use threading mode which is the default and works with standard worker
socketio = SocketIO(
    app, 
    cors_allowed_origins=["*"]
)

# Initialize model services to None - they'll be loaded on demand
model_service = None
audio_processor = None
asr_service = None
MODELS_LOADED = False

# Import model-related modules lazily when needed
def import_model_modules():
    """Import ML-related modules only when needed"""
    global TRANSFORMERS_AVAILABLE, MODELS_IMPORTABLE
    
    try:
        import torch
        from transformers import pipeline
        TRANSFORMERS_AVAILABLE = True
    except ImportError:
        print("Warning: transformers or torch not available. Using fallback approach for Hugging Face API.")
        TRANSFORMERS_AVAILABLE = False
    
    # Import our model services - with error handling
    try:
        global ModelService, AudioProcessor, ASRService
        from model_service import ModelService
        from audio_processor import AudioProcessor
        from asr_service import ASRService
        MODELS_IMPORTABLE = True
        return True
    except ImportError as e:
        print(f"Warning: Could not import model services: {e}")
        print("The API will run in limited functionality mode.")
        MODELS_IMPORTABLE = False
        return False

def initialize_models_if_needed():
    """Initialize models only when needed"""
    global model_service, audio_processor, asr_service, MODELS_LOADED
    
    # If models are already loaded, don't load again
    if MODELS_LOADED:
        return True
        
    # Import the model modules
    if not import_model_modules():
        return False
    
    # Default model paths
    ser_model_path = 'models/SER.h5'
    asr_model_path = 'models/ASR.pth'
    
    # Ensure models directory exists
    os.makedirs('models', exist_ok=True)
    
    try:
        # Check if models exist and have content
        if not os.path.exists(ser_model_path) or os.path.getsize(ser_model_path) == 0:
            print(f"Warning: SER model file is missing or empty: {ser_model_path}")
            return False
            
        if not os.path.exists(asr_model_path) or os.path.getsize(asr_model_path) == 0:
            print(f"Warning: ASR model file is missing or empty: {asr_model_path}")
            # We can continue without ASR
        
        # Initialize SER model service
        print(f"Initializing SER model from {ser_model_path}")
        try:
            model_service = ModelService(ser_model_path)
        except Exception as e:
            print(f"Error initializing SER model: {e}")
            return False
        
        # Initialize audio processor
        print("Initializing audio processor")
        try:
            audio_processor = AudioProcessor()
        except Exception as e:
            print(f"Error initializing audio processor: {e}")
            return False
        
        # Initialize ASR model service
        try:
            print(f"Initializing ASR model from {asr_model_path}")
            asr_service = ASRService(asr_model_path)
            print("ASR model initialized successfully")
        except Exception as e:
            print(f"Warning: Failed to initialize ASR service: {e}")
            asr_service = None
        
        print("All services initialized successfully")
        MODELS_LOADED = True
        return True
    except Exception as e:
        print(f"Error initializing models: {e}")
        return False

@app.route('/api/health', methods=['GET', 'OPTIONS'])
def health_check():
    """Health check endpoint"""
    # Handle OPTIONS request (CORS preflight)
    if request.method == 'OPTIONS':
        response = jsonify({"status": "ok"})
        return response
        
    return jsonify({
        "status": "ok", 
        "message": "Speech Emotion Recognition API is running",
        "model_status": "loaded" if MODELS_LOADED else "not_loaded"
    }), 200

@app.route('/api/initialize', methods=['GET', 'POST', 'OPTIONS'])
def initialize_model():
    """Initialize the model with the provided path"""
    # Handle OPTIONS request (CORS preflight)
    if request.method == 'OPTIONS':
        response = jsonify({"status": "ok"})
        return response
        
    if not import_model_modules():
        return jsonify({"status": "error", "message": "Could not import model modules"}), 500
        
    global model_service, audio_processor, asr_service
    
    # For GET requests, use default paths
    if request.method == 'GET':
        ser_model_path = 'models/SER.h5'
        asr_model_path = 'models/ASR.pth'
    else:
        # For POST requests, get paths from JSON payload
        data = request.json
        ser_model_path = data.get('model_path', 'models/SER.h5') if data else 'models/SER.h5'
        asr_model_path = data.get('asr_model_path', 'models/ASR.pth') if data else 'models/ASR.pth'
    
    try:
        # Initialize SER model service
        model_service = ModelService(ser_model_path)
        
        # Initialize audio processor
        audio_processor = AudioProcessor()
        
        # Initialize ASR model service
        try:
            asr_service = ASRService(asr_model_path)
        except Exception as e:
            print(f"Warning: Failed to initialize ASR service: {e}")
            asr_service = None
        
        return jsonify({
            "status": "success", 
            "message": f"Models initialized: SER={ser_model_path}, ASR={asr_model_path if asr_service else 'Not loaded'}",
            "emotions": model_service.emotions
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/analyze', methods=['POST', 'OPTIONS'])
def analyze_audio():
    """Analyze audio data for emotion"""
    # Handle OPTIONS request (CORS preflight)
    if request.method == 'OPTIONS':
        response = jsonify({"status": "ok"})
        return response
        
    # Initialize models if not already loaded
    if not MODELS_LOADED and not initialize_models_if_needed():
        return jsonify({
            "status": "error", 
            "message": "Models could not be initialized. Try again later or contact support."
        }), 500
    
    global model_service, audio_processor, asr_service
    
    if model_service is None:
        return jsonify({"status": "error", "message": "Model not initialized"}), 400
    
    if 'audio' not in request.files:
        return jsonify({"status": "error", "message": "No audio file provided"}), 400
    
    audio_file = request.files['audio']
    confidence_threshold = request.form.get('confidence_threshold', 0.4, type=float)
    
    try:
        # Process audio file
        audio_data = audio_processor.process_audio_file(audio_file)
        
        # Check if speech is actually detected in the audio
        if not audio_processor.detect_speech(audio_data):
            return jsonify({
                "status": "warning",
                "message": "No clear speech detected in the audio",
                "emotion": "neutral",
                "confidence": 0.0,
                "probabilities": {emotion: 0.0 for emotion in model_service.emotions}
            })
        
        # Extract features
        features = audio_processor.extract_features(audio_data)
        
        # Predict emotion
        emotion, confidence, all_probabilities = model_service.predict_emotion(features)
        
        # Apply confidence threshold
        if confidence < confidence_threshold:
            # If confidence is low, default to neutral with a warning
            original_emotion = emotion
            emotion = "neutral"
            message = f"Low confidence ({confidence:.2f}) for detected emotion '{original_emotion}', defaulting to neutral"
        else:
            message = f"Emotion detected with confidence: {confidence:.2f}"
        
        # Get speech characteristics from ASR if available
        speech_characteristics = {}
        speech_rate = 0
        
        if asr_service:
            try:
                # Extract features specifically for ASR
                asr_features = audio_processor.extract_features_for_asr(audio_data)
                speech_characteristics = asr_service.process_audio(asr_features)
                
                # Use ASR model for more accurate speech rate analysis
                # This will override the basic speech rate calculation
                if speech_characteristics:
                    # Calculate speech rate based on the tempo category from ASR
                    tempo_category = speech_characteristics.get("tempo", {}).get("category", "Medium Tempo")
                    
                    # Map tempo categories to approximate words per minute values
                    if tempo_category == "Fast Tempo":
                        speech_rate = 150 + (20 * speech_characteristics["tempo"]["confidence"])
                    elif tempo_category == "Slow Tempo":
                        speech_rate = 90 - (20 * speech_characteristics["tempo"]["confidence"])
                    else: # Medium Tempo
                        speech_rate = 120
                    
                    print(f"Speech rate determined from ASR: {speech_rate} WPM (Category: {tempo_category})")
            except Exception as e:
                print(f"Error in ASR processing: {e}")
        
        # If ASR failed to provide speech rate, fall back to basic calculation
        if speech_rate == 0:
            speech_rate = audio_processor.calculate_speech_rate(audio_data)
            print(f"Using fallback speech rate: {speech_rate}")
        
        response = {
            "status": "success",
            "message": message,
            "emotion": emotion,
            "confidence": float(confidence),
            "speech_rate": float(speech_rate),
            "probabilities": {
                emotion: float(prob) for emotion, prob in zip(model_service.emotions, all_probabilities)
            }
        }
        
        # Add speech characteristics if available
        if speech_characteristics:
            response["speech_characteristics"] = speech_characteristics
            
        # Save the analysis result to the database
        try:
            # TODO: Implement database saving here
            print("Analysis complete - result available for database saving")
        except Exception as save_error:
            print(f"Warning: Failed to save analysis to database: {save_error}")
        
        return jsonify(response)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/proxy/huggingface', methods=['POST', 'OPTIONS'])
def proxy_huggingface():
    """Proxy requests to Hugging Face to avoid CORS issues"""
    # Handle OPTIONS request (CORS preflight)
    if request.method == 'OPTIONS':
        response = jsonify({"status": "ok"})
        return response
        
    try:
        data = request.json
        print("Received proxy request data. Keys:", list(data.keys()))
        
        # Extract data from the request
        model_id = data.get('model', 'firdhokk/speech-emotion-recognition-with-openai-whisper-large-v3')
        api_key = data.get('apiKey')
        audio_base64 = data.get('audio')
        
        if not audio_base64:
            error_msg = "Missing required audio data"
            print(error_msg)
            return jsonify({"status": "error", "message": error_msg}), 400
            
        if not api_key:
            error_msg = "Missing API key"
            print(error_msg)
            return jsonify({"status": "error", "message": error_msg}), 401
        
        print(f"Processing request for model: {model_id}")
        print(f"Audio data length: {len(audio_base64)} characters")
        print(f"API key present: {bool(api_key)}")
        
        # Convert base64 to bytes for local processing
        audio_bytes = base64.b64decode(audio_base64)
        
        # Create temp file to process
        temp_file_path = 'temp_audio.wav'
        with open(temp_file_path, 'wb') as f:
            f.write(audio_bytes)
        
        # Try local transformers pipeline first with more robust error handling
        if TRANSFORMERS_AVAILABLE:
            try:
                print("Using transformers pipeline for emotion classification")
                
                # Use the specific model requested by the user
                from transformers import pipeline
                classifier = pipeline(
                    "audio-classification", 
                    model="firdhokk/speech-emotion-recognition-with-openai-whisper-large-v3",
                    token=api_key  # Add API key to the pipeline
                )
                
                # Set a timeout for inference to avoid hanging
                import signal
                
                def timeout_handler(signum, frame):
                    raise TimeoutError("Model inference timed out")
                
                # Set a 25-second timeout
                signal.signal(signal.SIGALRM, timeout_handler)
                signal.alarm(25)
                
                try:
                    result = classifier(temp_file_path)
                    # Cancel the alarm if successful
                    signal.alarm(0)
                    print("Pipeline classification result:", result)
                    
                    # Clean up temp file
                    try:
                        os.remove(temp_file_path)
                    except:
                        pass
                    
                    # Return formatted result to match expected format
                    return jsonify({
                        "status": "success",
                        "result": result
                    })
                except TimeoutError as te:
                    print(f"Pipeline timeout: {str(te)}")
                    signal.alarm(0)  # Cancel the alarm
                    raise  # Re-raise to be caught by outer exception handler
                
            except Exception as pipeline_error:
                import traceback
                print(f"Pipeline error: {str(pipeline_error)}")
                print(traceback.format_exc())
                print("Falling back to REST API")
        else:
            print("Transformers not available, using REST API")
        
        # REST API fallback with improved retry logic
        max_retries = 3
        retry_count = 0
        last_error = None
        
        while retry_count < max_retries:
            try:
                # Standard REST API fallback approach
                hf_url = f"https://api-inference.huggingface.co/models/{model_id}"
                
                # Standard REST API request
                headers = {
                    'Authorization': f'Bearer {api_key}',
                    'Content-Type': 'application/json'
                }
                
                # For audio models, the API expects the base64 string directly
                payload = {
                    'inputs': audio_base64
                }
                
                # Make the request with a longer timeout
                print(f"Making HuggingFace API request (attempt {retry_count + 1}/{max_retries})...")
                hf_response = requests.post(
                    hf_url,
                    headers=headers,
                    json=payload,
                    timeout=30
                )
                
                print(f"REST API response status: {hf_response.status_code}")
                
                if hf_response.ok:
                    # Process and return the response
                    result = hf_response.json()
                    print("REST API response:", result)
                    
                    # Clean up temp file
                    try:
                        os.remove(temp_file_path)
                    except:
                        pass
                    
                    return jsonify({
                        "status": "success",
                        "result": result
                    })
                elif hf_response.status_code == 503:
                    # Model is loading, retry after delay
                    retry_count += 1
                    last_error = hf_response.text
                    wait_time = 2 ** retry_count  # Exponential backoff (2, 4, 8 seconds)
                    print(f"503 Service Unavailable, retrying after {wait_time} seconds...")
                    time.sleep(wait_time)
                else:
                    # Other error, return immediately
                    error_text = hf_response.text
                    print(f"REST API error: {error_text}")
                    
                    # Clean up temp file
                    try:
                        os.remove(temp_file_path)
                    except:
                        pass
                    
                    return jsonify({
                        "status": "error", 
                        "message": f"Hugging Face API error: {hf_response.status_code}", 
                        "error": error_text,
                        "_meta": {
                            "using_fallback": True,
                            "fallback_reason": f"HuggingFace API error: {hf_response.status_code}"
                        }
                    }), hf_response.status_code
            
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
        
        # Clean up temp file
        try:
            os.remove(temp_file_path)
        except:
            pass
        
        # Extract simple emotion from filename if possible or provide neutral fallback
        # This is just a basic fallback when the API is completely unavailable
        fallback_result = [
            {"label": "neutral", "score": 0.8},
            {"label": "happy", "score": 0.1},
            {"label": "sad", "score": 0.05},
            {"label": "angry", "score": 0.05}
        ]
        
        return jsonify({
            "status": "success",
            "result": fallback_result,
            "_meta": {
                "using_fallback": True,
                "fallback_reason": f"HuggingFace service unavailable after {max_retries} attempts: {last_error}"
            }
        })
        
    except Exception as e:
        import traceback
        print(f"Exception in proxy_huggingface: {str(e)}")
        print(traceback.format_exc())
        
        # Clean up temp file if it exists
        try:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
        except:
            pass
            
        return jsonify({
            "status": "error", 
            "message": str(e),
            "_meta": {
                "using_fallback": True,
                "fallback_reason": "Internal server error"
            }
        }), 500

# Socket.IO event handlers
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print('Client connected')
    emit('connection_response', {'status': 'connected'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print('Client disconnected')

@socketio.on('audio_stream')
def handle_audio_stream(data):
    """Process streaming audio data"""
    global model_service, audio_processor, asr_service
    
    if model_service is None or audio_processor is None:
        emit('error', {'message': 'Model not initialized'})
        return
    
    try:
        # Convert base64 audio data to numpy array
        audio_data = audio_processor.decode_audio_data(data['audio'])
        
        # Get confidence threshold from client or use default
        confidence_threshold = data.get('confidence_threshold', 0.4)
        
        # Check if speech is detected
        is_speech = audio_processor.detect_speech(audio_data)
        
        # Check for client-provided metadata (frontend speech analysis)
        client_metadata = data.get('metadata', {})
        client_speech_rate = client_metadata.get('speechRate')
        
        if is_speech:
            # Extract features
            features = audio_processor.extract_features(audio_data)
            
            # Predict emotion
            emotion, confidence, all_probabilities = model_service.predict_emotion(features)
            
            # Apply confidence threshold
            if confidence < confidence_threshold:
                # If confidence is low, default to neutral with a warning
                original_emotion = emotion
                emotion = "neutral"
                message = f"Low confidence ({confidence:.2f}) for detected emotion '{original_emotion}'"
            else:
                message = f"Emotion detected: {emotion}"
            
            # Calculate speech rate - prioritize client calculation if available
            speech_rate = client_speech_rate if client_speech_rate is not None else audio_processor.calculate_speech_rate(audio_data)
            
            # Get speech characteristics from ASR if available
            speech_characteristics = {}
            if asr_service:
                try:
                    # Extract features specifically for ASR
                    asr_features = audio_processor.extract_features_for_asr(audio_data)
                    speech_characteristics = asr_service.process_audio(asr_features)
                except Exception as e:
                    print(f"Error in ASR processing: {e}")
            
            # Prepare response
            response = {
                'status': 'success',
                'message': message,
                'is_speech': True,
                'emotion': emotion,
                'confidence': float(confidence),
                'speech_rate': float(speech_rate) if speech_rate is not None else 0,
                'probabilities': {
                    emotion: float(prob) for emotion, prob in zip(model_service.emotions, all_probabilities)
                }
            }
            
            # Add speech characteristics if available
            if speech_characteristics:
                response['speech_characteristics'] = speech_characteristics
        else:
            # No speech detected
            response = {
                'status': 'no_speech',
                'message': 'No speech detected in audio',
                'is_speech': False,
                'emotion': 'neutral',
                'confidence': 0.0
            }
        
        # Emit result
        emit('emotion_result', response)
    except Exception as e:
        print(f"Error processing streaming audio: {e}")
        emit('error', {'message': str(e)})

if __name__ == '__main__':
    # Create models directory if it doesn't exist
    os.makedirs('models', exist_ok=True)
    
    # Get the port from the environment variable or use default
    port = int(os.environ.get('PORT', 5001))
    
    # Start the Socket.IO server with threading
    socketio.run(app, host='0.0.0.0', port=port)
