import { useState, useEffect } from 'react';
import { 
  Paper, 
  Typography, 
  Box, 
  Chip, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  Button,
  Slider,
  IconButton,
  Tooltip,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import {
  ConfidenceThresholds,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  loadConfidenceThresholds,
  saveConfidenceThresholds,
} from '../services/modelCalibration';

// Define emotion types for calibration
const EMOTIONS = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral'];

interface EmotionResult {
  emotion: string;
  confidence: number;
  speech_rate: number;
  probabilities: Record<string, number>;
  is_speech: boolean;
}

interface EmotionCalibrationProps {
  emotionResult: EmotionResult | null;
  isCapturing: boolean;
  onCalibrationUpdate?: (calibrationData: any[]) => void;
}

const EmotionCalibration: React.FC<EmotionCalibrationProps> = ({ 
  emotionResult, 
  isCapturing,
  onCalibrationUpdate = () => {},
}) => {
  // Settings state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [confidenceThresholds, setConfidenceThresholds] = useState<ConfidenceThresholds>(DEFAULT_CONFIDENCE_THRESHOLDS);
  
  // Load confidence thresholds from local storage on component mount
  useEffect(() => {
    setConfidenceThresholds(loadConfidenceThresholds());
  }, []);

  // Save thresholds whenever they change
  useEffect(() => {
    saveConfidenceThresholds(confidenceThresholds);
    // Notify parent component about calibration update
    if (onCalibrationUpdate) {
      onCalibrationUpdate([]);
    }
  }, [confidenceThresholds, onCalibrationUpdate]);

  // Handle threshold adjustments
  const handleThresholdChange = (emotion: string, newValue: number) => {
    setConfidenceThresholds((prev: ConfidenceThresholds) => ({
      ...prev,
      [emotion]: newValue
    }));
  };

  // Check if current emotion prediction passes the confidence threshold
  const isConfident = (emotion: string, confidence: number) => {
    return confidence >= (confidenceThresholds[emotion] || 0.6);
  };

  // Get filtered emotion result based on confidence thresholds
  const getFilteredEmotionResult = () => {
    if (!emotionResult) return null;
    
    const { emotion, confidence } = emotionResult;
    
    if (isConfident(emotion, confidence)) {
      return emotion;
    } else {
      // If below threshold, return "uncertain"
      return "uncertain";
    }
  };

  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Emotion Detection
        </Typography>
        <Tooltip title="Adjust confidence thresholds">
          <IconButton onClick={() => setIsSettingsOpen(true)} size="small">
            <TuneIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {isCapturing && emotionResult ? (
        <>
          <Box sx={{ mb: 3 }}>
            <Typography variant="body1" gutterBottom component="div">
              Detected emotion: <strong>{emotionResult.emotion}</strong> 
              {!isConfident(emotionResult.emotion, emotionResult.confidence) && 
                <Chip size="small" label="Low confidence" color="warning" sx={{ ml: 1 }} />
              }
            </Typography>
            
            <Typography variant="body2" color="text.secondary" gutterBottom component="div">
              Confidence: <strong>{(emotionResult.confidence * 100).toFixed(1)}%</strong>
            </Typography>
            
            <Typography variant="body2" color="text.secondary" gutterBottom component="div">
              Filtered result: <strong>{getFilteredEmotionResult()}</strong>
            </Typography>
            
            {emotionResult.probabilities && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" component="div" sx={{ mb: 1 }}>
                  All emotions:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {Object.entries(emotionResult.probabilities)
                    .sort((a, b) => b[1] - a[1])
                    .map(([emotion, probability]) => (
                      <Chip
                        key={emotion}
                        label={`${emotion}: ${(probability * 100).toFixed(1)}%`}
                        size="small"
                        variant={emotionResult.emotion === emotion ? "filled" : "outlined"}
                        color={emotionResult.emotion === emotion ? "primary" : "default"}
                        sx={{ mb: 0.5 }}
                      />
                    ))}
                </Box>
              </Box>
            )}
          </Box>
        </>
      ) : (
        <Typography variant="body1" component="div">
          {isCapturing 
            ? "Waiting for speech to analyze..." 
            : "Start capturing to detect emotion"}
        </Typography>
      )}

      {/* Settings Dialog */}
      <Dialog 
        open={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Emotion Detection Settings</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle1" gutterBottom>
            Adjust confidence thresholds for each emotion
          </Typography>
          <Typography variant="body2" color="text.secondary" component="div">
            Higher thresholds make the system more certain before assigning an emotion.
            Emotions below threshold will be marked as "uncertain".
          </Typography>
          
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
            {EMOTIONS.map(emotion => (
              <Box key={emotion} sx={{ width: { xs: '100%', sm: '45%' }, mb: 2 }}>
                <Typography id={`${emotion}-slider-label`}>
                  {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Slider
                    value={confidenceThresholds[emotion] || 0.6}
                    onChange={(_, newValue) => handleThresholdChange(emotion, newValue as number)}
                    aria-labelledby={`${emotion}-slider-label`}
                    step={0.05}
                    min={0.3}
                    max={0.95}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => `${(value * 100).toFixed(0)}%`}
                  />
                </Box>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsSettingsOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default EmotionCalibration; 