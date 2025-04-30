import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';

interface AudioPlayerProps {
  audioUrl: string;
  fileName: string;
  recordingDate: string;
  duration: number;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  fileName,
  recordingDate,
  duration
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Initialize audio element
  useEffect(() => {
    const audio = new Audio(audioUrl);
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
    });
    audioRef.current = audio;
    
    return () => {
      if (audio) {
        audio.pause();
        audio.src = '';
      }
    };
  }, [audioUrl]);
  
  // Handle play/pause
  const togglePlayback = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(err => {
        console.error('Error playing audio:', err);
      });
      setIsPlaying(true);
    }
  };
  
  // Format date for player header
  const formatPlayerDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Format duration
  const formatPlayerDuration = (ms: number): string => {
    if (!ms || isNaN(ms)) return '0:00';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <Box sx={{
      bgcolor: '#1E293B',
      borderRadius: '8px',
      overflow: 'hidden',
      width: '100%'
    }}>
      <Box sx={{ 
        p: 2, 
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Typography variant="h6" sx={{ fontSize: '1rem', color: 'white' }}>
          {fileName}
        </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
          {formatPlayerDate(recordingDate)} • {formatPlayerDuration(duration)}
        </Typography>
      </Box>
      
      <Box sx={{ 
        p: 2, 
        display: 'flex', 
        justifyContent: 'center',
        bgcolor: 'rgba(0,0,0,0.2)'
      }}>
        <IconButton 
          onClick={togglePlayback}
          sx={{ 
            bgcolor: isPlaying ? 'primary.main' : 'rgba(255,255,255,0.1)',
            color: 'white',
            '&:hover': {
              bgcolor: isPlaying ? 'primary.dark' : 'rgba(255,255,255,0.2)'
            }
          }}
        >
          {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
      </Box>
    </Box>
  );
};

export default AudioPlayer; 