import React from 'react';
import { Paper, Typography, Box, LinearProgress } from '@mui/material';

interface SpeechCharacteristicsProps {
  characteristics: {
    fluency: { category: string; confidence: number };
    tempo: { category: string; confidence: number };
    pronunciation: { category: string; confidence: number };
  } | null | undefined;
  isCapturing: boolean;
}

const SpeechCharacteristics: React.FC<SpeechCharacteristicsProps> = ({ 
  characteristics, 
  isCapturing 
}) => {
  if (!characteristics || !isCapturing) {
    return null;
  }

  return (
    <Paper sx={{ p: 3, borderRadius: 3, mt: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
        Speech Characteristics
      </Typography>
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
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <Typography variant="subtitle1" fontWeight="bold" color="primary">
            Fluency
          </Typography>
          <Typography variant="h5" sx={{ 
            my: 1, 
            color: characteristics.fluency.category.includes('High') 
              ? 'success.main' 
              : characteristics.fluency.category.includes('Low')
                ? 'error.main'
                : 'info.main'
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
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <Typography variant="subtitle1" fontWeight="bold" color="primary">
            Tempo
          </Typography>
          <Typography variant="h5" sx={{ 
            my: 1,
            color: characteristics.tempo.category.includes('Fast') 
              ? 'error.main' 
              : characteristics.tempo.category.includes('Slow')
                ? 'info.main'
                : 'success.main'
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
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <Typography variant="subtitle1" fontWeight="bold" color="primary">
            Pronunciation
          </Typography>
          <Typography variant="h5" sx={{ 
            my: 1,
            color: characteristics.pronunciation.category.includes('Clear') 
              ? 'success.main' 
              : 'error.main'
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
    </Paper>
  );
};

export default SpeechCharacteristics; 