import React, { useEffect, useRef } from 'react';
import { Paper, Typography, Box, LinearProgress, Tooltip, Chip } from '@mui/material';

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
}

const SpeechCharacteristics: React.FC<SpeechCharacteristicsProps> = ({ 
  characteristics, 
  isCapturing,
  noPaper = false,
  showLastDetectedMessage = false,
  showWaitingMessage = false
}) => {
  // Track previous values to animate transitions
  const lastValues = useRef({
    fluency: 0,
    tempo: 0,
    pronunciation: 0
  });
  
  // Update ref when characteristics change
  useEffect(() => {
    if (characteristics) {
      lastValues.current = {
        fluency: characteristics.fluency.confidence * 100,
        tempo: characteristics.tempo.confidence * 100,
        pronunciation: characteristics.pronunciation.confidence * 100
      };
    }
  }, [characteristics]);

  // Only return null when not capturing - always show something otherwise
  if (!isCapturing) {
    return null;
  }

  if (!characteristics && showWaitingMessage) {
    const waitingContent = (
      <>
        <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
          Speech Characteristics
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', my: 4, textAlign: 'center' }}>
          Waiting for speech to analyze characteristics...
        </Typography>
      </>
    );

    if (noPaper) {
      return waitingContent;
    }

    return (
      <Paper sx={{ p: 3, borderRadius: 3, mt: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        {waitingContent}
      </Paper>
    );
  }

  if (!characteristics) {
    return null;
  }

  // Format confidence value as percentage
  const formatConfidence = (value: number) => {
    return `${Math.round(value * 100)}%`;
  };

  const content = (
    <>
      <Typography variant="h6" sx={{ mb: showLastDetectedMessage ? 1 : 3, fontWeight: 600 }}>
        Speech Characteristics
      </Typography>
      
      {showLastDetectedMessage && (
        <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary', fontStyle: 'italic' }}>
          Showing last detected speech characteristics. Continue speaking for new analysis.
        </Typography>
      )}
      
      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, 
        gap: 4
      }}>
        {/* Fluency */}
        <Box sx={{ 
          p: 2, 
          border: '1px solid rgba(0,0,0,0.08)', 
          borderRadius: 2,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
          }
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold" color="primary">
              Fluency
            </Typography>
            <Tooltip title="Speech fluency confidence score" arrow>
              <Chip 
                label={formatConfidence(characteristics.fluency.confidence)} 
                size="small"
                sx={{ 
                  backgroundColor: characteristics.fluency.category.includes('High') 
                    ? 'rgba(76, 175, 80, 0.1)' 
                    : characteristics.fluency.category.includes('Low')
                      ? 'rgba(244, 67, 54, 0.1)'
                      : 'rgba(33, 150, 243, 0.1)',
                  color: characteristics.fluency.category.includes('High') 
                    ? '#4caf50' 
                    : characteristics.fluency.category.includes('Low')
                      ? '#f44336'
                      : '#2196f3',
                  fontWeight: 'bold'
                }}
              />
            </Tooltip>
          </Box>
          <Typography variant="h5" sx={{ 
            my: 1, 
            color: characteristics.fluency.category.includes('High') 
              ? 'success.main' 
              : characteristics.fluency.category.includes('Low')
                ? 'error.main'
                : 'info.main',
            transition: 'color 0.3s ease'
          }}>
            {characteristics.fluency.category}
          </Typography>
          
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Low
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Medium
              </Typography>
              <Typography variant="caption" color="text.secondary">
                High
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={characteristics.fluency.confidence * 100} 
              sx={{ 
                height: 8, 
                borderRadius: 4,
                backgroundColor: 'rgba(0,0,0,0.08)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: characteristics.fluency.category.includes('High') 
                    ? '#4caf50' 
                    : characteristics.fluency.category.includes('Low')
                      ? '#f44336'
                      : '#2196f3',
                  transition: 'transform 0.5s ease'
                }
              }} 
            />
          </Box>
        </Box>
        
        {/* Tempo */}
        <Box sx={{ 
          p: 2, 
          border: '1px solid rgba(0,0,0,0.08)', 
          borderRadius: 2,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
          }
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold" color="primary">
              Tempo
            </Typography>
            <Tooltip title="Speech tempo confidence score" arrow>
              <Chip 
                label={formatConfidence(characteristics.tempo.confidence)} 
                size="small"
                sx={{ 
                  backgroundColor: characteristics.tempo.category.includes('Fast') 
                    ? 'rgba(244, 67, 54, 0.1)' 
                    : characteristics.tempo.category.includes('Slow')
                      ? 'rgba(33, 150, 243, 0.1)'
                      : 'rgba(76, 175, 80, 0.1)',
                  color: characteristics.tempo.category.includes('Fast') 
                    ? '#f44336' 
                    : characteristics.tempo.category.includes('Slow')
                      ? '#2196f3'
                      : '#4caf50',
                  fontWeight: 'bold'
                }}
              />
            </Tooltip>
          </Box>
          <Typography variant="h5" sx={{ 
            my: 1,
            color: characteristics.tempo.category.includes('Fast') 
              ? 'error.main' 
              : characteristics.tempo.category.includes('Slow')
                ? 'info.main'
                : 'success.main',
            transition: 'color 0.3s ease'
          }}>
            {characteristics.tempo.category}
          </Typography>
          
          <Box sx={{ mb: 1 }}>
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
              value={characteristics.tempo.confidence * 100} 
              sx={{ 
                height: 8, 
                borderRadius: 4,
                backgroundColor: 'rgba(0,0,0,0.08)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: characteristics.tempo.category.includes('Fast') 
                    ? '#f44336' 
                    : characteristics.tempo.category.includes('Slow')
                      ? '#2196f3'
                      : '#4caf50',
                  transition: 'transform 0.5s ease'
                }
              }} 
            />
          </Box>
        </Box>
        
        {/* Pronunciation */}
        <Box sx={{ 
          p: 2, 
          border: '1px solid rgba(0,0,0,0.08)', 
          borderRadius: 2,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
          }
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold" color="primary">
              Pronunciation
            </Typography>
            <Tooltip title="Pronunciation clarity confidence score" arrow>
              <Chip 
                label={formatConfidence(characteristics.pronunciation.confidence)} 
                size="small"
                sx={{ 
                  backgroundColor: characteristics.pronunciation.category.includes('Clear') 
                    ? 'rgba(76, 175, 80, 0.1)' 
                    : 'rgba(244, 67, 54, 0.1)',
                  color: characteristics.pronunciation.category.includes('Clear') 
                    ? '#4caf50' 
                    : '#f44336',
                  fontWeight: 'bold'
                }}
              />
            </Tooltip>
          </Box>
          <Typography variant="h5" sx={{ 
            my: 1,
            color: characteristics.pronunciation.category.includes('Clear') 
              ? 'success.main' 
              : 'error.main',
            transition: 'color 0.3s ease'
          }}>
            {characteristics.pronunciation.category}
          </Typography>
          
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Unclear
              </Typography>
              <Typography variant="caption" color="text.secondary" textAlign="right">
                Clear
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={characteristics.pronunciation.confidence * 100} 
              sx={{ 
                height: 8, 
                borderRadius: 4,
                backgroundColor: 'rgba(0,0,0,0.08)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: characteristics.pronunciation.category.includes('Clear') 
                    ? '#4caf50' 
                    : '#f44336',
                  transition: 'transform 0.5s ease'
                }
              }} 
            />
          </Box>
        </Box>
      </Box>
    </>
  );

  if (noPaper) {
    return content;
  }

  return (
    <Paper sx={{ p: 3, borderRadius: 3, mt: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
      {content}
    </Paper>
  );
};

export default SpeechCharacteristics; 