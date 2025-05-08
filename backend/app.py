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
import eventlet
import requests
import time
try:
    import torch
    from transformers.pipelines import pipeline
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    print("Warning: transformers or torch not available. Using fallback approach for Hugging Face API.")
    TRANSFORMERS_AVAILABLE = False

# Import our model services
from model_service import ModelService
from audio_processor import AudioProcessor
from asr_service import ASRService

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configure Socket.IO with more permissive CORS settings and longer ping timeout
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='eventlet',
    ping_timeout=60,
    ping_interval=25,
    logger=True,
    engineio_logger=True
)

# Initialize model services
model_service = None
audio_processor = None
asr_service = None

# Default confidence threshold for dominant emotion detection
DEFAULT_CONFIDENCE_THRESHOLD = 0.35  # Adjusted from 0.4 to 0.35 for better sensitivity

# Auto-initialize the models on startup
def initialize_on_startup():
    global model_service, audio_processor, asr_service
    
    # Default model paths
    ser_model_path = 'models/SER.h5'
    asr_model_path = 'models/ASR.pth'
    
    # Ensure models directory exists
    os.makedirs('models', exist_ok=True)
    
    try:
        # Initialize SER model service
        print(f"Initializing SER model from {ser_model_path}")
        model_service = ModelService(ser_model_path)
        
        # Initialize audio processor
        print("Initializing audio processor")
        audio_processor = AudioProcessor()
        
        # Initialize ASR model service
        try:
            print(f"Initializing ASR model from {asr_model_path}")
            asr_service = ASRService(asr_model_path)
            print("ASR model initialized successfully")
        except Exception as e:
            print(f"Warning: Failed to initialize ASR service: {e}")
            asr_service = None
        
        print("All services initialized successfully")
        return True
    except Exception as e:
        print(f"Error initializing models: {e}")
        return False

# Run initialization
initialize_on_startup()

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "ok", "message": "Speech Emotion Recognition API is running"})

@app.route('/api/initialize', methods=['POST'])
def initialize_model():
    """Initialize the model with the provided path"""
    global model_service, audio_processor, asr_service
    
    data = request.get_json() or {}
    ser_model_path = data.get('model_path', 'models/SER.h5')
    asr_model_path = data.get('asr_model_path', 'models/ASR.pth')
    
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

@app.route('/api/analyze', methods=['POST'])
def analyze_audio():
    """Analyze audio data for emotion"""
    global model_service, audio_processor, asr_service
    
    if model_service is None:
        return jsonify({"status": "error", "message": "Model not initialized"}), 400
    
    if 'audio' not in request.files:
        return jsonify({"status": "error", "message": "No audio file provided"}), 400
    
    audio_file = request.files['audio']
    confidence_threshold = request.form.get('confidence_threshold', DEFAULT_CONFIDENCE_THRESHOLD, type=float)
    # Option to turn off smoothing for diagnostic purposes
    apply_smoothing = request.form.get('apply_smoothing', 'true').lower() != 'false'
    
    try:
        # Check if audio_processor is initialized
        if audio_processor is None:
            return jsonify({"status": "error", "message": "Audio processor not initialized"}), 500
            
        # Process audio file
        audio_data = audio_processor.process_audio_file(audio_file)
        
        # Apply a noise gate to filter out background noise
        audio_data = audio_processor._normalize_audio(audio_data)
        
        # Check audio duration
        audio_duration = len(audio_data) / audio_processor.sample_rate
        if audio_duration < 0.5:
            return jsonify({
                "status": "warning",
                "message": "Audio clip too short for accurate analysis (less than 0.5 seconds)",
                "emotion": "neutral",
                "confidence": 0.0,
                "probabilities": {emotion: 0.0 for emotion in model_service.emotions}
            })
        
        # Check if speech is actually detected in the audio with enhanced detection
        if not audio_processor.detect_speech(audio_data):
            return jsonify({
                "status": "warning",
                "message": "No clear speech detected in the audio",
                "emotion": "neutral",
                "confidence": 0.0,
                "probabilities": {emotion: 0.0 for emotion in model_service.emotions}
            })
        
        # Extract features with enhanced feature extraction
        features = audio_processor.extract_features(audio_data)
        
        # Predict emotion
        emotion, confidence, all_probabilities = model_service.predict_emotion(features, apply_smoothing=apply_smoothing)
        
        # Calculate emotion dominance ratio (highest vs second highest probability)
        sorted_probs = sorted(all_probabilities, reverse=True)
        dominance_ratio = sorted_probs[0] / sorted_probs[1] if len(sorted_probs) > 1 and sorted_probs[1] > 0 else 1.0
        
        # Apply confidence threshold with dynamic adjustment based on dominance ratio
        adjusted_threshold = confidence_threshold
        if dominance_ratio < 1.2:  # If top emotions are very close
            adjusted_threshold = confidence_threshold * 1.1  # Require higher confidence
        elif dominance_ratio > 2.0:  # If top emotion is clearly dominant
            adjusted_threshold = confidence_threshold * 0.9  # Lower threshold
        
        if confidence < adjusted_threshold:
            # If confidence is low, default to neutral with a warning
            original_emotion = emotion
            emotion = "neutral"
            message = f"Low confidence ({confidence:.2f}) for detected emotion '{original_emotion}', defaulting to neutral"
        else:
            message = f"Emotion detected with confidence: {confidence:.2f}"
        
        # Get speech characteristics from ASR if available
        speech_characteristics = {}
        speech_rate = 0
        
        if asr_service and audio_processor:
            try:
                # Extract features specifically for ASR
                asr_features = audio_processor.extract_features_for_asr(audio_data)
                speech_characteristics = asr_service.process_audio(asr_features)
                
                # Use ASR model for more accurate speech rate analysis
                # This will override the basic speech rate calculation
                if speech_characteristics:
                    # Calculate speech rate based on the tempo category from ASR
                    tempo_category = speech_characteristics.get("tempo", {}).get("category", "Medium Tempo")
                    tempo_confidence = speech_characteristics.get("tempo", {}).get("confidence", 0.5)
                    
                    # Map tempo categories to approximate words per minute values
                    if tempo_category == "Fast Tempo":
                        speech_rate = 150 + (20 * tempo_confidence)
                    elif tempo_category == "Slow Tempo":
                        speech_rate = 90 - (20 * tempo_confidence)
                    else: # Medium Tempo
                        speech_rate = 120
                    
                    # Use speech characteristics to enhance emotion detection
                    if speech_characteristics.get("fluency", {}).get("confidence", 0) > 0.7:
                        # High fluency tends to indicate positive emotions or neutral state
                        if speech_characteristics["fluency"]["category"] == "High Fluency" and emotion == "neutral" and confidence < 0.55:
                            # Check if happiness or surprise have decent probability
                            happiness_prob = all_probabilities[model_service.emotions.index("happiness")]
                            surprise_prob = all_probabilities[model_service.emotions.index("surprise")]
                            
                            if happiness_prob > 0.2:
                                emotion = "happiness"
                                confidence = happiness_prob * 1.1  # Boost confidence slightly
                            elif surprise_prob > 0.2:
                                emotion = "surprise"
                                confidence = surprise_prob * 1.1
                    
                    print(f"Speech rate determined from ASR: {speech_rate} WPM (Category: {tempo_category})")
            except Exception as e:
                print(f"Error in ASR processing: {e}")
        
        # If ASR failed to provide speech rate, fall back to basic calculation
        if speech_rate == 0 and audio_processor:
            speech_rate = audio_processor.calculate_speech_rate(audio_data)
            print(f"Using fallback speech rate: {speech_rate}")
        
        response = {
            "status": "success",
            "message": message,
            "emotion": emotion,
            "confidence": float(confidence),
            "speech_rate": float(speech_rate),
            "dominance_ratio": float(dominance_ratio),
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

@app.route('/api/proxy/huggingface', methods=['POST'])
def proxy_huggingface():
    """Proxy requests to Hugging Face to avoid CORS issues"""
    try:
        data = request.get_json() or {}
        print("Received proxy request data. Keys:", list(data.keys() if data else []))
        
        # Extract data from the request
        model_id = data.get('model', 'firdhokk/speech-emotion-recognition-with-openai-whisper-large-v3')
        api_key = data.get('apiKey')
        audio_base64 = data.get('audio')
        
        if not audio_base64:
            error_msg = "Missing required audio data"
            print(error_msg)
            return jsonify({"status": "error", "message": error_msg}), 400
            
        if not api_key:
            # Instead of 401, return 400 with message for better client-side handling
            error_msg = "Missing API key"
            print(error_msg)
            return jsonify({"status": "error", "message": error_msg}), 400
        
        print(f"Processing request for model: {model_id}")
        print(f"Audio data length: {len(audio_base64)} characters")
        print(f"API key present: {bool(api_key)}")
        
        # Validate base64 string format
        try:
            # Convert base64 to bytes for local processing
            audio_bytes = base64.b64decode(audio_base64)
            print(f"Successfully decoded base64 data, size: {len(audio_bytes)} bytes")
        except Exception as e:
            error_detail = str(e)
            print(f"Invalid base64 data: {error_detail}")
            # Include more details about the first few characters of the base64 string to help diagnose
            sample = audio_base64[:50] + "..." if len(audio_base64) > 50 else audio_base64
            print(f"Base64 sample: {sample}")
            return jsonify({
                "status": "error", 
                "message": "Invalid audio data format", 
                "details": error_detail
            }), 400
        
        # Create temp file to process
        temp_file_path = 'temp_audio.wav'
        try:
            with open(temp_file_path, 'wb') as f:
                f.write(audio_bytes)
        except Exception as e:
            print(f"Failed to write temporary file: {str(e)}")
            return jsonify({"status": "error", "message": "Failed to process audio data"}), 500
        
        # Try local transformers pipeline first with more robust error handling
        if TRANSFORMERS_AVAILABLE:
            try:
                print("Using transformers pipeline for emotion classification")
                
                # Use the specific model requested by the user
                classifier = pipeline(
                    "audio-classification", 
                    model="firdhokk/speech-emotion-recognition-with-openai-whisper-large-v3",
                    token=api_key  # Add API key to the pipeline
                )
                
                # Use threading for timeout instead of signal (for Windows compatibility)
                import threading
                
                result = None
                timeout_occurred = False
                
                def run_classifier():
                    nonlocal result
                    try:
                        result = classifier(temp_file_path)
                    except Exception as e:
                        print(f"Classifier error: {e}")
                
                # Create and start the thread
                thread = threading.Thread(target=run_classifier)
                thread.start()
                thread.join(timeout=25)  # 25 second timeout
                
                if thread.is_alive():
                    timeout_occurred = True
                    print("Pipeline timeout after 25 seconds")
                    # We can't terminate the thread safely in Python,
                    # but we can continue with our fallback
                
                if timeout_occurred:
                    print("Pipeline timeout")
                    raise TimeoutError("Model inference timed out")
                
                if result:
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
        confidence_threshold = data.get('confidence_threshold', DEFAULT_CONFIDENCE_THRESHOLD)
        
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
            
            # Calculate dominance ratio (highest vs second highest probability)
            sorted_probs = sorted(all_probabilities, reverse=True)
            dominance_ratio = sorted_probs[0] / sorted_probs[1] if len(sorted_probs) > 1 and sorted_probs[1] > 0 else 1.0
            
            # Apply confidence threshold with dynamic adjustment
            adjusted_threshold = confidence_threshold
            if dominance_ratio < 1.2:  # If top emotions are very close
                adjusted_threshold = confidence_threshold * 1.1  # Require higher confidence
            elif dominance_ratio > 2.0:  # If top emotion is clearly dominant
                adjusted_threshold = confidence_threshold * 0.9  # Lower threshold
                
            if confidence < adjusted_threshold:
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
                    
                    # Check if features are valid
                    if asr_features is not None and len(asr_features) > 0:
                        speech_characteristics = asr_service.process_audio(asr_features)
                    else:
                        print("Warning: ASR features are invalid, skipping ASR analysis")
                except Exception as e:
                    print(f"Error in ASR processing: {e}")
                    import traceback
                    print(traceback.format_exc())
            
            # Prepare response
            response = {
                'status': 'success',
                'message': message,
                'is_speech': True,
                'emotion': emotion,
                'confidence': float(confidence),
                'dominance_ratio': float(dominance_ratio),
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
        import traceback
        print(traceback.format_exc())
        emit('error', {'message': str(e)})

if __name__ == '__main__':
    # Create models directory if it doesn't exist
    os.makedirs('models', exist_ok=True)
    
    # Get the port from the environment variable or use default
    port = int(os.environ.get('PORT', 5001))
    
    # Print startup message
    print(f"Starting server on http://0.0.0.0:{port}")
    print("Press Ctrl+C to stop the server")
    
    try:
        # Start the Socket.IO server
        socketio.run(app, host='0.0.0.0', port=port, debug=False)
    except KeyboardInterrupt:
        print("Server stopped by user")
    except Exception as e:
        print(f"Server error: {e}")
