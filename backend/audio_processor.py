"""
Audio processing utilities for Speech Emotion Recognition.
"""

import numpy as np
import librosa
import base64
import io
import wave

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
        
        # Energy thresholds for better speech detection
        self.speech_energy_threshold = 0.015  # Increased from default 0.01
        self.silence_energy_threshold = 0.008  # For silence detection
        
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
        
        # Load audio file
        audio_data, _ = librosa.load(temp_file, sr=self.sample_rate, mono=True)
        
        # Apply pre-emphasis filter to boost higher frequencies
        audio_data = self._apply_preemphasis(audio_data)
        
        # Normalize audio data
        audio_data = self._normalize_audio(audio_data)
        
        return audio_data
    
    def _normalize_audio(self, audio_data):
        """Normalize audio data to range [-1, 1]"""
        if np.abs(audio_data).max() > 0:
            return audio_data / np.abs(audio_data).max()
        return audio_data
    
    def _apply_preemphasis(self, audio_data, coef=0.97):
        """Apply pre-emphasis filter to boost higher frequencies"""
        return np.append(audio_data[0], audio_data[1:] - coef * audio_data[:-1])
    
    def decode_audio_data(self, base64_audio):
        """
        Decode base64 audio data.
        
        Args:
            base64_audio: Base64 encoded audio data
            
        Returns:
            Numpy array of audio data
        """
        # Decode base64
        audio_bytes = base64.b64decode(base64_audio.split(',')[1] if ',' in base64_audio else base64_audio)
        
        # Convert to numpy array
        audio_data = np.frombuffer(audio_bytes, dtype=np.float32)
        
        # Apply pre-emphasis and normalization
        audio_data = self._apply_preemphasis(audio_data)
        audio_data = self._normalize_audio(audio_data)
        
        return audio_data
    
    def extract_features(self, audio_data):
        """
        Extract features for emotion recognition.
        
        Args:
            audio_data: Audio data to extract features from
            
        Returns:
            Features for SER model
        """
        # Trim silence from beginning and end
        trimmed_audio, _ = librosa.effects.trim(audio_data, top_db=30)
        
        # If trimming removed too much, use the original audio
        if len(trimmed_audio) < len(audio_data) * 0.5:
            print("Warning: Trimming removed too much audio. Using original.")
            trimmed_audio = audio_data
        
        # Extract MFCCs
        mfccs = librosa.feature.mfcc(
            y=trimmed_audio,
            sr=self.sample_rate,
            n_mfcc=self.n_mfcc,
            n_fft=self.n_fft,
            hop_length=self.hop_length
        )
        
        # Extract delta features (rate of change of MFCCs)
        mfcc_delta = librosa.feature.delta(mfccs)
        mfcc_delta2 = librosa.feature.delta(mfccs, order=2)
        
        # Extract additional features
        chroma = librosa.feature.chroma_stft(
            y=trimmed_audio,
            sr=self.sample_rate,
            n_fft=self.n_fft,
            hop_length=self.hop_length
        )
        
        mel = librosa.feature.melspectrogram(
            y=trimmed_audio,
            sr=self.sample_rate,
            n_fft=self.n_fft,
            hop_length=self.hop_length
        )
        
        # Extract spectral features
        spectral_contrast = librosa.feature.spectral_contrast(
            y=trimmed_audio, 
            sr=self.sample_rate,
            n_fft=self.n_fft,
            hop_length=self.hop_length
        )
        
        # Zero crossing rate - good for detecting voiced/unvoiced segments
        zcr = librosa.feature.zero_crossing_rate(trimmed_audio, hop_length=self.hop_length)
        
        # Root Mean Square Energy
        rmse = librosa.feature.rms(y=trimmed_audio, hop_length=self.hop_length)
        
        # Get pitch information (fundamental frequency F0)
        pitches, magnitudes = librosa.piptrack(
            y=trimmed_audio, 
            sr=self.sample_rate,
            n_fft=self.n_fft, 
            hop_length=self.hop_length
        )
        # Extract the pitch with the highest magnitude at each time frame
        pitch_frames = []
        for t in range(magnitudes.shape[1]):
            index = magnitudes[:,t].argmax()
            pitch_frames.append(pitches[index, t])
        pitch = np.array(pitch_frames)
        
        # Calculate statistics for all features
        mfccs_mean = np.mean(mfccs, axis=1)
        mfccs_std = np.std(mfccs, axis=1)
        mfccs_delta_mean = np.mean(mfcc_delta, axis=1)
        mfccs_delta2_mean = np.mean(mfcc_delta2, axis=1)
        chroma_mean = np.mean(chroma, axis=1)
        mel_mean = np.mean(mel, axis=1)
        spectral_contrast_mean = np.mean(spectral_contrast, axis=1)
        zcr_mean = np.mean(zcr)
        zcr_std = np.std(zcr)
        rmse_mean = np.mean(rmse)
        rmse_std = np.std(rmse)
        pitch_mean = np.mean(pitch) if len(pitch) > 0 else 0
        pitch_std = np.std(pitch) if len(pitch) > 0 else 0
        
        # Combine features
        features = np.concatenate([
            mfccs_mean, mfccs_std, 
            mfccs_delta_mean, mfccs_delta2_mean,
            chroma_mean, mel_mean, 
            spectral_contrast_mean,
            [zcr_mean, zcr_std, rmse_mean, rmse_std, pitch_mean, pitch_std]
        ])
        
        # Ensure we have exactly 180 features as expected by the SER model
        if len(features) > 180:
            features = features[:180]  # Truncate if too many
        elif len(features) < 180:
            # Pad with zeros if too few
            features = np.pad(features, (0, 180 - len(features)), 'constant')
        
        return features
    
    def extract_features_for_asr(self, audio_data):
        """
        Extract features optimized for ASR model.
        
        Args:
            audio_data: Audio data to extract features from
            
        Returns:
            Features for ASR model (13 dimensions)
        """
        try:
            # Extract MFCCs for ASR - use 13 coefficients which is standard for ASR
            mfccs = librosa.feature.mfcc(
                y=audio_data,
                sr=self.sample_rate,
                n_mfcc=13,  # Standard for ASR is 13 MFCCs
                n_fft=self.n_fft,
                hop_length=self.hop_length
            )
            
            # Get mean across time dimension to get one feature vector
            features = np.mean(mfccs, axis=1)
            
            # Ensure we have exactly 13 features
            if len(features) > 13:
                features = features[:13]  # Truncate if too many
            elif len(features) < 13:
                # Pad with zeros if too few
                features = np.pad(features, (0, 13 - len(features)), 'constant')
                
            return features
        except Exception as e:
            print(f"Error in ASR feature extraction: {e}")
            # Return fallback feature vector of the correct size
            return np.zeros(13)
    
    def detect_speech(self, audio_data, energy_threshold=None):
        """
        Enhanced speech detection based on energy and zero-crossing rate.
        
        Args:
            audio_data: Audio data to check
            energy_threshold: Optional energy threshold override
            
        Returns:
            True if speech detected, False otherwise
        """
        if energy_threshold is None:
            energy_threshold = self.speech_energy_threshold
        
        # Calculate energy for each frame
        frame_length = int(0.025 * self.sample_rate)  # 25ms frame
        hop_length = int(0.010 * self.sample_rate)    # 10ms hop
        
        # Split audio into frames
        frames = librosa.util.frame(audio_data, frame_length=frame_length, hop_length=hop_length).T
        
        # Calculate energy for each frame
        frame_energy = np.sum(frames**2, axis=1) / frame_length
        
        # Calculate zero-crossing rate for each frame
        zcr = librosa.feature.zero_crossing_rate(
            y=audio_data, 
            frame_length=frame_length, 
            hop_length=hop_length
        )[0]
        
        # Count frames with significant energy
        speech_frames = sum(1 for e in frame_energy if e > energy_threshold)
        high_zcr_frames = sum(1 for z in zcr if z > 0.1)  # High ZCR indicates fricatives or noise
        
        # Percentage of frames with speech
        if len(frame_energy) > 0:
            speech_percentage = speech_frames / len(frame_energy)
            zcr_ratio = high_zcr_frames / len(zcr) if len(zcr) > 0 else 0
            
            # Combined decision logic:
            # 1. Either a significant percentage of frames have energy above threshold
            # 2. Or a moderate percentage + some fricatives/sibilants (high ZCR)
            has_speech = (speech_percentage > 0.15) or (speech_percentage > 0.1 and zcr_ratio > 0.05)
            return has_speech
        
        # Fallback to simple energy check if framing fails
        energy = np.mean(np.abs(audio_data))
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
        window_size = int(self.sample_rate * 0.02)  # 20ms window (increased from 10ms)
        energy_smooth = np.convolve(energy, np.ones(window_size)/window_size, mode='same')
        
        # Find peaks (syllables) with dynamic peak detection
        from scipy.signal import find_peaks
        
        # Calculate energy statistics for adaptive thresholding
        energy_mean = np.mean(energy_smooth)
        energy_std = np.std(energy_smooth)
        
        # Adaptive height threshold based on audio energy statistics
        height_threshold = max(0.05, energy_mean + 0.5 * energy_std)
        
        # Find syllable peaks
        peaks, _ = find_peaks(
            energy_smooth, 
            height=height_threshold, 
            distance=int(self.sample_rate * 0.1)
        )
        
        # Count syllables
        num_syllables = len(peaks)
        
        # Calculate duration (excluding silence)
        silence_threshold = self.silence_energy_threshold
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
