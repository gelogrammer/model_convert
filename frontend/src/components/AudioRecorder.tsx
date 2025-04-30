import { useState, useRef, useEffect } from 'react';
import { Button, Box, CircularProgress, Typography, Snackbar, Alert } from '@mui/material';
import { MicIcon, StopIcon, FileUploadIcon } from '../mui-icon-fallbacks';
import { uploadRecording, RecordingMetadata } from '../services/supabaseService';

interface AudioRecorderProps {
  onRecordingStart?: () => void;
  onRecordingStop?: (blob: Blob, options?: { confidenceThreshold?: number, useSmoothing?: boolean }) => void;
  emotionResult?: any;
  confidenceThreshold?: number;
  useSmoothing?: boolean;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ 
  onRecordingStart, 
  onRecordingStop,
  emotionResult,
  confidenceThreshold = 0.4,
  useSmoothing = true
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Start recording function
  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordingBlob(audioBlob);
        setRecordingDuration(Date.now() - startTimeRef.current);
        
        // Stop all tracks in the stream
        stream.getTracks().forEach(track => track.stop());
        
        if (onRecordingStop) {
          onRecordingStop(audioBlob, { confidenceThreshold, useSmoothing });
        }
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      startTimeRef.current = Date.now();
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
      if (onRecordingStart) {
        onRecordingStart();
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      setErrorMessage('Could not access microphone. Please check permissions.');
      setShowError(true);
    }
  };

  // Stop recording function
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Upload recording to Supabase
  const handleUpload = async () => {
    if (!recordingBlob) {
      setErrorMessage('No recording to upload');
      setShowError(true);
      return;
    }
    
    setIsUploading(true);
    setErrorMessage(null);
    
    try {
      console.log('Starting upload process...');
      console.log('Recording blob size:', recordingBlob.size);
      console.log('Recording blob type:', recordingBlob.type);
      
      const fileName = `recording_${Date.now()}.webm`;
      
      // Prepare metadata with emotion data if available
      const metadata: RecordingMetadata = {
        duration: recordingDuration,
        emotionData: emotionResult || {},
        settings: {
          confidenceThreshold,
          useSmoothing
        }
      };
      
      console.log('Uploading with metadata:', metadata);
      
      const { data, error } = await uploadRecording(recordingBlob, fileName, metadata);
      
      if (error) {
        console.error('Upload error details:', error);
        
        // More specific error messages
        let message = 'Failed to upload recording';
        
        if (error.message) {
          if (error.message.includes('storage bucket')) {
            message = 'Storage bucket error: The recordings storage may not be configured correctly';
          } else if (error.message.includes('Database insert failed')) {
            message = 'Database error: Could not save recording metadata to database';
          } else if (error.message.includes('violates row-level security policy')) {
            message = 'Security policy error: You may not have permission to upload recordings';
          } else {
            message = `Error: ${error.message}`;
          }
        }
        
        setErrorMessage(message);
        setShowError(true);
      } else {
        console.log('Upload successful:', data);
        // Reset recording state
        setRecordingBlob(null);
        setRecordingTime(0);
      }
    } catch (error: any) {
      console.error('Error in upload process:', error);
      setErrorMessage(`Upload error: ${error.message || 'Unknown error'}`);
      setShowError(true);
    } finally {
      setIsUploading(false);
    }
  };

  // Format time for display (MM:SS)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording]);

  const handleErrorClose = () => {
    setShowError(false);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {isRecording ? (
        <Typography variant="h6" color="error">
          Recording: {formatTime(recordingTime)}
        </Typography>
      ) : recordingBlob ? (
        <Typography variant="h6">
          Recording ready: {formatTime(Math.floor(recordingDuration / 1000))}
        </Typography>
      ) : (
        <Typography variant="h6">
          Ready to record
        </Typography>
      )}
      
      <Box sx={{ display: 'flex', gap: 2 }}>
        {!isRecording ? (
          <Button
            variant="contained"
            color="primary"
            startIcon={<MicIcon />}
            onClick={startRecording}
            disabled={isUploading}
          >
            Start Recording
          </Button>
        ) : (
          <Button
            variant="contained"
            color="error"
            startIcon={<StopIcon />}
            onClick={stopRecording}
          >
            Stop Recording
          </Button>
        )}
        
        {recordingBlob && !isRecording && (
          <Button
            variant="contained"
            color="success"
            startIcon={isUploading ? <CircularProgress size={20} color="inherit" /> : <FileUploadIcon />}
            onClick={handleUpload}
            disabled={isUploading}
          >
            {isUploading ? 'Uploading...' : 'Save Recording'}
          </Button>
        )}
      </Box>
      
      <Snackbar open={showError} autoHideDuration={6000} onClose={handleErrorClose}>
        <Alert onClose={handleErrorClose} severity="error" sx={{ width: '100%' }}>
          {errorMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AudioRecorder; 