"""
Flask application for Real-Time Speech Emotion Recognition API.
"""

import os
import json
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import eventlet

# Import our model services
from model_service import ModelService
from audio_processor import AudioProcessor
from asr_service import ASRService

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configure Socket.IO
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Initialize model services
model_service = None
audio_processor = None
asr_service = None

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
    
    data = request.json
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
        
        # Calculate speech rate
        speech_rate = audio_processor.calculate_speech_rate(audio_data)
        
        # Get speech characteristics from ASR if available
        speech_characteristics = {}
        if asr_service:
            try:
                speech_characteristics = asr_service.process_audio(features)
            except Exception as e:
                print(f"Error in ASR processing: {e}")
        
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
            
        return jsonify(response)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

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
                    speech_characteristics = asr_service.process_audio(features)
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
    # Start the Socket.IO server
    socketio.run(app, host='0.0.0.0', port=5001, debug=True)
