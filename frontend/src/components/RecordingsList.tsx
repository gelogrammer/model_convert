import { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Card,
  CardContent,
  CardActions,
  Chip,
  CircularProgress,
  IconButton
} from '@mui/material';

// Import fallback icons
import { PlayArrowIcon, PauseIcon, DeleteIcon } from '../mui-icon-fallbacks';
import { getRecordings, deleteRecording } from '../services/supabaseService';

interface Recording {
  id: number;
  file_name: string;
  file_path: string;
  public_url: string;
  duration: number;
  recorded_at: string;
  emotion_data: any;
}

// Custom time ago formatter (replacing date-fns)
const formatTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return `${diffSec} seconds`;
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''}`;
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''}`;
  if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''}`;
  
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} month${diffMonth !== 1 ? 's' : ''}`;
  
  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear} year${diffYear !== 1 ? 's' : ''}`;
};

const RecordingsList = () => {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<number | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  
  // Load recordings on component mount
  useEffect(() => {
    loadRecordings();
  }, []);
  
  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
      }
    };
  }, [audioElement]);
  
  // Load recordings from Supabase
  const loadRecordings = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await getRecordings();
      
      if (error) {
        console.error('Error fetching recordings:', error);
      } else if (data) {
        setRecordings(data);
      }
    } catch (error) {
      console.error('Failed to load recordings:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle play/pause of recording
  const togglePlayback = (recordingId: number, url: string) => {
    // If we already have an audio element playing, stop it
    if (audioElement) {
      audioElement.pause();
    }
    
    // If we're clicking on the currently playing recording, pause it
    if (currentlyPlaying === recordingId) {
      setCurrentlyPlaying(null);
      return;
    }
    
    // Otherwise, play the new recording
    const audio = new Audio(url);
    audio.addEventListener('ended', () => {
      setCurrentlyPlaying(null);
    });
    
    audio.play();
    setAudioElement(audio);
    setCurrentlyPlaying(recordingId);
  };
  
  // Format recording duration
  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Delete a recording
  const handleDelete = async (id: number, filePath: string) => {
    if (!window.confirm('Are you sure you want to delete this recording?')) {
      return;
    }
    
    try {
      const { error } = await deleteRecording(id, filePath);
      
      if (error) {
        console.error('Error deleting recording:', error);
        alert('Failed to delete recording');
      } else {
        // Remove from local state
        setRecordings(recordings.filter(r => r.id !== id));
        
        // If this was playing, stop it
        if (currentlyPlaying === id && audioElement) {
          audioElement.pause();
          setCurrentlyPlaying(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete recording:', error);
      alert('An error occurred while deleting');
    }
  };
  
  // Get the primary emotion from emotion data
  const getPrimaryEmotion = (emotionData: any) => {
    if (!emotionData) return 'Unknown';
    return emotionData.emotion || 'Unknown';
  };
  
  // Get the emotion confidence
  const getEmotionConfidence = (emotionData: any) => {
    if (!emotionData || !emotionData.confidence) return 0;
    return Math.round(emotionData.confidence * 100);
  };
  
  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Your Recordings
      </Typography>
      
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : recordings.length === 0 ? (
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
          No recordings found. Start capturing to create some!
        </Typography>
      ) : (
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
          gap: 2, 
          mt: 1 
        }}>
          {recordings.map((recording) => (
            <Card key={recording.id}>
              <CardContent>
                <Typography variant="subtitle1" component="div">
                  {recording.file_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatTimeAgo(new Date(recording.recorded_at))} ago
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Duration: {formatDuration(recording.duration)}
                </Typography>
                
                {recording.emotion_data && (
                  <Box sx={{ mt: 1 }}>
                    <Chip 
                      size="small" 
                      label={`${getPrimaryEmotion(recording.emotion_data)} ${getEmotionConfidence(recording.emotion_data)}%`}
                      color="primary"
                    />
                  </Box>
                )}
              </CardContent>
              <CardActions>
                <IconButton 
                  onClick={() => togglePlayback(recording.id, recording.public_url)} 
                  color={currentlyPlaying === recording.id ? "primary" : "default"}
                >
                  {currentlyPlaying === recording.id ? <PauseIcon /> : <PlayArrowIcon />}
                </IconButton>
                <IconButton 
                  onClick={() => handleDelete(recording.id, recording.file_path)} 
                  color="error"
                >
                  <DeleteIcon />
                </IconButton>
              </CardActions>
            </Card>
          ))}
        </Box>
      )}
    </Paper>
  );
};

export default RecordingsList; 