"""
Audio processing utilities for Speech Emotion Recognition.
"""

import numpy as np
import librosa
import base64
import io
import wave
import soundfile as sf

class AudioProcessor:
    """Audio processing for speech emotion recognition"""
    
    def __init__(self, sample_rate=16000):
        """
        Initialize audio processor.
        
        Args:
            sample_rate: Audio sample rate
        """
        self.sample_rate = sample_rate
        
        # Feature extraction parameters
        self.n_mfcc = 40
        self.n_fft = 2048
        self.hop_length = 512
        
        print(f"Audio processor initialized with sample rate {sample_rate}Hz")
    
    def process_audio_file(self, audio_file):
        """
        Process audio file to numpy array.
        
        Args:
            audio_file: Audio file from request
            
        Returns:
            Numpy array of audio data
        """
        # Save temporary file
        temp_file = io.BytesIO()
        audio_file.save(temp_file)
        temp_file.seek(0)
        
        try:
            # Try using librosa first
            audio_data, _ = librosa.load(temp_file, sr=self.sample_rate, mono=True)
        except Exception as e:
            # Fall back to soundfile if librosa fails
            temp_file.seek(0)
            try:
                audio_data, sample_rate = sf.read(temp_file)
                # Convert to mono if needed
                if len(audio_data.shape) > 1:
                    audio_data = np.mean(audio_data, axis=1)
                # Resample if needed
                if sample_rate != self.sample_rate:
                    audio_data = librosa.resample(audio_data, orig_sr=sample_rate, target_sr=self.sample_rate)
            except Exception as sf_error:
                print(f"Error loading audio with soundfile: {sf_error}")
                # If all else fails, return empty array
                audio_data = np.zeros(self.sample_rate)  # 1 second of silence
        
        return audio_data
    
    def decode_audio_data(self, base64_audio):
        """
        Decode base64 audio data.
        
        Args:
            base64_audio: Base64 encoded audio data
            
        Returns:
            Numpy array of audio data
        """
        # Decode base64
        try:
            audio_bytes = base64.b64decode(base64_audio.split(',')[1] if ',' in base64_audio else base64_audio)
            
            # Try to interpret as float32 array
            try:
                audio_data = np.frombuffer(audio_bytes, dtype=np.float32)
            except Exception as e:
                # If that fails, try wav format
                try:
                    with io.BytesIO(audio_bytes) as wav_io:
                        with wave.open(wav_io, 'rb') as wav_file:
                            frames = wav_file.readframes(wav_file.getnframes())
                            audio_data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
                except Exception as wave_error:
                    # Last attempt with soundfile
                    try:
                        with io.BytesIO(audio_bytes) as sf_io:
                            audio_data, _ = sf.read(sf_io)
                    except Exception as sf_error:
                        print(f"Failed to decode audio: {sf_error}")
                        audio_data = np.zeros(self.sample_rate, dtype=np.float32)
        except Exception as e:
            print(f"Failed to decode base64 audio: {e}")
            audio_data = np.zeros(self.sample_rate, dtype=np.float32)
        
        return audio_data
    
    def extract_features(self, audio_data):
        """
        Extract features for emotion recognition.
        
        Args:
            audio_data: Audio data to extract features from
            
        Returns:
            Features for SER model
        """
        # Extract MFCCs
        mfccs = librosa.feature.mfcc(
            y=audio_data,
            sr=self.sample_rate,
            n_mfcc=self.n_mfcc,
            n_fft=self.n_fft,
            hop_length=self.hop_length
        )
        
        # Extract additional features
        chroma = librosa.feature.chroma_stft(
            y=audio_data,
            sr=self.sample_rate,
            n_fft=self.n_fft,
            hop_length=self.hop_length
        )
        
        mel = librosa.feature.melspectrogram(
            y=audio_data,
            sr=self.sample_rate,
            n_fft=self.n_fft,
            hop_length=self.hop_length
        )
        
        # Get statistics
        mfccs_mean = np.mean(mfccs, axis=1)
        mfccs_std = np.std(mfccs, axis=1)
        chroma_mean = np.mean(chroma, axis=1)
        mel_mean = np.mean(mel, axis=1)
        
        # Combine features
        features = np.concatenate([
            mfccs_mean, mfccs_std, chroma_mean, mel_mean
        ])
        
        # Ensure we have exactly 180 features as expected by the model
        if len(features) > 180:
            features = features[:180]  # Truncate if too many
        elif len(features) < 180:
            # Pad with zeros if too few
            features = np.pad(features, (0, 180 - len(features)), 'constant')
        
        return features
    
    def detect_speech(self, audio_data, energy_threshold=0.01):
        """
        Simple speech detection based on energy.
        
        Args:
            audio_data: Audio data to check
            energy_threshold: Energy threshold for speech detection
            
        Returns:
            True if speech detected, False otherwise
        """
        # Calculate energy
        energy = np.mean(np.abs(audio_data))
        
        # Check if energy is above threshold
        return energy > energy_threshold
    
    def calculate_speech_rate(self, audio_data, min_silence_duration=0.2):
        """
        Calculate speech rate in syllables per second.
        
        Args:
            audio_data: Audio data to analyze
            min_silence_duration: Minimum silence duration in seconds
            
        Returns:
            Speech rate in syllables per second
        """
        # Simple energy-based syllable detection
        energy = np.abs(audio_data)
        
        # Smooth energy
        window_size = int(self.sample_rate * 0.01)  # 10ms window
        energy_smooth = np.convolve(energy, np.ones(window_size)/window_size, mode='same')
        
        # Find peaks (syllables)
        from scipy.signal import find_peaks
        peaks, _ = find_peaks(energy_smooth, height=0.05, distance=int(self.sample_rate * 0.1))
        
        # Count syllables
        num_syllables = len(peaks)
        
        # Calculate duration (excluding silence)
        silence_threshold = 0.01
        is_silence = energy_smooth < silence_threshold
        
        # Group consecutive silence frames
        silence_groups = []
        current_group = []
        
        for i, silent in enumerate(is_silence):
            if silent:
                current_group.append(i)
            elif current_group:
                silence_groups.append(current_group)
                current_group = []
        
        if current_group:
            silence_groups.append(current_group)
        
        # Filter out short silence groups
        min_frames = int(min_silence_duration * self.sample_rate)
        long_silence_frames = sum(len(group) for group in silence_groups if len(group) >= min_frames)
        
        # Calculate speech duration
        total_frames = len(audio_data)
        speech_frames = total_frames - long_silence_frames
        speech_duration = speech_frames / self.sample_rate
        
        # Calculate speech rate
        if speech_duration > 0 and num_syllables > 0:
            speech_rate = num_syllables / speech_duration
        else:
            speech_rate = 0.0
        
        return speech_rate
