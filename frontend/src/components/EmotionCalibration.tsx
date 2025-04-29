import { useState, useEffect } from 'react';
import { 
  Paper, 
  Typography, 
  Box, 
  Button, 
  Chip, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  ButtonGroup,
  Slider,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Snackbar
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import {
  CalibrationData,
  ConfidenceThresholds,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  loadCalibrationData,
  saveCalibrationData,
  loadConfidenceThresholds,
  saveConfidenceThresholds,
  getCalibrationStats,
  sendCalibrationToBackend
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
  onCalibrationUpdate?: (calibrationData: CalibrationData[]) => void;
}

const EmotionCalibration: React.FC<EmotionCalibrationProps> = ({ 
  emotionResult, 
  isCapturing,
  onCalibrationUpdate 
}) => {
  // Load calibration data from service
  const [calibrationData, setCalibrationData] = useState<CalibrationData[]>([]);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [confidenceThresholds, setConfidenceThresholds] = useState<ConfidenceThresholds>(DEFAULT_CONFIDENCE_THRESHOLDS);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [isRetraining, setIsRetraining] = useState(false);

  // Load calibration data from local storage on component mount
  useEffect(() => {
    setCalibrationData(loadCalibrationData());
    setConfidenceThresholds(loadConfidenceThresholds());
  }, []);

  // Save calibration data to local storage whenever it changes
  useEffect(() => {
    if (calibrationData.length > 0) {
      saveCalibrationData(calibrationData);
      
      // Trigger callback if provided
      if (onCalibrationUpdate) {
        onCalibrationUpdate(calibrationData);
      }
    }
  }, [calibrationData, onCalibrationUpdate]);

  // Save thresholds whenever they change
  useEffect(() => {
    saveConfidenceThresholds(confidenceThresholds);
  }, [confidenceThresholds]);

  // Handle user feedback on emotion accuracy
  const handleFeedback = (correctness: 'correct' | 'incorrect' | 'unsure') => {
    if (!emotionResult) return;

    if (correctness === 'incorrect') {
      setSelectedEmotion(null);
      setIsCalibrationOpen(true);
    } else {
      // Save correct or unsure feedback directly
      const newCalibrationEntry: CalibrationData = {
        emotion: emotionResult.emotion,
        userFeedback: {
          correctness,
        },
        timestamp: Date.now()
      };
      
      setCalibrationData(prev => [...prev, newCalibrationEntry]);
      
      setSnackbarMessage(`Feedback recorded: ${correctness}`);
      setSnackbarOpen(true);
    }
  };

  // Handle confirmation of actual emotion when user indicates an incorrect prediction
  const handleCorrectEmotionSelection = () => {
    if (!emotionResult || !selectedEmotion) return;
    
    const newCalibrationEntry: CalibrationData = {
      emotion: emotionResult.emotion, // The predicted emotion
      userFeedback: {
        correctness: 'incorrect',
        actualEmotion: selectedEmotion // The user-selected correct emotion
      },
      timestamp: Date.now()
    };
    
    setCalibrationData(prev => [...prev, newCalibrationEntry]);
    setIsCalibrationOpen(false);
    
    setSnackbarMessage(`Feedback recorded: Emotion corrected to ${selectedEmotion}`);
    setSnackbarOpen(true);
  };

  // Handle threshold adjustments
  const handleThresholdChange = (emotion: string, newValue: number) => {
    setConfidenceThresholds((prev: ConfidenceThresholds) => ({
      ...prev,
      [emotion]: newValue
    }));
  };

  // Reset calibration data
  const handleResetCalibration = () => {
    setCalibrationData([]);
    localStorage.removeItem('emotionCalibrationData');
    setSnackbarMessage('Calibration data reset');
    setSnackbarOpen(true);
  };

  // Update model with calibration data
  const handleRetrainModel = async () => {
    setIsRetraining(true);
    
    try {
      const success = await sendCalibrationToBackend(calibrationData);
      
      if (success) {
        setSnackbarMessage('Model calibration applied successfully');
      } else {
        setSnackbarMessage('Failed to apply calibration');
      }
    } catch (error) {
      console.error('Failed to retrain model:', error);
      setSnackbarMessage('Failed to apply calibration');
    } finally {
      setIsRetraining(false);
      setSnackbarOpen(true);
    }
  };

  const stats = getCalibrationStats(calibrationData);

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
          Emotion Calibration
        </Typography>
        <Tooltip title="Adjust confidence thresholds and recalibrate the emotion model">
          <IconButton onClick={() => setIsCalibrationOpen(true)} size="small">
            <TuneIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {isCapturing && emotionResult ? (
        <>
          <Box sx={{ mb: 3 }}>
            <Typography variant="body1" gutterBottom>
              The system detected: <strong>{emotionResult.emotion}</strong> 
              {!isConfident(emotionResult.emotion, emotionResult.confidence) && 
                <Chip size="small" label="Low confidence" color="warning" sx={{ ml: 1 }} />
              }
            </Typography>
            
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Filtered result: <strong>{getFilteredEmotionResult()}</strong>
            </Typography>
            
            <Typography variant="body2" sx={{ mt: 2 }}>
              Is this correct?
            </Typography>
            
            <ButtonGroup variant="outlined" size="small" sx={{ mt: 1 }}>
              <Button onClick={() => handleFeedback('correct')} color="success">
                Yes
              </Button>
              <Button onClick={() => handleFeedback('incorrect')} color="error">
                No
              </Button>
              <Button onClick={() => handleFeedback('unsure')}>
                Unsure
              </Button>
            </ButtonGroup>
          </Box>
          
          {stats && (
            <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <Typography variant="subtitle2" gutterBottom>
                Calibration Stats:
              </Typography>
              <Typography variant="body2">
                Accuracy: {stats.accuracy.toFixed(1)}% ({stats.correct}/{stats.total} correct)
              </Typography>
              
              {stats.misclassifications.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" gutterBottom>
                    Top misclassifications:
                  </Typography>
                  {stats.misclassifications.map(([label, count]: [string, number], idx: number) => (
                    <Chip 
                      key={idx} 
                      label={`${label}: ${count}`} 
                      size="small" 
                      variant="outlined"
                      sx={{ mr: 1, mb: 1 }}
                    />
                  ))}
                </Box>
              )}
            </Box>
          )}
        </>
      ) : (
        <Typography variant="body1">
          {isCapturing 
            ? "Waiting for speech to analyze..." 
            : "Start capturing to calibrate emotion detection"}
        </Typography>
      )}

      {/* Calibration Dialog */}
      <Dialog 
        open={isCalibrationOpen} 
        onClose={() => setIsCalibrationOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Emotion Recognition Calibration</DialogTitle>
        <DialogContent>
          {!selectedEmotion ? (
            <>
              <Typography variant="subtitle1" gutterBottom>
                What emotion were you actually expressing?
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, my: 2 }}>
                {EMOTIONS.map(emotion => (
                  <Chip
                    key={emotion}
                    label={emotion.charAt(0).toUpperCase() + emotion.slice(1)}
                    onClick={() => setSelectedEmotion(emotion)}
                    color="primary"
                    variant="outlined"
                    sx={{ 
                      px: 2, 
                      py: 3,
                      fontSize: '1rem',
                      cursor: 'pointer',
                      '&:hover': {
                        backgroundColor: 'rgba(124, 58, 237, 0.1)'
                      }
                    }}
                  />
                ))}
              </Box>
            </>
          ) : (
            <>
              <Typography variant="subtitle1" gutterBottom>
                Adjust confidence thresholds for each emotion
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Higher thresholds make the system more certain before assigning an emotion.
                Emotions below threshold will be marked as "uncertain".
              </Typography>
              
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
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
              
              <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between' }}>
                <Button 
                  variant="outlined" 
                  color="warning" 
                  onClick={handleResetCalibration}
                >
                  Reset Calibration Data
                </Button>
                
                <Button 
                  variant="contained"
                  onClick={handleRetrainModel}
                  disabled={isRetraining || calibrationData.length === 0}
                  startIcon={isRetraining ? <CircularProgress size={20} /> : undefined}
                >
                  {isRetraining ? 'Applying Calibration...' : 'Apply Calibration'}
                </Button>
              </Box>
              
              {stats && stats.total > 0 && (
                <Alert severity="info" sx={{ mt: 3 }}>
                  {`You've provided feedback on ${stats.total} predictions, with ${stats.accuracy.toFixed(1)}% marked as correct.`}
                </Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsCalibrationOpen(false)}>
            Cancel
          </Button>
          {selectedEmotion && (
            <Button 
              onClick={handleCorrectEmotionSelection} 
              variant="contained"
            >
              Confirm
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Notification Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
      />
    </Paper>
  );
};

export default EmotionCalibration; 