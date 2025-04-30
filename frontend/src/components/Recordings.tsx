import { useState, useEffect } from 'react';
import { Paper, Typography, Box, List, ListItem, ListItemText, IconButton, Divider, Button, CircularProgress } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import { fetchRecordings, deleteRecording as apiDeleteRecording, Recording as DBRecording } from '../services/recordingsService';

interface RecordingsProps {
  isCapturing: boolean;
}

const Recordings: React.FC<RecordingsProps> = ({ isCapturing }) => {
  const [recordings, setRecordings] = useState<DBRecording[]>([]);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load recordings from API
  const loadRecordings = async () => {
    try {
      setLoading(true);
      console.log('Loading recordings...');
      const data = await fetchRecordings();
      console.log('Recordings loaded:', data);
      
      if (data && data.length > 0) {
        console.log('First recording details:', {
          id: data[0].id,
          file_name: data[0].file_name,
          public_url: data[0].public_url,
          duration: data[0].duration
        });
      } else {
        // This is not an error - it's normal to have no recordings at first
        console.log('No recordings returned from fetchRecordings - this is expected for new users');
      }
      
      setRecordings(data);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error in loadRecordings:', err);
      setError(`Failed to load recordings: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Load recordings on component mount and when capturing stops
  useEffect(() => {
    if (!isCapturing) {
      loadRecordings();
    }
  }, [isCapturing]);

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audio.addEventListener('ended', () => {
      setPlayingId(null);
    });
    setAudioElement(audio);

    return () => {
      if (audio) {
        audio.pause();
        audio.src = '';
      }
    };
  }, []);

  // Play recording
  const playRecording = (id: number, url: string) => {
    if (audioElement) {
      if (playingId === id) {
        audioElement.pause();
        setPlayingId(null);
      } else {
        console.log('Attempting to play recording URL:', url);
        
        try {
          // Make sure URL is valid
          if (!url) {
            throw new Error('Invalid recording URL');
          }
          
          // Fix Supabase URL if needed
          let validUrl = url;
          
          // Handle URL path issues
          if (url.includes('/public/public/')) {
            validUrl = url.replace('/public/public/', '/public/');
            console.log('Fixed duplicate public paths in URL for playback:', validUrl);
          }
          
          if (!validUrl.startsWith('http') && !validUrl.startsWith('blob:')) {
            // If it's not a full URL or blob URL, log an error
            console.error('Recording URL is not a valid URL:', validUrl);
            setError('Recording URL is invalid. Please check Supabase storage settings.');
            return;
          }
          
          console.log('Playing audio with URL:', validUrl);
          audioElement.src = validUrl;
          
          // Add error handling for audio playback
          const playPromise = audioElement.play();
          
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log('Audio playback started successfully');
                setPlayingId(id);
              })
              .catch(err => {
                console.error('Error during audio playback:', err);
                setError(`Playback error: ${err.message}`);
                setPlayingId(null);
              });
          }
        } catch (err) {
          console.error('Exception playing audio:', err);
          setError(`Could not play recording: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }
  };

  // Delete recording
  const deleteRecording = async (id: number) => {
    // Stop playback if this recording is playing
    if (playingId === id && audioElement) {
      audioElement.pause();
      setPlayingId(null);
    }

    try {
      const success = await apiDeleteRecording(id);
      if (success) {
        // Remove from state
        setRecordings(prev => prev.filter(rec => rec.id !== id));
      } else {
        setError("Failed to delete recording");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to delete recording");
    }
  };

  // Download recording
  const downloadRecording = (recording: DBRecording) => {
    try {
      console.log('Downloading recording:', recording.public_url);
      
      // Fix Supabase URL if needed (same as in playRecording)
      let downloadUrl = recording.public_url;
      
      // Handle URL path issues
      if (downloadUrl.includes('/public/public/')) {
        downloadUrl = downloadUrl.replace('/public/public/', '/public/');
        console.log('Fixed duplicate public paths in URL for download:', downloadUrl);
      }
      
      if (!downloadUrl.startsWith('http') && !downloadUrl.startsWith('blob:')) {
        // If it's not a valid URL, show error
        setError('Download URL is invalid. Please check Supabase storage settings.');
        return;
      }
      
      console.log('Using download URL:', downloadUrl);
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = recording.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error downloading recording:', err);
      setError(`Error downloading: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Format date string
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Format duration
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Recordings
        </Typography>
        {!isCapturing && (
          <Button 
            size="small" 
            onClick={loadRecordings}
            disabled={loading}
          >
            Refresh
          </Button>
        )}
      </Box>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
          <CircularProgress size={40} />
        </Box>
      ) : error ? (
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          textAlign: 'center',
          flexGrow: 1,
          p: 3
        }}>
          <Typography variant="body1" color="error" sx={{ mb: 2 }}>
            {error}
          </Typography>
          <Button variant="outlined" size="small" onClick={loadRecordings}>
            Try Again
          </Button>
        </Box>
      ) : recordings.length > 0 ? (
        <List sx={{ flexGrow: 1, overflowY: 'auto' }}>
          {recordings.map((recording, index) => (
            <Box key={recording.id}>
              <ListItem
                secondaryAction={
                  <Box>
                    <IconButton edge="end" aria-label="download" onClick={() => downloadRecording(recording)}>
                      <DownloadIcon />
                    </IconButton>
                    <IconButton edge="end" aria-label="delete" onClick={() => deleteRecording(recording.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                }
              >
                <IconButton 
                  edge="start" 
                  aria-label="play"
                  onClick={() => playRecording(recording.id, recording.public_url)}
                >
                  {playingId === recording.id ? <PauseIcon /> : <PlayArrowIcon />}
                </IconButton>
                <ListItemText
                  primary={recording.file_name}
                  secondary={
                    <>
                      {formatDate(recording.recorded_at)} • {formatDuration(recording.duration)}
                    </>
                  }
                  sx={{ ml: 1 }}
                />
              </ListItem>
              {index < recordings.length - 1 && <Divider />}
            </Box>
          ))}
        </List>
      ) : (
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          textAlign: 'center',
          flexGrow: 1,
          p: 3
        }}>
          <Typography variant="body1" sx={{ mb: 2 }}>
            No recordings yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isCapturing 
              ? "Your recording will be saved here when you stop capturing"
              : "Click 'Start Capture' to begin recording your voice"}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default Recordings; 