import { useState, useEffect, useRef } from 'react';
import { Paper, Typography, Box, List, ListItem, ListItemText, IconButton, Divider, Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, alpha, Chip, Tooltip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SettingsIcon from '@mui/icons-material/Settings';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import { fetchRecordings, deleteRecording as apiDeleteRecording, Recording as DBRecording, convertAudioForBrowserPlayback } from '../services/recordingsService';
import { AudioAnalysisResult } from '../services/audioService';
import { testSupabaseConnection, saveViewAnalysis } from '../services/supabaseService';

interface RecordingsProps {
  isCapturing: boolean;
  recordingToAnalyze?: number | string | null;
  onAnalysisComplete?: (id: number | string) => void;
}

const Recordings: React.FC<RecordingsProps> = ({ isCapturing, recordingToAnalyze, onAnalysisComplete }) => {
  const [recordings, setRecordings] = useState<DBRecording[]>([]);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [recordingToDelete, setRecordingToDelete] = useState<number | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<AudioAnalysisResult | null>(null);
  const [selectedRecordingName, setSelectedRecordingName] = useState<string>('');
  const [hasBackendIssues, setHasBackendIssues] = useState(false);
  const [webAudioContext, setWebAudioContext] = useState<AudioContext | null>(null);
  const webAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [analyzingRecordingId, setAnalyzingRecordingId] = useState<number | null>(null);
  
  // Add states for connection testing
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{connected: boolean, message: string} | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  
  // Test Supabase connection
  const checkSupabaseConnection = async () => {
    setTestingConnection(true);
    try {
      const status = await testSupabaseConnection();
      setConnectionStatus(status);
      setHasBackendIssues(!status.connected);
    } catch (error) {
      console.error('Error testing connection:', error);
      setConnectionStatus({
        connected: false,
        message: 'Error testing connection'
      });
      setHasBackendIssues(true);
    } finally {
      setTestingConnection(false);
    }
  };

  // Load recordings from API
  const loadRecordings = async () => {
    try {
      setLoading(true);
      console.log('Loading recordings...');
      
      // Check for known backend connectivity issues
      const supabaseError = localStorage.getItem('supabase_connectivity_issue');
      const currentTime = Date.now();
      const errorTime = supabaseError ? parseInt(supabaseError, 10) : 0;
      
      // If there was a recent error (within last 5 minutes), show fallback right away
      if (supabaseError && (currentTime - errorTime) < 5 * 60 * 1000) {
        console.log('Recent Supabase connectivity issues detected, using localStorage fallback');
        setHasBackendIssues(true);
      }
      
      const data = await fetchRecordings();
      console.log('Recordings loaded:', data);
      
      if (data && data.length > 0) {
        console.log('First recording details:', {
          id: data[0].id,
          file_name: data[0].file_name,
          public_url: data[0].public_url,
          duration: data[0].duration
        });
        
        // Process local storage recordings to ensure blob URLs are valid
        const processedData = data.map(processLocalStorageRecording);
        setRecordings(processedData);
      } else {
        // This is not an error - it's normal to have no recordings at first
        console.log('No recordings returned from fetchRecordings - this is expected for new users');
        setRecordings([]);
      }
      
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error in loadRecordings:', err);
      
      // Check if it's a backend connectivity issue
      if (errorMessage.includes('Failed to fetch') || 
          errorMessage.includes('Network error') ||
          errorMessage.includes('storage bucket') ||
          errorMessage.includes('Bucket not found')) {
        setHasBackendIssues(true);
        localStorage.setItem('supabase_connectivity_issue', Date.now().toString());
      }
      
      setError(`Failed to load recordings: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Process localStorage recordings to ensure URLs are valid
  const processLocalStorageRecording = (recording: DBRecording): DBRecording => {
    // If this is not a blob URL (e.g., from Supabase), return as is
    if (!recording.public_url.startsWith('blob:')) {
      return recording;
    }
    
    try {
      // Try to verify the blob URL is still valid
      fetch(recording.public_url, { method: 'HEAD' })
        .catch(() => {
          console.log('Blob URL expired, attempting to recover for recording:', recording.id);
          
          // Check if we have blob data stored
          if (recording.emotion_data && recording.emotion_data._blob && recording.emotion_data._blobType) {
            try {
              // Convert base64 string back to blob
              const binaryString = atob(recording.emotion_data._blob);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              // Create a new blob
              const blob = new Blob([bytes.buffer], { type: recording.emotion_data._blobType });
              
              // Create a new blob URL
              const newUrl = URL.createObjectURL(blob);
              console.log('Successfully recovered blob URL for recording:', recording.id);
              
              // Update the recording's URL in state
              setRecordings(prev => 
                prev.map(rec => 
                  rec.id === recording.id 
                    ? { ...rec, public_url: newUrl } 
                    : rec
                )
              );
            } catch (err) {
              console.error('Failed to recover blob for recording:', recording.id, err);
            }
          }
        });
    } catch (err) {
      // Ignore errors - we'll handle URL recovery during playback
    }
    
    return recording;
  };

  // Load recordings on component mount and when capturing stops
  useEffect(() => {
    if (!isCapturing) {
      loadRecordings();
    }
  }, [isCapturing]);

  // Watch for changes to recordingToAnalyze prop and trigger analysis
  useEffect(() => {
    const analyzeRecordingById = async () => {
      if (recordingToAnalyze && !isCapturing && recordings.length > 0) {
        console.log(`Attempting to analyze recording with ID: ${recordingToAnalyze}`);
        
        // Find the recording by ID (which could be a number or string)
        const recordingToProcess = recordings.find(rec => 
          rec.id === recordingToAnalyze || 
          rec.id === Number(recordingToAnalyze) || 
          String(rec.id) === String(recordingToAnalyze)
        );
        
        if (recordingToProcess) {
          console.log(`Found recording to analyze: ${recordingToProcess.file_name}`);
          await analyzeRecording(recordingToProcess);
          
          // Notify that analysis is complete
          if (onAnalysisComplete) {
            onAnalysisComplete(recordingToProcess.id);
          }
        } else {
          console.log(`Recording with ID ${recordingToAnalyze} not found. Available recordings:`, 
            recordings.map(r => ({ id: r.id, name: r.file_name })));
            
          // Load recordings and try again once
          console.log('Loading recordings to try finding the recording again...');
          await loadRecordings();
        }
      }
    };
    
    analyzeRecordingById();
  }, [recordingToAnalyze, recordings, isCapturing, onAnalysisComplete]);

  // Listen for custom event to show latest recording analysis
  useEffect(() => {
    // Handler function to process the event
    const handleShowLatestAnalysis = async () => {
      console.log('Received event to show latest recording analysis');
      
      try {
        // Reload recordings first to ensure we have the latest
        console.log('Loading latest recordings for analysis...');
        await loadRecordings();
        
        // Wait a moment to make sure state is updated
        setTimeout(async () => {
          // Get the most recent recording (should be at index 0)
          if (recordings && recordings.length > 0) {
            const latestRecording = recordings[0];
            console.log('Found latest recording for analysis:', latestRecording.id, latestRecording.file_name);
            
            // Analyze the latest recording with the model
            await analyzeRecording(latestRecording);
          } else {
            console.log('No recordings available to show analysis');
            // Try once more after a longer delay
            setTimeout(async () => {
              console.log('Retrying to find recordings after longer delay');
              await loadRecordings();
              
              if (recordings && recordings.length > 0) {
                const latestRecording = recordings[0];
                console.log('Found latest recording on second attempt:', latestRecording.id);
                await analyzeRecording(latestRecording);
              } else {
                console.log('Still no recordings found after retry');
              }
            }, 2000);
          }
        }, 1000); // Increased from 500ms to 1000ms for better reliability
      } catch (error) {
        console.error('Error handling latest recording analysis:', error);
      }
    };
    
    // Add event listener
    document.addEventListener('showLatestRecordingAnalysis', handleShowLatestAnalysis);
    
    // Clean up the event listener when component unmounts
    return () => {
      document.removeEventListener('showLatestRecordingAnalysis', handleShowLatestAnalysis);
    };
  }, [recordings]); // Include recordings in dependencies

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

  // Play with WebAudio API as fallback (handles more formats)
  const playWithWebAudio = async (blob: Blob, id: number) => {
    try {
      // Create audio context if it doesn't exist
      if (!webAudioContext) {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        setWebAudioContext(audioCtx);
      }
      
      const ctx = webAudioContext || new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Stop any currently playing audio
      if (webAudioSourceRef.current) {
        try {
          webAudioSourceRef.current.stop();
        } catch (err) {
          // Ignore errors from stopping already stopped sources
        }
      }
      
      // Check blob type and ensure it's supported
      console.log('Attempting to play blob of type:', blob.type, 'size:', blob.size);
      
      // Convert blob to array buffer
      const arrayBuffer = await blob.arrayBuffer();
      
      console.log('Decoding audio data with WebAudio API...');
      
      try {
        // Try to decode the audio data
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer).catch(err => {
          console.error('Initial decodeAudioData failed:', err);
          throw err;
        });
        
        // Create audio source node
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        
        // Store reference to stop it later
        webAudioSourceRef.current = source;
        
        // Set up ended callback
        source.onended = () => {
          setPlayingId(null);
          webAudioSourceRef.current = null;
        };
        
        // Start playback
        source.start();
        setPlayingId(id);
        console.log('WebAudio playback started successfully');
        
        return true;
      } catch (decodeErr) {
        console.error('Failed to decode audio data:', decodeErr);
        
        // Try different format conversions based on browser capabilities
        let formatAttempts = [];
        
        // If WebM fails, try different formats
        if (blob.type.includes('webm')) {
          formatAttempts.push({
            type: 'audio/wav',
            name: 'WAV'
          });
          formatAttempts.push({
            type: 'audio/mp3',
            name: 'MP3'
          });
        } else if (blob.type.includes('wav')) {
          formatAttempts.push({
            type: 'audio/mp3',
            name: 'MP3'
          });
          formatAttempts.push({
            type: 'audio/webm',
            name: 'WebM'
          });
        } else {
          formatAttempts.push({
            type: 'audio/wav',
            name: 'WAV'
          });
          formatAttempts.push({
            type: 'audio/webm; codecs=opus',
            name: 'WebM with Opus'
          });
        }
        
        // Try each format in sequence
        for (const format of formatAttempts) {
          try {
            console.log(`Trying to convert to ${format.name} format for better compatibility`);
            
            // Create a new blob with different format
            const convertedBlob = new Blob([arrayBuffer], { type: format.type });
            
            // Try to decode with new format
            const wavBuffer = await convertedBlob.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(wavBuffer);
            
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            
            webAudioSourceRef.current = source;
            source.onended = () => {
              setPlayingId(null);
              webAudioSourceRef.current = null;
            };
            
            source.start();
            setPlayingId(id);
            console.log(`${format.name} conversion playback succeeded`);
            
            return true;
          } catch (convErr) {
            console.error(`${format.name} conversion failed:`, convErr);
            // Continue to next format
          }
        }
        
        // If we got here, all format attempts failed
        throw new Error('Failed to play audio after multiple format attempts');
      }
    } catch (err) {
      console.error('WebAudio playback failed after all attempts:', err);
      return false;
    }
  };

  // Play recording
  const playRecording = async (id: number, url: string) => {
    if (audioElement) {
      if (playingId === id) {
        // Stop playback if already playing
        audioElement.pause();
        
        // Also stop WebAudio playback if active
        if (webAudioSourceRef.current) {
          try {
            webAudioSourceRef.current.stop();
            webAudioSourceRef.current = null;
          } catch (err) {
            // Ignore errors from stopping already stopped sources
          }
        }
        
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
          
          // Find the recording for mime type information
          const recording = recordings.find(rec => rec.id === id);
          const mimeType = recording?.mime_type;
          
          // Convert audio for better browser compatibility
          const playableUrl = await convertAudioForBrowserPlayback(validUrl);
          console.log('Got browser-compatible URL:', playableUrl);
          
          // Check for blob URLs from localStorage
          const isBlobUrl = playableUrl.startsWith('blob:');
          
          // Check if the URL is valid
          if (!playableUrl.startsWith('http') && !isBlobUrl) {
            console.error('Recording URL is not a valid URL:', playableUrl);
            setError('Recording URL is invalid. Please check storage settings.');
            return;
          }
          
          console.log('Playing audio with URL:', playableUrl, 'MIME type:', mimeType);

          // For blob URLs from localStorage or converted URLs, play directly
          if (isBlobUrl) {
            // Use standard audio element first
            try {
              audioElement.src = playableUrl;
              
              // Clean up blob URL when done
              audioElement.addEventListener('ended', () => {
                if (playableUrl !== validUrl) { // Only revoke if we created a new one
                  URL.revokeObjectURL(playableUrl);
                }
              }, { once: true });
              
              const playPromise = audioElement.play();
              
              if (playPromise !== undefined) {
                playPromise
                  .then(() => {
                    console.log('Audio playback started successfully');
                    setPlayingId(id);
                  })
                  .catch((err) => {
                    console.error('Standard audio playback failed:', err);
                    // Try with WebAudio API if standard playback fails
                    fetch(playableUrl)
                      .then(response => response.blob())
                      .then(blob => playWithWebAudio(blob, id))
                      .catch(() => {
                        setError('The audio format is not supported by your browser or the recording is corrupted.');
                      });
                  });
              }
            } catch (err) {
              console.error('Error setting up audio element:', err);
              setError('Failed to play recording. Please try again.');
            }
          } else {
            // Regular HTTP URL
            audioElement.src = playableUrl;
            
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
                  
                  // Try to fetch and convert the audio file
                  console.log('Standard playback failed, trying to fetch and convert');
                  
                  fetch(validUrl)
                    .then(response => {
                      if (!response.ok) {
                        throw new Error(`Server returned ${response.status}`);
                      }
                      return response.blob();
                    })
                    .then(async blob => {
                      // Try to convert the audio format for better compatibility
                      const compatibleUrl = URL.createObjectURL(blob);
                      audioElement.src = compatibleUrl;
                      
                      try {
                        await audioElement.play();
                        console.log('Successfully playing after conversion');
                        setPlayingId(id);
                      } catch (playErr) {
                        console.error('Play failed even after conversion:', playErr);
                        setError('The audio format is not supported by your browser.');
                        
                        // Last resort: try WebAudio API
                        return playWithWebAudio(blob, id);
                      } finally {
                        audioElement.addEventListener('ended', () => {
                          URL.revokeObjectURL(compatibleUrl);
                        }, { once: true });
                      }
                    })
                    .catch(fetchErr => {
                      console.error('Error fetching for conversion:', fetchErr);
                      setError(`Playback error: Could not load the recording.`);
                    });
                    
                  setPlayingId(null);
                });
            }
          }
        } catch (err) {
          console.error('Exception playing audio:', err);
          setError(`Could not play recording: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }
  };

  // Open delete confirmation dialog
  const openDeleteConfirmation = (id: number) => {
    setRecordingToDelete(id);
    setDeleteConfirmOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteConfirmation = () => {
    setDeleteConfirmOpen(false);
    setRecordingToDelete(null);
  };

  // Delete recording after confirmation
  const confirmDeleteRecording = async () => {
    if (recordingToDelete === null) return;
    
    setDeleteInProgress(true);
    setDeleteError(null);
    
    // Stop playback if this recording is playing
    if (playingId === recordingToDelete && audioElement) {
      audioElement.pause();
      setPlayingId(null);
    }

    try {
      const success = await apiDeleteRecording(recordingToDelete);
      if (success) {
        // Remove from state
        setRecordings(prev => prev.filter(rec => rec.id !== recordingToDelete));
        setDeleteConfirmOpen(false);
        setRecordingToDelete(null);
      } else {
        setDeleteError("Failed to delete recording from server");
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setDeleteError(`Failed to delete: ${errorMessage}`);
    } finally {
      setDeleteInProgress(false);
    }
  };

  // Download recording
  const downloadRecording = (recording: DBRecording) => {
    try {
      console.log('Downloading recording:', recording.public_url);
      
      // Fix Supabase URL if needed
      let downloadUrl = recording.public_url;
      
      // Handle URL path issues
      if (downloadUrl.includes('/public/public/')) {
        downloadUrl = downloadUrl.replace('/public/public/', '/public/');
        console.log('Fixed duplicate public paths in URL for download:', downloadUrl);
      }
      
      // Check if it's a blob URL
      const isBlobUrl = downloadUrl.startsWith('blob:');
      
      if (!downloadUrl.startsWith('http') && !isBlobUrl) {
        // If it's not a valid URL, show error
        setError('Download URL is invalid. Please check storage settings.');
        return;
      }
      
      // For blob URLs from localStorage
      if (isBlobUrl) {
        // Try to fetch the blob to make sure it's still valid
        fetch(downloadUrl)
          .then(response => {
            if (!response.ok) {
              throw new Error('Blob URL is no longer valid');
            }
            return response.blob();
          })
          .then(blob => {
            // If the blob is valid, create a download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = recording.file_name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url); // Clean up
          })
          .catch(err => {
            console.error('Error with blob URL during download:', err);
            
            // Try to regenerate blob from stored data
            if (recording.emotion_data && recording.emotion_data._blob) {
              try {
                console.log('Attempting to recover blob for download');
                // Convert base64 string back to blob
                const binaryString = atob(recording.emotion_data._blob);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                
                for (let i = 0; i < len; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                
                // Create a new blob
                const blob = new Blob([bytes.buffer], { 
                  type: recording.emotion_data._blobType || 'audio/webm' 
                });
                
                // Create a download link
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = recording.file_name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url); // Clean up
                
                // Update the recording's URL in state for future use
                const newUrl = URL.createObjectURL(blob);
                setRecordings(prev => 
                  prev.map(rec => 
                    rec.id === recording.id 
                      ? { ...rec, public_url: newUrl } 
                      : rec
                  )
                );
              } catch (blobErr) {
                console.error('Error recovering blob for download:', blobErr);
                setError('Unable to download recording. The data may have been lost.');
              }
            } else {
              setError('Unable to download recording. The blob URL is no longer valid.');
            }
          });
      } else {
        // Regular HTTP URL - use the normal download method
        console.log('Using HTTP download URL:', downloadUrl);
        
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = recording.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
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
    if (!ms || isNaN(ms)) return '0:00';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Get recording filename by ID
  const getRecordingName = (id: number): string => {
    const recording = recordings.find(rec => rec.id === id);
    return recording ? recording.file_name : 'Recording';
  };

  // Format percentage value
  const formatPercentage = (value: number): string => {
    return `${Math.round(value * 100)}%`;
  };

  // Save analysis data to the database
  const saveAnalysisToDatabase = async (recording: DBRecording, analysisData: any) => {
    try {
      console.log('Saving analysis data to audio_analysis table...');
      
      // Add recording_id to the analysis data
      const analysisDataForSaving = {
        ...analysisData,
        recording_id: recording.id
      };
      
      // Save to audio_analysis table
      const { data, error } = await saveViewAnalysis(analysisDataForSaving);
      
      if (error) {
        console.error('Error saving to audio_analysis table:', error);
        return false;
      } else {
        console.log('Successfully saved analysis to audio_analysis table:', data);
        return true;
      }
    } catch (saveError) {
      console.error('Exception saving to audio_analysis table:', saveError);
      return false;
    }
  };

  // Analyze recording manually with backend model
  const analyzeRecording = async (recording: DBRecording) => {
    try {
      setAnalyzingRecordingId(recording.id);
      console.log('Analyzing recording:', recording.id);
      setError(null); // Clear any previous errors
      
      // Check if the recording has a valid URL
      if (!recording.public_url) {
        console.error('Recording has no URL');
        setError('Recording has no valid URL to analyze');
        setAnalyzingRecordingId(null);
        return;
      }
      
      // Fetch the audio file
      const response = await fetch(recording.public_url);
      if (!response.ok) {
        console.error('Failed to fetch audio file:', response.status);
        setError(`Failed to fetch audio file: ${response.status}`);
        setAnalyzingRecordingId(null);
        return;
      }
      
      const audioBlob = await response.blob();
      if (!audioBlob || audioBlob.size === 0) {
        console.error('Empty audio blob');
        setError('Failed to retrieve valid audio data');
        setAnalyzingRecordingId(null);
        return;
      }
      
      try {
        // Process with high-accuracy model
        console.log('Processing audio with advanced model...');
        
        // First decode the audio to get its duration
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        try {
          // Decode the audio data
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          console.log('Successfully decoded audio:', {
            duration: audioBuffer.duration,
            sampleRate: audioBuffer.sampleRate,
            numberOfChannels: audioBuffer.numberOfChannels
          });
          
          // Convert to WAV for consistent processing
          const wavBlob = await convertToWav(audioBuffer);
          
          // Import the analysis service
          const { createCompleteAnalysis } = await import('../services/analysisService');
          
          // Use high-accuracy model analysis service
          const analysisWithEmotion = await createCompleteAnalysis(wavBlob, audioBuffer.duration);
          console.log('Advanced analysis complete:', analysisWithEmotion);
          
          if (!analysisWithEmotion.emotionAnalysis || analysisWithEmotion.emotionAnalysis === "No emotion analysis available.") {
            // If the ASR model didn't generate an emotion analysis, create one from the dominant emotion
            const emotionName = (analysisWithEmotion.dominantEmotion || "").split(" ")[0].toLowerCase();
            
            if (emotionName) {
              // Generate a default analysis text based on the emotion
              switch(emotionName.toLowerCase()) {
                case 'happy':
                case 'happiness':
                  analysisWithEmotion.emotionAnalysis = "Your voice conveys happiness and positive energy. This upbeat tone helps create an engaging and optimistic atmosphere, which can be effective for motivational content and building rapport with listeners.";
                  break;
                case 'sad':
                case 'sadness':
                  analysisWithEmotion.emotionAnalysis = "Your voice reflects a somber or melancholic tone. This emotional quality can create empathy and connection when discussing serious topics, though it may benefit from more variation for engaging longer conversations.";
                  break;
                case 'angry':
                case 'anger':
                  analysisWithEmotion.emotionAnalysis = "Your voice expresses intensity and strong conviction. This passionate delivery can be powerful for persuasive content, though moderating the tone for different segments might create better listener engagement over time.";
                  break;
                case 'fear':
                  analysisWithEmotion.emotionAnalysis = "Your voice conveys apprehension or concern. This cautious delivery style can be effective when discussing risks or warnings, though it may benefit from balancing with more confident tones in other segments.";
                  break;
                case 'surprise':
                  analysisWithEmotion.emotionAnalysis = "Your voice expresses wonder and curiosity. This engaged tone creates interest and can effectively maintain listener attention, particularly useful when introducing new concepts or unexpected information.";
                  break;
                case 'disgust':
                  analysisWithEmotion.emotionAnalysis = "Your voice conveys strong disapproval or aversion. This critical tone can be appropriate when discussing problematic issues, though balancing with constructive alternatives may create a more positive overall impression.";
                  break;
                case 'neutral':
                case 'calm':
                  analysisWithEmotion.emotionAnalysis = "Your speech tone is primarily neutral and measured. This balanced delivery is appropriate for informational content and creates a sense of credibility and objectivity.";
                  break;
                default:
                  if (emotionName !== 'unknown') {
                    analysisWithEmotion.emotionAnalysis = `Your voice primarily expresses ${emotionName}, creating a distinctive emotional quality in your delivery. This emotional tone adds personality to your speech and helps create connection with listeners.`;
                  } else {
                    analysisWithEmotion.emotionAnalysis = "Your speech shows a unique combination of emotional tones that creates an engaging delivery pattern. This varied expression helps maintain listener interest throughout your recording.";
                  }
              }
            } else {
              analysisWithEmotion.emotionAnalysis = "Your speech shows a balanced emotional quality that creates an engaging delivery pattern. The natural variation in tone helps maintain listener interest throughout your recording.";
            }
          }
          
          // Save complete analysis data to audio_analysis table
          await saveAnalysisToDatabase(recording, analysisWithEmotion);
          
          // Update the recording in state with the new analysis
          setRecordings(prevRecordings => 
            prevRecordings.map(rec => 
              rec.id === recording.id 
                ? { 
                    ...rec, 
                    emotion_data: {
                      ...rec.emotion_data,
                      audioAnalysis: analysisWithEmotion,
                      dominantEmotion: analysisWithEmotion.dominantEmotion,
                      emotionAnalysis: analysisWithEmotion.emotionAnalysis
                    } 
                  } 
                : rec
            )
          );
          
          // Display the analysis
          setSelectedAnalysis(analysisWithEmotion);
          setSelectedRecordingName(`${recording.file_name} - ${analysisWithEmotion.dominantEmotion}`);
          console.log('Analysis complete, displaying dialog for recording:', recording.id);
          setAnalysisDialogOpen(true);
          
          // Make sure dialog is visible by force-checking it after a short delay
          setTimeout(() => {
            if (!analysisDialogOpen) {
              console.log('Dialog not visible, forcing it open');
              setAnalysisDialogOpen(true);
            }
          }, 500);
          
          // Notify parent component that analysis is complete
          if (onAnalysisComplete) {
            onAnalysisComplete(recording.id);
          }
          
        } catch (decodeErr) {
          console.error('Failed to decode audio data:', decodeErr);
          setError('Failed to process audio: The format may not be supported');
        } finally {
          audioContext.close();
          setAnalyzingRecordingId(null);
        }
      } catch (err) {
        console.error('Error analyzing recording:', err);
        setError(`Error analyzing recording: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setAnalyzingRecordingId(null);
      }
    } catch (err) {
      console.error('Error analyzing recording:', err);
      setError(`Error analyzing recording: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setAnalyzingRecordingId(null);
    }
  };

  // Helper function to convert AudioBuffer to WAV format Blob
  const convertToWav = async (audioBuffer: AudioBuffer): Promise<Blob> => {
    // Get channels data
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    
    // Create the WAV file
    const dataLength = length * numChannels * 2; // 16-bit audio (2 bytes per sample)
    const buffer = new ArrayBuffer(44 + dataLength); // 44 bytes for WAV header
    const view = new DataView(buffer);
    
    // Write WAV header
    // "RIFF" chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true); // file size
    writeString(view, 8, 'WAVE');
    
    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // sub-chunk size
    view.setUint16(20, 1, true); // audio format (1 for PCM)
    view.setUint16(22, numChannels, true); // number of channels
    view.setUint32(24, sampleRate, true); // sample rate
    view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
    view.setUint16(32, numChannels * 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    
    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true); // sub-chunk size
    
    // Write audio data
    let offset = 44;
    const float32To16Bit = (sample: number) => {
      return Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    };
    
    // Combine and interleave all channels
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = float32To16Bit(audioBuffer.getChannelData(channel)[i]);
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  };
  
  // Helper function to write strings to DataView
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  return (
    <Paper sx={{ p: 3, borderRadius: 2, bgcolor: 'rgba(10, 25, 41, 0.7)' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" component="h2">
          Recording History
        </Typography>
        <Button 
          variant="outlined" 
          size="small" 
          onClick={loadRecordings}
          startIcon={<SettingsIcon fontSize="small" />}
        >
          Refresh
        </Button>
      </Box>
      
      {/* Connection status dialog */}
      <Dialog open={connectionDialogOpen} onClose={() => setConnectionDialogOpen(false)}>
        <DialogTitle>Supabase Connection Status</DialogTitle>
        <DialogContent>
          {testingConnection ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={24} />
              <Typography sx={{ ml: 2 }}>Testing connection...</Typography>
            </Box>
          ) : connectionStatus ? (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle1" sx={{ mr: 1 }}>Status:</Typography>
                <Chip 
                  label={connectionStatus.connected ? "Connected" : "Disconnected"} 
                  color={connectionStatus.connected ? "success" : "error"}
                  size="small"
                />
              </Box>
              <Typography variant="body2">{connectionStatus.message}</Typography>
              
              {!connectionStatus.connected && (
                <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(255, 0, 0, 0.05)', borderRadius: 1 }}>
                  <Typography variant="subtitle2" color="error">
                    Troubleshooting Tips:
                  </Typography>
                  <ul>
                    <li>Check if your Supabase project is active</li>
                    <li>Verify your VITE_SUPABASE_URL and VITE_SUPABASE_KEY in .env file</li>
                    <li>Make sure the recordings table and bucket exist</li>
                    <li>Check browser console for more detailed errors</li>
                  </ul>
                </Box>
              )}
            </Box>
          ) : (
            <Typography>Click Test Connection to check Supabase status</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={checkSupabaseConnection} 
            disabled={testingConnection}
          >
            Test Connection
          </Button>
          <Button onClick={() => setConnectionDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
      
      {hasBackendIssues && (
        <Box 
          sx={{ 
            mb: 2, 
            p: 1.5, 
            borderRadius: 1, 
            bgcolor: alpha('#F59E0B', 0.1), 
            border: '1px solid ' + alpha('#F59E0B', 0.2)
          }}
        >
          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
            <strong>Note:</strong> Backend connectivity issues detected. Recordings are being saved to your browser's local storage. 
            They will be available on this device but won't sync to the cloud.
          </Typography>
        </Box>
      )}
      
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
        <List sx={{ 
          flexGrow: 1, 
          overflowY: 'auto',
          maxHeight: '600px', // Significantly increased maximum height to show more recordings
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
            }
          }
        }}>
          {recordings.map((recording, index) => (
            <Box key={recording.id}>
              <ListItem
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: { xs: 0.5, sm: 1 } }}>
                    <IconButton 
                      size="small" 
                      onClick={() => playRecording(recording.id, recording.public_url)}
                      color={playingId === recording.id ? 'primary' : 'default'}
                      sx={{ 
                        p: { xs: 0.5, sm: 1 },
                        backgroundColor: playingId === recording.id ? alpha('#7C3AED', 0.1) : 'transparent'
                      }}
                    >
                      {playingId === recording.id ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                    </IconButton>
                    
                    <IconButton 
                      size="small" 
                      onClick={() => downloadRecording(recording)}
                      sx={{ p: { xs: 0.5, sm: 1 } }}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                    
                    <Tooltip title="Analyze with model">
                      <span>
                        <IconButton 
                          size="small" 
                          onClick={() => analyzeRecording(recording)}
                          color="secondary"
                          disabled={analyzingRecordingId === recording.id}
                          sx={{ p: { xs: 0.5, sm: 1 } }}
                        >
                          {analyzingRecordingId === recording.id ? (
                            <CircularProgress size={16} color="secondary" />
                          ) : (
                            <AnalyticsIcon fontSize="small" />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                    
                    <IconButton 
                      size="small" 
                      onClick={() => openDeleteConfirmation(recording.id)}
                      color="error"
                      sx={{ p: { xs: 0.5, sm: 1 } }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1">
                        {recording.file_name.replace(/_/g, ' ').replace('.wav', '').replace(/recording/i, 'Recording')}
                      </Typography>
                      {recording.public_url.startsWith('blob:') && (
                        <Chip 
                          label="Local" 
                          size="small" 
                          color="warning" 
                          sx={{ 
                            height: 18, 
                            fontSize: '0.65rem',
                            '& .MuiChip-label': { px: 0.8 }
                          }} 
                        />
                      )}
                    </Box>
                  }
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

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={!deleteInProgress ? closeDeleteConfirmation : undefined}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        PaperProps={{
          sx: {
            bgcolor: '#1E293B',
            backgroundImage: 'none',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            maxWidth: { xs: '90%', sm: '450px' }
          }
        }}
      >
        <DialogTitle id="delete-dialog-title" sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          {deleteError ? (
            <>
              <ErrorOutlineIcon color="error" sx={{ fontSize: { xs: 20, sm: 24 } }} />
              Error
            </>
          ) : (
            <>
              <WarningAmberIcon color="warning" sx={{ fontSize: { xs: 20, sm: 24 } }} />
              Delete Recording
            </>
          )}
        </DialogTitle>
        <DialogContent>
          {deleteError ? (
            <Box sx={{ mb: 1 }}>
              <Typography variant="body1" color="error" sx={{ mb: 2 }}>
                {deleteError}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Please try again later or check your network connection.
              </Typography>
            </Box>
          ) : (
            <Box>
              <DialogContentText id="delete-dialog-description" sx={{ color: 'text.secondary' }}>
                Are you sure you want to delete "{getRecordingName(recordingToDelete || 0)}"?
              </DialogContentText>
              <Box sx={{ 
                mt: 2, 
                p: 1.5, 
                borderRadius: 1, 
                bgcolor: alpha('#DC2626', 0.1), 
                border: '1px solid ' + alpha('#DC2626', 0.2) 
              }}>
                <Typography variant="body2" sx={{ color: alpha('#fff', 0.8), fontSize: { xs: '0.8rem', sm: '0.9rem' } }}>
                  This action cannot be undone and will permanently remove the recording from your account.
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1, sm: 0 } }}>
          <Button 
            onClick={closeDeleteConfirmation} 
            color="primary"
            sx={{ 
              borderRadius: '12px',
              px: { xs: 2, md: 3 },
              width: { xs: '100%', sm: 'auto' }
            }}
            disabled={deleteInProgress}
          >
            {deleteError ? 'Close' : 'Cancel'}
          </Button>
          {!deleteError && (
            <Button 
              onClick={confirmDeleteRecording} 
              color="error" 
              variant="contained"
              autoFocus
              disabled={deleteInProgress}
              sx={{ 
                borderRadius: '12px',
                background: 'linear-gradient(90deg, #DC2626 0%, #EF4444 100%)',
                px: { xs: 2, md: 3 },
                width: { xs: '100%', sm: 'auto' }
              }}
            >
              {deleteInProgress ? (
                <>
                  <CircularProgress size={16} color="inherit" sx={{ mr: 1 }} />
                  Deleting...
                </>
              ) : 'Delete'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Analysis results dialog */}
      <Dialog
        open={analysisDialogOpen}
        onClose={() => setAnalysisDialogOpen(false)}
        aria-labelledby="analysis-dialog-title"
        maxWidth="md"
        fullWidth
      >
        <DialogTitle id="analysis-dialog-title">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AssessmentIcon color="info" />
            <Typography variant="h6">Audio Analysis: {selectedRecordingName}</Typography>
          </Box>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
            Analysis data is stored in Supabase audio_analysis table for retrieval across sessions
          </Typography>
        </DialogTitle>
        <DialogContent>
          {selectedAnalysis ? (
            <Box sx={{ mt: 1 }}>
              {/* Overview section */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Overview</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
                <Box sx={{ bgcolor: alpha('#7C3AED', 0.1), p: 2, borderRadius: 2 }}>
                  <Typography variant="body2" color="text.secondary">Duration</Typography>
                  <Typography variant="h6">{selectedAnalysis.duration.toFixed(1)} seconds</Typography>
                </Box>
                
                <Box sx={{ bgcolor: alpha('#10B981', 0.1), p: 2, borderRadius: 2 }}>
                  <Typography variant="body2" color="text.secondary">Words Spoken (est.)</Typography>
                  <Typography variant="h6">{selectedAnalysis.wordCount} words</Typography>
                </Box>
                
                <Box sx={{ bgcolor: alpha('#3B82F6', 0.1), p: 2, borderRadius: 2 }}>
                  <Typography variant="body2" color="text.secondary">Speech Rate</Typography>
                  <Typography variant="h6">{selectedAnalysis.speechRate} words/min</Typography>
                </Box>
                
                <Box sx={{ bgcolor: alpha('#F59E0B', 0.1), p: 2, borderRadius: 2 }}>
                  <Typography variant="body2" color="text.secondary">Silence Duration</Typography>
                  <Typography variant="h6">{selectedAnalysis.silenceDuration.toFixed(1)} seconds</Typography>
                </Box>
                
                {/* Dominant Emotion box */}
                <Box sx={{ 
                  bgcolor: alpha('#EC4899', 0.1), 
                  p: 2, 
                  borderRadius: 2, 
                  gridColumn: { xs: 'auto', sm: '1 / -1' }
                }}>
                  <Typography variant="body2" color="text.secondary">Dominant Emotion</Typography>
                  <Typography variant="h6">
                    {(selectedAnalysis as any).dominantEmotion || "Unknown"}
                  </Typography>
                </Box>
              </Box>
              
              {/* Emotion Analysis */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, mt: 2 }}>Emotion Analysis</Typography>
              <Box sx={{ 
                p: 2, 
                borderRadius: 2, 
                bgcolor: alpha('#EC4899', 0.1),
                border: '1px solid ' + alpha('#EC4899', 0.2),
                mb: 3
              }}>
                <Typography variant="body2">
                  {(selectedAnalysis as any).emotionAnalysis || "No emotion analysis available."}
                </Typography>
              </Box>
              
              {/* Speech Rate Categories */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Speech Characteristics</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Chip 
                    label={selectedAnalysis.speechRateCategory.fluency}
                    color={
                      selectedAnalysis.speechRateCategory.fluency === 'High Fluency' ? 'success' :
                      selectedAnalysis.speechRateCategory.fluency === 'Medium Fluency' ? 'primary' : 'warning'
                    }
                    sx={{ fontWeight: 500 }}
                  />
                  
                  <Chip 
                    label={selectedAnalysis.speechRateCategory.tempo}
                    color={
                      selectedAnalysis.speechRateCategory.tempo === 'Fast Tempo' ? 'info' :
                      selectedAnalysis.speechRateCategory.tempo === 'Medium Tempo' ? 'primary' : 'default'
                    }
                    sx={{ fontWeight: 500 }}
                  />
                  
                  <Chip 
                    label={selectedAnalysis.speechRateCategory.pronunciation}
                    color={
                      selectedAnalysis.speechRateCategory.pronunciation === 'Clear Pronunciation' ? 'success' : 'warning'
                    }
                    sx={{ fontWeight: 500 }}
                  />
                </Box>
                
                <Box sx={{ 
                  p: 2, 
                  borderRadius: 2, 
                  bgcolor: alpha('#64748B', 0.1),
                  border: '1px solid ' + alpha('#64748B', 0.2) 
                }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Speech Pattern Analysis:
                  </Typography>
                  <Typography variant="body2">
                    {selectedAnalysis.speechRateCategory.fluency === 'High Fluency' ? 
                      'Your speech demonstrates high fluency with minimal hesitations and a smooth flow of words.' :
                      selectedAnalysis.speechRateCategory.fluency === 'Medium Fluency' ? 
                      'Your speech shows moderate fluency with occasional pauses and hesitations.' :
                      'Your speech exhibits lower fluency with frequent pauses and hesitations.'
                    }
                    {' '}
                    {selectedAnalysis.speechRateCategory.tempo === 'Fast Tempo' ? 
                      'You speak at a fast pace, which shows confidence but may affect clarity.' :
                      selectedAnalysis.speechRateCategory.tempo === 'Medium Tempo' ? 
                      'You speak at a comfortable, balanced pace that is easy to follow.' :
                      'You speak at a slower pace, which can aid comprehension but may indicate uncertainty.'
                    }
                    {' '}
                    {selectedAnalysis.speechRateCategory.pronunciation === 'Clear Pronunciation' ? 
                      'Your pronunciation is clear and words are easily understood.' :
                      'Your pronunciation could be improved for better clarity and understanding.'
                    }
                  </Typography>
                </Box>
              </Box>
              
              {/* Volume metrics */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Volume Metrics</Typography>
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">Average Volume</Typography>
                  <Typography variant="body2">{formatPercentage(selectedAnalysis.averageVolume)}</Typography>
                </Box>
                <Box sx={{ height: 8, bgcolor: 'rgba(0,0,0,0.1)', borderRadius: 4, mb: 2, overflow: 'hidden' }}>
                  <Box sx={{ height: '100%', width: `${selectedAnalysis.averageVolume * 100}%`, bgcolor: '#7C3AED', borderRadius: 4 }} />
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">Peak Volume</Typography>
                  <Typography variant="body2">{formatPercentage(selectedAnalysis.peakVolume)}</Typography>
                </Box>
                <Box sx={{ height: 8, bgcolor: 'rgba(0,0,0,0.1)', borderRadius: 4, mb: 1, overflow: 'hidden' }}>
                  <Box sx={{ height: '100%', width: `${selectedAnalysis.peakVolume * 100}%`, bgcolor: '#F59E0B', borderRadius: 4 }} />
                </Box>
              </Box>
              
              {/* Audio quality */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Audio Quality</Typography>
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">Clarity</Typography>
                  <Typography variant="body2">{formatPercentage(selectedAnalysis.audioQuality.clarity)}</Typography>
                </Box>
                <Box sx={{ height: 8, bgcolor: 'rgba(0,0,0,0.1)', borderRadius: 4, mb: 2, overflow: 'hidden' }}>
                  <Box sx={{ height: '100%', width: `${selectedAnalysis.audioQuality.clarity * 100}%`, bgcolor: '#10B981', borderRadius: 4 }} />
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">Background Noise</Typography>
                  <Typography variant="body2">{formatPercentage(selectedAnalysis.audioQuality.noiseLevel)}</Typography>
                </Box>
                <Box sx={{ height: 8, bgcolor: 'rgba(0,0,0,0.1)', borderRadius: 4, mb: 2, overflow: 'hidden' }}>
                  <Box sx={{ height: '100%', width: `${selectedAnalysis.audioQuality.noiseLevel * 100}%`, bgcolor: '#EF4444', borderRadius: 4 }} />
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">Distortion</Typography>
                  <Typography variant="body2">{formatPercentage(selectedAnalysis.audioQuality.distortion)}</Typography>
                </Box>
                <Box sx={{ height: 8, bgcolor: 'rgba(0,0,0,0.1)', borderRadius: 4, mb: 1, overflow: 'hidden' }}>
                  <Box sx={{ height: '100%', width: `${selectedAnalysis.audioQuality.distortion * 100}%`, bgcolor: '#F59E0B', borderRadius: 4 }} />
                </Box>
              </Box>
              
              {/* Speech segments visualization */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Speech Pattern</Typography>
              <Box sx={{ height: 80, mb: 1, position: 'relative' }}>
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 30, display: 'flex' }}>
                  {selectedAnalysis.segments.map((segment, i) => (
                    <Box 
                      key={i} 
                      sx={{ 
                        height: '100%', 
                        width: `${((segment.end - segment.start) / selectedAnalysis.duration) * 100}%`,
                        bgcolor: segment.isSpeech ? '#10B981' : '#E5E7EB',
                        borderRadius: 1,
                        position: 'relative',
                        '&:hover': {
                          outline: '2px solid white',
                          zIndex: 2,
                          '& .segment-tooltip': {
                            display: 'block'
                          }
                        }
                      }} 
                    >
                      <Box 
                        className="segment-tooltip"
                        sx={{ 
                          display: 'none',
                          position: 'absolute', 
                          bottom: '100%', 
                          left: '50%',
                          transform: 'translateX(-50%)',
                          bgcolor: 'rgba(0,0,0,0.8)',
                          color: 'white',
                          p: 1,
                          borderRadius: 1,
                          fontSize: '0.75rem',
                          whiteSpace: 'nowrap',
                          zIndex: 10,
                          mb: 0.5
                        }}
                      >
                        {segment.isSpeech ? 'Speech' : 'Silence'}: {(segment.end - segment.start).toFixed(1)}s
                      </Box>
                    </Box>
                  ))}
                </Box>
                
                {/* Timeline marks */}
                <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 20, display: 'flex', justifyContent: 'space-between' }}>
                  {[0, 0.25, 0.5, 0.75, 1].map((mark) => (
                    <Box key={mark} sx={{ position: 'relative' }}>
                      <Box sx={{ height: 8, width: 1, bgcolor: 'rgba(0,0,0,0.3)' }} />
                      <Typography variant="caption" sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
                        {Math.round(selectedAnalysis.duration * mark)}s
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
              
              {/* Legend */}
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 1, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: '#10B981' }} />
                  <Typography variant="caption">Speech</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: '#E5E7EB' }} />
                  <Typography variant="caption">Silence/Pause</Typography>
                </Box>
              </Box>
              
              <Box sx={{ textAlign: 'center', mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Hover over segments to see detailed duration information
                </Typography>
              </Box>
            </Box>
          ) : (
            <Typography color="error">No analysis data available</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnalysisDialogOpen(false)} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default Recordings; 