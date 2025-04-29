import { useState, useEffect, useRef } from 'react';
import { Container, Box, Typography, Paper, AppBar, Toolbar, Button, CircularProgress, Badge, Alert, Snackbar, ThemeProvider, createTheme, CssBaseline, alpha } from '@mui/material';
import AudioCapture from './components/AudioCapture';
import EmotionDisplay from './components/EmotionDisplay';
import SpeechTempoDisplay from './components/SpeechRateDisplay';
import Feedback from './components/Feedback';
import SpeechCharacteristics from './components/SpeechCharacteristics';
import EmotionCalibration from './components/EmotionCalibration';
import { initializeWebSocket, closeWebSocket } from './services/websocket';
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
    },
    h5: {
      fontWeight: 700,
      letterSpacing: '0.02em',
    },
    button: {
      fontWeight: 600,
    }
  },
  shape: {
    borderRadius: 16
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
          padding: '12px 28px',
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
          height: 80,
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

// Local interface for calibration data
interface CalibrationData {
  emotion: string;
  userFeedback: {
    correctness: 'correct' | 'incorrect' | 'unsure';
    actualEmotion?: string;
  };
  timestamp: number;
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

// Load confidence thresholds from local storage
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
  const processingTimeoutRef = useRef<number | null>(null);
  
  // Speech detection timeout
  const speechTimeoutRef = useRef<number | null>(null);
  const [calibratedEmotionResult, setCalibratedEmotionResult] = useState<EmotionResult | null>(null);

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
              
              // Set a new timeout to reset speaking state if no speech is detected for 3 seconds
              speechTimeoutRef.current = window.setTimeout(() => {
                setIsSpeaking(false);
                speechTimeoutRef.current = null;
              }, 3000);
            }
            
            // Show processing indicator for 500ms
            setProcessingPacket(true);
            if (processingTimeoutRef.current) {
              window.clearTimeout(processingTimeoutRef.current);
            }
            
            processingTimeoutRef.current = window.setTimeout(() => {
              setProcessingPacket(false);
              processingTimeoutRef.current = null;
            }, 500);
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

  // Apply calibration to emotion results
  useEffect(() => {
    if (emotionResult) {
      const confidenceThresholds = loadConfidenceThresholds();
      const calibratedResult = applyCalibrationToResult(emotionResult, confidenceThresholds);
      setCalibratedEmotionResult(calibratedResult);
    } else {
      setCalibratedEmotionResult(null);
    }
  }, [emotionResult]);

  // Handle start/stop capturing
  const toggleCapturing = () => {
    if (isCapturing) {
      setIsSpeaking(false);
      if (speechTimeoutRef.current) {
        window.clearTimeout(speechTimeoutRef.current);
        speechTimeoutRef.current = null;
      }
    }
    setIsCapturing(!isCapturing);
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
    
    // Format tempo using ASR model's exact terminology
    let tempo = 'Medium Tempo';
    if (characteristics.tempo.category.toLowerCase().includes('fast')) {
      tempo = 'Fast Tempo';
    } else if (characteristics.tempo.category.toLowerCase().includes('slow')) {
      tempo = 'Slow Tempo';
    }
    
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

  // Handle calibration data updates
  const handleCalibrationUpdate = (_: CalibrationData[]) => {
    // Recalibrate current result if it exists
    if (emotionResult) {
      const confidenceThresholds = loadConfidenceThresholds();
      const calibratedResult = applyCalibrationToResult(emotionResult, confidenceThresholds);
      setCalibratedEmotionResult(calibratedResult);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="App" style={{ minHeight: '100vh', backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(124, 58, 237, 0.05) 0%, rgba(6, 182, 212, 0.05) 90%)' }}>
        <AppBar position="fixed" elevation={0}>
          <Toolbar>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box 
                sx={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: '12px', 
                  background: 'linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mr: 2
                }}
              >
                <Typography variant="h6" sx={{ color: 'white' }}>RT</Typography>
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
                  display: { xs: 'none', sm: 'block' }
                }}
              >
                SpeechSense AI
              </Typography>
            </Box>
            
            <Box sx={{ flexGrow: 1 }} />
            
            {/* Connection status indicator */}
            <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
              <Badge
                color={isConnected ? "success" : "error"}
                variant="dot"
                sx={{ 
                  '& .MuiBadge-badge': { 
                    width: 12, 
                    height: 12,
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
                  py: 0.75, 
                  px: 2, 
                  borderRadius: '8px',
                  backgroundColor: isConnected ? alpha(theme.palette.success.main, 0.1) : alpha(theme.palette.error.main, 0.1)
                }}>
                  <Typography variant="body2" sx={{ 
                    color: isConnected ? theme.palette.success.main : theme.palette.error.main,
                    fontWeight: 600,
                  }}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </Typography>
                </Box>
              </Badge>
            </Box>
            
            {/* Last update time */}
            {lastUpdateTime && (
              <Box sx={{ 
                backgroundColor: alpha(theme.palette.background.paper, 0.3),
                py: 0.75, 
                px: 2, 
                borderRadius: '8px',
                display: { xs: 'none', md: 'block' }
              }}>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
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
              border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`
            }}
          >
            {reconnectAttempt > 0 
              ? `Reconnecting to server... (Attempt ${reconnectAttempt})` 
              : 'Connection lost. Reconnecting...'
            }
          </Alert>
        </Snackbar>

        <Container maxWidth="lg" sx={{ pt: 12, pb: 6 }}>
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
              p: 4, 
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
                Please make sure the backend server is running and try again.
              </Typography>
            </Paper>
          ) : (
            <>
              <Box sx={{ mb: 5, mt: 2, display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="contained"
                  color={isCapturing ? "error" : "primary"}
                  disabled={!isConnected || !isModelInitialized}
                  onClick={toggleCapturing}
                  size="large"
                  sx={{ 
                    px: 4, 
                    py: 2, 
                    fontSize: '1.1rem',
                    position: 'relative',
                    overflow: 'hidden',
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
                display: 'grid', 
                gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, 
                gap: 4,
                mb: 4
              }}>
                <Box>
                  <AudioCapture
                    isCapturing={isCapturing}
                    isConnected={isConnected}
                  />
                </Box>
                <Box>
                  <EmotionDisplay
                    emotionResult={isSpeaking ? calibratedEmotionResult : null}
                    isCapturing={isCapturing}
                  />
                </Box>
              </Box>

              <Box sx={{ 
                display: 'grid', 
                gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, 
                gap: 4,
                mb: 4
              }}>
                <Box>
                  <SpeechTempoDisplay
                    speechRate={isSpeaking ? emotionResult?.speech_rate : undefined}
                    isCapturing={isCapturing}
                  />
                </Box>
                <Box>
                  <EmotionCalibration
                    emotionResult={isSpeaking ? emotionResult : null}
                    isCapturing={isCapturing}
                    onCalibrationUpdate={handleCalibrationUpdate}
                  />
                </Box>
              </Box>
              
              <Box sx={{ 
                display: 'grid', 
                gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, 
                gap: 4,
                mb: 4
              }}>
                <Box>
                  {emotionResult?.speech_characteristics && (
                    <SpeechCharacteristics
                      characteristics={formatSpeechCharacteristics(emotionResult.speech_characteristics)}
                      isCapturing={isCapturing}
                    />
                  )}
                </Box>
                <Box>
                  <Feedback
                    emotionResult={isSpeaking ? calibratedEmotionResult : null}
                    isCapturing={isCapturing}
                  />
                </Box>
              </Box>
            </>
          )}
        </Container>
        
        {/* Footer */}
        <Box 
          component="footer" 
          sx={{ 
            py: 3, 
            textAlign: 'center', 
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            mt: 'auto'
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Real-Time Speech Analysis • Powered by AI
          </Typography>
        </Box>
      </div>
    </ThemeProvider>
  );
}

export default App;
