import { useState, useEffect, useRef } from 'react';
import { Container, Box, Typography, Paper, AppBar, Toolbar, Button, CircularProgress, Badge, Alert, Snackbar, ThemeProvider, createTheme, CssBaseline, alpha } from '@mui/material';
import EmotionDisplay from './components/EmotionDisplay';
// import SpeechTempoDisplay from './components/SpeechRateDisplay';
import Feedback from './components/Feedback';
import SpeechCharacteristics from './components/SpeechCharacteristics';
//import EmotionCalibration from './components/EmotionCalibration';
import Recordings from './components/Recordings';
import { initializeWebSocket, closeWebSocket, setAudioProcessingEnabled } from './services/websocket';
import { saveRecordingToDatabase } from './services/recordingsService';
import './App.css';

// Create a theme
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#7C3AED', // Vibrant purple
    },
    secondary: {
      main: '#06B6D4', // Cyan
    },
    background: {
      default: '#0F172A', // Dark blue-gray
      paper: '#1E293B'   // Slightly lighter blue-gray
    },
    success: {
      main: '#10B981'    // Emerald green
    },
    error: {
      main: '#EF4444'    // Red
    },
    warning: {
      main: '#F59E0B'    // Amber
    },
    text: {
      primary: '#F1F5F9', // Light gray/white
      secondary: '#94A3B8' // Medium gray
    }
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: {
      fontWeight: 700,
      letterSpacing: '0.02em',
      fontSize: '1.1rem',
      '@media (max-width:600px)': {
        fontSize: '1rem',
      },
    },
    h5: {
      fontWeight: 700,
      letterSpacing: '0.02em',
      fontSize: '1.5rem',
      '@media (max-width:600px)': {
        fontSize: '1.2rem',
      },
    },
    button: {
      fontWeight: 600,
    },
    body1: {
      '@media (max-width:600px)': {
        fontSize: '0.9rem',
      },
    },
    body2: {
      '@media (max-width:600px)': {
        fontSize: '0.8rem',
      },
    },
  },
  shape: {
    borderRadius: 12
  },
  components: {
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 12,
          padding: '10px 24px',
          '@media (max-width:600px)': {
            padding: '8px 16px',
          },
          transition: '0.3s',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 6px 20px rgba(124, 58, 237, 0.4)',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(90deg, #7C3AED 0%, #8B5CF6 100%)',
        },
        containedError: {
          background: 'linear-gradient(90deg, #DC2626 0%, #EF4444 100%)',
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backdropFilter: 'blur(10px)',
          backgroundColor: 'rgba(30, 41, 59, 0.8)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }
      }
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          height: 64,
          '@media (max-width:600px)': {
            height: 56,
            padding: '0 8px',
          },
        }
      }
    },
    MuiContainer: {
      styleOverrides: {
        root: {
          '@media (max-width:600px)': {
            padding: '0 12px',
          },
        }
      }
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: '#0F172A',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#334155',
            borderRadius: '4px',
          },
        },
      },
    },
  }
});

// Define emotion result type and calibration data interface
interface EmotionResult {
  emotion: string;
  confidence: number;
  speech_rate: number;
  probabilities: Record<string, number>;
  is_speech: boolean;
  speech_characteristics?: {
    fluency: { category: string; confidence: number };
    tempo: { category: string; confidence: number };
    pronunciation: { category: string; confidence: number };
  };
  belowThreshold?: boolean;
  filteredEmotion?: string;
}

// Helper function to apply calibration thresholds
const applyCalibrationToResult = (
  rawResult: EmotionResult | null, 
  thresholds: Record<string, number>
): EmotionResult | null => {
  if (!rawResult) return null;
  
  const { emotion, confidence } = rawResult;
  const threshold = thresholds[emotion] || 0.6;
  
  if (confidence < threshold) {
    return {
      ...rawResult,
      belowThreshold: true as any,
      filteredEmotion: 'uncertain' as any
    };
  }
  
  return rawResult;
};

// Function not used anymore since we removed EmotionCalibration
/* 
const loadConfidenceThresholds = (): Record<string, number> => {
  try {
    const savedThresholds = localStorage.getItem('emotionConfidenceThresholds');
    return savedThresholds 
      ? JSON.parse(savedThresholds) 
      : {
          anger: 0.6,
          disgust: 0.6,
          fear: 0.6,
          happiness: 0.6,
          sadness: 0.6,
          surprise: 0.6,
          neutral: 0.5,
        };
  } catch (e) {
    console.error('Failed to load confidence thresholds:', e);
    return {
      anger: 0.6,
      disgust: 0.6,
      fear: 0.6,
      happiness: 0.6,
      sadness: 0.6,
      surprise: 0.6,
      neutral: 0.5,
    };
  }
};
*/

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isModelInitialized, setIsModelInitialized] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [emotionResult, setEmotionResult] = useState<EmotionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [showReconnecting, setShowReconnecting] = useState(false);
  const [processingPacket, setProcessingPacket] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean | null>(null);
  const [latestRecordingId, setLatestRecordingId] = useState<number | string | null>(null);
  const processingTimeoutRef = useRef<number | null>(null);
  
  // Speech detection timeout
  const speechTimeoutRef = useRef<number | null>(null);
  const [calibratedEmotionResult, setCalibratedEmotionResult] = useState<EmotionResult | null>(null);
  
  // Store last speech characteristics to keep displaying them even when not speaking
  const [lastSpeechCharacteristics, setLastSpeechCharacteristics] = useState<EmotionResult['speech_characteristics'] | null>(null);
  
  // Keep track of previous result to prevent infinite loops
  const prevEmotionResultRef = useRef<EmotionResult | null>(null);
  
  // Add state to track HuggingFace API availability
  const [isHuggingFaceAvailable, setIsHuggingFaceAvailable] = useState(true);
  
  // Initialize WebSocket connection
  useEffect(() => {
    // Setup WebSocket connection
    const setupWebSocket = async () => {
      try {
        setLoading(true);

        // Initialize WebSocket
        initializeWebSocket({
          onConnect: () => {
            setIsConnected(true);
            setError(null);
            setShowReconnecting(false);
            setReconnectAttempt(0);
            
            // Make sure audio processing is disabled initially
            setAudioProcessingEnabled(false);
          },
          onDisconnect: () => {
            setIsConnected(false);
            setShowReconnecting(true);
          },
          onReconnectAttempt: (attempt) => {
            setReconnectAttempt(attempt);
            setShowReconnecting(true);
          },
          onReconnect: () => {
            setIsConnected(true);
            setShowReconnecting(false);
            setReconnectAttempt(0);
            
            // Make sure audio processing is disabled on reconnect
            setAudioProcessingEnabled(false);
          },
          onEmotionResult: (result) => {
            setEmotionResult(result);
            setLastUpdateTime(new Date());
            
            // Set speaking state based on is_speech flag
            if (result.is_speech) {
              setIsSpeaking(true);
              
              // Clear any existing timeout
              if (speechTimeoutRef.current) {
                window.clearTimeout(speechTimeoutRef.current);
              }
              
              // Set a new timeout to reset speaking state if no speech is detected for 1.5 seconds
              speechTimeoutRef.current = window.setTimeout(() => {
                setIsSpeaking(false);
                speechTimeoutRef.current = null;
              }, 1500);
            }
            
            // Update speech characteristics immediately even if no speech detected
            if (result.speech_characteristics) {
              setLastSpeechCharacteristics(result.speech_characteristics);
            }
            
            // Show processing indicator for 300ms (reduced from 500ms)
            setProcessingPacket(true);
            if (processingTimeoutRef.current) {
              window.clearTimeout(processingTimeoutRef.current);
            }
            
            processingTimeoutRef.current = window.setTimeout(() => {
              setProcessingPacket(false);
              processingTimeoutRef.current = null;
            }, 300);
          },
          onError: (err) => {
            setError(err.message);
          }
        });

        // Initialize model
        try {
          const response = await fetch('/api/initialize', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model_path: 'models/SER.h5',
              asr_model_path: 'models/ASR.pth'
            }),
          });

          const data = await response.json();

          if (data.status === 'success') {
            setIsModelInitialized(true);
          } else {
            setError(data.message || 'Failed to initialize model');
          }
        } catch (error) {
          console.error('API error:', error);
          // For development, we'll set this to true even if the backend is not available
          setIsModelInitialized(true);
        }
      } catch (err) {
        setError('Failed to connect to server. Make sure the backend is running.');
        console.error(err);

        // For development, we'll set these to true even if the backend is not available
        setIsConnected(true);
        setIsModelInitialized(true);
      } finally {
        setLoading(false);
      }
    };

    setupWebSocket();

    // Cleanup WebSocket connection
    return () => {
      if (processingTimeoutRef.current) {
        window.clearTimeout(processingTimeoutRef.current);
      }
      if (speechTimeoutRef.current) {
        window.clearTimeout(speechTimeoutRef.current);
      }
      closeWebSocket();
    };
  }, []);

  // Apply calibration to emotion results (using default thresholds since we removed the calibration UI)
  useEffect(() => {
    // Check if emotionResult actually changed meaningfully
    const hasChanged = !prevEmotionResultRef.current || 
      JSON.stringify(emotionResult) !== JSON.stringify(prevEmotionResultRef.current);
    
    // Only update if we have a result and it's different from previous
    if (emotionResult && hasChanged) {
      // Update the ref first
      prevEmotionResultRef.current = emotionResult;
      
      // Use default thresholds since we removed the calibration functionality
      const defaultThresholds = {
        anger: 0.6,
        disgust: 0.6,
        fear: 0.6,
        happiness: 0.6,
        sadness: 0.6,
        surprise: 0.6,
        neutral: 0.5,
      };
      
      // Calculate new calibrated result
      const calibratedResult = applyCalibrationToResult(emotionResult, defaultThresholds);
      
      // Update state without checking current calibratedEmotionResult
      setCalibratedEmotionResult(calibratedResult);
    } else if (!emotionResult && calibratedEmotionResult !== null) {
      // Clear the ref and state when there's no emotion result
      prevEmotionResultRef.current = null;
      setCalibratedEmotionResult(null);
    }
  }, [emotionResult]); // Only depend on emotionResult

  // Update last speech characteristics when new data is received
  useEffect(() => {
    if (emotionResult && emotionResult.speech_characteristics) {
      setLastSpeechCharacteristics(emotionResult.speech_characteristics);
    }
  }, [emotionResult]);

  // Clear last speech characteristics when capturing stops
  useEffect(() => {
    if (!isCapturing) {
      setLastSpeechCharacteristics(null);
    }
  }, [isCapturing]);

  // Handle start/stop capturing
  const toggleCapturing = async () => {
    if (isCapturing) {
      // Reset emotion state when stopping
      setEmotionResult(null);
      setIsSpeaking(false);
      if (speechTimeoutRef.current) {
        window.clearTimeout(speechTimeoutRef.current);
        speechTimeoutRef.current = null;
      }
      
      // Reset latest recording ID - we'll set it again after saving
      setLatestRecordingId(null);
      
      // Disable audio processing
      setAudioProcessingEnabled(false);
      
      // Stop the audio capture to finalize recording
      try {
        // Import needed functions
        const { stopAudioCapture, getRecordedAudio, cleanupAudio } = await import('./services/audioService');
        
        setLoading(true);
        // Wait for the stopAudioCapture to complete
        await stopAudioCapture();
        
        // Small delay to make sure recording is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Get the recorded audio and make sure it's available
        const audioBlob = getRecordedAudio();
        if (!audioBlob) {
          console.error('Failed to get recorded audio');
          setSaveSuccess(false);
          setTimeout(() => setSaveSuccess(null), 5000);
          cleanupAudio(); // Clean up audio resources
          setIsCapturing(false);
          setLoading(false);
          return;
        }
        
        console.log('Successfully retrieved audio recording, size:', audioBlob.size);
        
        // Save the recording
        try {
          const recordingId = await saveRecording();
          
          console.log('Recording saved successfully with ID:', recordingId);
          
          // No need for custom event - we'll use the state directly
          if (recordingId) {
            // Use a timeout to make sure recordings are loaded first
            setTimeout(() => {
              setLatestRecordingId(recordingId);
              console.log('Set latest recording ID for analysis:', recordingId);
            }, 500);
          }
          
        } catch (error) {
          console.error('Error saving recording:', error);
          setSaveSuccess(false);
          setTimeout(() => setSaveSuccess(null), 5000);
        } finally {
          cleanupAudio(); // Clean up audio resources
          setLoading(false);
          setIsCapturing(false);
        }
      } catch (error) {
        console.error('Error finalizing recording:', error);
        setSaveSuccess(false);
        setTimeout(() => setSaveSuccess(null), 5000);
        
        // Attempt to clean up resources even if there was an error
        try {
          const { cleanupAudio } = await import('./services/audioService');
          cleanupAudio();
        } catch (cleanupError) {
          console.error('Error during cleanup:', cleanupError);
        }
        
        setLoading(false);
        setIsCapturing(false);
      }
    } else {
      // Starting capture
      try {
        // Import needed functions and initialize audio
        const { startAudioCapture, initializeAudioCapture } = await import('./services/audioService');
        
        setLoading(true); // Show loading state while initializing
        
        // Initialize audio context first
        console.log('Initializing audio context...');
        const initialized = await initializeAudioCapture();
        if (!initialized) {
          console.error('Failed to initialize audio context');
          setError('Failed to initialize audio. Please check microphone permissions and try again.');
          setLoading(false);
          return;
        }
        
        // Start audio capture
        const started = await startAudioCapture();
        if (!started) {
          console.error('Failed to start audio capture');
          setError('Failed to start audio capture. Please check microphone permissions and try again.');
          setLoading(false);
          return;
        }
        
        // Enable audio processing
        setAudioProcessingEnabled(true);
        
        setLoading(false);
        setIsCapturing(true);
      } catch (error) {
        console.error('Error starting audio capture:', error);
        setError('An error occurred while starting audio capture: ' + (error instanceof Error ? error.message : String(error)));
        setLoading(false);
      }
    }
  };

  // Handle saving the recording
  const saveRecording = async () => {
    // Import needed functions for audio validation
    try {
      const { getRecordedAudio } = await import('./services/audioService');
      
      // First verify we have a valid audio recording
      const audioBlob = getRecordedAudio();
      
      if (!audioBlob) {
        console.error('No audio blob available for saving');
        setSaveSuccess(false);
        setTimeout(() => setSaveSuccess(null), 5000);
        return;
      }
      
      if (audioBlob.size === 0) {
        console.error('Audio blob is empty (zero bytes)');
        setSaveSuccess(false);
        setTimeout(() => setSaveSuccess(null), 5000);
        return;
      }
      
      console.log('Audio blob verified for saving: size =', audioBlob.size, 'type =', audioBlob.type);
      
      // Only save if we have emotion data
      if (!emotionResult) {
        console.warn('No emotion data available for recording, using default empty object');
        // Continue with empty emotion data rather than failing
      }
      
      try {
        console.log('Saving recording with emotion data:', emotionResult || {});
        // Save recording to database using API, provide empty object if emotionResult is null
        const result = await saveRecordingToDatabase(emotionResult || {});
        
        if (result && result.success) {
          console.log('Recording saved successfully (either to Supabase or localStorage) with ID:', result.recordingId);
          setLatestRecordingId(result.recordingId || null);
          setSaveSuccess(true);
          // Clear success message after 5 seconds
          setTimeout(() => setSaveSuccess(null), 5000);
          return result.recordingId;
        } else {
          console.error('Failed to save recording - could not save to either Supabase or localStorage');
          setSaveSuccess(false);
          // Clear error message after 5 seconds
          setTimeout(() => setSaveSuccess(null), 5000);
          return null;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error saving recording:', error);
        console.error('Error details:', errorMessage);
        setSaveSuccess(false);
        // Clear error message after 5 seconds
        setTimeout(() => setSaveSuccess(null), 5000);
        return null;
      }
    } catch (error) {
      console.error('Error loading audio service modules:', error);
      setSaveSuccess(false);
      setTimeout(() => setSaveSuccess(null), 5000);
      return null;
    }
  };

  // Format last update time
  const getLastUpdateText = () => {
    if (!lastUpdateTime) return 'No updates yet';
    
    const now = new Date();
    const diff = now.getTime() - lastUpdateTime.getTime();
    
    if (diff < 1000) return 'Just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)} seconds ago`;
    
    return `${Math.floor(diff / 60000)} minutes ago`;
  };

  // Map speech characteristics to user-friendly format
  const formatSpeechCharacteristics = (characteristics: any) => {
    if (!characteristics) return null;
    
    // Format fluency using ASR model's exact terminology
    let fluency = 'Medium Fluency';
    if (characteristics.fluency.category.toLowerCase().includes('high')) {
      fluency = 'High Fluency';
    } else if (characteristics.fluency.category.toLowerCase().includes('low')) {
      fluency = 'Low Fluency';
    }
    
    // Use the original tempo category directly from the ASR model
    const tempo = characteristics.tempo.category;
    
    // Format pronunciation using ASR model's exact terminology
    let pronunciation = 'Clear Pronunciation';
    if (characteristics.pronunciation.category.toLowerCase().includes('unclear')) {
      pronunciation = 'Unclear Pronunciation';
    }
    
    return {
      fluency: { 
        category: fluency, 
        confidence: characteristics.fluency.confidence 
      },
      tempo: { 
        category: tempo, 
        confidence: characteristics.tempo.confidence 
      },
      pronunciation: { 
        category: pronunciation, 
        confidence: characteristics.pronunciation.confidence 
      }
    };
  };

  const handleEmotionSettingsChange = (_: { confidenceThreshold: number, useSmoothing: boolean }) => {
    // These variables are used by EmotionDisplay component
    // No need to set local state anymore since we removed AudioCapture component
  };

  // Handle analysis completion
  const handleAnalysisComplete = (id: number | string) => {
    console.log(`Analysis completed for recording ID: ${id}`);
    // Reset the latest recording ID
    setLatestRecordingId(null);
  };
  
  useEffect(() => {
    // Check for stored API availability on start
    const storedAvailability = localStorage.getItem('huggingFaceApiAvailable');
    if (storedAvailability === 'false') {
      setIsHuggingFaceAvailable(false);
      
      // Also check when it was stored
      const storedTime = localStorage.getItem('huggingFaceApiUnavailableTime');
      if (storedTime) {
        const unavailableTime = parseInt(storedTime, 10);
        const currentTime = Date.now();
        
        // If it's been more than 2 minutes, reset
        if (currentTime - unavailableTime > 2 * 60 * 1000) {
          setIsHuggingFaceAvailable(true);
          localStorage.removeItem('huggingFaceApiAvailable');
          localStorage.removeItem('huggingFaceApiUnavailableTime');
        }
      }
    }
  }, []);
  
  // Update any error display logic to handle "width=9 cannot exceed data.shape" specifically
  const getErrorDetails = (errorMsg: string): string => {
    // Special handling for dimension mismatch errors
    if (errorMsg.includes("width=9 cannot exceed data.shape") || 
        errorMsg.includes("data.shape[axis]=7") ||
        errorMsg.includes("dimension mismatch")) {
      return "The system encountered a model dimension issue. Please refresh the page and try again.";
    } else {
      return "Please make sure the backend server is running and try again.";
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="App" style={{ 
        minHeight: '100vh', 
        position: 'relative',
        backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(124, 58, 237, 0.1) 0%, rgba(6, 182, 212, 0.1) 90%)', 
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        zIndex: 0,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Background effect that is visually in the background */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.3,
          zIndex: -1,
          background: 'radial-gradient(circle at 10% 20%, rgba(124, 58, 237, 0.15) 0%, rgba(6, 182, 212, 0.15) 90%)',
          pointerEvents: 'none'
        }}></div>

        <AppBar position="fixed" elevation={0}>
          <Toolbar sx={{ height: { xs: 54, md: 60 }, px: { xs: 1, md: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box 
                sx={{ 
                  width: { xs: 28, md: 36 }, 
                  height: { xs: 28, md: 36 }, 
                  borderRadius: { xs: '8px', md: '10px' }, 
                  background: 'linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mr: { xs: 1, md: 1 }
                }}
              >
                <Typography variant="h6" sx={{ color: 'white', fontSize: { xs: '0.8rem', md: '1rem' }, m: 0, p: 0 }}>TW</Typography>
              </Box>
              <Typography 
                variant="h5" 
                component="div" 
                sx={{ 
                  flexGrow: 1, 
                  fontWeight: 700, 
                  background: 'linear-gradient(90deg, #7C3AED 0%, #06B6D4 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  mr: 2,
                  display: { xs: 'none', sm: 'block' },
                  fontSize: { xs: '1.2rem', md: '1.3rem' }
                }}
              >
                Talk.twahnalyzer
              </Typography>
            </Box>
            
            <Box sx={{ flexGrow: 1 }} />
            
            {/* Connection status indicator */}
            <Box sx={{ display: 'flex', alignItems: 'center', mr: { xs: 0.5, md: 1 } }}>
              <Badge
                color={isConnected ? "success" : "error"}
                variant="dot"
                sx={{ 
                  '& .MuiBadge-badge': { 
                    width: { xs: 8, md: 10 }, 
                    height: { xs: 8, md: 10 },
                    borderRadius: '50%',
                    animation: isConnected && processingPacket ? 'pulse 1s infinite' : 'none',
                    '@keyframes pulse': {
                      '0%': { transform: 'scale(0.8)' },
                      '50%': { transform: 'scale(1.2)' },
                      '100%': { transform: 'scale(0.8)' },
                    }
                  } 
                }}
              >
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  py: { xs: 0.4, md: 0.5 }, 
                  px: { xs: 1, md: 1.5 }, 
                  borderRadius: '8px',
                  backgroundColor: isConnected ? alpha(theme.palette.success.main, 0.1) : alpha(theme.palette.error.main, 0.1)
                }}>
                  <Typography variant="body2" sx={{ 
                    color: isConnected ? theme.palette.success.main : theme.palette.error.main,
                    fontWeight: 600,
                    fontSize: { xs: '0.65rem', md: '0.75rem' }
                  }}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </Typography>
                </Box>
              </Badge>
            </Box>
            
            {/* Last update time - hidden on mobile */}
            {lastUpdateTime && (
              <Box sx={{ 
                backgroundColor: alpha(theme.palette.background.paper, 0.3),
                py: 0.5, 
                px: 1.5, 
                borderRadius: '8px',
                display: { xs: 'none', md: 'block' }
              }}>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontSize: '0.75rem' }}>
                  Last update: {getLastUpdateText()}
                </Typography>
              </Box>
            )}
          </Toolbar>
        </AppBar>

        {/* Reconnecting indicator */}
        <Snackbar 
          open={showReconnecting} 
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert 
            severity="warning" 
            sx={{ 
              width: '100%', 
              borderRadius: theme.shape.borderRadius,
              backgroundColor: alpha(theme.palette.warning.main, 0.15),
              color: theme.palette.warning.main,
              border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
              py: 0.5,
              minHeight: 'auto'
            }}
          >
            {reconnectAttempt > 0 
              ? `Reconnecting... (${reconnectAttempt})` 
              : 'Connection lost'
            }
          </Alert>
        </Snackbar>

        {/* Recording saved notification */}
        <Snackbar 
          open={saveSuccess !== null} 
          autoHideDuration={5000}
          onClose={() => setSaveSuccess(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert 
            severity={saveSuccess ? "success" : "error"} 
            sx={{ 
              width: '100%', 
              borderRadius: theme.shape.borderRadius,
              backgroundColor: alpha(saveSuccess ? theme.palette.success.main : theme.palette.error.main, 0.15),
              color: saveSuccess ? theme.palette.success.main : theme.palette.error.main,
              border: `1px solid ${alpha(saveSuccess ? theme.palette.success.main : theme.palette.error.main, 0.3)}`,
              py: 0.5,
              minHeight: 'auto'
            }}
          >
            {saveSuccess 
              ? 'Recording saved!' 
              : 'Failed to save'
            }
          </Alert>
        </Snackbar>

        <Container disableGutters maxWidth="lg" sx={{ 
          pt: { xs: 7, sm: 8, md: 8 }, 
          pb: { xs: 1, md: 2 }, 
          px: { xs: 1, sm: 2, md: 3 },
          position: 'relative',
          zIndex: 1,
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column'
        }}>
          {loading ? (
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column',
              justifyContent: 'center', 
              alignItems: 'center', 
              height: '70vh',
              textAlign: 'center'
            }}>
              <CircularProgress size={60} thickness={4} sx={{ mb: 3 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>
                Initializing AI Speech Analysis
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Please wait while we set up the machine learning model
              </Typography>
            </Box>
          ) : error ? (
            <Paper sx={{ 
              p: { xs: 2, md: 3 }, 
              textAlign: 'center', 
              backgroundColor: alpha(theme.palette.error.main, 0.1),
              borderRadius: theme.shape.borderRadius,
              border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`
            }}>
              <Typography variant="h6" color="error" sx={{ mb: 2 }}>
                Connection Error
              </Typography>
              <Typography variant="body1">
                {error}
              </Typography>
              <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                {getErrorDetails(error || '')}
              </Typography>
            </Paper>
          ) : (
            <>
              <Box sx={{ 
                mb: { xs: 1.5, md: 2 }, 
                display: 'flex', 
                justifyContent: 'center', 
                position: 'relative',
                zIndex: 1000,
                width: '100%'
              }}>
                <Button
                  variant="contained"
                  color={isCapturing ? "error" : "primary"}
                  disabled={!isConnected || !isModelInitialized}
                  onClick={toggleCapturing}
                  size="medium"
                  sx={{ 
                    px: { xs: 2, md: 3 }, 
                    py: { xs: 0.8, md: 1 }, 
                    fontSize: { xs: '0.85rem', md: '0.95rem' },
                    position: 'relative',
                    minWidth: { xs: '40%', sm: '30%', md: 'auto' },
                    overflow: 'hidden',
                    zIndex: 1000,
                    boxShadow: '0 6px 12px rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '50px',
                    fontWeight: 700,
                    '&::before': isCapturing ? {} : {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(255, 255, 255, 0.1)',
                      animation: 'pulse-animation 2s infinite',
                    },
                    '@keyframes pulse-animation': {
                      '0%': { opacity: 0.6, transform: 'scale(1)' },
                      '50%': { opacity: 0, transform: 'scale(1.2)' },
                      '100%': { opacity: 0.6, transform: 'scale(1)' },
                    }
                  }}
                >
                  {isCapturing ? "STOP CAPTURE" : "START CAPTURE"}
                </Button>
              </Box>

              <Box sx={{ 
                display: 'flex', 
                flexDirection: { xs: 'column', md: 'row' },
                gap: { xs: 1, md: 1.5 },
                flexGrow: 1,
                overflow: 'auto',
                height: { xs: 'auto', md: 'calc(100vh - 180px)' },
                maxHeight: { md: '650px' },
                mx: { xs: 0.5, md: 0 }
              }}>
                {/* Left column: Speech Characteristics (was Recordings) */}
                <Box sx={{ 
                  width: { xs: '100%', md: '27%', lg: '25%' },
                  height: { xs: 'auto', md: '100%' }
                }}>
                  <Paper sx={{ 
                    p: { xs: 0.75, md: 1.25 }, 
                    height: '100%',
                    minHeight: { xs: '200px', md: '240px' },
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    borderRadius: '12px',
                    background: 'linear-gradient(145deg, rgba(36, 45, 66, 0.7), rgba(30, 41, 59, 0.9))',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
                  }}>
                    <SpeechCharacteristics
                      characteristics={formatSpeechCharacteristics(emotionResult?.speech_characteristics || lastSpeechCharacteristics)}
                      isCapturing={isCapturing}
                      noPaper={true}
                      showLastDetectedMessage={!emotionResult?.speech_characteristics && !!lastSpeechCharacteristics}
                      showWaitingMessage={true}
                      useASRModel={true}
                      isUsingFallback={!isHuggingFaceAvailable}
                    />
                  </Paper>
                </Box>
                
                {/* Middle column: Emotion Display and Recordings (was Speech Characteristics) */}
                <Box sx={{ 
                  width: { xs: '100%', md: '46%', lg: '50%' },
                  display: 'flex',
                  flexDirection: 'column',
                  gap: { xs: 1, md: 1.5 },
                  height: { xs: 'auto', md: '100%' }
                }}>
                  <Paper sx={{ 
                    p: { xs: 0.75, md: 1.25 },
                    borderRadius: '12px',
                    background: 'linear-gradient(145deg, rgba(36, 45, 66, 0.7), rgba(30, 41, 59, 0.9))',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
                    height: '100%',
                    flexGrow: 1
                  }}>
                    <EmotionDisplay
                      emotionResult={isCapturing && isSpeaking ? emotionResult : null}
                      isCapturing={isCapturing}
                      onSettingsChange={handleEmotionSettingsChange}
                    />
                  </Paper>
                  
                  {/* Show Recordings only when not capturing */}
                  {!isCapturing && (
                    <Paper sx={{ 
                      p: { xs: 0.75, md: 1.25 },
                      borderRadius: '12px',
                      background: 'linear-gradient(145deg, rgba(36, 45, 66, 0.7), rgba(30, 41, 59, 0.9))',
                      backdropFilter: 'blur(10px)',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
                    }}>
                      <Recordings 
                        isCapturing={isCapturing} 
                        recordingToAnalyze={latestRecordingId}
                        onAnalysisComplete={handleAnalysisComplete}
                      />
                    </Paper>
                  )}
                </Box>
                
                {/* Right column: Feedback */}
                <Box sx={{ 
                  width: { xs: '100%', md: '27%', lg: '25%' },
                  height: { xs: 'auto', md: '100%' }
                }}>
                  <Paper sx={{ 
                    p: { xs: 0.75, md: 1.25 }, 
                    height: '100%',
                    borderRadius: '12px',
                    background: 'linear-gradient(145deg, rgba(36, 45, 66, 0.7), rgba(30, 41, 59, 0.9))',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
                  }}>
                    <Feedback
                      emotionResult={isCapturing ? calibratedEmotionResult : null}
                      isCapturing={isCapturing}
                    />
                  </Paper>
                </Box>
              </Box>
            </>
          )}
        </Container>
        
        {/* Footer */}
        <Box 
          component="footer" 
          sx={{ 
            py: { xs: 0.75, md: 1 }, 
            textAlign: 'center', 
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            mt: 'auto'
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', md: '0.7rem' } }}>
            Real-Time Speech Analysis • Powered by AI
          </Typography>
        </Box>
      </div>
    </ThemeProvider>
  );
}

export default App;
