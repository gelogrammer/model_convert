"""
Model service for Speech Emotion Recognition.
"""

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
        
        # Create emotion history for temporal smoothing
        self.emotion_history = deque(maxlen=5)
        self.current_emotion = None
        self.emotion_stability_count = 0
        
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
        
        # Get the raw predicted emotion
        emotion_idx = np.argmax(emotion_probs)
        raw_emotion = self.emotions[emotion_idx]
        raw_confidence = emotion_probs[emotion_idx]
        
        # Apply temporal smoothing if requested
        if apply_smoothing:
            smoothed_emotion, smoothed_confidence = self._apply_temporal_smoothing(raw_emotion, emotion_probs)
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
        
        # Count occurrences of each emotion in history with weighting
        # More recent emotions are weighted higher
        emotion_counts = {}
        emotion_total_probs = {}
        total_weights = 0
        
        for idx, (emotion, probs) in enumerate(self.emotion_history):
            # Apply recency weight - more recent entries have higher weight
            weight = 1.0 + idx * 0.5  # Increase weight for more recent samples
            total_weights += weight
            
            # Count occurrences
            if emotion not in emotion_counts:
                emotion_counts[emotion] = 0
                emotion_total_probs[emotion] = 0
            
            emotion_counts[emotion] += weight
            emotion_total_probs[emotion] += probs[self.emotions.index(emotion)] * weight
        
        # Find the most frequent emotion
        most_frequent_emotion = None
        max_count = 0
        
        for emotion, count in emotion_counts.items():
            if count > max_count:
                max_count = count
                most_frequent_emotion = emotion
        
        # Calculate weighted average confidence for most frequent emotion
        avg_confidence = emotion_total_probs[most_frequent_emotion] / emotion_counts[most_frequent_emotion]
        
        # Check if emotion has changed
        if self.current_emotion != most_frequent_emotion:
            # Only switch emotions if the new one has significantly higher confidence
            if self.current_emotion and self.emotion_stability_count >= 3:
                current_emotion_confidence = emotion_total_probs.get(self.current_emotion, 0)
                if current_emotion_confidence > 0 and avg_confidence < current_emotion_confidence * 1.2:
                    # Not enough improvement to switch
                    return self.current_emotion, current_emotion_confidence / emotion_counts.get(self.current_emotion, 1)
            
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
        
        return smoothed_emotion, smoothed_confidence
