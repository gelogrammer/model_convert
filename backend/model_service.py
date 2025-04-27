"""
Model service for Speech Emotion Recognition.
"""

import numpy as np
import tensorflow as tf
import os

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
                    # Remove batch_shape if present
                    if 'batch_shape' in config:
                        input_shape = config['batch_shape'][1:]
                        del config['batch_shape']
                        return tf.keras.layers.InputLayer(input_shape=input_shape, **config)
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
        
        print("Model service initialized")
    
    def _create_placeholder_model(self):
        """Create a simple placeholder model for testing"""
        inputs = tf.keras.layers.Input(shape=(180,))
        x = tf.keras.layers.Dense(128, activation='relu')(inputs)
        outputs = tf.keras.layers.Dense(7, activation='softmax')(x)
        self.model = tf.keras.Model(inputs=inputs, outputs=outputs)
    
    def predict_emotion(self, features):
        """
        Predict emotion from audio features.
        
        Args:
            features: Extracted audio features
            
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
        
        # Get the predicted emotion
        emotion_idx = np.argmax(emotion_probs)
        emotion = self.emotions[emotion_idx]
        confidence = emotion_probs[emotion_idx]
        
        return emotion, confidence, emotion_probs
