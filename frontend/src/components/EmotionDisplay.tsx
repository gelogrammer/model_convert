import { useEffect, useRef, useState } from 'react';
import { Paper, Typography, Box } from '@mui/material';
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
}

interface EmotionDisplayProps {
  emotionResult: EmotionResult | null;
  isCapturing: boolean;
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

const EmotionDisplay: React.FC<EmotionDisplayProps> = ({ emotionResult, isCapturing }) => {
  const chartRef = useRef<any>(null);
  const [lastValidResult, setLastValidResult] = useState<EmotionResult | null>(null);

  // Update last valid result when we get a new emotion result
  useEffect(() => {
    if (emotionResult) {
      setLastValidResult(emotionResult);
    }
  }, [emotionResult]);

  // Update chart when emotion result changes
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.update();
    }
  }, [emotionResult, lastValidResult]);

  // Prepare chart data
  const getChartData = () => {
    const emotions = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise', 'neutral'];
    
    // Use the current result or the last valid result, or empty data if neither exists
    const result = emotionResult || lastValidResult;
    
    const data = {
      labels: emotions.map(e => e ? e.charAt(0).toUpperCase() + e.slice(1) : ''),
      datasets: [
        {
          label: 'Emotion Probability',
          data: emotions.map(emotion => 
            result?.probabilities?.[emotion] || 0
          ),
          backgroundColor: emotions.map(emotion => 
            result?.emotion === emotion 
              ? emotionColors[emotion as keyof typeof emotionColors].replace('0.7', '1.0')
              : emotionColors[emotion as keyof typeof emotionColors]
          ),
          borderWidth: 1,
        },
      ],
    };
    
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

  // Determine display state
  const getDisplayContent = () => {
    if (!isCapturing) {
      return (
        <>
          <Typography sx={{ mb: 2 }}>Start capturing to detect emotions</Typography>
          {renderChart()}
        </>
      );
    }
    
    if (emotionResult) {
      return (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h5" color="primary">
              {emotionResult.emotion && emotionResult.emotion.charAt(0).toUpperCase() + emotionResult.emotion.slice(1)}
            </Typography>
            <Typography variant="h6">
              {(emotionResult.confidence * 100).toFixed(1)}%
            </Typography>
          </Box>
          
          {renderChart()}
        </>
      );
    }
    
    if (lastValidResult) {
      return (
        <>
          <Typography sx={{ mb: 2 }}>Waiting for speech...</Typography>
          {renderChart()}
        </>
      );
    }
    
    return (
      <>
        <Typography sx={{ mb: 2 }}>No speech detected yet</Typography>
        {renderChart()}
      </>
    );
  };

  // Helper to render chart
  const renderChart = () => (
    <Box sx={{ height: 200, mt: 2 }}>
      <Bar 
        ref={chartRef}
        data={getChartData()} 
        options={options} 
      />
    </Box>
  );

  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Emotion Recognition
      </Typography>
      
      {getDisplayContent()}
    </Paper>
  );
};

export default EmotionDisplay;
