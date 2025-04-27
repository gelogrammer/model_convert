import { useEffect, useRef, useState } from 'react';
import { Paper, Typography, Box, LinearProgress } from '@mui/material';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface SpeechTempoDisplayProps {
  speechRate: number | undefined;
  isCapturing: boolean;
}

const SpeechTempoDisplay: React.FC<SpeechTempoDisplayProps> = ({ speechRate, isCapturing }) => {
  const chartRef = useRef<any>(null);
  const historyRef = useRef<number[]>([]);
  const timeLabelsRef = useRef<string[]>([]);
  const [lastValidRate, setLastValidRate] = useState<number | null>(null);

  // Update last valid rate when speech rate changes
  useEffect(() => {
    if (speechRate !== undefined) {
      // Convert from syllables/sec to WPM (approximate conversion)
      // Assuming average of 1.5 syllables per word
      const speechRateWPM = speechRate * 60 / 1.5;
      setLastValidRate(speechRateWPM);
    }
  }, [speechRate]);

  // Update history when speech rate changes
  useEffect(() => {
    if (speechRate !== undefined && isCapturing) {
      // Convert to WPM for consistency with the display
      const speechRateWPM = speechRate * 60 / 1.5;
      
      // Add to history
      historyRef.current.push(speechRateWPM);
      
      // Limit history to 20 points
      if (historyRef.current.length > 20) {
        historyRef.current.shift();
      }
      
      // Update time labels
      const now = new Date();
      const timeLabel = `${now.getMinutes()}:${now.getSeconds().toString().padStart(2, '0')}`;
      timeLabelsRef.current.push(timeLabel);
      
      if (timeLabelsRef.current.length > 20) {
        timeLabelsRef.current.shift();
      }
      
      // Update chart
      if (chartRef.current) {
        chartRef.current.update();
      }
    }
  }, [speechRate, isCapturing]);

  // Reset history when capturing starts/stops
  useEffect(() => {
    if (!isCapturing) {
      historyRef.current = [];
      timeLabelsRef.current = [];
      
      if (chartRef.current) {
        chartRef.current.update();
      }
    }
  }, [isCapturing]);

  // Get speech rate category and color based on the ASR model classification
  const getSpeechRateInfo = (rate: number | undefined) => {
    if (rate === undefined) {
      return { category: 'No data', color: '#9e9e9e', progress: 0 };
    }
    
    // Using thresholds based on ASR model's classification of tempo
    if (rate < 100) {
      return { category: 'Slow Tempo', color: '#2196f3', progress: 33 };
    } else if (rate < 150) {
      return { category: 'Medium Tempo', color: '#8bc34a', progress: 66 };
    } else {
      return { category: 'Fast Tempo', color: '#f44336', progress: 100 };
    }
  };

  // Prepare chart data
  const getChartData = () => {
    return {
      labels: timeLabelsRef.current,
      datasets: [
        {
          label: 'Speech Rate (WPM)',
          data: historyRef.current,
          borderColor: '#2196f3',
          backgroundColor: 'rgba(33, 150, 243, 0.2)',
          tension: 0.4,
        },
      ],
    };
  };

  // Chart options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        suggestedMax: 200,
      },
    },
  };

  // Helper function to render chart
  const renderChart = () => (
    <Box sx={{ height: 150, mt: 3 }}>
      <Line 
        ref={chartRef}
        data={getChartData()} 
        options={options} 
      />
    </Box>
  );

  // Helper to render tempo indicator
  const renderTempoIndicator = (rate: number) => {
    const rateInfo = getSpeechRateInfo(rate);
    
    return (
      <>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
          <Typography variant="h5" sx={{ color: rateInfo.color }}>
            {rateInfo.category}
          </Typography>
          <Typography variant="h6">
            {rate.toFixed(1)} WPM
          </Typography>
        </Box>
        
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Slow
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Medium
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Fast
            </Typography>
          </Box>
          <LinearProgress 
            variant="determinate" 
            value={rateInfo.progress} 
            sx={{ 
              height: 10, 
              borderRadius: 5,
              backgroundColor: 'rgba(0,0,0,0.1)',
              '& .MuiLinearProgress-bar': {
                backgroundColor: rateInfo.color,
                transition: 'transform 0.5s ease'
              }
            }} 
          />
        </Box>
      </>
    );
  };

  // Determine what to display based on the current state
  const getDisplayContent = () => {
    if (!isCapturing) {
      return (
        <>
          <Typography sx={{ mb: 2 }}>Start capturing to analyze speech tempo</Typography>
          {renderChart()}
        </>
      );
    }
    
    if (speechRate !== undefined) {
      // Convert from syllables/sec to WPM
      const speechRateWPM = speechRate * 60 / 1.5;
      return (
        <>
          {renderTempoIndicator(speechRateWPM)}
          {renderChart()}
        </>
      );
    }
    
    if (lastValidRate !== null) {
      return (
        <>
          <Typography sx={{ mb: 2, color: 'text.secondary' }}>
            Waiting for speech... Last detected tempo:
          </Typography>
          {renderTempoIndicator(lastValidRate)}
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

  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Speech Tempo
      </Typography>
      
      {getDisplayContent()}
    </Paper>
  );
};

export default SpeechTempoDisplay;
