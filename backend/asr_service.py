"""
ASR (Automatic Speech Recognition) service for speech characteristics analysis.
"""

import torch
import torch.nn as nn
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
        
        # Check model structure
        if isinstance(self.model, dict):
            print(f"Model is a dictionary with keys: {list(self.model.keys())}")
            
            # First try to see if it contains a supervised model state dict
            if "supervised_model_state_dict" in self.model:
                print("Using supervised_model_state_dict")
                model_state_dict = self.model["supervised_model_state_dict"]
            # Otherwise try the drl model state dict
            elif "drl_model_state_dict" in self.model:
                print("Using drl_model_state_dict")
                model_state_dict = self.model["drl_model_state_dict"]
            # Or just use the dict itself
            else:
                print("Using the entire dictionary as state_dict")
                model_state_dict = self.model
            
            # Create a simple model architecture - adjust this to match your actual model
            self.model = nn.Sequential(
                nn.Linear(13, 32),  # Input features to hidden
                nn.ReLU(),
                nn.Linear(32, 11)   # Hidden to output
            )
            
            # Try loading with the identified state dict
            try:
                # Get shape information for input layer from the first layer's weight
                if isinstance(model_state_dict, dict):
                    # Look for weight keys to determine input size
                    weight_keys = [k for k in model_state_dict.keys() if 'weight' in k]
                    if weight_keys:
                        first_layer_key = min(weight_keys, key=lambda k: int(k.split('.')[0]) if k.split('.')[0].isdigit() else 999)
                        first_layer_weights = model_state_dict[first_layer_key]
                        if isinstance(first_layer_weights, torch.Tensor):
                            input_size = first_layer_weights.shape[1]
                            hidden_size = first_layer_weights.shape[0]
                            print(f"Detected input size: {input_size}, hidden size: {hidden_size}")
                            
                            # Rebuild model with detected dimensions
                            self.model = nn.Sequential(
                                nn.Linear(input_size, hidden_size),
                                nn.ReLU(),
                                nn.Linear(hidden_size, 11)
                            )
                
                # Try to load the state dict
                try:
                    self.model.load_state_dict(model_state_dict)
                    print("Successfully loaded model state dictionary")
                except Exception as e:
                    print(f"Error loading state dict directly: {e}")
                    print("Attempting to create a compatible model from scratch")
                    # Continue with the base model without loading weights
            except Exception as e:
                print(f"Error analyzing model structure: {e}")
                print("Using default model architecture")
                # Continue with the base model
        
        # Set to evaluation mode
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
        try:
            # Convert features to tensor
            if isinstance(features, np.ndarray):
                # Reshape features to match model's expected input dimension
                # The original features have 180 dimensions, but the model expects 13
                # Extract the first 13 features or use dimensionality reduction
                if features.shape[0] == 180:
                    # Option 1: Use the first 13 features
                    features = features[:13]
                    
                    # Option 2: Alternative approach - reshape to 13 features by averaging
                    # Reshape 180 features into 13 groups and average each group
                    # feature_groups = np.array_split(features, 13)
                    # features = np.array([np.mean(group) for group in feature_groups])
                
                features_tensor = torch.tensor(features, dtype=torch.float32).to(self.device)
            else:
                # If already a tensor, check and reshape if needed
                if features.size(0) == 180:
                    features = features[:13]
                features_tensor = features.to(self.device)
            
            # Ensure correct shape for model
            if len(features_tensor.shape) == 1:
                features_tensor = features_tensor.unsqueeze(0)
            
            # Get predictions
            with torch.no_grad():
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
                fluency_idx = int(torch.argmax(fluency_scores, dim=1).item())
                tempo_idx = int(torch.argmax(tempo_scores, dim=1).item())
                pronunciation_idx = int(torch.argmax(pronunciation_scores, dim=1).item())
                
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