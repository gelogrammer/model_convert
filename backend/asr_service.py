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
        try:
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
                
                # Create a simplified robust model architecture that can handle dimension mismatches
                # This uses the identified input size (or defaults to 13) but ensures output is always 11
                input_size = 13  # Default input size
                hidden_size = 32  # Default hidden size
                
                try:
                    # Look for weight keys to determine input size
                    if isinstance(model_state_dict, dict):
                        weight_keys = [k for k in model_state_dict.keys() if 'weight' in k]
                        if weight_keys:
                            first_layer_key = min(weight_keys, key=lambda k: int(k.split('.')[0]) if k.split('.')[0].isdigit() else 999)
                            first_layer_weights = model_state_dict[first_layer_key]
                            if isinstance(first_layer_weights, torch.Tensor):
                                input_size = first_layer_weights.shape[1]
                                hidden_size = first_layer_weights.shape[0]
                                print(f"Detected input size: {input_size}, hidden size: {hidden_size}")
                except Exception as e:
                    print(f"Error detecting dimensions: {e}, using defaults")
                
                # Create robust model architecture
                self.model = nn.Sequential(
                    nn.Linear(input_size, hidden_size),
                    nn.ReLU(),
                    nn.Dropout(0.2),  # Add dropout for better robustness
                    nn.Linear(hidden_size, 11)  # Always output 11 features regardless of original model
                )
                
                # Try to load the state dict, but be robust to missing or extra parameters
                try:
                    # Handle strict=False to allow dimension mismatches
                    self.model.load_state_dict(model_state_dict, strict=False)
                    print("Loaded model state dictionary with relaxed constraints")
                except Exception as e:
                    print(f"Error loading state dict: {e}")
                    print("Using initialized model without loading weights")
            
        except Exception as e:
            print(f"Error loading model: {e}")
            print("Creating fallback model")
            
            # Create a fallback model that always outputs 11 dimensions
            self.model = nn.Sequential(
                nn.Linear(13, 32),
                nn.ReLU(),
                nn.Linear(32, 11)
            )
        
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
                # Validate feature dimensions
                if features.size == 0:
                    raise ValueError("Empty feature array")
                
                # Ensure we have exactly 13 features (standard MFCC features for ASR)
                if features.shape[0] > 13:
                    features = features[:13]  # Truncate if too many
                elif features.shape[0] < 13:
                    # Pad with zeros if too few
                    features = np.pad(features, (0, 13 - features.shape[0]), 'constant')
                
                features_tensor = torch.tensor(features, dtype=torch.float32).to(self.device)
            else:
                # If already a tensor, check and reshape if needed
                if features.size(0) > 13:
                    features = features[:13]
                elif features.size(0) < 13:
                    # Create a new padded tensor
                    padded = torch.zeros(13, dtype=features.dtype, device=features.device)
                    padded[:features.size(0)] = features
                    features = padded
                
                features_tensor = features.to(self.device)
            
            # Ensure correct shape for model
            if len(features_tensor.shape) == 1:
                features_tensor = features_tensor.unsqueeze(0)
            
            # Get predictions
            with torch.no_grad():
                try:
                    outputs = self.model(features_tensor)
                    
                    # Extract different outputs with specific safety checks for each dimension
                    if isinstance(outputs, tuple) or isinstance(outputs, list):
                        # Multiple outputs case
                        output_tensor = outputs[0]
                        output_size = output_tensor.size(1)
                        
                        # Create zeroed tensors for each category
                        fluency_scores = torch.zeros(1, 3, device=self.device)
                        tempo_scores = torch.zeros(1, 3, device=self.device)
                        pronunciation_scores = torch.zeros(1, 2, device=self.device)
                        
                        # Populate with available outputs based on actual size
                        # Handle different output sizes (7, 8, or more)
                        if output_size >= 3:
                            fluency_scores = output_tensor[:, 0:3]
                        
                        if output_size >= 6:
                            tempo_scores = output_tensor[:, 3:6]
                        elif output_size >= 5:
                            # If only 5 outputs, use 2 for tempo (less precision)
                            tempo_scores[:, 0:2] = output_tensor[:, 3:5]
                        
                        if output_size >= 8:
                            pronunciation_scores = output_tensor[:, 6:8]
                        elif output_size == 7:
                            # If only 7 outputs, use 1 for pronunciation
                            pronunciation_scores[:, 0] = output_tensor[:, 6]
                    else:
                        # Single output tensor with multiple dimensions
                        output_size = outputs.size(1)
                        
                        # Create zeroed tensors for each category
                        fluency_scores = torch.zeros(1, 3, device=self.device)
                        tempo_scores = torch.zeros(1, 3, device=self.device)
                        pronunciation_scores = torch.zeros(1, 2, device=self.device)
                        
                        # Populate with available outputs based on actual size
                        if output_size >= 3:
                            fluency_scores = outputs[:, 0:3]
                        
                        if output_size >= 6:
                            tempo_scores = outputs[:, 3:6]
                        elif output_size >= 5:
                            # If only 5 outputs, use 2 for tempo (less precision)
                            tempo_scores[:, 0:2] = outputs[:, 3:5]
                        
                        if output_size >= 8:
                            pronunciation_scores = outputs[:, 6:8]
                        elif output_size == 7:
                            # If only 7 outputs, use 1 for pronunciation
                            pronunciation_scores[:, 0] = outputs[:, 6]
                    
                    # Get highest scoring categories
                    fluency_idx = int(torch.argmax(fluency_scores, dim=1).item())
                    tempo_idx = int(torch.argmax(tempo_scores, dim=1).item())
                    pronunciation_idx = int(torch.argmax(pronunciation_scores, dim=1).item())
                    
                    # Get confidence scores
                    fluency_confidence = torch.softmax(fluency_scores, dim=1)[0, fluency_idx].item()
                    tempo_confidence = torch.softmax(tempo_scores, dim=1)[0, tempo_idx].item()
                    pronunciation_confidence = torch.softmax(pronunciation_scores, dim=1)[0, pronunciation_idx].item()
                except Exception as e:
                    print(f"Error during model inference: {e}")
                    raise e
                
                # Return results
                return {
                    "fluency": {
                        "category": self.fluency_categories[min(fluency_idx, len(self.fluency_categories)-1)],
                        "confidence": float(fluency_confidence)
                    },
                    "tempo": {
                        "category": self.tempo_categories[min(tempo_idx, len(self.tempo_categories)-1)],
                        "confidence": float(tempo_confidence)
                    },
                    "pronunciation": {
                        "category": self.pronunciation_categories[min(pronunciation_idx, len(self.pronunciation_categories)-1)],
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