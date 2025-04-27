"""
ASR (Automatic Speech Recognition) service for speech characteristics analysis.
"""

import torch
import numpy as np
import os

class ASRService:
    """Service for handling the ASR model for speech characteristics analysis"""
    
    def __init__(self, model_path):
        """
        Initialize the ASR service.
        
        Args:
            model_path: Path to the trained ASR model (.pth)
        """
        # Check if the model file exists
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"ASR model file not found: {model_path}")
            
        print(f"Loading ASR model from {model_path}")
        
        # Set device
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Using device: {self.device}")
        
        # Load model
        self.model = torch.load(model_path, map_location=self.device)
        self.model.eval()  # Set to evaluation mode
        
        # Define categories
        self.fluency_categories = ["High Fluency", "Medium Fluency", "Low Fluency"]
        self.tempo_categories = ["Fast Tempo", "Medium Tempo", "Slow Tempo"]
        self.pronunciation_categories = ["Clear Pronunciation", "Unclear Pronunciation"]
        
        print("ASR service initialized")
    
    def process_audio(self, features):
        """
        Process audio features to determine speech characteristics.
        
        Args:
            features: Extracted audio features
            
        Returns:
            Dictionary of speech characteristics
        """
        # Convert features to tensor
        if isinstance(features, np.ndarray):
            features_tensor = torch.tensor(features, dtype=torch.float32).to(self.device)
        else:
            features_tensor = features.to(self.device)
        
        # Ensure correct shape for model
        if len(features_tensor.shape) == 1:
            features_tensor = features_tensor.unsqueeze(0)
        
        # Get predictions
        with torch.no_grad():
            try:
                outputs = self.model(features_tensor)
                
                # Extract different outputs
                # The exact format depends on the model architecture
                # Here we assume the model outputs [fluency, tempo, pronunciation] scores
                
                if isinstance(outputs, tuple) or isinstance(outputs, list):
                    # Multiple outputs case
                    fluency_scores, tempo_scores, pronunciation_scores = outputs
                else:
                    # Single output tensor with multiple dimensions
                    fluency_scores = outputs[:, 0:3]
                    tempo_scores = outputs[:, 3:6]
                    pronunciation_scores = outputs[:, 6:8]
                
                # Get highest scoring categories
                fluency_idx = torch.argmax(fluency_scores, dim=1).item()
                tempo_idx = torch.argmax(tempo_scores, dim=1).item()
                pronunciation_idx = torch.argmax(pronunciation_scores, dim=1).item()
                
                # Get confidence scores
                fluency_confidence = torch.softmax(fluency_scores, dim=1)[0, fluency_idx].item()
                tempo_confidence = torch.softmax(tempo_scores, dim=1)[0, tempo_idx].item()
                pronunciation_confidence = torch.softmax(pronunciation_scores, dim=1)[0, pronunciation_idx].item()
                
                # Return results
                return {
                    "fluency": {
                        "category": self.fluency_categories[fluency_idx],
                        "confidence": float(fluency_confidence)
                    },
                    "tempo": {
                        "category": self.tempo_categories[tempo_idx],
                        "confidence": float(tempo_confidence)
                    },
                    "pronunciation": {
                        "category": self.pronunciation_categories[pronunciation_idx],
                        "confidence": float(pronunciation_confidence)
                    }
                }
            except Exception as e:
                print(f"Error during ASR processing: {e}")
                # Fallback to default values if model processing fails
                return {
                    "fluency": {"category": "Medium Fluency", "confidence": 0.5},
                    "tempo": {"category": "Medium Tempo", "confidence": 0.5},
                    "pronunciation": {"category": "Clear Pronunciation", "confidence": 0.5}
                } 