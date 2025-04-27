import { useState, useEffect, useRef } from 'react';
import { Container, Box, Typography, Paper, AppBar, Toolbar, Button, CircularProgress, Badge, Alert, Snackbar, ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import AudioCapture from './components/AudioCapture';
import EmotionDisplay from './components/EmotionDisplay';
import SpeechTempoDisplay from './components/SpeechRateDisplay';
import Feedback from './components/Feedback';
import SpeechCharacteristics from './components/SpeechCharacteristics';
import { initializeWebSocket, closeWebSocket } from './services/websocket';
import './App.css';

// Create a theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#3f51b5',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: '#f5f7fa',
      paper: '#ffffff'
    }
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h6: {
      fontWeight: 600,
    }
  },
  shape: {
    borderRadius: 12
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
          padding: '10px 24px'
        }
      }
    }
  }
});

// Define emotion result type
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
}

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

  // Initialize WebSocket connection
  useEffect(() => {
    // Setup WebSocket connection
    const setupWebSocket = async () => {
      try {
        setLoading(true);
        
        // Log the backend URL for debugging
        const backendUrl = import.meta.env.VITE_BACKEND_URL || '/';
        console.log('Using backend URL:', backendUrl);

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
          const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
          const apiUrl = backendUrl ? `${backendUrl}/api/initialize` : '/api/initialize';
          console.log('Calling initialize API at:', apiUrl);
          
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            mode: 'cors',
            credentials: 'same-origin',
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

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="App">
        <AppBar position="static" elevation={0} sx={{ backgroundColor: 'white', color: 'text.primary' }}>
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700, color: theme.palette.primary.main }}>
              Real-Time Speech Emotion & Rate Feedback
            </Typography>
            
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
                <Typography variant="body2" sx={{ ml: 2 }}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </Typography>
              </Badge>
            </Box>
            
            {/* Last update time */}
            {lastUpdateTime && (
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                Last update: {getLastUpdateText()}
              </Typography>
            )}
          </Toolbar>
        </AppBar>

        {/* Reconnecting indicator */}
        <Snackbar 
          open={showReconnecting} 
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert severity="warning" sx={{ width: '100%', borderRadius: theme.shape.borderRadius }}>
            {reconnectAttempt > 0 
              ? `Reconnecting to server... (Attempt ${reconnectAttempt})` 
              : 'Connection lost. Reconnecting...'
            }
          </Alert>
        </Snackbar>

        <Container maxWidth="lg" sx={{ mt: 4, pb: 4 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
              <CircularProgress />
              <Typography variant="h6" sx={{ ml: 2 }}>
                Initializing...
              </Typography>
            </Box>
          ) : error ? (
            <Paper sx={{ p: 3, textAlign: 'center', bgcolor: '#ffebee', borderRadius: theme.shape.borderRadius }}>
              <Typography variant="h6" color="error">
                Error: {error}
              </Typography>
              <Typography variant="body1" sx={{ mt: 2 }}>
                Please make sure the backend server is running and try again.
              </Typography>
            </Paper>
          ) : (
            <>
              <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center' }}>
                <Button
                  variant="contained"
                  color={isCapturing ? "error" : "primary"}
                  disabled={!isConnected || !isModelInitialized}
                  onClick={toggleCapturing}
                  size="large"
                  sx={{ 
                    px: 4, 
                    py: 1.5, 
                    fontSize: '1rem',
                    boxShadow: isCapturing ? '0 4px 20px rgba(244, 67, 54, 0.2)' : '0 4px 20px rgba(63, 81, 181, 0.2)'
                  }}
                >
                  {isCapturing ? "STOP CAPTURING" : "START CAPTURING"}
                </Button>
              </Box>

              <Box sx={{ 
                display: 'grid', 
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, 
                gap: 3,
                mb: 3
              }}>
                <Box>
                  <AudioCapture
                    isCapturing={isCapturing}
                    isConnected={isConnected}
                  />
                </Box>
                <Box>
                  <EmotionDisplay
                    emotionResult={isSpeaking ? emotionResult : null}
                    isCapturing={isCapturing}
                  />
                </Box>
              </Box>

              <Box sx={{ 
                display: 'grid', 
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, 
                gap: 3,
                mb: 3
              }}>
                <Box>
                  <SpeechTempoDisplay
                    speechRate={isSpeaking ? emotionResult?.speech_rate : undefined}
                    isCapturing={isCapturing}
                  />
                </Box>
                <Box>
                  <Feedback
                    emotionResult={isSpeaking ? emotionResult : null}
                    isCapturing={isCapturing}
                  />
                </Box>
              </Box>
              
              {/* Speech Characteristics Display */}
              {emotionResult?.speech_characteristics && (
                <Box sx={{ mt: 2 }}>
                  <SpeechCharacteristics
                    characteristics={formatSpeechCharacteristics(emotionResult.speech_characteristics)}
                    isCapturing={isCapturing}
                  />
                </Box>
              )}
            </>
          )}
        </Container>
      </div>
    </ThemeProvider>
  );
}

export default App;
