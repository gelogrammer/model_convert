import { useEffect, useRef, useState } from 'react';
import { Paper, Typography, Box, LinearProgress, Chip, Stack } from '@mui/material';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  LineController
} from 'chart.js';
import { TEMPO_CATEGORIES } from '../services/asrService';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend
);

interface SpeechTempoDisplayProps {
  speechRate: number | undefined;
  isCapturing: boolean;
  tempoCategory?: string;
  tempoConfidence?: number;
}

const SpeechTempoDisplay: React.FC<SpeechTempoDisplayProps> = ({ 
  speechRate, 
  isCapturing, 
  tempoCategory, 
  tempoConfidence = 0 
}) => {
  const chartRef = useRef<any>(null);
  const historyRef = useRef<number[]>([]);
  const timeLabelsRef = useRef<string[]>([]);
  const [lastValidRate, setLastValidRate] = useState<number | null>(null);
  const [lastTempoCategory, setLastTempoCategory] = useState<string | null>(null);

  // Update last valid rate when speech rate changes
  useEffect(() => {
    // Log updates for debugging
    console.log('Speech rate changed:', speechRate);
    console.log('Tempo category changed:', tempoCategory);
    
    if (speechRate !== undefined) {
      // ASR model already provides WPM, no need for conversion
      setLastValidRate(speechRate);
    }
    
    if (tempoCategory) {
      console.log('Setting new tempo category:', tempoCategory);
      setLastTempoCategory(tempoCategory);
    }
  }, [speechRate, tempoCategory]);

  // Update history when speech rate changes
  useEffect(() => {
    if (speechRate !== undefined && isCapturing) {
      // Add to history
      historyRef.current.push(speechRate);
      
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
    } else {
      // Reset states when capturing starts to ensure we don't get stuck with old values
      console.log('Capturing started, resetting component state');
      setLastValidRate(null);
      setLastTempoCategory(null);
      historyRef.current = [];
      timeLabelsRef.current = [];
      
      if (chartRef.current) {
        chartRef.current.update();
      }
    }
  }, [isCapturing]);

  // Get speech rate category and color based on the ASR model classification
  const getSpeechRateInfo = (rate: number | undefined, category?: string) => {
    if (rate === undefined) {
      return { category: 'No data', color: '#9e9e9e', progress: 0 };
    }
    
    // Use the ASR model's tempo category if available
    if (category) {
      if (category === "Fast Tempo") {
        return { category, color: '#f44336', progress: 100 };
      } else if (category === "Medium Tempo") {
        return { category, color: '#8bc34a', progress: 66 };
      } else if (category === "Slow Tempo") {
        return { category, color: '#2196f3', progress: 33 };
      }
    }
    
    // Fallback to rate-based classification
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
          tension: 0,
          fill: true,
        },
      ],
    };
  };

  // Chart options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1000,
      easing: 'linear' as const,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            return `${context.raw.toFixed(1)} WPM`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        suggestedMax: 200,
        title: {
          display: true,
          text: 'Words Per Minute'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Time'
        }
      }
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
  const renderTempoIndicator = (rate: number, category?: string) => {
    // Log current values for debugging
    console.log('Current tempo category:', category);
    console.log('Last tempo category:', lastTempoCategory);
    
    const rateInfo = getSpeechRateInfo(rate, category);
    
    return (
      <>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h5" sx={{ color: rateInfo.color }}>
              {rateInfo.category}
            </Typography>
            {tempoConfidence > 0 && (
              <Chip 
                label={`${Math.round(tempoConfidence * 100)}% conf.`} 
                size="small" 
                sx={{ 
                  backgroundColor: `${rateInfo.color}22`,
                  color: rateInfo.color,
                  fontWeight: 'bold'
                }} 
              />
            )}
          </Stack>
          <Typography variant="h6">
            {rate.toFixed(1)} WPM
          </Typography>
        </Box>
        
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            {TEMPO_CATEGORIES.map((tempoCat, index) => (
              <Typography 
                key={index} 
                variant="caption" 
                sx={{
                  color: rateInfo.category === tempoCat ? rateInfo.color : 'text.secondary',
                  fontWeight: rateInfo.category === tempoCat ? 'bold' : 'normal'
                }}
              >
                {tempoCat}
              </Typography>
            ))}
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
    // Log current state for debugging
    console.log('isCapturing:', isCapturing);
    console.log('speechRate:', speechRate);
    console.log('tempoCategory:', tempoCategory);
    console.log('lastValidRate:', lastValidRate);
    console.log('lastTempoCategory:', lastTempoCategory);
    
    if (!isCapturing) {
      return (
        <>
          <Typography sx={{ mb: 2 }}>Start capturing to analyze speech tempo</Typography>
          {renderChart()}
        </>
      );
    }
    
    if (speechRate !== undefined) {
      return (
        <>
          {renderTempoIndicator(speechRate, tempoCategory)}
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
          {renderTempoIndicator(lastValidRate, lastTempoCategory || undefined)}
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
