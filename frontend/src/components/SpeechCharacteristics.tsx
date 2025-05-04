import React, { useEffect, useRef, useState, memo, useCallback, useMemo } from 'react';
import { 
  Typography, Box, Chip, CircularProgress, alpha, Paper,
  useTheme, Fade, Button
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

// Animation timing constants
const ANIMATION = {
  transition: '0.2s cubic-bezier(0.4, 0, 0.2, 1)'
};

// Add constants for fixed dimensions to prevent layout shifts
const LAYOUT = {
  metricHeight: 36,
  indicatorSize: 12,
  metricSpacing: 24,
  headerHeight: 40,
  footerHeight: 60
};

// Add a constant for smoothing configuration to make it more responsive
const SMOOTHING = {
  // Lower value = faster response to new data
  factor: 0.5,
  // Minimum change threshold to update UI (prevents tiny jitters)
  threshold: 0.005
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
  useASRModel?: boolean;
  isUsingFallback?: boolean;
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
  confidence: number;
  lastUpdated: number;
  classProbabilities?: {
    [key: string]: number;
  };
}

// Default ASR metrics
const DEFAULT_ASR_METRICS: ASRModelMetrics = {
  fluencyScore: 0.75,
  tempoScore: 0.75,
  pronunciationScore: 0.75,
  overallScore: 0.75,
  wordCount: 0,
  wordsPerMinute: 120,
  silenceRatio: 0.1,
  processingTime: 0,
  confidence: 0,
  lastUpdated: Date.now(),
  classProbabilities: {
    'high_fluency': 0.5,
    'medium_fluency': 0.3,
    'low_fluency': 0.2,
    'fast_tempo': 0.3,
    'medium_tempo': 0.5,
    'slow_tempo': 0.2,
    'clear_pronunciation': 0.6,
    'unclear_pronunciation': 0.4
  }
};

// Create a real-time metric indicator component for fluency, tempo, and pronunciation
const MetricIndicator = memo<{
  value: number;
  metricName: 'fluency' | 'tempo' | 'pronunciation';
  segments: {label: string; color: string}[];
}>(({ value, metricName, segments }) => {
  // Memoize the position value to reduce unnecessary calculations
  const roundedValue = useMemo(() => {
    // Round to nearest 0.5% to reduce jitter
    return Math.round(value * 2) / 2;
  }, [value]);
  
  // Determine which segment the value falls into
  const getActiveSegment = () => {
    // Special case for pronunciation which only has 2 segments
    if (metricName === 'pronunciation') {
      return roundedValue < 50 ? 0 : 1;
    }
    
    // For fluency and tempo with 3 segments
    if (roundedValue < 33) return 0;
    if (roundedValue < 67) return 1;
    return 2;
  };
  
  const activeIndex = getActiveSegment();
  
  return (
    <Box sx={{ 
      mb: 3, 
      position: 'relative', 
      height: LAYOUT.metricHeight + LAYOUT.metricSpacing,
      width: '100%'
    }}>
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        mb: 0.25, 
        alignItems: 'center',
        height: 24 // Fixed height for label area
      }}>
        <Typography sx={{ 
          fontSize: '1rem', 
          fontWeight: 600, 
          lineHeight: 1.2,
          width: '50%', // Prevent text width changes
          whiteSpace: 'nowrap'
        }}>
          {metricName.charAt(0).toUpperCase() + metricName.slice(1)}
        </Typography>
        <Typography sx={{ 
          fontSize: '0.85rem', 
          fontWeight: 600, 
          color: segments[activeIndex].color,
          width: '50%', // Prevent label width changes
          textAlign: 'right',
          whiteSpace: 'nowrap'
        }}>
          {segments[activeIndex].label}
        </Typography>
      </Box>
      
      <Box sx={{ 
        display: 'flex', 
        mt: 1, 
        height: LAYOUT.metricHeight, 
        position: 'relative',
        width: '100%'
      }}>
        {segments.map((segment, index) => (
          <Box 
            key={index}
            sx={{
              flex: 1,
              backgroundColor: alpha(segment.color, 0.2),
              borderRadius: index === 0 ? '4px 0 0 4px' : index === segments.length - 1 ? '0 4px 4px 0' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              border: activeIndex === index ? `2px solid ${segment.color}` : '1px solid transparent',
              boxShadow: activeIndex === index ? `0 0 10px ${alpha(segment.color, 0.5)}` : 'none',
              transition: ANIMATION.transition,
              height: '100%',
              overflow: 'hidden'
            }}
          >
            <Typography 
              sx={{ 
                fontSize: '0.65rem', 
                color: alpha(segment.color, activeIndex === index ? 1 : 0.7),
                fontWeight: activeIndex === index ? 700 : 500,
                whiteSpace: 'nowrap'
              }}
            >
              {segment.label}
            </Typography>
            
            {activeIndex === index && (
              <Box 
                sx={{
                  position: 'absolute',
                  top: -12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderBottom: `6px solid ${segment.color}`
                }}
              />
            )}
          </Box>
        ))}
        
        {/* Position indicator */}
        <Box 
          sx={{
            position: 'absolute',
            bottom: -10,
            left: `${roundedValue}%`,
            transform: 'translateX(-50%)',
            width: LAYOUT.indicatorSize,
            height: LAYOUT.indicatorSize,
            borderRadius: '50%',
            backgroundColor: segments[activeIndex].color,
            boxShadow: `0 0 8px ${alpha(segments[activeIndex].color, 0.7)}`,
            transition: ANIMATION.transition,
            willChange: 'left, box-shadow', // Performance optimization for animation
            zIndex: 1
          }}
        />
      </Box>
    </Box>
  );
});

// Add a new component to display model class probabilities
const ModelProbabilities: React.FC<{
  classProbabilities?: {[key: string]: number};
  visible: boolean;
}> = ({ classProbabilities, visible }) => {
  const theme = useTheme();
  
  if (!visible || !classProbabilities) return null;
  
  // Group probabilities by category
  const fluencyClasses = ['high_fluency', 'medium_fluency', 'low_fluency'];
  const tempoClasses = ['fast_tempo', 'medium_tempo', 'slow_tempo'];
  const pronunciationClasses = ['clear_pronunciation', 'unclear_pronunciation'];
  
  // Helper to format probability as percentage
  const formatProb = (prob?: number) => {
    if (prob === undefined) return '0%';
    return `${Math.round(prob * 100)}%`;
  };
  
  return (
    <Fade in={visible} timeout={700}>
      <Box sx={{ 
        mt: 2, 
        p: 2, 
        borderRadius: 2,
        backgroundColor: theme => alpha(theme.palette.background.paper, 0.2),
        borderTop: `1px dashed ${alpha(theme.palette.divider, 0.3)}`
      }}>
      <Typography sx={{ 
          fontSize: '0.8rem', 
          fontWeight: 600, 
          mb: 1.5,
          color: theme => alpha(theme.palette.text.primary, 0.7),
          display: 'flex',
          alignItems: 'center',
          gap: 0.5
        }}>
          <GraphicEqIcon sx={{ fontSize: '1rem', color: theme.palette.primary.main }} />
          ASR Model Class Probabilities
        </Typography>
        
        <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2 }}>
          {/* Fluency Classes */}
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#2196f3', mb: 0.5 }}>
              Fluency
            </Typography>
            {fluencyClasses.map(cls => (
              <Box key={cls} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                  {cls.replace('_', ' ')}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 500 }}>
                  {formatProb(classProbabilities[cls])}
                </Typography>
              </Box>
            ))}
          </Box>
          
          {/* Tempo Classes */}
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#4caf50', mb: 0.5 }}>
              Tempo
            </Typography>
            {tempoClasses.map(cls => (
              <Box key={cls} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                  {cls.replace('_', ' ')}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 500 }}>
                  {formatProb(classProbabilities[cls])}
                </Typography>
              </Box>
            ))}
          </Box>
          
          {/* Pronunciation Classes */}
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#ff9800', mb: 0.5 }}>
              Pronunciation
            </Typography>
            {pronunciationClasses.map(cls => (
              <Box key={cls} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                  {cls.replace('_', ' ')}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 500 }}>
                  {formatProb(classProbabilities[cls])}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Fade>
  );
};

// Mock worker for ASR processing
const createAsrWorker = () => {
  type WorkerMessageData = {
    characteristics: NonNullable<SpeechCharacteristicsProps['characteristics']>;
    timestamp: number;
    previousMetrics?: ASRModelMetrics;
    analysisCount: number;
  };
  
  type MessageCallback = (data: { data: { type: string; metrics?: ASRModelMetrics } }) => void;
  
  const callbacks: { [key: string]: MessageCallback } = {};
  
  const mockWorker = {
    postMessage: (message: { type: string; data: WorkerMessageData }) => {
      setTimeout(() => {
        if (message.type === 'process_speech') {
          const { characteristics, timestamp, previousMetrics, analysisCount } = message.data;
          
          // Create realistic model probabilities based on characteristics
          const classProbabilities: { [key: string]: number } = {};
          
          // Map fluency characteristics to class probabilities
          const fluencyBase = characteristics.fluency.confidence;
          
          if (fluencyBase > 0.7) {
            classProbabilities['high_fluency'] = 0.6 + (Math.random() * 0.2);
            classProbabilities['medium_fluency'] = 0.3 - (Math.random() * 0.15);
            classProbabilities['low_fluency'] = 0.1 - (Math.random() * 0.05);
          } else if (fluencyBase > 0.4) {
            classProbabilities['high_fluency'] = 0.3 - (Math.random() * 0.1);
            classProbabilities['medium_fluency'] = 0.5 + (Math.random() * 0.2);
            classProbabilities['low_fluency'] = 0.2 - (Math.random() * 0.1);
          } else {
            classProbabilities['high_fluency'] = 0.1 - (Math.random() * 0.05);
            classProbabilities['medium_fluency'] = 0.3 - (Math.random() * 0.1);
            classProbabilities['low_fluency'] = 0.6 + (Math.random() * 0.2);
          }
          
          // Map tempo characteristics to class probabilities
          if (characteristics.tempo.category.toLowerCase().includes('fast')) {
            classProbabilities['fast_tempo'] = 0.7 + (Math.random() * 0.2);
            classProbabilities['medium_tempo'] = 0.2 + (Math.random() * 0.1);
            classProbabilities['slow_tempo'] = 0.1 - (Math.random() * 0.05);
          } else if (characteristics.tempo.category.toLowerCase().includes('medium')) {
            classProbabilities['fast_tempo'] = 0.2 + (Math.random() * 0.1);
            classProbabilities['medium_tempo'] = 0.6 + (Math.random() * 0.2);
            classProbabilities['slow_tempo'] = 0.2 - (Math.random() * 0.1);
          } else {
            classProbabilities['fast_tempo'] = 0.1 - (Math.random() * 0.05);
            classProbabilities['medium_tempo'] = 0.3 - (Math.random() * 0.1);
            classProbabilities['slow_tempo'] = 0.6 + (Math.random() * 0.2);
          }
          
          // Map pronunciation characteristics to class probabilities
          const pronunciationBase = characteristics.pronunciation.confidence;
          
          if (pronunciationBase > 0.6) {
            classProbabilities['clear_pronunciation'] = 0.7 + (Math.random() * 0.2);
            classProbabilities['unclear_pronunciation'] = 0.3 - (Math.random() * 0.2);
          } else {
            classProbabilities['clear_pronunciation'] = 0.3 - (Math.random() * 0.1);
            classProbabilities['unclear_pronunciation'] = 0.7 + (Math.random() * 0.1);
          }
          
          // Normalize probabilities
          const normalizeGroup = (group: string[]) => {
            const sum = group.reduce((acc, cls) => acc + classProbabilities[cls], 0);
            if (sum > 0) {
              group.forEach(cls => {
                classProbabilities[cls] = classProbabilities[cls] / sum;
              });
            }
          };
          
          normalizeGroup(['high_fluency', 'medium_fluency', 'low_fluency']);
          normalizeGroup(['fast_tempo', 'medium_tempo', 'slow_tempo']);
          normalizeGroup(['clear_pronunciation', 'unclear_pronunciation']);
          
          // Calculate scores
          const fluencyScore = (
            (classProbabilities['high_fluency'] || 0) * 95 +
            (classProbabilities['medium_fluency'] || 0) * 75 +
            (classProbabilities['low_fluency'] || 0) * 50
          ) / 100;
          
          const tempoScore = (
            (classProbabilities['fast_tempo'] || 0) * 95 +
            (classProbabilities['medium_tempo'] || 0) * 75 +
            (classProbabilities['slow_tempo'] || 0) * 50
          ) / 100;
          
          const pronunciationScore = (
            (classProbabilities['clear_pronunciation'] || 0) * 90 +
            (classProbabilities['unclear_pronunciation'] || 0) * 50
          ) / 100;
          
          const overallScore = (fluencyScore + tempoScore + pronunciationScore) / 3;
          
          // Calculate speech metrics
          const baseWordsPerMinute = 
            (classProbabilities['fast_tempo'] || 0) * 160 + 
            (classProbabilities['medium_tempo'] || 0) * 130 + 
            (classProbabilities['slow_tempo'] || 0) * 100;
          
          const calculatedSilenceRatio = 0.3 - (fluencyScore * 0.25);
          
          // Calculate word count
          const speechDurationSec = (timestamp - (previousMetrics?.lastUpdated || timestamp)) / 1000;
          const normalizedDuration = Math.max(0.5, speechDurationSec);
          const estimatedWordCount = Math.floor((baseWordsPerMinute / 60) * normalizedDuration);
          
          // Apply smoothing with improved responsiveness
          const smoothingFactor = SMOOTHING.factor; // Faster reactions to changes
          const smooth = (current: number, previous: number) => {
            if (analysisCount === 0 || isNaN(previous) || isNaN(current)) {
              return isNaN(current) ? 0 : current;
            }
            
            // Skip smoothing for small changes to improve perceived responsiveness
            const diff = Math.abs(current - previous);
            if (diff < SMOOTHING.threshold) {
              return previous;
            }
            
            const smoothedValue = previous * smoothingFactor + current * (1 - smoothingFactor);
            return isNaN(smoothedValue) ? current : smoothedValue;
          };
          
          const prevMetrics = previousMetrics || DEFAULT_ASR_METRICS;
          
          // Create metrics
          const enhancedMetrics: ASRModelMetrics = {
            fluencyScore: smooth(fluencyScore, prevMetrics.fluencyScore),
            tempoScore: smooth(tempoScore, prevMetrics.tempoScore),
            pronunciationScore: smooth(pronunciationScore, prevMetrics.pronunciationScore),
            overallScore: smooth(overallScore, prevMetrics.overallScore),
            wordCount: analysisCount === 0 ? estimatedWordCount : prevMetrics.wordCount + estimatedWordCount,
            wordsPerMinute: smooth(baseWordsPerMinute, prevMetrics.wordsPerMinute),
            silenceRatio: smooth(Math.max(0, Math.min(0.4, calculatedSilenceRatio)), prevMetrics.silenceRatio),
            processingTime: 25,
            confidence: Math.min(0.95, 0.6 + (analysisCount * 0.05)),
            lastUpdated: timestamp,
            classProbabilities: classProbabilities
          };
          
          // Return result
          if (callbacks['message']) {
            callbacks['message']({ 
              data: { 
                type: 'asr_result', 
                metrics: enhancedMetrics 
              } 
            });
          }
        }
      }, 10); // Reduce processing delay for faster updates
    },
    addEventListener: (event: string, callback: MessageCallback) => {
      callbacks[event] = callback;
    },
    terminate: () => {
      Object.keys(callbacks).forEach(key => delete callbacks[key]);
    }
  };
  
  return mockWorker as unknown as Worker;
};

const SpeechCharacteristics: React.FC<SpeechCharacteristicsProps> = ({ 
  characteristics, 
  isCapturing,
  noPaper = false,
  showWaitingMessage = false,
  useASRModel = true,
}) => {
  const theme = useTheme();
  
  const lastValues = useRef({
    fluency: 0,
    tempo: 0,
    pronunciation: 0
  });
  
  const [asrMetrics, setAsrMetrics] = useState<ASRModelMetrics>(DEFAULT_ASR_METRICS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [showModelDetails, setShowModelDetails] = useState(false);
  
  const workerRef = useRef<Worker | null>(null);
  
  const [performanceMetrics, setPerformanceMetrics] = useState({
    renderTime: 0,
    updateInterval: 0,
    lastRenderTimestamp: 0
  });
  
  const toggleModelDetails = () => {
    setShowModelDetails(prev => !prev);
  };
  
  // Initialize worker
  useEffect(() => {
    if (useASRModel) {
      workerRef.current = createAsrWorker();
      
      workerRef.current.addEventListener('message', (event) => {
        if (event.data.type === 'asr_result') {
          setAsrMetrics(event.data.metrics);
          setIsProcessing(false);
          setAnalysisCount(prev => prev + 1);
        }
      });
      
      return () => {
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
        }
      };
    }
  }, [useASRModel]);
  
  // Process speech with worker - optimize update frequency
  useEffect(() => {
    if (characteristics && isCapturing && useASRModel && workerRef.current) {
      setIsProcessing(true);
      
      // Use a debounce mechanism to prevent too frequent updates
      const currentTime = Date.now();
      const minUpdateInterval = 100; // milliseconds
      
      if (!asrMetrics.lastUpdated || (currentTime - asrMetrics.lastUpdated > minUpdateInterval)) {
        workerRef.current.postMessage({
          type: 'process_speech',
          data: {
            characteristics,
            timestamp: currentTime,
            previousMetrics: asrMetrics,
            analysisCount
          }
        });
      }
    }
  }, [characteristics, isCapturing, useASRModel, asrMetrics, analysisCount]);
  
  // Store last valid values
  useEffect(() => {
    if (characteristics) {
      lastValues.current = {
        fluency: characteristics.fluency.confidence * 100,
        tempo: characteristics.tempo.confidence * 100,
        pronunciation: characteristics.pronunciation.confidence * 100
      };
    }
  }, [characteristics]);
  
  // Performance monitoring
  useEffect(() => {
    if (isCapturing && characteristics) {
      const startTime = performance.now();
      
      const rafId = requestAnimationFrame(() => {
        const endTime = performance.now();
        const renderTime = endTime - startTime;
        
        const now = Date.now();
        let interval = 0;
        
        if (performanceMetrics.lastRenderTimestamp > 0) {
          const rawInterval = now - performanceMetrics.lastRenderTimestamp;
          interval = Math.max(16.67, rawInterval);
        }
        
        setPerformanceMetrics(prev => ({
          renderTime,
          updateInterval: interval || prev.updateInterval,
          lastRenderTimestamp: now
        }));
      });
      
      return () => cancelAnimationFrame(rafId);
    }
  }, [characteristics, isCapturing, performanceMetrics.lastRenderTimestamp]);
  
  // Memoize the metrics values to prevent unnecessary calculations
  const metricValues = useMemo(() => {
    return {
      fluency: useASRModel 
        ? asrMetrics.fluencyScore * 100 
        : (characteristics?.fluency?.confidence ?? 0) * 100,
      tempo: useASRModel 
        ? asrMetrics.tempoScore * 100 
        : (characteristics?.tempo?.confidence ?? 0) * 100,
      pronunciation: useASRModel 
        ? asrMetrics.pronunciationScore * 100 
        : (characteristics?.pronunciation?.confidence ?? 0) * 100
    };
  }, [
    useASRModel, 
    asrMetrics.fluencyScore, 
    asrMetrics.tempoScore, 
    asrMetrics.pronunciationScore,
    characteristics?.fluency?.confidence,
    characteristics?.tempo?.confidence,
    characteristics?.pronunciation?.confidence
  ]);
  
  // Color determination
  const getScoreColor = useCallback((score: number) => {
    if (score >= 0.8) return theme.palette.success.main;
    if (score >= 0.6) return theme.palette.info.main;
    if (score >= 0.4) return theme.palette.warning.main;
    return theme.palette.error.main;
  }, [theme.palette.success.main, theme.palette.info.main, theme.palette.warning.main, theme.palette.error.main]);
  
  // Define segment colors
  const fluencySegments = [
    { label: 'Low', color: '#ff5252' },
    { label: 'Medium', color: '#fb8c00' },
    { label: 'High', color: '#4caf50' }
  ];
  
  const tempoSegments = [
    { label: 'Slow', color: '#fb8c00' },
    { label: 'Medium', color: '#4caf50' },
    { label: 'Fast', color: '#2196f3' }
  ];
  
  const pronunciationSegments = [
    { label: 'Unclear', color: '#ff5252' },
    { label: 'Clear', color: '#4caf50' }
  ];

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

  const content = (
    <Box sx={{ 
      width: '100%', 
      py: 1,
      px: 1,
      position: 'relative',
      overflow: 'hidden',
      minHeight: 300, // Add minimum height to prevent container resizing
      display: 'flex',
      flexDirection: 'column'
    }}>
      {useASRModel && (
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
          pb: 1,
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
          height: LAYOUT.headerHeight,
          width: '100%'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GraphicEqIcon sx={{ 
              fontSize: '1.1rem', 
              color: theme.palette.primary.main,
              flexShrink: 0
            }} />
            <Typography sx={{ 
              fontSize: '0.9rem', 
              fontWeight: 600,
              whiteSpace: 'nowrap'
            }}>
              Speech Metrics
            </Typography>
            <Box sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isProcessing && (
                <CircularProgress size={16} thickness={4} />
              )}
            </Box>
          </Box>
          
          <Chip
            label={`Score: ${Math.round(asrMetrics.overallScore * 100)}`}
            size="small"
            sx={{
              height: 24,
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '4px',
              backgroundColor: getScoreColor(asrMetrics.overallScore),
              color: 'white',
              minWidth: 80, // Fix minimum width
              flexShrink: 0
            }}
          />
        </Box>
      )}
      
      <Box sx={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column' }}>
        {/* Simplified UI for metrics */}
        <MetricIndicator 
          metricName="fluency"
          value={metricValues.fluency}
          segments={fluencySegments}
        />
        
        <MetricIndicator 
          metricName="tempo"
          value={metricValues.tempo}
          segments={tempoSegments}
        />
        
        <MetricIndicator 
          metricName="pronunciation"
          value={metricValues.pronunciation}
          segments={pronunciationSegments}
        />
      </Box>
      
      {useASRModel && (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          mt: 2,
          pt: 1,
          borderTop: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
          height: LAYOUT.footerHeight,
          width: '100%'
        }}>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, height: 20 }}>Words: {Math.round(asrMetrics.wordCount)}</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', height: 18 }}>Rate: {Math.round(asrMetrics.wordsPerMinute)} wpm</Typography>
          </Box>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, height: 20 }}>Silence: {Math.round(asrMetrics.silenceRatio * 100)}%</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', height: 18 }}>Confidence: {Math.round(asrMetrics.confidence * 100)}%</Typography>
          </Box>
        </Box>
      )}
      
      {useASRModel && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1, height: 32 }}>
          <Button 
            size="small" 
            startIcon={showModelDetails ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            onClick={toggleModelDetails}
            variant="text"
            sx={{ fontSize: '0.7rem' }}
          >
            {showModelDetails ? 'Hide Details' : 'Show Details'}
          </Button>
        </Box>
      )}
    </Box>
  );

  return noPaper ? content : (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        borderRadius: 2,
        backgroundColor: theme.palette.background.paper,
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        height: showModelDetails ? 'auto' : (useASRModel ? 460 : 340) // Fixed height based on content
      }}
    >
      {content}
      <ModelProbabilities 
        classProbabilities={asrMetrics.classProbabilities} 
        visible={useASRModel && showModelDetails} 
      />
    </Paper>
  );
};

export default SpeechCharacteristics; 