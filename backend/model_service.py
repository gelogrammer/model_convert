"""
Model service for Speech Emotion Recognition.
"""
# pyright: reportAttributeAccessIssue=false

import numpy as np
import tensorflow as tf
import os
from collections import deque

# Register custom metrics to fix loading issues
tf.keras.utils.get_custom_objects().update({
    'mse': tf.keras.losses.MeanSquaredError()
})

class ModelService:
    """Service for handling the emotion recognition model"""
    
    def __init__(self, model_path):
        """
        Initialize the model service.
        
        Args:
            model_path: Path to the trained model
        """
        # Load model with custom options
        print(f"Loading model from {model_path}")
        try:
            # First try standard loading
            self.model = tf.keras.models.load_model(model_path, compile=False)
        except Exception as e:
            print(f"Standard loading failed: {e}")
            # Use a fallback approach with custom objects
            try:
                # Create a custom InputLayer loader to handle batch_shape issue
                def custom_input_layer(config):
                    # Remove batch_shape if present and convert to input_shape
                    if 'batch_shape' in config:
                        input_shape = config['batch_shape'][1:] if len(config['batch_shape']) > 1 else (config['batch_shape'][0],)
                        config = config.copy()  # Create a copy to avoid modifying the original
                        config['input_shape'] = input_shape
                        del config['batch_shape']
                    return tf.keras.layers.InputLayer(**config)
                
                self.model = tf.keras.models.load_model(
                    model_path, 
                    compile=False,
                    custom_objects={'InputLayer': custom_input_layer}
                )
            except Exception as e2:
                print(f"Fallback loading failed: {e2}")
                # Last resort - use a simple model for testing
                print("Creating a simple model as placeholder")
                self._create_placeholder_model()
        
        # Compile model with default optimizer and loss
        self.model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
        
        # Emotion mapping
        self.emotions = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral']
        
        # Create emotion history for temporal smoothing - increased history length
        self.emotion_history = deque(maxlen=8)  # Increased from 5 to 8 for better stability
        self.current_emotion = None
        self.emotion_stability_count = 0
        
        # Minimum confidence threshold for valid emotion detection
        self.min_confidence_threshold = 0.25
        
        # Exponential moving average for emotion probabilities
        self.ema_probs = None
        self.ema_alpha = 0.3  # Lower alpha for smoother transitions
        
        print("Model service initialized")
    
    def _create_placeholder_model(self):
        """Create a simple placeholder model for testing"""
        inputs = tf.keras.layers.Input(shape=(180,))
        x = tf.keras.layers.Dense(128, activation='relu')(inputs)
        outputs = tf.keras.layers.Dense(7, activation='softmax')(x)
        self.model = tf.keras.Model(inputs=inputs, outputs=outputs)
    
    def predict_emotion(self, features, apply_smoothing=True):
        """
        Predict emotion from audio features.
        
        Args:
            features: Extracted audio features
            apply_smoothing: Whether to apply temporal smoothing
            
        Returns:
            Tuple of (emotion, confidence, all_probabilities)
        """
        # Ensure features are in the right shape
        if len(features.shape) == 1:
            features = np.expand_dims(features, axis=0)
        
        # Predict emotion
        predictions = self.model.predict(features, verbose=0)
        
        # Handle different output formats
        if isinstance(predictions, list):
            # RL model has multiple outputs, use the first one (emotion probabilities)
            emotion_probs = predictions[0][0]
        else:
            # Standard model has a single output
            emotion_probs = predictions[0]
        
        # Apply Exponential Moving Average to probabilities for smoother transitions
        if self.ema_probs is None:
            self.ema_probs = emotion_probs
        else:
            self.ema_probs = self.ema_alpha * emotion_probs + (1 - self.ema_alpha) * self.ema_probs
            
        # Get the raw predicted emotion (using EMA probabilities)
        emotion_idx = np.argmax(self.ema_probs)
        raw_emotion = self.emotions[emotion_idx]
        raw_confidence = self.ema_probs[emotion_idx]
        
        # Apply temporal smoothing if requested
        if apply_smoothing:
            smoothed_emotion, smoothed_confidence = self._apply_temporal_smoothing(raw_emotion, self.ema_probs)
            return smoothed_emotion, smoothed_confidence, emotion_probs
        else:
            return raw_emotion, raw_confidence, emotion_probs
    
    def _apply_temporal_smoothing(self, current_raw_emotion, emotion_probs):
        """
        Apply temporal smoothing to emotion predictions to reduce jitter.
        
        Args:
            current_raw_emotion: Current raw emotion prediction
            emotion_probs: Current emotion probabilities
            
        Returns:
            Tuple of (smoothed_emotion, smoothed_confidence)
        """
        # Add current prediction to history
        self.emotion_history.append((current_raw_emotion, emotion_probs))
        
        # Count occurrences of each emotion in history with improved weighting
        # More recent emotions are weighted higher
        emotion_counts = {}
        emotion_total_probs = {}
        total_weights = 0
        
        for idx, (emotion, probs) in enumerate(self.emotion_history):
            # Apply stronger recency weight - more recent entries have higher weight
            # Use exponential weighting for sharper focus on recent emotions
            weight = 1.0 + (idx * 0.6)**2  # Increased from 0.5 to 0.6, and squared for exponential weighting
            total_weights += weight
            
            # Count occurrences
            if emotion not in emotion_counts:
                emotion_counts[emotion] = 0
                emotion_total_probs[emotion] = 0
            
            emotion_counts[emotion] += weight
            
            # Add confidence boost for high confidence predictions
            confidence_boost = 1.0
            if probs[self.emotions.index(emotion)] > 0.7:
                confidence_boost = 1.3  # Boost high confidence predictions
                
            emotion_total_probs[emotion] += probs[self.emotions.index(emotion)] * weight * confidence_boost
        
        # Sort emotions by weighted count
        sorted_emotions = sorted(
            [(emotion, count) for emotion, count in emotion_counts.items()],
            key=lambda x: x[1],
            reverse=True
        )
        
        # Get the two most frequent emotions
        most_frequent_emotion = sorted_emotions[0][0] if sorted_emotions else 'neutral'
        second_most_frequent = sorted_emotions[1][0] if len(sorted_emotions) > 1 else most_frequent_emotion
        
        # Calculate weighted average confidence for most frequent emotion
        avg_confidence = emotion_total_probs[most_frequent_emotion] / emotion_counts[most_frequent_emotion]
        
        # Check if top two emotions are very close in frequency and confidence
        if len(sorted_emotions) > 1:
            most_freq_count = sorted_emotions[0][1]
            second_freq_count = sorted_emotions[1][1]
            
            most_freq_conf = emotion_total_probs[most_frequent_emotion] / emotion_counts[most_frequent_emotion]
            second_freq_conf = emotion_total_probs[second_most_frequent] / emotion_counts[second_most_frequent]
            
            # If very close in both frequency and confidence, use the one with higher confidence
            if most_freq_count / second_freq_count < 1.1 and second_freq_conf > most_freq_conf:
                most_frequent_emotion = second_most_frequent
                avg_confidence = second_freq_conf
        
        # Check if emotion has changed
        if self.current_emotion != most_frequent_emotion:
            # Only switch emotions if the new one has significantly higher confidence
            # or if we've been in the current emotion for too long with a challenger
            if self.current_emotion and self.emotion_stability_count >= 3:
                current_emotion_confidence = emotion_total_probs.get(self.current_emotion, 0)
                current_emotion_count = emotion_counts.get(self.current_emotion, 0)
                
                if current_emotion_count > 0 and current_emotion_confidence > 0:
                    current_avg_conf = current_emotion_confidence / current_emotion_count
                    
                    # Require more confidence to switch from neutral to another emotion
                    switch_threshold = 1.15  # Default threshold
                    if self.current_emotion == 'neutral':
                        switch_threshold = 1.3  # Higher threshold to leave neutral
                    elif most_frequent_emotion == 'neutral':
                        switch_threshold = 1.1  # Lower threshold to go to neutral
                    
                    # Don't switch if the confidence increase isn't significant
                    if avg_confidence < current_avg_conf * switch_threshold:
                        # Don't stay in the same emotion state for too long if something else is competing
                        if self.emotion_stability_count < 8:
                            return self.current_emotion, current_avg_conf
            
            # Reset stability counter for new emotion
            self.emotion_stability_count = 1
            self.current_emotion = most_frequent_emotion
        else:
            # Increment stability counter for same emotion
            self.emotion_stability_count += 1
        
        # Apply stability threshold - only change emotion if it's stable for multiple frames
        if self.emotion_stability_count >= 2:
            # Emotion is stable enough to report
            smoothed_emotion = most_frequent_emotion
        else:
            # Emotion is not stable enough, use neutral or previous emotion
            smoothed_emotion = self.current_emotion if self.current_emotion else 'neutral'
        
        # Apply weighted confidence based on stability
        stability_factor = min(1.0, self.emotion_stability_count / 5)
        smoothed_confidence = avg_confidence * stability_factor
        
        # Ensure minimum confidence is met - fallback to neutral if not confident enough
        if smoothed_confidence < self.min_confidence_threshold and smoothed_emotion != 'neutral':
            # Return neutral with a modest confidence
            smoothed_emotion = 'neutral'
            smoothed_confidence = 0.4  # Modest default confidence
        
        return smoothed_emotion, smoothed_confidence
