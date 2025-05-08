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
  transition: '0.15s cubic-bezier(0.4, 0, 0.2, 1)' // Faster transition for more responsive UI
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
  // Lower value = faster response to new data (reduced from 0.5 to 0.3)
  factor: 0.3,
  // Minimum change threshold to update UI (prevents tiny jitters)
  threshold: 0.005,
  // Minimum refresh interval (in ms)
  minUpdateInterval: 100
};

// Add speech activity detection parameters (from voice_test_gui.py)
const SPEECH_DETECTION = {
  energyThreshold: 0.01, // Energy threshold for speech detection
  minSpeechDuration: 0.5, // Minimum duration of speech (seconds) to trigger analysis
  analysisDelay: 200, // Milliseconds to wait before starting analysis after detecting speech
  forceUpdateInterval: 5000 // Force update every 5 seconds even without speech
};

// Add constant for voice inactivity detection
const VOICE_DETECTION = {
  // Time in ms after which we show the waiting indicator if no speech detected
  inactivityThreshold: 3000,
  // Minimum confidence needed to consider audio as speech
  minConfidenceThreshold: 0.03
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
  category?: string; // Add actual category from characteristics
}>(({ value, metricName, segments, category }) => {
  // Memoize the position value to reduce unnecessary calculations
  const roundedValue = useMemo(() => {
    // Ensure value is within bounds
    const boundedValue = Math.max(0, Math.min(100, value));
    // Round to nearest 0.5% to reduce jitter
    return Math.round(boundedValue * 2) / 2;
  }, [value]);
  
  // Determine which segment the value falls into based on category or value
  const getActiveSegment = useCallback(() => {
    // If we have the actual category from the model, use that with higher priority
    if (category) {
      const lowerCategory = category.toLowerCase();
      
      if (metricName === 'fluency') {
        if (lowerCategory.includes('high')) return 2;
        if (lowerCategory.includes('medium')) return 1;
        return 0; // low
      }
      
      if (metricName === 'tempo') {
        if (lowerCategory.includes('fast')) return 2;
        if (lowerCategory.includes('medium')) return 1;
        return 0; // slow
      }
      
      if (metricName === 'pronunciation') {
        if (lowerCategory.includes('clear')) return 1;
        return 0; // unclear
      }
    }
    
    // Fallback to value-based determination if category is not provided
    // Special case for pronunciation which only has 2 segments
    if (metricName === 'pronunciation') {
      return roundedValue < 50 ? 0 : 1;
    }
    
    // For fluency and tempo with 3 segments
    if (roundedValue < 33) return 0;
    if (roundedValue < 67) return 1;
    return 2;
  }, [metricName, roundedValue, category]);
  
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
          {segments[activeIndex].label} ({Math.round(roundedValue)}%)
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
    isSpeaking?: boolean;
  };
  
  type MessageCallback = (data: { data: { type: string; metrics?: ASRModelMetrics } }) => void;
  
  const callbacks: { [key: string]: MessageCallback } = {};
  
  // Enhanced calculation helpers
  const calculateMetrics = (
    characteristics: NonNullable<SpeechCharacteristicsProps['characteristics']>,
    timestamp: number, 
    previousMetrics?: ASRModelMetrics,
    analysisCount: number = 0,
    isSpeaking: boolean = false
  ): ASRModelMetrics => {
    // Extract characteristics with proper validation
    const fluencyConfidence = Math.max(0, Math.min(1, characteristics.fluency.confidence));
    const tempoConfidence = Math.max(0, Math.min(1, characteristics.tempo.confidence));
    const pronunciationConfidence = Math.max(0, Math.min(1, characteristics.pronunciation.confidence));
    
    // Convert category strings to normalized values
    const getCategoryValue = (category: string, defaultValue: number): number => {
      const lower = category.toLowerCase();
      
      // Fluency categories
      if (lower.includes('high fluency')) return 0.9;
      if (lower.includes('high')) return 0.85;
      if (lower.includes('medium fluency')) return 0.65;
      if (lower.includes('medium')) return 0.6;
      if (lower.includes('low fluency')) return 0.3;
      if (lower.includes('low')) return 0.25;
      
      // Tempo categories
      if (lower.includes('fast tempo')) return 0.85;
      if (lower.includes('fast')) return 0.8;
      if (lower.includes('medium tempo')) return 0.7;
      if (lower.includes('slow tempo')) return 0.4;
      if (lower.includes('slow')) return 0.35;
      
      // Pronunciation categories
      if (lower.includes('clear pronunciation')) return 0.9;
      if (lower.includes('clear')) return 0.85;
      if (lower.includes('unclear pronunciation')) return 0.4;
      if (lower.includes('unclear')) return 0.35;
      
      return defaultValue;
    };
    
    // Get category values with confidences as weights
    const fluencyValue = getCategoryValue(characteristics.fluency.category, 0.5) * (0.5 + fluencyConfidence * 0.5);
    const tempoValue = getCategoryValue(characteristics.tempo.category, 0.5) * (0.5 + tempoConfidence * 0.5);
    const pronunciationValue = getCategoryValue(characteristics.pronunciation.category, 0.5) * (0.5 + pronunciationConfidence * 0.5);
    
    // Create class probabilities based on characteristics and category values
    const classProbabilities: { [key: string]: number } = {};
    
    // More accurate fluency mapping
    const fluencyBase = fluencyValue;
    const highFluencyProb = Math.pow(fluencyBase, 1.5) * 0.9;
    const lowFluencyProb = Math.pow(1 - fluencyBase, 1.5) * 0.9;
    const mediumFluencyProb = 1 - (highFluencyProb + lowFluencyProb);
    
    classProbabilities['high_fluency'] = highFluencyProb;
    classProbabilities['medium_fluency'] = mediumFluencyProb;
    classProbabilities['low_fluency'] = lowFluencyProb;
    
    // More accurate tempo mapping
    const tempoBase = tempoValue;
    const fastTempoProb = characteristics.tempo.category.toLowerCase().includes('fast') ? 
                         0.6 + (0.3 * tempoConfidence) : 
                         Math.pow(tempoBase, 1.2) * 0.7;
    
    const slowTempoProb = characteristics.tempo.category.toLowerCase().includes('slow') ? 
                         0.6 + (0.3 * tempoConfidence) : 
                         Math.pow(1 - tempoBase, 1.2) * 0.7;
    
    const mediumTempoProb = 1 - (fastTempoProb + slowTempoProb);
    
    classProbabilities['fast_tempo'] = fastTempoProb;
    classProbabilities['medium_tempo'] = mediumTempoProb;
    classProbabilities['slow_tempo'] = slowTempoProb;
    
    // More accurate pronunciation mapping
    const pronunciationBase = pronunciationValue;
    classProbabilities['clear_pronunciation'] = Math.min(0.95, pronunciationBase * 1.15);
    classProbabilities['unclear_pronunciation'] = Math.min(0.95, (1 - pronunciationBase) * 1.15);
    
    // Normalize all probabilities to sum to 1.0 within each category
    const normalizeGroup = (group: string[]) => {
      const sum = group.reduce((acc, cls) => acc + (classProbabilities[cls] || 0), 0);
      if (sum > 0 && sum !== 1) {
        group.forEach(cls => {
          classProbabilities[cls] = (classProbabilities[cls] || 0) / sum;
        });
      }
    };
    
    normalizeGroup(['high_fluency', 'medium_fluency', 'low_fluency']);
    normalizeGroup(['fast_tempo', 'medium_tempo', 'slow_tempo']);
    normalizeGroup(['clear_pronunciation', 'unclear_pronunciation']);
    
    // Calculate scores with more accurate weighting
    const fluencyScore = Math.min(1, (
      (classProbabilities['high_fluency'] || 0) * 0.95 +
      (classProbabilities['medium_fluency'] || 0) * 0.7 +
      (classProbabilities['low_fluency'] || 0) * 0.4
    ));
    
    const tempoScore = Math.min(1, (
      (classProbabilities['fast_tempo'] || 0) * 0.9 +
      (classProbabilities['medium_tempo'] || 0) * 0.8 +
      (classProbabilities['slow_tempo'] || 0) * 0.5
    ));
    
    const pronunciationScore = Math.min(1, (
      (classProbabilities['clear_pronunciation'] || 0) * 0.9 +
      (classProbabilities['unclear_pronunciation'] || 0) * 0.4
    ));
    
    // Calculate overall score with weightings that match the Python implementation
    const overallScore = Math.min(1, (
      fluencyScore * 0.35 + 
      tempoScore * 0.35 + 
      pronunciationScore * 0.3
    ));
    
    // Calculate speech metrics more accurately
    const baseWordsPerMinute = 
      (classProbabilities['fast_tempo'] || 0) * 160 + 
      (classProbabilities['medium_tempo'] || 0) * 120 + 
      (classProbabilities['slow_tempo'] || 0) * 80;
    
    const calculatedSilenceRatio = isSpeaking ? 
      Math.max(0.05, 0.3 - (fluencyScore * 0.25)) : 
      Math.min(0.8, 0.4 + ((1 - fluencyScore) * 0.4));
    
    // Calculate word count
    const speechDurationSec = previousMetrics ? 
      (timestamp - previousMetrics.lastUpdated) / 1000 : 
      1.0;
      
    const normalizedDuration = Math.max(0.2, speechDurationSec);
    const estimatedWordCount = isSpeaking ? 
      Math.floor((baseWordsPerMinute / 60) * normalizedDuration) : 
      Math.floor((baseWordsPerMinute / 60) * normalizedDuration * 0.2);
    
    // Apply smoothing with improved responsiveness
    const smoothingFactor = SMOOTHING.factor;
    const smooth = (current: number, previous: number, weight: number = 1.0) => {
      if (analysisCount === 0 || isNaN(previous) || isNaN(current)) {
        return isNaN(current) ? 0 : current;
      }
      
      // Skip smoothing for small changes to improve perceived responsiveness
      const diff = Math.abs(current - previous);
      if (diff < SMOOTHING.threshold) {
        return previous;
      }
      
      // Adjust smoothing factor based on speaking state and weight
      const adjustedFactor = isSpeaking ? 
        smoothingFactor * 0.8 * weight : // More responsive when speaking
        smoothingFactor * 1.2; // Less responsive when silent
        
      const smoothedValue = previous * adjustedFactor + current * (1 - adjustedFactor);
      return isNaN(smoothedValue) ? current : smoothedValue;
    };
    
    const prevMetrics = previousMetrics || DEFAULT_ASR_METRICS;
    
    // Create metrics with improved accuracy
    return {
      fluencyScore: smooth(fluencyScore, prevMetrics.fluencyScore, 1.2),
      tempoScore: smooth(tempoScore, prevMetrics.tempoScore, 1.1),
      pronunciationScore: smooth(pronunciationScore, prevMetrics.pronunciationScore, 1.0),
      overallScore: smooth(overallScore, prevMetrics.overallScore, 1.2),
      wordCount: analysisCount === 0 ? 
        estimatedWordCount : 
        prevMetrics.wordCount + estimatedWordCount,
      wordsPerMinute: smooth(baseWordsPerMinute, prevMetrics.wordsPerMinute, 0.9),
      silenceRatio: smooth(Math.max(0, Math.min(0.8, calculatedSilenceRatio)), prevMetrics.silenceRatio, 0.8),
      processingTime: 25,
      confidence: Math.min(0.98, 0.7 + (analysisCount * 0.03)),
      lastUpdated: timestamp,
      classProbabilities: classProbabilities
    };
  };
  
  const mockWorker = {
    postMessage: (message: { type: string; data: WorkerMessageData }) => {
      setTimeout(() => {
        if (message.type === 'process_speech') {
          const { characteristics, timestamp, previousMetrics, analysisCount, isSpeaking = false } = message.data;
          
          // Calculate metrics with improved accuracy
          const enhancedMetrics = calculateMetrics(
            characteristics, 
            timestamp, 
            previousMetrics, 
            analysisCount,
            isSpeaking
          );
          
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

// Add a throttle function to optimize real-time updates
const useThrottle = <T,>(value: T, limit: number): T => {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastRun = useRef<number>(Date.now());
  
  useEffect(() => {
    const now = Date.now();
    if (now - lastRun.current >= limit) {
      lastRun.current = now;
      setThrottledValue(value);
    } else {
      const timerId = setTimeout(() => {
        lastRun.current = now;
        setThrottledValue(value);
      }, limit);
      
      return () => clearTimeout(timerId);
    }
  }, [value, limit]);
  
  return throttledValue;
};

// Create a speech activity detector (inspired by voice_test_gui.py)
const useSpeechActivityDetector = (
  characteristics: SpeechCharacteristicsProps['characteristics'],
  isCapturing: boolean
) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [shouldAnalyze, setShouldAnalyze] = useState(false);
  const [waitingForVoice, setWaitingForVoice] = useState(false);
  const speechStartTime = useRef<number>(0);
  const lastAnalysisTime = useRef<number>(Date.now());
  const lastActivityTime = useRef<number>(Date.now());
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Reset the inactivity timer when component unmounts
  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);
  
  useEffect(() => {
    if (!isCapturing || !characteristics) {
      // Reset waiting state when not capturing
      if (waitingForVoice) {
        setWaitingForVoice(false);
      }
      return;
    }
    
    // Calculate average energy from characteristics
    const energy = (
      characteristics.fluency.confidence + 
      characteristics.tempo.confidence + 
      characteristics.pronunciation.confidence
    ) / 3;
    
    // Check if energy exceeds threshold
    if (energy > SPEECH_DETECTION.energyThreshold) {
      // Speech detected
      if (!isSpeaking) {
        // Start of speech
        speechStartTime.current = Date.now();
        setIsSpeaking(true);
      }
      
      // Update last activity time
      lastActivityTime.current = Date.now();
      
      // Clear any waiting state
      if (waitingForVoice) {
        setWaitingForVoice(false);
      }
      
      // Clear any existing inactivity timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      
      // Check if speech duration is long enough and if we haven't analyzed recently
      const speechDuration = (Date.now() - speechStartTime.current) / 1000;
      const timeSinceLastAnalysis = Date.now() - lastAnalysisTime.current;
      
      if (speechDuration >= SPEECH_DETECTION.minSpeechDuration && 
          timeSinceLastAnalysis >= SPEECH_DETECTION.analysisDelay) {
        setShouldAnalyze(true);
        lastAnalysisTime.current = Date.now();
      }
      
      // Set a new inactivity timer
      inactivityTimerRef.current = setTimeout(() => {
        if (Date.now() - lastActivityTime.current >= VOICE_DETECTION.inactivityThreshold) {
          setWaitingForVoice(true);
        }
      }, VOICE_DETECTION.inactivityThreshold);
      
    } else {
      // No speech detected - start inactivity detection
      if (isSpeaking) {
        setIsSpeaking(false);
      }
      
      // Set waiting state after inactivity threshold
      if (!waitingForVoice && Date.now() - lastActivityTime.current >= VOICE_DETECTION.inactivityThreshold) {
        setWaitingForVoice(true);
      } else if (!inactivityTimerRef.current) {
        // If no timer is set, set one to check for inactivity
        inactivityTimerRef.current = setTimeout(() => {
          if (Date.now() - lastActivityTime.current >= VOICE_DETECTION.inactivityThreshold) {
            setWaitingForVoice(true);
          }
        }, VOICE_DETECTION.inactivityThreshold);
      }
      
      // Force analysis if it's been too long since the last update
      const timeSinceLastAnalysis = Date.now() - lastAnalysisTime.current;
      if (timeSinceLastAnalysis >= SPEECH_DETECTION.forceUpdateInterval) {
        setShouldAnalyze(true);
        lastAnalysisTime.current = Date.now();
      }
    }
    
    return () => {
      // Reset analysis flag after each update
      setShouldAnalyze(false);
    };
  }, [characteristics, isCapturing, isSpeaking, waitingForVoice]);
  
  return { isSpeaking, shouldAnalyze, waitingForVoice };
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
  const animationFrameRef = useRef<number | null>(null);
  
  const [performanceMetrics, setPerformanceMetrics] = useState({
    renderTime: 0,
    updateInterval: 0,
    lastRenderTimestamp: 0
  });
  
  const [lastDetectedSpeech, setLastDetectedSpeech] = useState<number | null>(null);
  
  const { isSpeaking, shouldAnalyze, waitingForVoice } = useSpeechActivityDetector(characteristics, isCapturing);
  
  // Throttle state updates to reduce rendering
  const throttledMetrics = useThrottle(asrMetrics, SMOOTHING.minUpdateInterval);
  
  const toggleModelDetails = () => {
    setShowModelDetails(prev => !prev);
  };
  
  // Save the timestamp when speech was last detected
  useEffect(() => {
    if (isSpeaking) {
      setLastDetectedSpeech(Date.now());
    }
  }, [isSpeaking]);
  
  // Initialize worker
  useEffect(() => {
    if (useASRModel) {
      workerRef.current = createAsrWorker();
      
      workerRef.current.addEventListener('message', (event) => {
        if (event.data.type === 'asr_result') {
          setAsrMetrics(prev => {
            // Apply custom smoothing logic to reduce jitter
            const newMetrics = event.data.metrics;
            
            // Only update if changes exceed threshold
            const fluencyDiff = Math.abs(prev.fluencyScore - newMetrics.fluencyScore);
            const tempoDiff = Math.abs(prev.tempoScore - newMetrics.tempoScore);
            const pronunciationDiff = Math.abs(prev.pronunciationScore - newMetrics.pronunciationScore);
            
            if (fluencyDiff < SMOOTHING.threshold && 
                tempoDiff < SMOOTHING.threshold && 
                pronunciationDiff < SMOOTHING.threshold) {
              return prev;
            }
            
            return newMetrics;
          });
          
          setIsProcessing(false);
          setAnalysisCount(prev => prev + 1);
        }
      });
      
      return () => {
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
        }
        
        // Cancel any pending animation frames
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [useASRModel]);
  
  // Process speech with worker only when shouldAnalyze is true
  useEffect(() => {
    if (characteristics && isCapturing && useASRModel && workerRef.current && shouldAnalyze) {
      setIsProcessing(true);
      
      // Use a debounce mechanism to prevent too frequent updates
      const currentTime = Date.now();
      
      workerRef.current.postMessage({
        type: 'process_speech',
        data: {
          characteristics,
          timestamp: currentTime,
          previousMetrics: asrMetrics,
          analysisCount,
          isSpeaking
        }
      });
    }
  }, [characteristics, isCapturing, useASRModel, asrMetrics, analysisCount, shouldAnalyze, isSpeaking]);
  
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
  
  // Performance monitoring using requestAnimationFrame for better sync with browser rendering
  useEffect(() => {
    if (isCapturing && characteristics) {
      const monitorPerformance = () => {
        const startTime = performance.now();
        
        // Schedule the next frame
        animationFrameRef.current = requestAnimationFrame(() => {
          const endTime = performance.now();
          const renderTime = endTime - startTime;
          
          const now = Date.now();
          let interval = 0;
          
          if (performanceMetrics.lastRenderTimestamp > 0) {
            const rawInterval = now - performanceMetrics.lastRenderTimestamp;
            interval = Math.max(16.67, rawInterval); // Cap at 60fps
          }
          
          setPerformanceMetrics(prev => ({
            renderTime,
            updateInterval: interval || prev.updateInterval,
            lastRenderTimestamp: now
          }));
          
          // Continue monitoring in next frame
          monitorPerformance();
        });
      };
      
      // Start the monitoring loop
      monitorPerformance();
      
      return () => {
        // Clean up animation frame on unmount
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, []);  // Empty dependency array to only run once
  
  // Memoize the metrics values to prevent unnecessary calculations
  const metricValues = useMemo(() => {
    return {
      fluency: useASRModel 
        ? throttledMetrics.fluencyScore * 100 
        : (characteristics?.fluency?.confidence ?? 0) * 100,
      tempo: useASRModel 
        ? throttledMetrics.tempoScore * 100 
        : (characteristics?.tempo?.confidence ?? 0) * 100,
      pronunciation: useASRModel 
        ? throttledMetrics.pronunciationScore * 100 
        : (characteristics?.pronunciation?.confidence ?? 0) * 100
    };
  }, [
    useASRModel, 
    throttledMetrics.fluencyScore, 
    throttledMetrics.tempoScore, 
    throttledMetrics.pronunciationScore,
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

  const VoiceWaitingMessage = () => {
    if (!waitingForVoice) return null;
    
    return (
      <Fade in={waitingForVoice} timeout={500}>
        <Box sx={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: alpha(theme.palette.background.paper, 0.7),
          borderRadius: 2,
          zIndex: 10
        }}>
          <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            p: 3,
            backgroundColor: alpha(theme.palette.background.default, 0.9),
            borderRadius: 2,
            boxShadow: theme.shadows[4]
          }}>
            <MicIcon sx={{ fontSize: '2rem', color: theme.palette.warning.main, mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 500 }}>
              Waiting for voice...
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
              Please speak into your microphone
            </Typography>
            {lastDetectedSpeech && (
              <Typography variant="caption" sx={{ mt: 1, color: 'text.disabled' }}>
                Last speech detected {Math.floor((Date.now() - lastDetectedSpeech) / 1000)}s ago
              </Typography>
            )}
          </Box>
        </Box>
      </Fade>
    );
  };

  // Replace the content rendering with more efficient rendering
  const content = (
    <Box sx={{ 
      width: '100%', 
      py: 1,
      px: 1,
      position: 'relative',
      overflow: 'hidden',
      minHeight: 300,
      display: 'flex',
      flexDirection: 'column'
    }}>
      
      {useASRModel && (
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center',
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
              Speech Metrics {isSpeaking && "(Active)"} {waitingForVoice && "(Waiting for voice)"}
            </Typography>
            <Box sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isProcessing && (
                <CircularProgress size={16} thickness={4} />
              )}
            </Box>
          </Box>
        </Box>
      )}
      
      <Box sx={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column' }}>
        {/* Simplified UI for metrics */}
        <MetricIndicator 
          metricName="fluency"
          value={metricValues.fluency}
          segments={fluencySegments}
          category={characteristics?.fluency?.category}
        />
        
        <MetricIndicator 
          metricName="tempo"
          value={metricValues.tempo}
          segments={tempoSegments}
          category={characteristics?.tempo?.category}
        />
        
        <MetricIndicator 
          metricName="pronunciation"
          value={metricValues.pronunciation}
          segments={pronunciationSegments}
          category={characteristics?.pronunciation?.category}
        />
      </Box>
      
      {useASRModel && (
        <Box sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          my: 2,
          pb: 1,
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}>
          <Chip
            label={`Overall Score: ${Math.round(throttledMetrics.overallScore * 100)}`}
            size="medium"
            sx={{
              height: 32,
              fontSize: '0.9rem',
              fontWeight: 700,
              borderRadius: '4px',
              backgroundColor: getScoreColor(throttledMetrics.overallScore),
              color: 'white',
              minWidth: 120,
              boxShadow: `0 2px 4px ${alpha(getScoreColor(throttledMetrics.overallScore), 0.4)}`
            }}
          />
        </Box>
      )}
      
      {useASRModel && (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          mt: 1,
          pt: 1,
          height: LAYOUT.footerHeight,
          width: '100%'
        }}>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, height: 20 }}>
              Words: {Math.round(throttledMetrics.wordCount)}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', height: 18 }}>
              Rate: {Math.round(throttledMetrics.wordsPerMinute)} wpm
            </Typography>
          </Box>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, height: 20 }}>
              Silence: {Math.round(throttledMetrics.silenceRatio * 100)}%
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', height: 18 }}>
              {performanceMetrics.renderTime > 10 ? 
                `Render: ${Math.round(performanceMetrics.renderTime)}ms` : 
                `Confidence: ${Math.round(throttledMetrics.confidence * 100)}%`}
            </Typography>
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
      
      <VoiceWaitingMessage />
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