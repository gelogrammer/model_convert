import { useEffect, useRef, useState } from 'react';
import { Paper, Typography, Box, Slider, FormControlLabel, Switch, Chip, Alert, IconButton, Popover } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import SettingsIcon from '@mui/icons-material/Settings';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ChartData,
  BarController,
  LineController
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  BarController,
  LineController,
  Title,
  Tooltip,
  Legend
);

interface EmotionResult {
  emotion: string;
  confidence: number;
  speech_rate: number;
  probabilities: Record<string, number>;
  is_speech: boolean;
  status?: string;
  message?: string;
  belowThreshold?: boolean;
  filteredEmotion?: string;
}

interface EmotionDisplayProps {
  emotionResult: EmotionResult | null;
  isCapturing: boolean;
  onSettingsChange?: (settings: { confidenceThreshold: number, useSmoothing: boolean }) => void;
}

// Emotion colors
const emotionColors = {
  anger: 'rgba(255, 99, 132, 0.7)',
  disgust: 'rgba(75, 192, 192, 0.7)',
  fear: 'rgba(153, 102, 255, 0.7)',
  happiness: 'rgba(255, 206, 86, 0.7)',
  sadness: 'rgba(54, 162, 235, 0.7)',
  surprise: 'rgba(255, 159, 64, 0.7)',
  neutral: 'rgba(201, 203, 207, 0.7)'
};

// Commented out for future use
/* 
// Emotion descriptions
const emotionDescriptions = {
  anger: 'Strong feeling of annoyance, displeasure, or hostility',
  disgust: 'Feeling of revulsion or strong disapproval',
  fear: 'Unpleasant emotion caused by the threat of danger, pain, or harm',
  happiness: 'State of pleasant emotional well-being and joy',
  sadness: 'Feeling of unhappiness or sorrow',
  surprise: 'Feeling of sudden wonder or astonishment',
  neutral: 'Absence of strong or positive/negative emotions'
};
*/

const EmotionDisplay: React.FC<EmotionDisplayProps> = ({ emotionResult, isCapturing, onSettingsChange }) => {
  const chartRef = useRef<any>(null);
  const [lastValidResult, setLastValidResult] = useState<EmotionResult | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.4);
  const [useSmoothing, setUseSmoothing] = useState<boolean>(true);
  const [settingsAnchorEl, setSettingsAnchorEl] = useState<HTMLButtonElement | null>(null);

  // Update last valid result when we get a new emotion result
  useEffect(() => {
    if (emotionResult && isCapturing) {
      // Only update if we have a valid result with sufficient confidence
      if (emotionResult.confidence >= confidenceThreshold) {
        setLastValidResult(emotionResult);
      }
    }
  }, [emotionResult, isCapturing, confidenceThreshold]);

  // Update chart when emotion result changes
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.update();
    }
    
    // Clean up chart instance when component unmounts
    return () => {
      if (chartRef.current && chartRef.current.chart) {
        chartRef.current.chart.destroy();
      }
    };
  }, [emotionResult, lastValidResult]);

  // Notify parent component when settings change
  useEffect(() => {
    if (onSettingsChange) {
      onSettingsChange({ confidenceThreshold, useSmoothing });
    }
  }, [confidenceThreshold, useSmoothing, onSettingsChange]);

  // Prepare chart data with more stable values
  const getChartData = () => {
    const emotions = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral'];
    
    // Use the current result or the last valid result, or empty data if neither exists
    const result = emotionResult || lastValidResult;
    
    // If we have no result or not capturing, show empty or last result
    if (!result || !isCapturing) {
      const data: ChartData<'bar', number[], string> = {
        labels: emotions.map(e => e ? e.charAt(0).toUpperCase() + e.slice(1) : ''),
        datasets: [
          {
            label: 'Emotion Probability',
            data: result ? emotions.map(emotion => result.probabilities?.[emotion] || 0) 
                         : emotions.map(() => 0),
            backgroundColor: result ? emotions.map(emotion => 
              result.emotion === emotion 
                ? emotionColors[emotion as keyof typeof emotionColors].replace('0.7', '1.0')
                : emotionColors[emotion as keyof typeof emotionColors]
            ) : emotions.map(emotion => emotionColors[emotion as keyof typeof emotionColors]),
            borderWidth: 1,
          },
        ],
      };
      
      // Add threshold line
      try {
        const thresholdDataset = {
          label: 'Confidence Threshold',
          data: emotions.map(() => confidenceThreshold),
          type: 'line',
          borderColor: 'rgba(0, 0, 0, 0.5)',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        };
        
        (data.datasets as any[]).push(thresholdDataset);
      } catch (e) {
        console.warn('Could not add threshold line to chart', e);
      }
      
      return data;
    }
    
    // For active capturing with results
    const data: ChartData<'bar', number[], string> = {
      labels: emotions.map(e => e ? e.charAt(0).toUpperCase() + e.slice(1) : ''),
      datasets: [
        {
          label: 'Emotion Probability',
          data: emotions.map(emotion => result.probabilities?.[emotion] || 0),
          backgroundColor: emotions.map(emotion => 
            result.emotion === emotion 
              ? emotionColors[emotion as keyof typeof emotionColors].replace('0.7', '1.0')
              : emotionColors[emotion as keyof typeof emotionColors]
          ),
          borderWidth: 1,
        },
      ],
    };
    
    // Add threshold line
    try {
      const thresholdDataset = {
        label: 'Confidence Threshold',
        data: emotions.map(() => confidenceThreshold),
        type: 'line',
        borderColor: 'rgba(0, 0, 0, 0.5)',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
      };
      
      (data.datasets as any[]).push(thresholdDataset);
    } catch (e) {
      console.warn('Could not add threshold line to chart', e);
    }
    
    return data;
  };

  // Chart options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 1,
        ticks: {
          padding: 5,
        }
      },
      x: {
        ticks: {
          padding: 5
        }
      }
    },
    layout: {
      padding: {
        bottom: 15
      }
    }
  };

  // Handle confidence threshold change
  const handleConfidenceChange = (_event: Event, newValue: number | number[]) => {
    setConfidenceThreshold(newValue as number);
  };

  // Handle smoothing toggle change
  const handleSmoothingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUseSmoothing(event.target.checked);
  };

  // Handle settings button click
  const handleSettingsClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setSettingsAnchorEl(event.currentTarget);
  };

  const handleSettingsClose = () => {
    setSettingsAnchorEl(null);
  };

  const settingsOpen = Boolean(settingsAnchorEl);
  const settingsId = settingsOpen ? 'settings-popover' : undefined;

  // Get status alert if any
  const getStatusAlert = () => {
    if (!emotionResult) return null;
    
    if (emotionResult.status === 'warning' || emotionResult.status === 'error') {
      return (
        <Alert severity={emotionResult.status} sx={{ mb: 1, py: 0.5 }}>
          {emotionResult.message}
        </Alert>
      );
    }
    
    return null;
  };

  // Get emotion chips display
  const renderEmotionChips = () => {
    // Use emotionResult if available, otherwise use lastValidResult or default empty values
    const result = emotionResult || lastValidResult || { 
      probabilities: {} as Record<string, number>, 
      emotion: '' 
    };
    const emotions = ['disgust', 'neutral', 'anger', 'sadness', 'happiness', 'surprise', 'fear'];
    
    return (
      <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'center' }}>
        {emotions.map(emotion => (
          <Chip
            key={emotion}
            label={`${emotion}: ${((result.probabilities?.[emotion] || 0) * 100).toFixed(1)}%`}
            size="small"
            sx={{
              height: '20px',
              fontSize: '0.7rem',
              backgroundColor: emotion === result.emotion 
                ? emotionColors[emotion as keyof typeof emotionColors].replace('0.7', '0.9')
                : 'rgba(30, 41, 59, 0.8)',
              color: emotion === result.emotion ? '#000' : '#fff'
            }}
          />
        ))}
      </Box>
    );
  };

  // Determine display content
  const getDisplayContent = () => {
    if (!isCapturing) {
      return (
        <>
          <Typography variant="body2" sx={{ textAlign: 'center', fontStyle: 'italic', my: 1 }}>
            Press START CAPTURE to detect emotions
          </Typography>
          {renderChart(true)}
        </>
      );
    }
    
    if (emotionResult) {
      return (
        <>
          {getStatusAlert()}
          {renderChart()}
        </>
      );
    }
    
    if (lastValidResult && isCapturing) {
      return (
        <>
          <Typography variant="body2" sx={{ textAlign: 'center', fontStyle: 'italic', my: 1 }}>
            Waiting for speech...
          </Typography>
          {renderChart()}
        </>
      );
    }
    
    return (
      <>
        <Typography variant="body2" sx={{ textAlign: 'center', fontStyle: 'italic', my: 1 }}>
          No speech detected yet
        </Typography>
        {renderChart()}
      </>
    );
  };

  // Helper to render chart
  const renderChart = (inactive = false) => (
    <Box sx={{ 
      height: 220, 
      mt: 1, 
      mb: 1,
      pb: 2, // Add bottom padding
      position: 'relative',
      '& canvas': {
        marginBottom: '10px !important'
      }
    }}>
      <Bar 
        ref={chartRef}
        key={`emotion-chart-${isCapturing ? 'active' : 'inactive'}`}
        data={getChartData()} 
        options={inactive ? { ...options, animation: false } : options} 
        style={inactive ? { opacity: 0.5 } : undefined}
      />
    </Box>
  );

  // Render settings section
  const renderSettings = () => (
    <Box sx={{ p: 2, width: 250 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Settings</Typography>
      
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="caption">
            Threshold: {(confidenceThreshold * 100).toFixed(0)}%
          </Typography>
        </Box>
        
        <Slider
          value={confidenceThreshold}
          onChange={handleConfidenceChange}
          min={0.1}
          max={0.9}
          step={0.05}
          sx={{ 
            width: '100%',
            height: 4,
            '& .MuiSlider-thumb': {
              backgroundColor: '#7C3AED',
              width: 12,
              height: 12,
            },
            '& .MuiSlider-track': {
              backgroundColor: '#7C3AED',
              height: 4,
            },
            '& .MuiSlider-rail': {
              height: 4,
            }
          }}
        />
      </Box>
      
      <FormControlLabel
        control={
          <Switch 
            checked={useSmoothing} 
            onChange={handleSmoothingChange}
            size="small"
            sx={{
              '& .Mui-checked': {
                color: '#7C3AED',
              },
              '& .Mui-checked + .MuiSwitch-track': {
                backgroundColor: '#7C3AED',
              }
            }}
          />
        }
        label={
          <Typography variant="caption">
            Smoothing
          </Typography>
        }
      />
    </Box>
  );

  // Get emotion details display
  const getEmotionDetails = () => {
    if (!emotionResult) {
      // Always display the emotion chips even when there's no result
      return renderEmotionChips();
    }
    
    // Make sure probabilities exist
    if (!emotionResult.probabilities) {
      return (
        <>
          <Typography variant="body2" align="center" sx={{ my: 0.5, fontStyle: 'italic' }}>
            Processing speech...
          </Typography>
          {renderEmotionChips()}
        </>
      );
    }
    
    const confidenceValue = (emotionResult.confidence * 100).toFixed(1);
    const confidenceLevel = emotionResult.confidence < 0.4 ? "Low" : 
                           emotionResult.confidence < 0.7 ? "Medium" : "High";
    const filterStatus = emotionResult.belowThreshold ? 'uncertain' : emotionResult.emotion;
    
    return (
      <Box sx={{ textAlign: 'center', mt: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
          <Typography variant="subtitle2">
            {emotionResult.emotion}
          </Typography>
          <Chip 
            label={`${confidenceLevel}`} 
            color={confidenceLevel === "Low" ? "warning" : "success"}
            size="small"
            sx={{ fontSize: '0.65rem', height: '18px', px: 0.5 }}
          />
        </Box>
        
        <Typography variant="caption" display="block" sx={{ opacity: 0.9 }}>
          Confidence: {confidenceValue}% • Filtered: {filterStatus}
        </Typography>
        
        {renderEmotionChips()}
      </Box>
    );
  };

  return (
    <Paper sx={{ 
      p: 2, 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      maxWidth: '100%',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      borderRadius: 2,
      overflow: 'visible'
    }}>
      <Box sx={{ 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        pb: 0.5,
        mb: 1,
      }}>
        <Typography 
          variant="subtitle1" 
          sx={{ 
            textAlign: 'center', 
            fontWeight: 500
          }}
        >
          Emotion Recognition
        </Typography>
        <IconButton 
          size="small" 
          sx={{ position: 'absolute', right: 0 }}
          onClick={handleSettingsClick}
          aria-describedby={settingsId}
        >
          <SettingsIcon fontSize="small" />
        </IconButton>
        
        <Popover
          id={settingsId}
          open={settingsOpen}
          anchorEl={settingsAnchorEl}
          onClose={handleSettingsClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
        >
          {renderSettings()}
        </Popover>
      </Box>
      
      {getEmotionDetails()}
      
      <Box sx={{ 
        flexGrow: 1, 
        minHeight: 250, 
        display: 'flex', 
        flexDirection: 'column', 
        overflowY: 'visible'
      }}>
        {getDisplayContent()}
      </Box>
    </Paper>
  );
};

export default EmotionDisplay;
