import { useEffect, useRef, useState } from 'react';
import { Paper, Typography, Box, CircularProgress, Chip } from '@mui/material';
import { initializeAudioCapture, startAudioCapture, stopAudioCapture, cleanupAudio, getAudioVisualizationData } from '../services/audioService';

interface AudioCaptureProps {
  isCapturing: boolean;
  isConnected: boolean;
}

const AudioCapture: React.FC<AudioCaptureProps> = ({ isCapturing, isConnected }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakingTimeoutRef = useRef<number | null>(null);

  // Initialize audio capture
  useEffect(() => {
    const initialize = async () => {
      try {
        if (isConnected) {
          const success = await initializeAudioCapture();
          setIsInitialized(success);
          
          if (!success) {
            setError('Failed to initialize audio capture. Please check your microphone permissions.');
          } else {
            setError(null);
          }
        }
      } catch (err) {
        console.error('Error initializing audio capture:', err);
        setError('Error initializing audio capture. Please check your microphone permissions.');
      }
    };

    initialize();

    // Cleanup
    return () => {
      cleanupAudio();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (speakingTimeoutRef.current) {
        window.clearTimeout(speakingTimeoutRef.current);
      }
    };
  }, [isConnected]);

  // Start/stop audio capture
  useEffect(() => {
    if (isInitialized) {
      if (isCapturing) {
        startAudioCapture();
        startVisualization();
      } else {
        stopAudioCapture();
        stopVisualization();
        setIsSpeaking(false);
        setAudioLevel(0);
      }
    }
  }, [isCapturing, isInitialized]);

  // Start visualization
  const startVisualization = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    const draw = () => {
      const dataArray = getAudioVisualizationData();
      
      if (!dataArray) return;
      
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
      
      // Clear canvas
      ctx.fillStyle = '#f7f9fc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw visualization
      const barWidth = (canvas.width / dataArray.length) * 2.5;
      let x = 0;
      
      for (let i = 0; i < dataArray.length; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        
        // Use gradient based on frequency
        const hue = i / dataArray.length * 360;
        const saturation = 80; // More vibrant colors
        const lightness = 65; // Brighter colors
        
        // Create a gradient effect
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
        gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.8)`);
        gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness + 10}%, 0.6)`);
        
        ctx.fillStyle = gradient;
        
        // Draw rounded top bars
        const barWidthActual = barWidth - 1;
        const radius = barWidthActual / 2;
        
        ctx.beginPath();
        ctx.moveTo(x + radius, canvas.height - barHeight);
        ctx.lineTo(x + barWidthActual - radius, canvas.height - barHeight);
        ctx.quadraticCurveTo(x + barWidthActual, canvas.height - barHeight, x + barWidthActual, canvas.height - barHeight + radius);
        ctx.lineTo(x + barWidthActual, canvas.height);
        ctx.lineTo(x, canvas.height);
        ctx.lineTo(x, canvas.height - barHeight + radius);
        ctx.quadraticCurveTo(x, canvas.height - barHeight, x + radius, canvas.height - barHeight);
        ctx.closePath();
        ctx.fill();
        
        x += barWidth + 1;
      }
      
      animationRef.current = requestAnimationFrame(draw);
    };
    
    draw();
  };

  // Stop visualization
  const stopVisualization = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f7f9fc';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  };

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
        <>
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2 
          }}>
            <Typography variant="body2">
              {isCapturing ? (isSpeaking ? 'Speech detected' : 'No speech detected') : 'Click Start Capturing to begin'}
            </Typography>
            
            {isCapturing && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: isSpeaking ? 'success.main' : '#aaa',
                  boxShadow: isSpeaking ? '0 0 10px rgba(76, 175, 80, 0.5)' : 'none',
                  animation: isSpeaking ? 'blink 1s infinite' : 'none',
                  '@keyframes blink': {
                    '0%': { opacity: 0.5 },
                    '50%': { opacity: 1 },
                    '100%': { opacity: 0.5 }
                  }
                }} />
                <Typography variant="body2" color={isSpeaking ? 'success.main' : 'text.secondary'} fontWeight={isSpeaking ? 500 : 400}>
                  {isSpeaking ? 'Live' : 'Idle'}
                </Typography>
              </Box>
            )}
          </Box>
          
          <Box sx={{ 
            mt: 2, 
            bgcolor: '#f7f9fc', 
            borderRadius: '12px', 
            overflow: 'hidden',
            position: 'relative',
            border: isCapturing ? '1px solid rgba(63, 81, 181, 0.2)' : '1px solid rgba(0, 0, 0, 0.08)',
            boxShadow: isCapturing ? 'inset 0 2px 4px rgba(0, 0, 0, 0.05)' : 'none',
            flexGrow: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <canvas 
              ref={canvasRef} 
              width={500} 
              height={200} 
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
            
            {!isCapturing && !isInitialized && (
              <Box sx={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0, 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                bgcolor: 'rgba(255, 255, 255, 0.7)' 
              }}>
                <CircularProgress size={40} color="primary" />
              </Box>
            )}
          </Box>
          
          {/* Audio level indicator */}
          {isCapturing && (
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ minWidth: 65 }} color="text.secondary">
                Audio level:
              </Typography>
              <Box sx={{ 
                flex: 1,
                height: 8, 
                bgcolor: 'rgba(0, 0, 0, 0.08)',
                borderRadius: 4,
                overflow: 'hidden'
              }}>
                <Box sx={{ 
                  height: '100%', 
                  width: `${audioLevel * 100}%`, 
                  bgcolor: isSpeaking ? 'success.main' : 'primary.main',
                  transition: 'width 0.1s ease-out', 
                  borderRadius: 4,
                  background: isSpeaking 
                    ? 'linear-gradient(90deg, #4caf50 0%, #8bc34a 100%)' 
                    : 'linear-gradient(90deg, #3f51b5 0%, #2196f3 100%)'
                }} />
              </Box>
            </Box>
          )}
        </>
      )}
    </Paper>
  );
};

export default AudioCapture;
