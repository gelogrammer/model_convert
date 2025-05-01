import { getRecordedAudio, getAudioAnalysisResult } from './audioService';
import { uploadRecording, getRecordings as fetchSupabaseRecordings, deleteRecording as deleteSupabaseRecording, saveAudioAnalysis, testSupabaseConnection } from './supabaseService';

// Interface for recording data
export interface Recording {
  id: number;
  file_name: string;
  public_url: string;
  duration: number;
  recorded_at: string;
  emotion_data: any;
  audio_analysis_id?: number;  // Reference to audio analysis table
  created_at: string;
  updated_at: string;
  file_path: string;
  mime_type?: string;  // Adding MIME type to track audio format
}

// Interface for audio analysis data
export interface AudioAnalysisData {
  id?: number;
  recording_id: number;
  duration: number;
  average_volume: number;
  peak_volume: number;
  silence_duration: number;
  speech_rate: number;
  word_count: number;
  fluency: string;
  tempo: string;
  pronunciation: string;
  audio_clarity: number;
  noise_level: number;
  distortion: number;
  dominant_emotion: string;
  emotion_confidence: number;
  segments: any;
  created_at?: string;
  updated_at?: string;
}

// Interface for local recording data
interface LocalRecording {
  id: string;
  name: string;
  date: string;
  url: string;
  emotion_data?: any;
  duration: number;
  mime_type?: string;  // Adding MIME type to track format
}

// Function to ensure audio format is compatible with most browsers
export const ensureCompatibleAudioFormat = async (blob: Blob): Promise<Blob> => {
  console.log('Checking audio format compatibility for blob type:', blob.type);
  
  // Check blob validity
  if (!blob || blob.size === 0) {
    console.error('Invalid blob: empty or null');
    return new Blob([], { type: 'audio/mpeg' }); // Return empty blob with MP3 type
  }
  
  // Helper to check browser support for audio formats
  const checkFormatSupport = (): { 
    mp3Support: boolean;
    wavSupport: boolean;
    webmSupport: boolean;
    oggSupport: boolean;
    aacSupport: boolean;
    bestFormat: string;
  } => {
    const audio = new Audio();
    
    // Check support for various formats
    const mp3Support = audio.canPlayType('audio/mpeg') !== '';
    const wavSupport = audio.canPlayType('audio/wav') !== '';
    const webmSupport = audio.canPlayType('audio/webm') !== '';
    const oggSupport = audio.canPlayType('audio/ogg') !== '';
    const aacSupport = audio.canPlayType('audio/aac') !== '';
    
    console.log('Browser format support:', {
      mp3: mp3Support ? 'Yes' : 'No',
      wav: wavSupport ? 'Yes' : 'No',
      webm: webmSupport ? 'Yes' : 'No',
      ogg: oggSupport ? 'Yes' : 'No',
      aac: aacSupport ? 'Yes' : 'No'
    });
    
    // Determine best format based on browser support
    // Prefer MP3 for widest compatibility, followed by AAC, WebM, WAV and OGG
    let bestFormat = 'audio/mpeg'; // Default to MP3
    
    if (mp3Support) {
      bestFormat = 'audio/mpeg';
    } else if (aacSupport) {
      bestFormat = 'audio/aac';
    } else if (webmSupport) {
      bestFormat = 'audio/webm';
    } else if (wavSupport) {
      bestFormat = 'audio/wav';
    } else if (oggSupport) {
      bestFormat = 'audio/ogg';
    }
    
    return {
      mp3Support,
      wavSupport,
      webmSupport,
      oggSupport,
      aacSupport,
      bestFormat
    };
  };
  
  // Get format support information
  const formatSupport = checkFormatSupport();
  
  // Determine current format and whether conversion is needed
  const currentType = blob.type.toLowerCase();
  let targetType = formatSupport.bestFormat;
  
  // Normalize current format for comparison
  let normalizedCurrentType = currentType;
  if (currentType.includes('mpeg') || currentType.includes('mp3')) {
    normalizedCurrentType = 'audio/mpeg';
  } else if (currentType.includes('wav')) {
    normalizedCurrentType = 'audio/wav';
  } else if (currentType.includes('webm')) {
    normalizedCurrentType = 'audio/webm';
  } else if (currentType.includes('ogg')) {
    normalizedCurrentType = 'audio/ogg';
  } else if (currentType.includes('aac') || currentType.includes('mp4')) {
    normalizedCurrentType = 'audio/aac';
  } else if (currentType === '' || currentType === 'application/octet-stream') {
    // For unknown types, assume we need to convert
    normalizedCurrentType = '';
  }
  
  // Check if current format is already supported and no conversion needed
  if (normalizedCurrentType === targetType) {
    console.log('Audio is already in optimal format, keeping as-is');
    return blob;
  }
  
  // Current format is also well-supported, can keep as-is
  if ((normalizedCurrentType === 'audio/mpeg' && formatSupport.mp3Support) ||
      (normalizedCurrentType === 'audio/webm' && formatSupport.webmSupport) ||
      (normalizedCurrentType === 'audio/wav' && formatSupport.wavSupport) ||
      (normalizedCurrentType === 'audio/ogg' && formatSupport.oggSupport) ||
      (normalizedCurrentType === 'audio/aac' && formatSupport.aacSupport)) {
    console.log('Current format is well-supported, keeping as-is');
    return blob;
  }
  
  try {
    console.log(`Converting audio from ${normalizedCurrentType || 'unknown'} to ${targetType}`);
    
    // Create a new blob with the target type
    // Note: This is only changing the MIME type, not transcoding the audio
    // For actual transcoding, a Web Audio API solution would be needed
    const newBlob = new Blob([await blob.arrayBuffer()], { type: targetType });
    
    console.log('Format conversion complete:', {
      originalSize: blob.size,
      newSize: newBlob.size,
      newType: targetType
    });
    
    return newBlob;
  } catch (err) {
    console.error('Audio format conversion failed:', err);
    // Return original blob on error
    return blob;
  }
};

// Calculate duration (if you have this information)
const calculateActualDuration = async (blob: Blob): Promise<number> => {
  return new Promise((resolve) => {
    if (!blob || blob.size === 0) {
      console.error('Cannot calculate duration of empty blob');
      resolve(0);
      return;
    }
    
    // Create a temporary audio element to get accurate duration
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(blob);
    
    // Set a timeout to prevent hanging if metadata never loads
    const timeoutId = setTimeout(() => {
      console.warn('Audio metadata load timed out, using fallback duration calculation');
      URL.revokeObjectURL(objectUrl);
      
      // Fallback: estimate based on file size (very rough)
      // Assuming standard 128kbps audio, which is about 16KB per second
      const bytesPerSecond = 16 * 1024; 
      const estimatedDuration = Math.max(1000, Math.round((blob.size / bytesPerSecond) * 1000));
      resolve(estimatedDuration);
    }, 3000); // 3 second timeout
    
    // Listener for successful metadata load
    audio.addEventListener('loadedmetadata', () => {
      clearTimeout(timeoutId);
      
      // Check if duration is valid
      if (isNaN(audio.duration) || audio.duration === Infinity || audio.duration <= 0) {
        console.warn('Invalid duration value:', audio.duration);
        URL.revokeObjectURL(objectUrl);
        
        // Fallback: estimate based on file size
        const bytesPerSecond = 16 * 1024;
        const estimatedDuration = Math.max(1000, Math.round((blob.size / bytesPerSecond) * 1000));
        resolve(estimatedDuration);
        return;
      }
      
      // Convert to milliseconds for consistency with the rest of the app
      const durationMs = Math.round(audio.duration * 1000);
      URL.revokeObjectURL(objectUrl);
      console.log('Audio duration from metadata:', durationMs, 'ms');
      resolve(durationMs);
    });
    
    // Handle errors and provide fallback duration estimate
    audio.addEventListener('error', (e) => {
      clearTimeout(timeoutId);
      console.error('Error loading audio metadata:', e);
      URL.revokeObjectURL(objectUrl);
      
      // Fallback: estimate based on file size (very rough)
      // For different formats, estimation varies:
      // - MP3: ~16KB per second at 128kbps
      // - WAV: ~172KB per second for 44.1kHz 16-bit stereo
      let bytesPerSecond = 16 * 1024; // Default to MP3 estimate
      
      // Adjust estimate based on format if known
      if (blob.type.includes('wav')) {
        bytesPerSecond = 172 * 1024; // WAV estimate
      } else if (blob.type.includes('webm')) {
        bytesPerSecond = 20 * 1024; // WebM Opus estimate
      }
      
      const estimatedDuration = Math.max(1000, Math.round((blob.size / bytesPerSecond) * 1000));
      console.log('Estimated audio duration from file size:', estimatedDuration, 'ms');
      resolve(estimatedDuration);
    });
    
    // Set the source to trigger metadata loading
    audio.src = objectUrl;
    
    // Explicitly try to load metadata (helps in some browsers)
    try {
      audio.load();
    } catch (e) {
      console.warn('Error calling load() on audio element', e);
    }
  });
};

// Save recording to the database using Supabase with localStorage fallback
export const saveRecordingToDatabase = async (emotionData: any): Promise<boolean> => {
  try {
    console.log('Starting saveRecordingToDatabase with emotion data:', emotionData);
    
    const recordedBlob = getRecordedAudio();
    console.log('Retrieved audio blob:', 
      recordedBlob 
        ? `Size: ${recordedBlob.size} bytes, Type: ${recordedBlob.type}` 
        : 'NULL'
    );
    
    if (!recordedBlob) {
      console.error('No recorded audio blob available - make sure recording is stopped properly');
      return false;
    }
    
    if (recordedBlob.size === 0) {
      console.error('Audio recording is empty (0 bytes) - check microphone access');
      return false;
    }
    
    // Log the blob details
    const uuid = Date.now().toString();
    console.log(`[${uuid}] Processing audio blob:`, {
      size: recordedBlob.size,
      type: recordedBlob.type,
      timestamp: new Date().toISOString()
    });
    
    // CRITICAL FIX: No conversions or manipulations whatsoever
    // Use exactly what we got from MediaRecorder
    const finalBlob = recordedBlob;
    
    // Determine file extension from MIME type
    let fileExtension = 'wav';
    const mimeType = finalBlob.type.toLowerCase();
    
    if (mimeType.includes('webm')) {
      fileExtension = 'webm';
    } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      fileExtension = 'mp3';
    } else if (mimeType.includes('ogg')) {
      fileExtension = 'ogg';
    }
    
    const fileName = `recording_${Date.now()}.${fileExtension}`;
    console.log('Generated filename:', fileName, 'with MIME type:', finalBlob.type);
    
    // Get accurate duration using an audio element
    const duration = await calculateActualDuration(finalBlob);
    console.log('Actual audio duration:', duration, 'ms');
    
    // Verify the duration is accurate
    if (duration < 500) {
      console.warn('VERY SHORT DURATION DETECTED - potential audio capture issue');
    }
    
    // Get audio analysis results
    const analysisResult = getAudioAnalysisResult();
    console.log('Audio analysis results:', analysisResult);
    
    // Ensure we have valid emotion data
    const sanitizedEmotionData = emotionData || {};
    
    // Create a default analysis result if none is available
    const defaultAnalysis = {
      duration: duration / 1000, // Convert ms to seconds for analysis data
      averageVolume: 0.5,
      peakVolume: 0.8,
      silenceDuration: 0,
      speechRate: 120,
      speechRateCategory: {
        fluency: "Medium Fluency",
        tempo: "Medium Tempo",
        pronunciation: "Clear Pronunciation"
      },
      audioQuality: {
        clarity: 0.7,
        noiseLevel: 0.3,
        distortion: 0.1
      },
      segments: [],
      wordCount: 0,
      timestamp: new Date().toISOString()
    };
    
    // Combine emotion data and analysis results
    const combinedMetadata = {
      ...sanitizedEmotionData,
      audioAnalysis: analysisResult || defaultAnalysis,
      audioFormat: finalBlob.type, // Store audio format for better playback
      duration: duration // Store actual duration in metadata
    };
    
    // Extract dominant emotion from emotion data
    let dominantEmotion = "Unknown";
    let emotionConfidence = 0;
    
    try {
      // Try to find the dominant emotion in the data
      const emotions = sanitizedEmotionData.emotions || {};
      
      if (Object.keys(emotions).length > 0) {
        const entries = Object.entries(emotions).filter(([_, value]) => 
          value !== undefined && value !== null && !isNaN(Number(value))
        );
        const nonNeutralEmotions = entries.filter(([key]) => 
          !['neutral', 'calm'].includes(key.toLowerCase())
        );
        
        const emotionsToConsider = nonNeutralEmotions.length > 0 ? nonNeutralEmotions : entries;
        
        if (emotionsToConsider.length > 0) {
          const dominant = emotionsToConsider.sort(([, a], [, b]) => {
            const valueA = typeof a === 'string' ? parseFloat(a) : Number(a);
            const valueB = typeof b === 'string' ? parseFloat(b) : Number(b);
            return valueB - valueA;
          })[0];
          
          if (dominant) {
            dominantEmotion = dominant[0].charAt(0).toUpperCase() + dominant[0].slice(1);
            emotionConfidence = typeof dominant[1] === 'string' ? parseFloat(dominant[1]) : Number(dominant[1]);
            // Normalize to 0-1 range if needed
            if (emotionConfidence > 1) {
              emotionConfidence = emotionConfidence / 100;
            }
          }
        }
      }
    } catch (err) {
      console.error('Error extracting dominant emotion:', err);
    }
    
    // Prepare analysis data for the dedicated table
    const analysis = analysisResult || defaultAnalysis;
    const audioAnalysisData: AudioAnalysisData = {
      recording_id: 0, // Will be set after recording is created
      duration: analysis.duration,
      average_volume: analysis.averageVolume,
      peak_volume: analysis.peakVolume,
      silence_duration: analysis.silenceDuration,
      speech_rate: analysis.speechRate,
      word_count: analysis.wordCount,
      fluency: analysis.speechRateCategory.fluency,
      tempo: analysis.speechRateCategory.tempo,
      pronunciation: analysis.speechRateCategory.pronunciation,
      audio_clarity: analysis.audioQuality.clarity,
      noise_level: analysis.audioQuality.noiseLevel,
      distortion: analysis.audioQuality.distortion,
      dominant_emotion: dominantEmotion,
      emotion_confidence: emotionConfidence,
      segments: analysis.segments
    };
    
    // First try to save to Supabase
    let supabaseSuccess = false;
    
    try {
      console.log('Attempting to save to Supabase...');
      
      // First verify Supabase connection by testing the connection status
      try {
        const { connected, message } = await testSupabaseConnection();
        if (!connected) {
          console.warn('Supabase connection issues detected:', message);
          console.log('Trying to save anyway...');
        } else {
          console.log('Supabase connection verified:', message);
        }
      } catch (connectionError) {
        console.error('Error testing Supabase connection:', connectionError);
        // Continue with upload attempt anyway
      }
      
      // Try a direct upload to Supabase with a timeout safeguard
      try {
        const uploadPromise = uploadRecording(finalBlob, fileName, {
          duration,
          emotionData: combinedMetadata,
          mimeType: finalBlob.type // Pass MIME type to storage service
        });
        
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Upload timed out after 10 seconds')), 10000);
        });
        
        // Race the upload against the timeout
        const { data, error } = await Promise.race([
          uploadPromise,
          timeoutPromise.then(() => ({
            data: null,
            error: new Error('Upload timed out')
          }))
        ]) as { data: any, error: any };
        
        if (error) {
          console.error('Supabase upload error:', error);
          // Try an alternative approach for upload
          try {
            console.log('Trying alternative upload method...');
            // Try with a simple file name with no special characters
            const simpleFileName = `audio_${Date.now().toString().slice(-6)}.${fileExtension}`;
            
            const { data: altData, error: altError } = await uploadRecording(finalBlob, simpleFileName, {
              duration,
              emotionData: {
                timestamp: new Date().toISOString(),
                duration
              },
              mimeType: finalBlob.type
            });
            
            if (altError) {
              console.error('Alternative upload also failed:', altError);
              // If upload fails, we'll continue to the localStorage fallback
            } else if (altData && altData.id) {
              console.log('Successfully saved recording to Supabase with alternative method, ID:', altData.id);
              
              // Now save the audio analysis data with the recording ID
              audioAnalysisData.recording_id = altData.id;
              const analysisResult = await saveAudioAnalysis(audioAnalysisData);
              
              if (analysisResult.error) {
                console.error('Error saving audio analysis:', analysisResult.error);
                // Recording was still saved successfully
              } else {
                console.log('Successfully saved audio analysis with ID:', analysisResult.data?.id);
              }
              
              supabaseSuccess = true;
              return true; // Return early on success
            }
          } catch (altError) {
            console.error('Alternative upload method failed:', altError);
            // Continue to localStorage fallback
          }
        } else if (data && data.id) {
          console.log('Successfully saved recording to Supabase with ID:', data.id);
          
          // Now save the audio analysis data with the recording ID
          audioAnalysisData.recording_id = data.id;
          const analysisResult = await saveAudioAnalysis(audioAnalysisData);
          
          if (analysisResult.error) {
            console.error('Error saving audio analysis:', analysisResult.error);
            // Recording was still saved successfully
          } else {
            console.log('Successfully saved audio analysis with ID:', analysisResult.data?.id);
          }
          
          supabaseSuccess = true;
          return true; // Return early on success
        } else {
          console.error('Supabase upload returned no data');
          // Continue to localStorage fallback
        }
      } catch (directUploadError) {
        console.error('Direct Supabase upload failed:', directUploadError);
        // Continue to localStorage fallback
      }
    } catch (supabaseError) {
      console.error('Error saving to Supabase:', supabaseError);
      // Continue to localStorage fallback
    }
    
    // If Supabase failed, fall back to localStorage
    if (!supabaseSuccess) {
      console.log('Supabase upload failed, falling back to localStorage');
      
      try {
        // For localStorage, we need to store some metadata about the blob
        // This helps us recover it later if the blob URL becomes invalid
        let blobData = null;
        
        // We'll try to store a serializable version of the blob
        // For small recordings, this works well, but can cause issues with large files
        // so we'll only do this for recordings under 5MB
        if (finalBlob.size < 5 * 1024 * 1024) {
          try {
            // Ensure the blob data can be read
            const reader = new FileReader();
            
            // Handle reading as a proper Promise
            const readBlobAsArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
              return new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result as ArrayBuffer);
                reader.onerror = reject;
                reader.readAsArrayBuffer(blob);
              });
            };
            
            // Read the blob data
            const arrayBuffer = await readBlobAsArrayBuffer(finalBlob);
            
            // Convert to a format we can store in localStorage
            // We can't store the raw binary data directly in localStorage
            // So we'll convert it to a base64 string
            const uint8Array = new Uint8Array(arrayBuffer);
            let binary = '';
            const len = uint8Array.byteLength;
            
            for (let i = 0; i < len; i++) {
              binary += String.fromCharCode(uint8Array[i]);
            }
            
            const base64 = btoa(binary);
            
            blobData = {
              _blob: base64,
              _blobType: finalBlob.type || 'audio/mp3',
              _blobSize: finalBlob.size
            };
            
            console.log('Successfully converted blob to base64 for localStorage storage');
          } catch (err) {
            console.error('Error converting blob for storage:', err);
            // Continue without blob data
          }
        } else {
          console.warn('Recording is too large to store in localStorage with blob data');
        }
        
        // Create a recording object for localStorage
        const localRecording = {
          id: `local_${Date.now()}`,
          name: fileName,
          date: new Date().toISOString(),
          url: URL.createObjectURL(finalBlob),
          emotion_data: {
            ...combinedMetadata,
            // Add blob metadata if available
            ...(blobData || {}),
            // Include the audio analysis data for local storage
            audioAnalysisData
          },
          duration,
          mime_type: finalBlob.type
        };
        
        // Get existing recordings from localStorage
        const existingRecordingsStr = localStorage.getItem('audioRecordings');
        const existingRecordings = existingRecordingsStr ? JSON.parse(existingRecordingsStr) : [];
        
        // Add new recording and save to localStorage
        localStorage.setItem('audioRecordings', JSON.stringify([localRecording, ...existingRecordings]));
        
        console.log('Successfully saved to localStorage as fallback');
        return true;
      } catch (localStorageError) {
        console.error('Error saving to localStorage:', localStorageError);
        return false;
      }
    }
    
    return supabaseSuccess;
  } catch (error) {
    console.error('Error saving recording:', error);
    return false;
  }
};

// Fetch recordings with fallback to localStorage
export const fetchRecordings = async (): Promise<Recording[]> => {
  try {
    console.log('Fetching recordings from Supabase...');
    
    try {
      // Try Supabase first
      const result = await fetchSupabaseRecordings();
      console.log('Fetch result from Supabase:', result);
      
      const { data, error } = result as { data: Recording[] | null, error: any };
      
      if (error) {
        console.error('Supabase error, falling back to localStorage:', error);
        throw new Error('Supabase fetch failed');
      }
      
      if (!data) {
        console.warn('No data returned from Supabase, checking localStorage');
        throw new Error('No Supabase data');
      }
      
      // If we have data (even empty array), return it
      // This prevents falling back to localStorage when there are simply no recordings yet
      // Ensure all data has the required fields
      const processedData = await Promise.all(data.map(async recording => {
        // Fix public URL if needed
        let fixedUrl = recording.public_url || '';
        
        // Fix any incorrect paths in the URL
        if (fixedUrl.includes('/public/public/')) {
          fixedUrl = fixedUrl.replace('/public/public/', '/public/');
          console.log('Fixed incorrect path in URL during processing:', fixedUrl);
        }
        
        // Add default MIME type if missing
        let mimeType = recording.mime_type;
        if (!mimeType) {
          // Determine MIME type from file extension if possible
          if (recording.file_name.endsWith('.mp3')) {
            mimeType = 'audio/mp3';
          } else if (recording.file_name.endsWith('.wav')) {
            mimeType = 'audio/wav';
          } else if (recording.file_name.endsWith('.webm')) {
            mimeType = 'audio/webm';
          } else {
            // Default to MP3 as best guess for compatibility
            mimeType = 'audio/mp3';
          }
        }
        
        // Check URL validity and fix format if needed
        if (fixedUrl.startsWith('http')) {
          try {
            // Try to check if the URL is accessible
            const response = await fetch(fixedUrl, { method: 'HEAD' }).catch(() => null);
            if (!response) {
              console.warn('Recording URL not accessible:', fixedUrl);
            }
          } catch (error) {
            console.warn('Error checking recording URL:', error);
            // Continue with original URL - we'll handle playback errors later
          }
        }
        
        return {
          ...recording,
          // Ensure path is correct for later use
          file_path: recording.file_path || recording.file_name,
          // Make sure public_url is available and correctly formatted
          public_url: fixedUrl,
          // Add MIME type
          mime_type: mimeType
        };
      }));
      
      console.log(`Successfully fetched ${processedData.length} recordings from Supabase`);
      return processedData;
    } catch (supabaseError) {
      // Fallback to localStorage
      console.log('Using localStorage fallback for recordings');
      const localRecordingsStr = localStorage.getItem('audioRecordings');
      
      if (!localRecordingsStr) {
        console.log('No recordings found in localStorage');
        return [];
      }
      
      const localRecordings: LocalRecording[] = JSON.parse(localRecordingsStr);
      
      // Convert LocalRecording to Recording format
      const recordings: Recording[] = localRecordings.map((local, index) => ({
        id: index + 1, // Generate sequential IDs
        file_name: local.name,
        public_url: local.url,
        duration: local.duration || 0,
        recorded_at: local.date,
        emotion_data: local.emotion_data || null,
        created_at: local.date,
        updated_at: local.date,
        file_path: local.name, // Use name as file_path for consistency
        mime_type: local.mime_type || (local.name.endsWith('.mp3') ? 'audio/mp3' : 
                    local.name.endsWith('.wav') ? 'audio/wav' : 
                    local.name.endsWith('.webm') ? 'audio/webm' : 'audio/mp3')
      }));
      
      console.log(`Successfully fetched ${recordings.length} recordings from localStorage`);
      return recordings;
    }
  } catch (error) {
    console.error('Error fetching recordings:', error);
    return [];
  }
};

// Convert audio format to be browser-compatible
export const convertAudioForBrowserPlayback = async (audioUrl: string): Promise<string> => {
  try {
    if (!audioUrl) return '';
    
    // If already a blob URL from our app, return as is
    if (audioUrl.startsWith('blob:')) {
      return audioUrl;
    }
    
    console.log('Converting audio for browser playback:', audioUrl);
    
    // Add cache-busting parameter to avoid caching issues with Supabase URLs
    const urlWithNoCacheParam = audioUrl.includes('?') 
      ? `${audioUrl}&_nocache=${Date.now()}` 
      : `${audioUrl}?_nocache=${Date.now()}`;
    
    // Fetch the audio file with appropriate headers for CORS
    try {
      const response = await fetch(urlWithNoCacheParam, {
        method: 'GET',
        headers: {
          'Range': 'bytes=0-', // Request range to help with partial content responses
          'Cache-Control': 'no-cache', // Avoid caching issues
          'Pragma': 'no-cache',
        },
        mode: 'cors', // Use CORS mode to handle cross-origin requests
        credentials: 'omit', // Don't send cookies to reduce CORS issues
      });
      
      if (!response.ok) {
        console.error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
        
        // Try alternative fetch approach without Range header, which can cause issues
        console.log('Trying alternative fetch approach without Range header');
        const altResponse = await fetch(urlWithNoCacheParam, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
          mode: 'cors',
          credentials: 'omit',
        });
        
        if (!altResponse.ok) {
          console.error(`Alternative fetch also failed: ${altResponse.status} ${altResponse.statusText}`);
          throw new Error(`Failed to fetch audio: ${altResponse.status}`);
        }
        
        const audioBlob = await altResponse.blob();
        console.log('Fetched audio blob with alternative method:', audioBlob.type, audioBlob.size);
        return handleAudioBlob(audioBlob);
      }
      
      // Get the audio file as blob
      const audioBlob = await response.blob();
      console.log('Fetched audio blob:', audioBlob.type, audioBlob.size);
      
      return handleAudioBlob(audioBlob);
    } catch (fetchError) {
      console.error('Error fetching audio:', fetchError);
      
      // If all attempts fail, return a data URI for the "audio not available" message
      console.log('Creating fallback "audio not available" message');
      return createAudioNotAvailableMessage();
    }
  } catch (error) {
    console.error('Error converting audio for browser playback:', error);
    return audioUrl; // Return original URL on failure
  }
};

// Helper function to process audio blob and prepare for playback
const handleAudioBlob = (audioBlob: Blob): string => {
  // Check if blob is valid
  if (!audioBlob || audioBlob.size === 0) {
    console.error('Received empty audio blob');
    return createAudioNotAvailableMessage();
  }
  
  // Small function to test if audio can be played
  const canBrowserPlayType = (mimeType: string): boolean => {
    const audio = document.createElement('audio');
    return audio.canPlayType(mimeType) !== '';
  };
  
  // Detect the format from blob type
  let detectedFormat = audioBlob.type.toLowerCase();
  console.log('Detected audio format:', detectedFormat);
  
  // Normalize common audio types for better detection
  if (detectedFormat.includes('mpeg') || detectedFormat.includes('mp3')) {
    detectedFormat = 'audio/mpeg';
  } else if (detectedFormat.includes('wav')) {
    detectedFormat = 'audio/wav';
  } else if (detectedFormat.includes('webm')) {
    detectedFormat = 'audio/webm';
  } else if (detectedFormat.includes('ogg')) {
    detectedFormat = 'audio/ogg';
  } else if (detectedFormat.includes('aac') || detectedFormat.includes('mp4')) {
    detectedFormat = 'audio/aac';
  } else if (detectedFormat === '' || detectedFormat === 'application/octet-stream') {
    // Try to auto-detect based on common browser support
    detectedFormat = 'audio/mpeg'; // Default to MP3 as most widely supported
  }
  
  // Check if the browser can play this format
  if (canBrowserPlayType(detectedFormat)) {
    console.log(`Browser can play ${detectedFormat}, creating blob URL`);
    // Create a blob with the correct MIME type
    const playableBlob = new Blob([audioBlob], { type: detectedFormat });
    return URL.createObjectURL(playableBlob);
  }
  
  // Find a format the browser supports
  console.log('Finding a compatible audio format for this browser');
  let compatibleFormat = '';
  
  if (canBrowserPlayType('audio/mpeg')) {
    compatibleFormat = 'audio/mpeg';
  } else if (canBrowserPlayType('audio/webm')) {
    compatibleFormat = 'audio/webm';
  } else if (canBrowserPlayType('audio/wav')) {
    compatibleFormat = 'audio/wav';
  } else if (canBrowserPlayType('audio/ogg')) {
    compatibleFormat = 'audio/ogg';
  } else if (canBrowserPlayType('audio/aac')) {
    compatibleFormat = 'audio/aac';
  }
  
  if (compatibleFormat) {
    console.log(`Converting to ${compatibleFormat} for browser compatibility`);
    // Create a new blob with the compatible format
    const compatibleBlob = new Blob([audioBlob], { type: compatibleFormat });
    return URL.createObjectURL(compatibleBlob);
  }
  
  // If no compatible format found, try with the original blob anyway
  console.warn('No compatible audio format found, trying with original format');
  return URL.createObjectURL(audioBlob);
};

// Create a "audio not available" message using a data URI
const createAudioNotAvailableMessage = (): string => {
  // Try to create a simple beep sound as fallback
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.value = 440; // A4 note
    gainNode.gain.value = 0.5;
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    // Record the beep
    const duration = 0.5; // seconds
    const sampleRate = audioCtx.sampleRate;
    const frameCount = sampleRate * duration;
    const audioBuffer = audioCtx.createBuffer(1, frameCount, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    // Fill with a simple sine wave
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = Math.sin(440 * 2 * Math.PI * i / sampleRate) * 0.5;
    }
    
    // Convert buffer to WAV
    const wavBuffer = audioBufferToWav(audioBuffer);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error('Failed to create audio not available message:', e);
    // Return an empty audio blob as last resort
    const emptyBlob = new Blob([], { type: 'audio/wav' });
    return URL.createObjectURL(emptyBlob);
  }
};

// Convert AudioBuffer to WAV format
const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM format
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  // Create the WAV file buffer
  const dataLength = buffer.length * numChannels * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);
  
  // RIFF identifier
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  
  // Format chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, format, true); // format (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  
  // Data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Write the audio data
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      // Convert float to int16
      const int16 = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += bytesPerSample;
    }
  }
  
  return arrayBuffer;
};

// Helper to write string to DataView
const writeString = (view: DataView, offset: number, string: string): void => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

// Delete a recording with localStorage fallback
export const deleteRecording = async (id: number): Promise<boolean> => {
  try {
    // Check if this is a localStorage recording (id will be a number but converted from a string like "local_1234567890")
    const localRecordingsStr = localStorage.getItem('audioRecordings');
    if (localRecordingsStr) {
      const localRecordings: LocalRecording[] = JSON.parse(localRecordingsStr);
      
      // If we have the same number of local recordings as the id, this might be a localStorage recording
      if (id <= localRecordings.length) {
        // This is likely a localStorage recording
        const updatedRecordings = localRecordings.filter((_, index) => index !== id - 1);
        localStorage.setItem('audioRecordings', JSON.stringify(updatedRecordings));
        console.log('Deleted recording from localStorage');
        return true;
      }
    }
    
    // If not a localStorage recording, try Supabase
    try {
      // First fetch the recording to get the file path
      const recordings = await fetchRecordings();
      const recording = recordings.find(rec => rec.id === id);
      
      if (!recording) {
        throw new Error('Recording not found');
      }
      
      const result = await deleteSupabaseRecording(id, recording.file_path);
      const { error } = result as { data: any, error: any };
      
      if (error) {
        console.error('Supabase delete error:', error);
        throw new Error('Supabase delete failed');
      }
      
      console.log('Successfully deleted recording from Supabase');
      return true;
    } catch (supabaseError) {
      console.error('Failed to delete from Supabase:', supabaseError);
      return false;
    }
  } catch (error) {
    console.error('Error deleting recording:', error);
    return false;
  }
};