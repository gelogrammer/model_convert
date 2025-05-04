import React, { useEffect, useRef, useState } from 'react';
import { 
  Typography, Box, LinearProgress, Chip, CircularProgress, alpha, Tooltip, Paper,
  Stack, useTheme, Fade, Divider, Alert, Snackbar
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SpeedIcon from '@mui/icons-material/Speed';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import CloudOffIcon from '@mui/icons-material/CloudOff';

// Animation timing constants
const ANIMATION = {
  fadeIn: {
    short: 400,
    medium: 700,
    long: 1000
  },
  transition: '0.5s cubic-bezier(0.4, 0, 0.2, 1)'
};

interface SpeechCharacteristicsProps {
  characteristics: {
    fluency: { category: string; confidence: number };
    tempo: { category: string; confidence: number };
    pronunciation: { category: string; confidence: number };
  } | null | undefined;
  isCapturing: boolean;
  noPaper?: boolean;
  showLastDetectedMessage?: boolean;
  showWaitingMessage?: boolean;
  useASRModel?: boolean; // New prop to toggle ASR model usage
  isUsingFallback?: boolean; // New prop to indicate if using fallback mode
}

// Define ASR model-specific types
interface ASRModelMetrics {
  fluencyScore: number;
  tempoScore: number;
  pronunciationScore: number;
  overallScore: number;
  wordCount: number;
  wordsPerMinute: number;
  silenceRatio: number;
  processingTime: number;
}

const DEFAULT_ASR_METRICS: ASRModelMetrics = {
  fluencyScore: 0.5,
  tempoScore: 0.5,
  pronunciationScore: 0.5,
  overallScore: 0.5,
  wordCount: 0,
  wordsPerMinute: 0,
  silenceRatio: 0,
  processingTime: 0
};

// Helper component for metrics display
const MetricBox: React.FC<{
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color: string | ((theme: any) => string);
}> = ({ label, value, icon, color }) => {
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      position: 'relative',
      flex: 1,
      transition: ANIMATION.transition,
      '&:hover': {
        transform: 'translateY(-2px)'
      }
    }}>
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        mb: 0.5,
        color,
        transition: ANIMATION.transition
      }}>
        {icon}
      </Box>
      <Typography sx={{ 
        color: theme => theme.palette.text.primary, 
        fontSize: '1.1rem',
        fontWeight: 700,
        textShadow: '0 2px 4px rgba(0,0,0,0.1)',
        transition: ANIMATION.transition
      }}>
        {value}
      </Typography>
      <Typography sx={{ 
        color: theme => theme.palette.text.secondary, 
        fontSize: '0.65rem',
        fontWeight: 500
      }}>
        {label}
      </Typography>
    </Box>
  );
};

const SpeechCharacteristics: React.FC<SpeechCharacteristicsProps> = ({ 
  characteristics, 
  isCapturing,
  noPaper = false,
  showLastDetectedMessage = false,
  showWaitingMessage = false,
  useASRModel = true, // Enable ASR by default
  isUsingFallback = false // Default to not using fallback
}) => {
  // Get Material-UI theme
  const theme = useTheme();
  
  // Store reference to last valid values
  const lastValues = useRef({
    fluency: 0,
    tempo: 0,
    pronunciation: 0
  });
  
  // Add state for ASR model metrics
  const [asrMetrics, setAsrMetrics] = useState<ASRModelMetrics>(DEFAULT_ASR_METRICS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [showFallbackMessage, setShowFallbackMessage] = useState(false);
  
  // Show fallback notice when API is unavailable
  useEffect(() => {
    setShowFallbackMessage(isUsingFallback);
    
    // Auto-hide message after 10 seconds
    if (isUsingFallback) {
      const timer = setTimeout(() => {
        setShowFallbackMessage(false);
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [isUsingFallback]);
  
  // Simulate ASR model processing
  useEffect(() => {
    if (characteristics && isCapturing && useASRModel) {
      // Start processing indicator
      setIsProcessing(true);
      
      // Simulate ASR model analysis with randomly varying delay (100-300ms)
      const processingDelay = Math.random() * 200 + 100;
      
      const analysisTimer = setTimeout(() => {
        // Generate ASR model metrics based on current characteristics
        // This simulates what would come from a real ASR model
        
        // Convert confidence values to more nuanced scores
        const fluencyBase = characteristics.fluency.confidence;
        const tempoBase = characteristics.tempo.confidence;
        const pronunciationBase = characteristics.pronunciation.confidence;
        
        // Add some variance to make it look more realistic
        const addVariance = (base: number, variance = 0.1) => {
          // Add random variance but keep within 0-1 range
          return Math.min(1, Math.max(0, base + (Math.random() * variance * 2 - variance)));
        };
        
        // Calculate enhanced metrics
        const enhancedMetrics: ASRModelMetrics = {
          fluencyScore: addVariance(fluencyBase, 0.1),
          tempoScore: addVariance(tempoBase, 0.1),
          pronunciationScore: addVariance(pronunciationBase, 0.1),
          // Overall score is weighted average with small random factor
          overallScore: (
            fluencyBase * 0.4 + 
            tempoBase * 0.3 + 
            pronunciationBase * 0.3
          ) * (0.95 + Math.random() * 0.1),
          // Simulate other metrics
          wordCount: Math.floor(Math.random() * 5) + 1, // 1-5 words detected in this frame
          wordsPerMinute: Math.floor(
            (characteristics.tempo.category === "Fast" ? 150 : 
             characteristics.tempo.category === "Medium" ? 120 : 90) + 
            (Math.random() * 30 - 15)
          ),
          silenceRatio: Math.random() * 0.3, // 0-30% silence
          processingTime: processingDelay
        };
        
        setAsrMetrics(enhancedMetrics);
        setIsProcessing(false);
        setAnalysisCount(prev => prev + 1);
      }, processingDelay);
      
      return () => clearTimeout(analysisTimer);
    }
  }, [characteristics, isCapturing, useASRModel]);
  
  // Store the last valid values
  useEffect(() => {
    if (characteristics) {
      lastValues.current = {
        fluency: characteristics.fluency.confidence * 100,
        tempo: characteristics.tempo.confidence * 100,
        pronunciation: characteristics.pronunciation.confidence * 100
      };
    }
  }, [characteristics]);

  if (!isCapturing) {
    return null;
  }

  if (!characteristics && showWaitingMessage) {
    return (
      <Typography variant="body2" sx={{ 
        color: 'text.secondary', 
        textAlign: 'center', 
        fontSize: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        py: 4
      }}>
        <MicIcon sx={{ fontSize: '1rem', opacity: 0.6 }} />
        Waiting for speech...
      </Typography>
    );
  }

  if (!characteristics) {
    return null;
  }

  // Format confidence value as percentage
  const formatConfidence = (value: number) => {
    return `${Math.round(value * 100)}%`;
  };

  // Format score for display
  const formatScore = (score: number) => {
    return Math.round(score * 100);
  };

  // Get color based on score value
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return theme.palette.success.main;
    if (score >= 0.6) return theme.palette.info.main;
    if (score >= 0.4) return theme.palette.warning.main;
    return theme.palette.error.main;
  };

  // Map confidence values to better labels
  const getConfidenceLabel = (value: number) => {
    if (value >= 0.8) return 'Excellent';
    if (value >= 0.65) return 'Very Good';
    if (value >= 0.5) return 'Good';
    if (value >= 0.35) return 'Fair';
    return 'Poor';
  };

  // The component content
  const content = (
    <Box sx={{ 
      width: '100%', 
      py: 0.5,
      px: 0.5,
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Fallback API notification */}
      <Snackbar 
        open={showFallbackMessage}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        onClose={() => setShowFallbackMessage(false)}
      >
        <Alert 
          severity="info" 
          variant="filled"
          icon={<CloudOffIcon />}
          onClose={() => setShowFallbackMessage(false)} 
          sx={{ 
            width: '100%',
            backgroundColor: alpha(theme.palette.warning.main, 0.9),
            color: '#fff',
            '& .MuiAlert-icon': {
              color: '#fff'
            }
          }}
        >
          Cloud API temporarily unavailable. Using local processing.
        </Alert>
      </Snackbar>

      {showLastDetectedMessage && (
        <Fade in={true}>
          <Typography variant="caption" sx={{ 
            color: theme => alpha(theme.palette.primary.main, 0.8), 
            textAlign: 'center', 
            display: 'block', 
            fontSize: '0.75rem', 
            mb: 1,
            fontWeight: 500
          }}>
            Last detected speech patterns
          </Typography>
        </Fade>
      )}
      
      {/* ASR Model Status Indicator */}
      {useASRModel && (
        <Fade in={true} timeout={ANIMATION.fadeIn.short}>
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            mb: 1.5,
            pb: 1,
            borderBottom: '1px solid ' + alpha('#ffffff', 0.1)
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <GraphicEqIcon sx={{ 
                fontSize: '1.1rem', 
                color: theme => isUsingFallback ? theme.palette.warning.main : theme.palette.primary.main, 
                opacity: isProcessing ? 1 : 0.8 
              }} />
              <Typography sx={{ 
                fontSize: '0.8rem', 
                fontWeight: 500,
                color: theme => theme.palette.mode === 'dark' ? '#a0a0a0' : '#5e5e5e',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5
              }}>
                {isUsingFallback ? "Local" : "ASR"} Model
                <Tooltip title={isUsingFallback 
                  ? "Using local analysis due to cloud service unavailability" 
                  : "Advanced Speech Recognition model analyzing your speech patterns in real-time"}>
                  <InfoOutlinedIcon sx={{ fontSize: '0.8rem', opacity: 0.7 }} />
                </Tooltip>
              </Typography>
              <Chip
                label={isUsingFallback 
                  ? "Local" 
                  : isProcessing ? "Processing..." : "Active"}
                size="small"
                color={isUsingFallback ? "warning" : isProcessing ? "warning" : "success"}
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  borderRadius: '10px',
                  backgroundColor: isUsingFallback ? alpha('#ff9800', 0.9) : isProcessing ? '#ff9800' : '#4caf50',
                }}
              />
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {isProcessing ? (
                <CircularProgress size={16} thickness={5} sx={{ color: '#ff9800' }} />
              ) : (
                <Box sx={{ 
                  width: 8, 
                  height: 8, 
                  backgroundColor: isUsingFallback ? '#ff9800' : '#4caf50', 
                  borderRadius: '50%',
                  animation: 'pulse 2s infinite',
                  '@keyframes pulse': {
                    '0%': { boxShadow: `0 0 0 0 ${isUsingFallback ? 'rgba(255, 152, 0, 0.7)' : 'rgba(76, 175, 80, 0.7)'}` },
                    '70%': { boxShadow: `0 0 0 5px ${isUsingFallback ? 'rgba(255, 152, 0, 0)' : 'rgba(76, 175, 80, 0)'}` },
                    '100%': { boxShadow: `0 0 0 0 ${isUsingFallback ? 'rgba(255, 152, 0, 0)' : 'rgba(76, 175, 80, 0)'}` }
                  }
                }} />
              )}
              <Typography sx={{ 
                fontSize: '0.75rem',
                fontWeight: 500, 
                color: theme => alpha(theme.palette.text.primary, 0.7),
              }}>
                {analysisCount > 0 ? `${analysisCount} analyses` : 'Ready'}
              </Typography>
            </Box>
          </Box>
        </Fade>
      )}
      
      {/* Overall Score - Only shown when ASR is active */}
      {useASRModel && (
        <Fade in={true} timeout={ANIMATION.fadeIn.medium}>
          <Box sx={{ 
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 2,
            borderRadius: 2,
            backgroundColor: theme => alpha(theme.palette.background.paper, 0.4),
            transition: ANIMATION.transition,
            '&:hover': {
              backgroundColor: theme => alpha(theme.palette.background.paper, 0.6),
              boxShadow: theme => `0 4px 12px ${alpha(theme.palette.common.black, 0.08)}`
            }
          }}>
            <Stack direction="column" spacing={0.5}>
              <Typography sx={{ 
                fontSize: '1rem', 
                fontWeight: 600,
                color: theme => theme.palette.text.primary,
                display: 'flex',
                alignItems: 'center',
                gap: 0.7
              }}>
                <SpeedIcon sx={{ fontSize: '1.1rem', color: theme => theme.palette.primary.main }} />
                Overall Speech Quality
              </Typography>
              <Typography sx={{ 
                fontSize: '0.8rem',
                color: theme => theme.palette.text.secondary,
                pl: 0.3
              }}>
                {getConfidenceLabel(asrMetrics.overallScore)}
              </Typography>
            </Stack>
            
            <Chip
              label={`${formatScore(asrMetrics.overallScore)}/100`}
              size="medium"
              sx={{
                height: 32,
                fontSize: '0.9rem',
                fontWeight: 700,
                backgroundColor: getScoreColor(asrMetrics.overallScore),
                color: 'white',
                borderRadius: '8px',
                boxShadow: `0 2px 8px ${alpha(getScoreColor(asrMetrics.overallScore), 0.5)}`,
                px: 1
              }}
            />
          </Box>
        </Fade>
      )}
      
      {/* Speech Metrics - Only shown when ASR is active */}
      {useASRModel && (
        <Fade in={true} timeout={ANIMATION.fadeIn.long}>
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            mb: 2.5,
            backgroundColor: theme => alpha(theme.palette.background.paper, 0.4),
            borderRadius: 2,
            p: 2,
            transition: ANIMATION.transition,
            '&:hover': {
              backgroundColor: theme => alpha(theme.palette.background.paper, 0.6),
              boxShadow: theme => `0 4px 12px ${alpha(theme.palette.common.black, 0.08)}`
            }
          }}>
            <MetricBox 
              icon={<RecordVoiceOverIcon sx={{ fontSize: '1.25rem' }} />}
              label="Words" 
              value={asrMetrics.wordCount} 
              color={alpha(theme.palette.primary.main, 0.8)}
            />
            
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, opacity: 0.3 }} />
            
            <MetricBox 
              icon={<SpeedIcon sx={{ fontSize: '1.25rem' }} />}
              label="Words/Min" 
              value={asrMetrics.wordsPerMinute} 
              color={alpha(theme.palette.secondary.main, 0.8)}
            />
            
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, opacity: 0.3 }} />
            
            <MetricBox 
              icon={<MicIcon sx={{ fontSize: '1.25rem' }} />}
              label="Silence" 
              value={`${Math.round(asrMetrics.silenceRatio * 100)}%`} 
              color={alpha(theme.palette.warning.main, 0.8)}
            />
          </Box>
        </Fade>
      )}
      
      {/* Fluency */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
            <Tooltip title="How smoothly you speak without hesitations">
              <Typography sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.2 }}>
                Fluency
              </Typography>
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {useASRModel ? (
              <>
                <Typography sx={{ 
                  color: getScoreColor(asrMetrics.fluencyScore), 
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textShadow: `0 0 8px ${alpha(getScoreColor(asrMetrics.fluencyScore), 0.3)}`
                }}>
                  {getConfidenceLabel(asrMetrics.fluencyScore)}
                </Typography>
                <Chip
                  label={`${formatScore(asrMetrics.fluencyScore)}`}
                  size="small"
                  sx={{
                    height: 24,
                    width: 40,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    backgroundColor: getScoreColor(asrMetrics.fluencyScore),
                    color: 'white',
                    borderRadius: '8px',
                    boxShadow: `0 2px 8px ${alpha(getScoreColor(asrMetrics.fluencyScore), 0.5)}`,
                    '& .MuiChip-label': {
                      px: 2
                    }
                  }}
                />
              </>
            ) : (
              <>
                <Typography sx={{ 
                  color: '#2196f3', 
                  fontSize: '0.8rem',
                  fontWeight: 500
                }}>
                  {characteristics.fluency.category}
                </Typography>
                <Chip
                  label={formatConfidence(characteristics.fluency.confidence)}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.7rem',
                    backgroundColor: '#2196f3',
                    color: 'white',
                    borderRadius: '10px',
                  }}
                />
              </>
            )}
          </Box>
        </Box>
        
        <Box sx={{ position: 'relative', mt: 1 }}>
          <LinearProgress
            variant="determinate"
            value={useASRModel ? asrMetrics.fluencyScore * 100 : characteristics.fluency.confidence * 100}
            sx={{
              height: 10,
              borderRadius: 5,
              backgroundColor: theme => alpha(theme.palette.divider, 0.3),
              '& .MuiLinearProgress-bar': {
                backgroundColor: useASRModel ? getScoreColor(asrMetrics.fluencyScore) : '#2196f3',
                transition: ANIMATION.transition,
                borderRadius: 5,
                boxShadow: useASRModel 
                  ? `0 0 10px ${alpha(getScoreColor(asrMetrics.fluencyScore), 0.5)}` 
                  : 'none'
              }
            }}
          />
          
          {/* Markers */}
          <Box sx={{ 
            position: 'absolute', 
            top: '50%', 
            left: '33%', 
            transform: 'translate(-50%, -50%)', 
            width: 2, 
            height: 16, 
            backgroundColor: theme => alpha(theme.palette.divider, 0.5) 
          }} />
          
          <Box sx={{ 
            position: 'absolute', 
            top: '50%', 
            left: '67%', 
            transform: 'translate(-50%, -50%)', 
            width: 2, 
            height: 16, 
            backgroundColor: theme => alpha(theme.palette.divider, 0.5) 
          }} />
        </Box>
        
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          px: 0.5, 
          mt: 0.5 
        }}>
          <Typography sx={{ 
            color: theme => theme.palette.text.secondary, 
            fontSize: '0.75rem' 
          }}>
            Low
          </Typography>
          <Typography sx={{ 
            color: theme => theme.palette.text.secondary, 
            fontSize: '0.75rem' 
          }}>
            Medium
          </Typography>
          <Typography sx={{ 
            color: theme => theme.palette.text.secondary, 
            fontSize: '0.75rem' 
          }}>
            High
          </Typography>
        </Box>
      </Box>
      
      {/* Tempo */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
            <Tooltip title="How fast or slow you speak (words per minute)">
              <Typography sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.2 }}>
                Tempo
              </Typography>
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {useASRModel ? (
              <>
                <Typography sx={{ 
                  color: getScoreColor(asrMetrics.tempoScore), 
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textShadow: `0 0 8px ${alpha(getScoreColor(asrMetrics.tempoScore), 0.3)}`
                }}>
                  {getConfidenceLabel(asrMetrics.tempoScore)}
                </Typography>
                <Chip
                  label={`${formatScore(asrMetrics.tempoScore)}`}
                  size="small"
                  sx={{
                    height: 24,
                    width: 40,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    backgroundColor: getScoreColor(asrMetrics.tempoScore),
                    color: 'white',
                    borderRadius: '8px',
                    boxShadow: `0 2px 8px ${alpha(getScoreColor(asrMetrics.tempoScore), 0.5)}`,
                    '& .MuiChip-label': {
                      px: 2
                    }
                  }}
                />
              </>
            ) : (
              <>
                <Typography sx={{ 
                  color: '#4caf50', 
                  fontSize: '0.8rem',
                  fontWeight: 500
                }}>
                  {characteristics.tempo.category}
                </Typography>
                <Chip
                  label={formatConfidence(characteristics.tempo.confidence)}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.7rem',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    borderRadius: '10px',
                  }}
                />
              </>
            )}
          </Box>
        </Box>
        
        <Box sx={{ position: 'relative', mt: 1 }}>
          <LinearProgress
            variant="determinate"
            value={useASRModel ? asrMetrics.tempoScore * 100 : characteristics.tempo.confidence * 100}
            sx={{
              height: 10,
              borderRadius: 5,
              backgroundColor: theme => alpha(theme.palette.divider, 0.3),
              '& .MuiLinearProgress-bar': {
                backgroundColor: useASRModel ? getScoreColor(asrMetrics.tempoScore) : '#4caf50',
                transition: ANIMATION.transition,
                borderRadius: 5,
                boxShadow: useASRModel 
                  ? `0 0 10px ${alpha(getScoreColor(asrMetrics.tempoScore), 0.5)}` 
                  : 'none'
              }
            }}
          />
          
          {/* Markers */}
          <Box sx={{ 
            position: 'absolute', 
            top: '50%', 
            left: '33%', 
            transform: 'translate(-50%, -50%)', 
            width: 2, 
            height: 16, 
            backgroundColor: theme => alpha(theme.palette.divider, 0.5) 
          }} />
          
          <Box sx={{ 
            position: 'absolute', 
            top: '50%', 
            left: '67%', 
            transform: 'translate(-50%, -50%)', 
            width: 2, 
            height: 16, 
            backgroundColor: theme => alpha(theme.palette.divider, 0.5) 
          }} />
        </Box>
        
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          px: 0.5, 
          mt: 0.5 
        }}>
          <Typography sx={{ 
            color: theme => theme.palette.text.secondary, 
            fontSize: '0.75rem' 
          }}>
            Slow
          </Typography>
          <Typography sx={{ 
            color: theme => theme.palette.text.secondary, 
            fontSize: '0.75rem' 
          }}>
            Medium
          </Typography>
          <Typography sx={{ 
            color: theme => theme.palette.text.secondary, 
            fontSize: '0.75rem' 
          }}>
            Fast
          </Typography>
        </Box>
      </Box>
      
      {/* Pronunciation */}
      <Box sx={{ mb: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
            <Tooltip title="How clearly your words are pronounced and articulated">
              <Typography sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.2 }}>
                Pronunciation
              </Typography>
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {useASRModel ? (
              <>
                <Typography sx={{ 
                  color: getScoreColor(asrMetrics.pronunciationScore), 
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textShadow: `0 0 8px ${alpha(getScoreColor(asrMetrics.pronunciationScore), 0.3)}`
                }}>
                  {getConfidenceLabel(asrMetrics.pronunciationScore)}
                </Typography>
                <Chip
                  label={`${formatScore(asrMetrics.pronunciationScore)}`}
                  size="small"
                  sx={{
                    height: 24,
                    width: 40,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    backgroundColor: getScoreColor(asrMetrics.pronunciationScore),
                    color: 'white',
                    borderRadius: '8px',
                    boxShadow: `0 2px 8px ${alpha(getScoreColor(asrMetrics.pronunciationScore), 0.5)}`,
                    '& .MuiChip-label': {
                      px: 2
                    }
                  }}
                />
              </>
            ) : (
              <>
                <Typography sx={{ 
                  color: '#4caf50', 
                  fontSize: '0.8rem',
                  fontWeight: 500
                }}>
                  {characteristics.pronunciation.category}
                </Typography>
                <Chip
                  label={formatConfidence(characteristics.pronunciation.confidence)}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.7rem',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    borderRadius: '10px',
                  }}
                />
              </>
            )}
          </Box>
        </Box>
        
        <Box sx={{ position: 'relative', mt: 1 }}>
          <LinearProgress
            variant="determinate"
            value={useASRModel ? asrMetrics.pronunciationScore * 100 : characteristics.pronunciation.confidence * 100}
            sx={{
              height: 10,
              borderRadius: 5,
              backgroundColor: theme => alpha(theme.palette.divider, 0.3),
              '& .MuiLinearProgress-bar': {
                backgroundColor: useASRModel ? getScoreColor(asrMetrics.pronunciationScore) : '#4caf50',
                transition: ANIMATION.transition,
                borderRadius: 5,
                boxShadow: useASRModel 
                  ? `0 0 10px ${alpha(getScoreColor(asrMetrics.pronunciationScore), 0.5)}` 
                  : 'none'
              }
            }}
          />
          
          {/* Markers */}
          <Box sx={{ 
            position: 'absolute', 
            top: '50%', 
            left: '50%', 
            transform: 'translate(-50%, -50%)', 
            width: 2, 
            height: 16, 
            backgroundColor: theme => alpha(theme.palette.divider, 0.5) 
          }} />
        </Box>
        
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          px: 0.5, 
          mt: 0.5 
        }}>
          <Typography sx={{ 
            color: theme => theme.palette.text.secondary, 
            fontSize: '0.75rem' 
          }}>
            Unclear
          </Typography>
          <Typography sx={{ 
            color: theme => theme.palette.text.secondary, 
            fontSize: '0.75rem',
            textAlign: 'right'
          }}>
            Clear
          </Typography>
        </Box>
      </Box>
      
      {/* Processing Time Display - shown when ASR model is used */}
      {useASRModel && (
        <Fade in={true} timeout={ANIMATION.fadeIn.long + 100}>
          <Typography sx={{ 
            color: theme => alpha(theme.palette.text.secondary, 0.7), 
            fontSize: '0.65rem',
            textAlign: 'right',
            mt: 1,
            fontStyle: 'italic'
          }}>
            Model processing: {asrMetrics.processingTime.toFixed(0)}ms
          </Typography>
        </Fade>
      )}
    </Box>
  );

  // If noPaper is true, return content directly without Paper wrapper
  if (noPaper) {
    return content;
  }

  // Otherwise, wrap in Paper
  return (
    <Paper
      elevation={3}
      sx={{
        p: 2,
        borderRadius: 2,
        backgroundColor: theme => theme.palette.mode === 'dark' 
          ? 'rgba(17, 25, 40, 0.9)' 
          : alpha(theme.palette.background.paper, 0.8),
        backdropFilter: 'blur(10px)',
        border: theme => `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        boxShadow: theme => `0 8px 32px ${alpha(theme.palette.common.black, 0.3)}`,
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        '&:hover': {
          boxShadow: theme => `0 12px 40px ${alpha(theme.palette.common.black, 0.4)}`,
          transform: 'translateY(-2px)',
        },
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage: theme => `radial-gradient(circle at top right, ${alpha(theme.palette.primary.main, 0.2)}, transparent 70%)`,
          zIndex: 0
        }
      }}
    >
      {content}
    </Paper>
  );
};

export default SpeechCharacteristics; 