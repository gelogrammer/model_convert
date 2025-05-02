import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  LinearProgress,
  Card,
  CardContent,
  Divider,
  useTheme,
  Button
} from '@mui/material';
import { 
  getSpeechMetricsContainer, 
  SpeechMetricsContainer, 
  resetSpeechMetricsContainer 
} from '../services/analysisService';

// Component for displaying speech metrics
const SpeechMetricsDisplay: React.FC = () => {
  const [metrics, setMetrics] = useState<SpeechMetricsContainer | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const theme = useTheme();
  
  // Memoized update function to prevent unnecessary re-renders
  const updateMetrics = useCallback(() => {
    const newMetrics = getSpeechMetricsContainer();
    setMetrics(prev => {
      // Only update if there's a meaningful change or 500ms has passed
      const now = Date.now();
      if (!prev || 
          now - lastUpdate > 500 ||
          prev.overallMetrics.averageRate !== newMetrics.overallMetrics.averageRate ||
          prev.overallMetrics.overallScore !== newMetrics.overallMetrics.overallScore) {
        setLastUpdate(now);
        return newMetrics;
      }
      return prev;
    });
  }, [lastUpdate]);
  
  // Update metrics periodically with optimized interval
  useEffect(() => {
    // Get initial metrics
    updateMetrics();
    
    // Set up interval to update metrics - more frequent updates for better responsiveness
    const intervalId = setInterval(updateMetrics, 300); // 300ms for more real-time feedback
    
    // Clean up on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [updateMetrics]);
  
  // Handle reset button click with click optimization
  const handleReset = useCallback(() => {
    resetSpeechMetricsContainer();
    updateMetrics();
  }, [updateMetrics]);
  
  // Memoized scoring color getter to prevent recalculation
  const getScoringColor = useCallback((score: number) => {
    if (score >= 80) return theme.palette.success.main;
    if (score >= 65) return theme.palette.warning.main;
    return theme.palette.error.main;
  }, [theme]);
  
  // If no metrics yet, show loading
  if (!metrics) {
    return (
      <Box p={2}>
        <Typography variant="h6">Loading speech metrics...</Typography>
        <LinearProgress />
      </Box>
    );
  }
  
  return (
    <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5">Speech Analysis Metrics</Typography>
        <Button 
          variant="outlined" 
          size="small"
          onClick={handleReset} 
          sx={{ minWidth: '60px', height: '32px' }}
        >
          Reset
        </Button>
      </Box>
      
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {/* Overall scores */}
        <ScoreCard 
          metrics={metrics.overallMetrics} 
          getScoringColor={getScoringColor} 
        />
        
        {/* Category distributions */}
        <DistributionCard 
          distributions={metrics.categoryDistribution} 
        />
        
        {/* Speech rate trend - only render if we have data */}
        {metrics.timeSeriesData.length > 0 && (
          <TimeSeriesCard 
            timeSeriesData={metrics.timeSeriesData}
          />
        )}
      </Box>
    </Paper>
  );
};

// Score Card Component - memoized to prevent unnecessary re-renders
const ScoreCard = React.memo(({ 
  metrics, 
  getScoringColor 
}: { 
  metrics: SpeechMetricsContainer['overallMetrics']; 
  getScoringColor: (score: number) => string;
}) => {
  const theme = useTheme();
  
  return (
    <Box sx={{ flex: '1 1 300px' }}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Overall Scores
          </Typography>
          
          <Box mb={2}>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2">Fluency</Typography>
              <Typography variant="body2" color={getScoringColor(metrics.fluencyScore)}>
                {Math.round(metrics.fluencyScore)}
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={metrics.fluencyScore} 
              sx={{ 
                height: 8, 
                borderRadius: 4,
                backgroundColor: theme.palette.grey[300],
                '& .MuiLinearProgress-bar': {
                  backgroundColor: getScoringColor(metrics.fluencyScore)
                }
              }}
            />
          </Box>
          
          <Box mb={2}>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2">Tempo</Typography>
              <Typography variant="body2" color={getScoringColor(metrics.tempoScore)}>
                {Math.round(metrics.tempoScore)}
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={metrics.tempoScore} 
              sx={{ 
                height: 8, 
                borderRadius: 4,
                backgroundColor: theme.palette.grey[300],
                '& .MuiLinearProgress-bar': {
                  backgroundColor: getScoringColor(metrics.tempoScore)
                }
              }}
            />
          </Box>
          
          <Box mb={2}>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2">Pronunciation</Typography>
              <Typography variant="body2" color={getScoringColor(metrics.pronunciationScore)}>
                {Math.round(metrics.pronunciationScore)}
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={metrics.pronunciationScore} 
              sx={{ 
                height: 8, 
                borderRadius: 4,
                backgroundColor: theme.palette.grey[300],
                '& .MuiLinearProgress-bar': {
                  backgroundColor: getScoringColor(metrics.pronunciationScore)
                }
              }}
            />
          </Box>
          
          <Divider sx={{ my: 2 }} />
          
          <Box mb={1}>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body1" fontWeight="bold">Overall Score</Typography>
              <Typography variant="body1" fontWeight="bold" color={getScoringColor(metrics.overallScore)}>
                {Math.round(metrics.overallScore)}
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={metrics.overallScore} 
              sx={{ 
                height: 10, 
                borderRadius: 5,
                backgroundColor: theme.palette.grey[300],
                '& .MuiLinearProgress-bar': {
                  backgroundColor: getScoringColor(metrics.overallScore)
                }
              }}
            />
          </Box>
          
          <Box mt={2}>
            <Typography variant="body2">
              Average Speech Rate: {Math.round(metrics.averageRate)} words/min
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
});

// Distribution Card Component - memoized to prevent unnecessary re-renders
const DistributionCard = React.memo(({ 
  distributions 
}: { 
  distributions: SpeechMetricsContainer['categoryDistribution']; 
}) => {
  return (
    <Box sx={{ flex: '1 1 300px' }}>
      <Card variant="outlined" sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Speech Pattern Distribution
          </Typography>
          
          <Box mb={2}>
            <Typography variant="subtitle2">Fluency</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {Object.entries(distributions.fluency).map(([category, percentage]) => (
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
              {Object.entries(distributions.tempo).map(([category, percentage]) => (
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
              {Object.entries(distributions.pronunciation).map(([category, percentage]) => (
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
  );
});

// Time Series Card Component - memoized to prevent unnecessary re-renders
const TimeSeriesCard = React.memo(({ 
  timeSeriesData 
}: { 
  timeSeriesData: SpeechMetricsContainer['timeSeriesData']; 
}) => {
  // Only display the last 10 data points for performance
  const recentData = useMemo(() => 
    timeSeriesData.slice(-10), 
    [timeSeriesData]
  );
  
  return (
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
              gap: 1,
              mt: 2,
              position: 'relative'
            }}
          >
            {/* Background grid lines */}
            <Box
              sx={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              {[0, 1, 2, 3].map(i => (
                <Box 
                  key={i}
                  sx={{
                    width: '100%',
                    borderBottom: i < 3 ? '1px dashed rgba(255,255,255,0.1)' : 'none',
                    height: '25%'
                  }}
                />
              ))}
            </Box>
            
            {/* Data bars */}
            {recentData.map((point, index) => {
              // Scale the value to fit in our 100px height
              // Assume max speech rate of 200 wpm
              const scaledHeight = Math.min((point.speechRate / 200) * 100, 100);
              
              return (
                <Box 
                  key={index}
                  sx={{
                    height: `${scaledHeight}px`,
                    width: `${100 / Math.min(recentData.length, 10)}%`,
                    backgroundColor: '#7C3AED',
                    borderRadius: '3px 3px 0 0',
                    transition: 'height 0.3s ease',
                    position: 'relative',
                    '&:hover::after': {
                      content: `"${Math.round(point.speechRate)} wpm"`,
                      position: 'absolute',
                      top: '-25px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: 'rgba(0,0,0,0.7)',
                      color: 'white',
                      padding: '2px 4px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      whiteSpace: 'nowrap'
                    }
                  }}
                />
              );
            })}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
});

export default SpeechMetricsDisplay; 