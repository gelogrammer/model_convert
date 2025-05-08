import { useEffect, useRef, useState } from 'react';
import { Typography, Box, Chip, Snackbar, Alert, Button } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { initializeAudioCapture, startAudioCapture, stopAudioCapture, cleanupAudio, getAudioVisualizationData, updateAudioSettings } from '../services/audioService';
import { saveRecordingToDatabase } from '../services/recordingsService';

interface AudioCaptureProps {
  isCapturing: boolean;
  isConnected: boolean;
  confidenceThreshold?: number;
  useSmoothing?: boolean;
}

const AudioCapture: React.FC<AudioCaptureProps> = ({ 
  isCapturing, 
  isConnected, 
  confidenceThreshold = 0.4,
  useSmoothing = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakingTimeoutRef = useRef<number | null>(null);
  const [analysisNotification, setAnalysisNotification] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Initialize audio capture only when connected
  useEffect(() => {
    const initialize = async () => {
      try {
        if (isConnected) {
          // Only initialize if we're actually capturing
          if (isCapturing) {
            const success = await initializeAudioCapture();
            setIsInitialized(success);
            
            if (!success) {
              setError('Failed to initialize audio capture. Please check your microphone permissions.');
            } else {
              setError(null);
              // Pass initial settings
              updateAudioSettings({ confidenceThreshold, useSmoothing });
            }
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
  }, [isConnected, isCapturing, confidenceThreshold, useSmoothing]);

  // Update settings when they change
  useEffect(() => {
    if (isInitialized) {
      updateAudioSettings({ confidenceThreshold, useSmoothing });
    }
  }, [isInitialized, confidenceThreshold, useSmoothing]);

  // Start/stop audio capture
  useEffect(() => {
    if (isInitialized) {
      if (isCapturing) {
        startAudioCapture();
        startVisualization();
      } else {
        stopAudioCapture().then(() => {
          stopVisualization();
          setIsSpeaking(false);
          setAudioLevel(0);
          // Show the analysis notification when stopping capture
          setAnalysisNotification(true);
          
          // Auto-save the recording
          saveRecording();
        });
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
      
      // Clear canvas with dark background
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw visualization only when actively capturing
      if (isCapturing) {
        const barWidth = (canvas.width / dataArray.length) * 2.5;
        let x = 0;
        
        for (let i = 0; i < dataArray.length; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          
          // Create a gradient effect with colors that work well on dark background
          const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
          
          // Use themed colors
          const hue = i / dataArray.length * 360;
          const saturation = 80; 
          const lightness = 65;
          
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
      }
      
      if (isCapturing) {
        animationRef.current = requestAnimationFrame(draw);
      }
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
        ctx.fillStyle = '#1E293B'; // Dark theme background
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  };

  // Save the recording
  const saveRecording = async () => {
    if (isSaving) return;
    
    setIsSaving(true);
    try {
      console.log('Attempting to save recording...');
      let attempts = 0;
      let success = false;
      const maxAttempts = 3;
      
      while (!success && attempts < maxAttempts) {
        attempts++;
        try {
          console.log(`Save attempt ${attempts}/${maxAttempts}`);
          const result = await saveRecordingToDatabase({});
          success = result.success;
          
          if (success) {
            console.log('Successfully saved recording');
            break;
          } else {
            console.warn(`Save attempt ${attempts} failed, ${maxAttempts - attempts} attempts remaining`);
            // Wait a short time before retry
            if (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
            }
          }
        } catch (retryErr) {
          console.error(`Error during save attempt ${attempts}:`, retryErr);
          // Continue to next attempt
        }
      }
      
      if (!success) {
        console.error(`Failed to save recording after ${maxAttempts} attempts`);
        setSaveError(true);
      }
    } catch (err) {
      console.error('Error in saveRecording function:', err);
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: { xs: 1, md: 2 } }}>
        <Typography variant="h6" sx={{ fontSize: { xs: '1rem', md: '1.1rem' } }}>
          Audio Capture
        </Typography>
        
        {isCapturing && (
          <Chip 
            label={isSpeaking ? "Speaking" : "Listening"} 
            color={isSpeaking ? "success" : "primary"}
            size="small"
            sx={{ 
              fontWeight: 500,
              fontSize: { xs: '0.65rem', md: '0.75rem' },
              height: { xs: 22, md: 24 },
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
        <Typography color="error" sx={{ fontSize: { xs: '0.8rem', md: '0.9rem' } }}>{error}</Typography>
      ) : (
        <>
          {!isCapturing ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', 
                       textAlign: 'center', flexDirection: 'column' }}>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Click Start Capturing to begin
              </Typography>
              <canvas 
                ref={canvasRef}
                width={500}
                height={200}
                style={{ 
                  width: '100%', 
                  height: '100%',
                  maxHeight: '200px',
                  borderRadius: '12px',
                  backgroundColor: '#1E293B',
                  opacity: 0.5
                }}
              />
            </Box>
          ) : (
            <Box sx={{ position: 'relative', height: '100%', flexGrow: 1 }}>
              <canvas 
                ref={canvasRef}
                width={500}
                height={200}
                style={{ 
                  width: '100%', 
                  height: '100%',
                  maxHeight: '200px',
                  borderRadius: '12px',
                  backgroundColor: '#1E293B'
                }}
              />
              {/* Audio level indicator */}
              <Box sx={{ 
                position: 'absolute', 
                bottom: '-30px', 
                left: 0, 
                right: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 1
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
            </Box>
          )}
        </>
      )}
      
      {!isCapturing && saveError && (
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
            onClick={saveRecording}
            disabled={isSaving}
            sx={{ mt: 2 }}
          >
            {isSaving ? 'Saving...' : 'Save Recording'}
          </Button>
        </Box>
      )}
      
      {/* Analysis notification */}
      <Snackbar
        open={analysisNotification}
        autoHideDuration={3000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        onClose={() => setAnalysisNotification(false)}
      >
        <Alert 
          onClose={() => setAnalysisNotification(false)} 
          severity="info" 
          variant="filled"
          sx={{ width: '100%' }}
        >
          Audio analysis complete. Check Recordings to view results.
        </Alert>
      </Snackbar>
      
      {/* Save Error Notification */}
      <Snackbar 
        open={saveError} 
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        autoHideDuration={5000}
        onClose={() => setSaveError(false)}
      >
        <Alert 
          severity="warning" 
          variant="filled"
          sx={{ width: '100%' }}
        >
          Failed to save recording automatically.
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AudioCapture;
