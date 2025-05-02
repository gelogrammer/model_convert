import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  LinearProgress,
  Card,
  CardContent,
  Divider,
  useTheme
} from '@mui/material';
import { 
  getSpeechMetricsContainer, 
  SpeechMetricsContainer, 
  resetSpeechMetricsContainer 
} from '../services/analysisService';

// Component for displaying speech metrics
const SpeechMetricsDisplay: React.FC = () => {
  const [metrics, setMetrics] = useState<SpeechMetricsContainer | null>(null);
  const theme = useTheme();
  
  // Update metrics periodically
  useEffect(() => {
    // Get initial metrics
    setMetrics(getSpeechMetricsContainer());
    
    // Set up interval to update metrics
    const intervalId = setInterval(() => {
      setMetrics(getSpeechMetricsContainer());
    }, 2000);
    
    // Clean up on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, []);
  
  // Handle reset button click
  const handleReset = () => {
    resetSpeechMetricsContainer();
    setMetrics(getSpeechMetricsContainer());
  };
  
  // If no metrics yet, show loading
  if (!metrics) {
    return (
      <Box p={2}>
        <Typography variant="h6">Loading speech metrics...</Typography>
        <LinearProgress />
      </Box>
    );
  }
  
  // Get scoring colors based on value
  const getScoringColor = (score: number) => {
    if (score >= 80) return theme.palette.success.main;
    if (score >= 65) return theme.palette.warning.main;
    return theme.palette.error.main;
  };
  
  return (
    <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">Speech Analysis Metrics</Typography>
        <button onClick={handleReset}>Reset</button>
      </Box>
      
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {/* Overall scores */}
        <Box sx={{ flex: '1 1 300px' }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Overall Scores
              </Typography>
              
              <Box mb={2}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2">Fluency</Typography>
                  <Typography variant="body2" color={getScoringColor(metrics.overallMetrics.fluencyScore)}>
                    {Math.round(metrics.overallMetrics.fluencyScore)}
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={metrics.overallMetrics.fluencyScore} 
                  sx={{ 
                    height: 8, 
                    borderRadius: 4,
                    backgroundColor: theme.palette.grey[300],
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: getScoringColor(metrics.overallMetrics.fluencyScore)
                    }
                  }}
                />
              </Box>
              
              <Box mb={2}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2">Tempo</Typography>
                  <Typography variant="body2" color={getScoringColor(metrics.overallMetrics.tempoScore)}>
                    {Math.round(metrics.overallMetrics.tempoScore)}
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={metrics.overallMetrics.tempoScore} 
                  sx={{ 
                    height: 8, 
                    borderRadius: 4,
                    backgroundColor: theme.palette.grey[300],
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: getScoringColor(metrics.overallMetrics.tempoScore)
                    }
                  }}
                />
              </Box>
              
              <Box mb={2}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2">Pronunciation</Typography>
                  <Typography variant="body2" color={getScoringColor(metrics.overallMetrics.pronunciationScore)}>
                    {Math.round(metrics.overallMetrics.pronunciationScore)}
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={metrics.overallMetrics.pronunciationScore} 
                  sx={{ 
                    height: 8, 
                    borderRadius: 4,
                    backgroundColor: theme.palette.grey[300],
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: getScoringColor(metrics.overallMetrics.pronunciationScore)
                    }
                  }}
                />
              </Box>
              
              <Divider sx={{ my: 2 }} />
              
              <Box mb={1}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body1" fontWeight="bold">Overall Score</Typography>
                  <Typography variant="body1" fontWeight="bold" color={getScoringColor(metrics.overallMetrics.overallScore)}>
                    {Math.round(metrics.overallMetrics.overallScore)}
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={metrics.overallMetrics.overallScore} 
                  sx={{ 
                    height: 10, 
                    borderRadius: 5,
                    backgroundColor: theme.palette.grey[300],
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: getScoringColor(metrics.overallMetrics.overallScore)
                    }
                  }}
                />
              </Box>
              
              <Box mt={2}>
                <Typography variant="body2">
                  Average Speech Rate: {Math.round(metrics.overallMetrics.averageRate)} words/min
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Box>
        
        {/* Category distributions */}
        <Box sx={{ flex: '1 1 300px' }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Speech Pattern Distribution
              </Typography>
              
              <Box mb={2}>
                <Typography variant="subtitle2">Fluency</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {Object.entries(metrics.categoryDistribution.fluency).map(([category, percentage]) => (
                    <Box key={category}>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2">{category}</Typography>
                        <Typography variant="body2">{Math.round(percentage * 100)}%</Typography>
                      </Box>
                      <LinearProgress 
                        variant="determinate" 
                        value={percentage * 100} 
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
              
              <Box mb={2}>
                <Typography variant="subtitle2">Tempo</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {Object.entries(metrics.categoryDistribution.tempo).map(([category, percentage]) => (
                    <Box key={category}>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2">{category}</Typography>
                        <Typography variant="body2">{Math.round(percentage * 100)}%</Typography>
                      </Box>
                      <LinearProgress 
                        variant="determinate" 
                        value={percentage * 100} 
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
              
              <Box>
                <Typography variant="subtitle2">Pronunciation</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {Object.entries(metrics.categoryDistribution.pronunciation).map(([category, percentage]) => (
                    <Box key={category}>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2">{category}</Typography>
                        <Typography variant="body2">{Math.round(percentage * 100)}%</Typography>
                      </Box>
                      <LinearProgress 
                        variant="determinate" 
                        value={percentage * 100} 
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
        
        {/* Speech rate trend - we'll just show the most recent entries */}
        {metrics.timeSeriesData.length > 0 && (
          <Box sx={{ width: '100%', mt: 2 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Recent Speech Rate Trend (Words per Minute)
                </Typography>
                
                <Box 
                  sx={{ 
                    height: '100px',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between'
                  }}
                >
                  {metrics.timeSeriesData.slice(-15).map((point, index) => (
                    <Box 
                      key={index}
                      sx={{
                        height: `${Math.min(100, point.speechRate / 2)}%`,
                        width: '15px',
                        backgroundColor: theme.palette.primary.main,
                        mx: 0.5,
                        borderTopLeftRadius: 2,
                        borderTopRightRadius: 2,
                        position: 'relative'
                      }}
                    >
                      {index % 5 === 0 && (
                        <Typography 
                          variant="caption"
                          sx={{
                            position: 'absolute',
                            bottom: '-20px',
                            left: '-10px',
                            width: '35px',
                            textAlign: 'center'
                          }}
                        >
                          {Math.round(point.speechRate)}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default SpeechMetricsDisplay; 