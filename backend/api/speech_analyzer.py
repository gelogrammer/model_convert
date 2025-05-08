import os
import sys
import numpy as np
import torch
import librosa
import soundfile as sf
from flask import Flask, request, jsonify
from flask_cors import CORS
import tempfile
import asyncio
import time
import logging
from io import BytesIO
from scipy.io import wavfile

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ASR Model Configuration
class ASRConfig:
    # Model paths
    MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
    MODEL_PATH = os.path.join(MODEL_DIR, "ASR.pth")
    
    # Audio parameters
    SAMPLE_RATE = 16000
    CHUNK_SIZE = 4096
    
    # Processing parameters
    FRAME_LENGTH = 0.025  # 25ms frame
    FRAME_STRIDE = 0.010  # 10ms stride
    
    # Feature extraction
    N_MFCC = 13
    N_FFT = 512
    HOP_LENGTH = 160  # Corresponds to 10ms at 16kHz
    
    # Classification thresholds
    FLUENCY_THRESHOLDS = [0.3, 0.7]  # Low-Medium-High thresholds
    TEMPO_THRESHOLDS = [90, 150]      # WPM thresholds (Slow-Medium-Fast)
    PRONUNCIATION_THRESHOLD = 0.65    # Clear vs. Unclear threshold

# Global variables
asr_model = None
device = None

def load_model():
    """Load the ASR model"""
    global asr_model, device
    
    logger.info("Loading ASR model...")
    
    try:
        # Determine the device (CPU or GPU)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using device: {device}")
        
        # Ensure model directory exists
        os.makedirs(ASRConfig.MODEL_DIR, exist_ok=True)
        
        # Check if model file exists
        if not os.path.exists(ASRConfig.MODEL_PATH):
            logger.warning(f"Model file not found at {ASRConfig.MODEL_PATH}")
            logger.info("Initializing with dummy model for demonstration")
            
            # Create a dummy model for demonstration
            class DummyASRModel(torch.nn.Module):
                def __init__(self):
                    super().__init__()
                    self.linear = torch.nn.Linear(ASRConfig.N_MFCC, 3)
                    
                def forward(self, x):
                    return self.linear(x)
            
            asr_model = DummyASRModel().to(device)
            logger.info("Dummy model initialized")
        else:
            # Load actual model
            asr_model = torch.load(ASRConfig.MODEL_PATH, map_location=device)
            logger.info(f"Model loaded from {ASRConfig.MODEL_PATH}")
        
        # Set model to evaluation mode
        asr_model.eval()
        return True
    
    except Exception as e:
        logger.error(f"Error loading ASR model: {str(e)}")
        return False

def process_audio(audio_data, sample_rate):
    """Process audio data and extract features"""
    try:
        # Resample if needed
        if sample_rate != ASRConfig.SAMPLE_RATE:
            audio_data = librosa.resample(audio_data, orig_sr=sample_rate, target_sr=ASRConfig.SAMPLE_RATE)
            sample_rate = ASRConfig.SAMPLE_RATE
        
        # Extract MFCC features
        mfccs = librosa.feature.mfcc(
            y=audio_data, 
            sr=sample_rate,
            n_mfcc=ASRConfig.N_MFCC,
            n_fft=ASRConfig.N_FFT,
            hop_length=ASRConfig.HOP_LENGTH
        )
        
        # Calculate delta features (first and second derivatives)
        delta_mfccs = librosa.feature.delta(mfccs)
        delta2_mfccs = librosa.feature.delta(mfccs, order=2)
        
        # Stack features
        features = np.vstack([mfccs, delta_mfccs, delta2_mfccs])
        
        # Transpose to (time, features)
        features = features.T
        
        # Convert to tensor and move to device
        features_tensor = torch.tensor(features, dtype=torch.float32).to(device)
        
        return features_tensor
    
    except Exception as e:
        logger.error(f"Error processing audio: {str(e)}")
        return None

def analyze_speech(audio_data, sample_rate, boost_sensitivity=False):
    """Analyze speech using the ASR model"""
    try:
        global asr_model
        if asr_model is None:
            success = load_model()
            if not success or asr_model is None:
                logger.error("Failed to load ASR model")
                return None
            
        # Process audio to extract features
        features = process_audio(audio_data, sample_rate)
        
        if features is None:
            return None
        
        # Calculate speech rate (syllables per second)
        energy = librosa.feature.rms(y=audio_data)[0]
        speech_frames = np.where(energy > np.mean(energy) * 0.5)[0]
        
        # If boosting sensitivity, adjust the energy threshold
        if boost_sensitivity:
            speech_frames = np.where(energy > np.mean(energy) * 0.3)[0]
        
        if len(speech_frames) == 0:
            logger.info("No speech detected in audio")
            return None
        
        # Estimate syllables from energy peaks
        syllable_peaks, _ = librosa.util.peak_pick(
            energy, 
            pre_max=3, 
            post_max=3, 
            pre_avg=3, 
            post_avg=5, 
            delta=0.2, 
            wait=3
        )
        
        # If boosting sensitivity, increase syllable count slightly
        syllable_count = len(syllable_peaks)
        if boost_sensitivity and syllable_count > 0:
            syllable_count = int(syllable_count * 1.2)  # Boost by 20%
        
        duration = len(audio_data) / sample_rate
        speech_rate_syllables = syllable_count / duration if duration > 0 else 0
        
        # Convert to WPM (assuming average 1.5 syllables per word)
        speech_rate_wpm = speech_rate_syllables * 60 / 1.5
        
        # Make prediction with the model
        with torch.no_grad():
            logits = asr_model(features)
            probabilities = torch.nn.functional.softmax(logits, dim=1)
            mean_probs = torch.mean(probabilities, dim=0).cpu().numpy()
        
        # Assuming the model outputs probabilities for different aspects:
        # [fluency, tempo, pronunciation]
        fluency_prob = mean_probs[0]
        tempo_prob = mean_probs[1] 
        pronunciation_prob = mean_probs[2]
        
        # Define categories based on probabilities
        # Fluency: Low, Medium, High
        if fluency_prob < ASRConfig.FLUENCY_THRESHOLDS[0]:
            fluency_category = "Low Fluency"
        elif fluency_prob < ASRConfig.FLUENCY_THRESHOLDS[1]:
            fluency_category = "Medium Fluency"
        else:
            fluency_category = "High Fluency"
        
        # Tempo: based on speech rate (WPM)
        if speech_rate_wpm < ASRConfig.TEMPO_THRESHOLDS[0]:
            tempo_category = "Slow Tempo"
        elif speech_rate_wpm < ASRConfig.TEMPO_THRESHOLDS[1]:
            tempo_category = "Medium Tempo"
        else:
            tempo_category = "Fast Tempo"
        
        # Pronunciation: Clear or Unclear
        pronunciation_category = "Clear Pronunciation" if pronunciation_prob > ASRConfig.PRONUNCIATION_THRESHOLD else "Unclear Pronunciation"
        
        # If we're boosting sensitivity, adjust confidence values slightly
        confidence_boost = 1.1 if boost_sensitivity else 1.0
        
        # Compile results
        result = {
            "speech_rate": speech_rate_wpm,
            "is_speech": True,
            "speech_characteristics": {
                "fluency": {
                    "category": fluency_category,
                    "confidence": min(fluency_prob * confidence_boost, 1.0)
                },
                "tempo": {
                    "category": tempo_category,
                    "confidence": min(tempo_prob * confidence_boost, 1.0)
                },
                "pronunciation": {
                    "category": pronunciation_category,
                    "confidence": min(pronunciation_prob * confidence_boost, 1.0)
                }
            }
        }
        
        return result
    
    except Exception as e:
        logger.error(f"Error analyzing speech: {str(e)}")
        return None

def create_app():
    app = Flask(__name__)
    CORS(app)
    
    @app.route('/api/analyze', methods=['POST'])
    def analyze_audio():
        """Handle audio analysis requests"""
        try:
            # Get audio file from request
            if 'audio' not in request.files:
                return jsonify({"status": "error", "message": "No audio file provided"}), 400
            
            # Get confidence threshold and sensitivity boost parameters
            confidence_threshold = float(request.form.get('confidence_threshold', '0.2'))
            boost_sensitivity = request.form.get('boost_sensitivity', 'false').lower() == 'true'
            
            audio_file = request.files['audio']
            
            # Save audio to a temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
                audio_file.save(temp_file.name)
                temp_file_path = temp_file.name
            
            try:
                # Load audio data
                audio_data, sample_rate = librosa.load(temp_file_path, sr=None)
                
                # Delete temporary file
                os.unlink(temp_file_path)
                
                # Check if audio contains speech (energy above threshold)
                if np.mean(np.abs(audio_data)) < 0.01 * confidence_threshold:
                    logger.info("Audio energy too low, no clear speech detected")
                    return jsonify({
                        "status": "error", 
                        "message": "No clear speech detected in the audio"
                    }), 400
                
                # Analyze speech
                analysis_result = analyze_speech(audio_data, sample_rate, boost_sensitivity)
                
                if analysis_result is None:
                    return jsonify({
                        "status": "error", 
                        "message": "Failed to analyze speech"
                    }), 500
                
                # Add status to result
                analysis_result["status"] = "success"
                
                return jsonify(analysis_result)
                
            except Exception as e:
                # Clean up temp file if still exists
                if os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)
                raise e
        
        except Exception as e:
            logger.error(f"Error processing request: {str(e)}")
            return jsonify({"status": "error", "message": str(e)}), 500
    
    @app.route('/api/initialize', methods=['POST'])
    def initialize_model():
        """Initialize the ASR model"""
        try:
            success = load_model()
            
            if success:
                return jsonify({"status": "success", "message": "ASR model initialized successfully"})
            else:
                return jsonify({"status": "error", "message": "Failed to initialize ASR model"}), 500
        
        except Exception as e:
            logger.error(f"Error initializing model: {str(e)}")
            return jsonify({"status": "error", "message": str(e)}), 500
    
    return app

if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5001, host='0.0.0.0') 