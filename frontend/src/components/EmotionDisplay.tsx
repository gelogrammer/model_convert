import { useEffect, useRef, useState } from 'react';
import { Paper, Typography, Box, Slider, FormControlLabel, Switch, Chip, Alert } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartData
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
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

const EmotionDisplay: React.FC<EmotionDisplayProps> = ({ emotionResult, isCapturing, onSettingsChange }) => {
  const chartRef = useRef<any>(null);
  const [lastValidResult, setLastValidResult] = useState<EmotionResult | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.4);
  const [useSmoothing, setUseSmoothing] = useState<boolean>(true);

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
      },
    },
  };

  // Handle confidence threshold change
  const handleConfidenceChange = (_event: Event, newValue: number | number[]) => {
    setConfidenceThreshold(newValue as number);
  };

  // Handle smoothing toggle change
  const handleSmoothingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUseSmoothing(event.target.checked);
  };

  // Get status alert if any
  const getStatusAlert = () => {
    if (!emotionResult) return null;
    
    if (emotionResult.status === 'warning' || emotionResult.status === 'error') {
      return (
        <Alert severity={emotionResult.status} sx={{ mb: 2 }}>
          {emotionResult.message}
        </Alert>
      );
    }
    
    return null;
  };

  // Determine display state
  const getDisplayContent = () => {
    if (!isCapturing) {
      return (
        <>
          <Typography variant="body1" sx={{ mb: 2, textAlign: 'center' }}>
            Press START CAPTURE to detect emotions
          </Typography>
          {renderChart(true)}
        </>
      );
    }
    
    if (emotionResult) {
      const emotionName = emotionResult.emotion.charAt(0).toUpperCase() + emotionResult.emotion.slice(1);
      const description = emotionDescriptions[emotionResult.emotion as keyof typeof emotionDescriptions] || '';
      
      return (
        <>
          {getStatusAlert()}
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="h5" color="primary">
              {emotionName}
            </Typography>
            <Chip 
              label={`${(emotionResult.confidence * 100).toFixed(1)}%`} 
              color={emotionResult.confidence > confidenceThreshold ? "success" : "default"}
            />
          </Box>
          
          <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic' }}>
            {description}
          </Typography>
          
          {renderChart()}
        </>
      );
    }
    
    if (lastValidResult && isCapturing) {
      return (
        <>
          <Typography sx={{ mb: 2 }}>
            Waiting for speech...
          </Typography>
          {renderChart()}
        </>
      );
    }
    
    return (
      <>
        <Typography sx={{ mb: 2 }}>
          No speech detected yet
        </Typography>
        {renderChart()}
      </>
    );
  };

  // Helper to render chart
  const renderChart = (inactive = false) => (
    <Box sx={{ height: 200, mt: 2 }}>
      <Bar 
        ref={chartRef}
        data={getChartData()} 
        options={inactive ? { ...options, animation: false } : options} 
        style={inactive ? { opacity: 0.5 } : undefined}
      />
    </Box>
  );

  // Render settings section
  const renderSettings = () => (
    <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(0, 0, 0, 0.12)' }}>
      <Typography variant="subtitle2" gutterBottom>
        Classification Settings
      </Typography>
      
      <Box sx={{ px: 1 }}>
        <Typography variant="body2" gutterBottom>
          Confidence Threshold: {(confidenceThreshold * 100).toFixed(0)}%
        </Typography>
        <Slider
          value={confidenceThreshold}
          onChange={handleConfidenceChange}
          min={0.1}
          max={0.9}
          step={0.05}
          sx={{ mb: 2 }}
        />
        
        <FormControlLabel
          control={
            <Switch 
              checked={useSmoothing} 
              onChange={handleSmoothingChange}
              size="small"
            />
          }
          label={
            <Typography variant="body2">
              Enable temporal smoothing
            </Typography>
          }
        />
      </Box>
    </Box>
  );

  return (
    <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" gutterBottom>
        Emotion Recognition
      </Typography>
      
      <Box sx={{ flexGrow: 1 }}>
        {getDisplayContent()}
      </Box>
      
      {renderSettings()}
    </Paper>
  );
};

export default EmotionDisplay;
