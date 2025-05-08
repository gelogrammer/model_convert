import React, { useRef, useState, useEffect } from 'react';
import { Paper, Typography, Box, Chip, Snackbar, Alert } from '@mui/material';
import { getAudioVisualizationData } from '../services/audioService';
import WaveformVisualizer from './WaveformVisualizer';

interface AudioCaptureProps {
  isCapturing: boolean;
  isConnected: boolean;
  onAudioLevelChange?: (level: number) => void;
  onSpeakingChange?: (isSpeaking: boolean) => void;
  saveError?: boolean | null;
}

const AudioCapture: React.FC<AudioCaptureProps> = ({ 
  isCapturing, 
  isConnected,
  onAudioLevelChange,
  onSpeakingChange,
  saveError
}) => {
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const speakingTimeoutRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisNotification, setAnalysisNotification] = useState<boolean>(false);
  
  // Effect for audio level change notifications
  useEffect(() => {
    onAudioLevelChange?.(audioLevel);
  }, [audioLevel, onAudioLevelChange]);
  
  // Effect for speaking state change notifications
  useEffect(() => {
    onSpeakingChange?.(isSpeaking);
  }, [isSpeaking, onSpeakingChange]);
  
  // Monitor audio levels from the visualization data
  useEffect(() => {
    if (!isCapturing) return;
    
    const monitorInterval = setInterval(() => {
      try {
        const dataArray = getAudioVisualizationData();
        
        if (!dataArray) {
          setError("Failed to get audio visualization data");
          return;
        }
        
        // Calculate audio level (average of frequency data)
        const sum = dataArray.reduce((acc, val) => acc + val, 0);
        const avg = sum / dataArray.length;
        const level = Math.min(avg / 128, 1); // Normalize to 0-1
        setAudioLevel(level);
        
        // Detect if speaking
        if (level > 0.1) {
          setIsSpeaking(true);
          
          // Reset speaking timeout
          if (speakingTimeoutRef.current) {
            window.clearTimeout(speakingTimeoutRef.current);
          }
          
          // Set timeout to turn off speaking indicator after 1 second of silence
          speakingTimeoutRef.current = window.setTimeout(() => {
            setIsSpeaking(false);
            speakingTimeoutRef.current = null;
          }, 1000);
        }
        
        // Clear any previous errors
        if (error) setError(null);
      } catch (err) {
        setError(`Audio monitoring error: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }, 100);
    
    return () => {
      clearInterval(monitorInterval);
      if (speakingTimeoutRef.current) {
        window.clearTimeout(speakingTimeoutRef.current);
      }
    };
  }, [isCapturing, error]);

  return (
    <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Audio Capture
        </Typography>
        
        {isCapturing && (
          <Chip 
            label={isSpeaking ? "Speaking" : "Listening"} 
            color={isSpeaking ? "success" : "primary"}
            size="small"
            sx={{ 
              fontWeight: 500,
              animation: isSpeaking ? 'pulse 1.5s infinite' : 'none',
              '@keyframes pulse': {
                '0%': { opacity: 0.7 },
                '50%': { opacity: 1 },
                '100%': { opacity: 0.7 }
              }
            }}
          />
        )}
      </Box>
      
      {error ? (
        <Typography color="error">{error}</Typography>
      ) : (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isConnected ? (
            <WaveformVisualizer 
              isCapturing={isCapturing} 
              height={150}
              width={400}
              barColor="gradient"
            />
          ) : (
            <Typography color="text.secondary">
              Not connected to server
            </Typography>
          )}
        </Box>
      )}
      
      {/* Audio level indicator */}
      <Box sx={{ 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 1,
        mt: 2
      }}>
        <Typography variant="caption" sx={{ whiteSpace: 'nowrap', fontSize: '0.7rem' }}>
          Audio level:
        </Typography>
        <Box sx={{ 
          flex: 1,
          height: '4px',
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <Box sx={{ 
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${audioLevel * 100}%`,
            backgroundColor: isSpeaking ? '#10B981' : '#7C3AED',
            borderRadius: '4px',
            transition: 'width 0.1s ease-out'
          }} />
        </Box>
      </Box>
      
      {/* Analysis notification */}
      <Snackbar 
        open={analysisNotification}
        autoHideDuration={3000}
        onClose={() => setAnalysisNotification(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          severity="info" 
          sx={{
            backgroundColor: 'rgba(41, 128, 185, 0.15)',
            color: '#2980b9',
            border: '1px solid rgba(41, 128, 185, 0.3)',
            py: 0.5,
            minHeight: 'auto'
          }}
        >
          Processing speech analysis...
        </Alert>
      </Snackbar>
      
      {/* Save error notification */}
      {saveError !== undefined && saveError !== null && (
        <Snackbar 
          open={saveError !== null}
          autoHideDuration={5000}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert 
            severity="error" 
            sx={{
              backgroundColor: 'rgba(211, 47, 47, 0.15)',
              color: '#f44336',
              border: '1px solid rgba(211, 47, 47, 0.3)',
              py: 0.5,
              minHeight: 'auto'
            }}
          >
            Failed to save recording
          </Alert>
        </Snackbar>
      )}
    </Paper>
  );
};

export default AudioCapture;
