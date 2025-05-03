import React, { useEffect, useRef } from 'react';
import { Typography, Box, LinearProgress, Chip } from '@mui/material';

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
  showLastDetectedMessage = false,
  showWaitingMessage = false
}) => {
  const lastValues = useRef({
    fluency: 0,
    tempo: 0,
    pronunciation: 0
  });
  
  useEffect(() => {
    if (characteristics) {
      lastValues.current = {
        fluency: characteristics.fluency.confidence * 100,
        tempo: characteristics.tempo.confidence * 100,
        pronunciation: characteristics.pronunciation.confidence * 100
      };
    }
  }, [characteristics]);

  if (!isCapturing) {
    return null;
  }

  if (!characteristics && showWaitingMessage) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', fontSize: '0.75rem' }}>
        Waiting for speech...
      </Typography>
    );
  }

  if (!characteristics) {
    return null;
  }

  // Format confidence value as percentage
  const formatConfidence = (value: number) => {
    return `${Math.round(value * 100)}%`;
  };

  // Define colors
  const fluencyColor = '#9c27b0'; // purple
  const tempoColor = '#9c27b0'; // purple
  const pronunciationColor = '#9c27b0'; // purple

  return (
    <Box sx={{ width: '100%', py: 0.5 }}>
      {showLastDetectedMessage && (
        <Typography variant="caption" sx={{ color: '#a0a0a0', textAlign: 'center', display: 'block', fontSize: '0.75rem', mb: 1 }}>
          Last analysis
        </Typography>
      )}
      
      {/* Fluency */}
      <Box sx={{ mb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
          <Typography sx={{ color: fluencyColor, fontSize: '0.8rem', fontWeight: 500 }}>
            Fluency
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ 
              color: '#2196f3', 
              fontSize: '0.8rem',
              fontWeight: 500
            }}>
              {characteristics.fluency.category}
            </Typography>
            <Chip
              label={formatConfidence(characteristics.fluency.confidence)}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.7rem',
                backgroundColor: '#2196f3',
                color: 'white',
                borderRadius: '10px',
              }}
            />
          </Box>
        </Box>
        <LinearProgress
          variant="determinate"
          value={characteristics.fluency.confidence * 100}
          sx={{
            height: 6,
            borderRadius: 3,
            backgroundColor: 'rgba(33, 150, 243, 0.2)',
            mb: 0.5,
            '& .MuiLinearProgress-bar': {
              backgroundColor: '#2196f3',
            }
          }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: '#a0a0a0', fontSize: '0.7rem' }}>Low</Typography>
          <Typography sx={{ color: '#a0a0a0', fontSize: '0.7rem' }}>Medium</Typography>
          <Typography sx={{ color: '#a0a0a0', fontSize: '0.7rem' }}>High</Typography>
        </Box>
      </Box>
      
      {/* Tempo */}
      <Box sx={{ mb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
          <Typography sx={{ color: tempoColor, fontSize: '0.8rem', fontWeight: 500 }}>
            Tempo
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ 
              color: '#4caf50', 
              fontSize: '0.8rem',
              fontWeight: 500
            }}>
              {characteristics.tempo.category}
            </Typography>
            <Chip
              label={formatConfidence(characteristics.tempo.confidence)}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.7rem',
                backgroundColor: '#4caf50',
                color: 'white',
                borderRadius: '10px',
              }}
            />
          </Box>
        </Box>
        <LinearProgress
          variant="determinate"
          value={characteristics.tempo.confidence * 100}
          sx={{
            height: 6,
            borderRadius: 3,
            backgroundColor: 'rgba(76, 175, 80, 0.2)',
            mb: 0.5,
            '& .MuiLinearProgress-bar': {
              backgroundColor: '#4caf50',
            }
          }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: '#a0a0a0', fontSize: '0.7rem' }}>Slow</Typography>
          <Typography sx={{ color: '#a0a0a0', fontSize: '0.7rem' }}>Medium</Typography>
          <Typography sx={{ color: '#a0a0a0', fontSize: '0.7rem' }}>Fast</Typography>
        </Box>
      </Box>
      
      {/* Pronunciation */}
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
          <Typography sx={{ color: pronunciationColor, fontSize: '0.8rem', fontWeight: 500 }}>
            Pronunciation
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ 
              color: '#4caf50', 
              fontSize: '0.8rem',
              fontWeight: 500
            }}>
              {characteristics.pronunciation.category}
            </Typography>
            <Chip
              label={formatConfidence(characteristics.pronunciation.confidence)}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.7rem',
                backgroundColor: '#4caf50',
                color: 'white',
                borderRadius: '10px',
              }}
            />
          </Box>
        </Box>
        <LinearProgress
          variant="determinate"
          value={characteristics.pronunciation.confidence * 100}
          sx={{
            height: 6,
            borderRadius: 3,
            backgroundColor: 'rgba(76, 175, 80, 0.2)',
            mb: 0.5,
            '& .MuiLinearProgress-bar': {
              backgroundColor: '#4caf50',
            }
          }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography sx={{ color: '#a0a0a0', fontSize: '0.7rem' }}>Unclear</Typography>
          <Typography sx={{ color: '#a0a0a0', fontSize: '0.7rem', textAlign: 'right' }}>Clear</Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default SpeechCharacteristics; 