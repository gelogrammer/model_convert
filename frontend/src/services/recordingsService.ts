import { getRecordedAudio } from './audioService';
import { uploadRecording, getRecordings as fetchSupabaseRecordings, deleteRecording as deleteSupabaseRecording } from './supabaseService';

// Interface for recording data
export interface Recording {
  id: number;
  file_name: string;
  public_url: string;
  duration: number;
  recorded_at: string;
  emotion_data: any;
  created_at: string;
  updated_at: string;
  file_path: string;
}

// Interface for local recording data
interface LocalRecording {
  id: string;
  name: string;
  date: string;
  url: string;
  emotion_data?: any;
  duration: number;
}

// Save recording to the database using Supabase with localStorage fallback
export const saveRecordingToDatabase = async (emotionData: any): Promise<boolean> => {
  try {
    console.log('Starting saveRecordingToDatabase with emotion data:', emotionData);
    
    const recordedBlob = getRecordedAudio();
    console.log('Retrieved audio blob:', recordedBlob ? `Size: ${recordedBlob.size} bytes, Type: ${recordedBlob.type}` : 'NULL');
    
    if (!recordedBlob) {
      console.error('No recorded audio blob available - make sure recording is stopped properly');
      return false;
    }
    
    if (recordedBlob.size === 0) {
      console.error('Audio recording is empty (0 bytes) - check microphone access');
      return false;
    }
    
    // Create filename
    const fileName = `recording_${Date.now()}.webm`;
    console.log('Generated filename:', fileName);
    
    // Calculate duration (if you have this information)
    const duration = recordedBlob.size > 0 ? Math.floor(recordedBlob.size / 16000) : 0; // Rough estimation
    console.log('Estimated duration:', duration, 'ms');
    
    // Ensure we have valid emotion data
    const sanitizedEmotionData = emotionData || {};
    
    // First try to save to Supabase
    let supabaseSuccess = false;
    
    try {
      console.log('Attempting to save to Supabase...');
      
      // Try Supabase with timeout in case of API issues
      const supabasePromise = new Promise<boolean>(async (resolve) => {
        try {
          const { error } = await uploadRecording(recordedBlob, fileName, {
            duration,
            emotionData: sanitizedEmotionData
          });
          
          if (error) {
            console.error('Supabase upload error:', error);
            resolve(false);
          } else {
            console.log('Successfully saved to Supabase');
            resolve(true);
          }
        } catch (error) {
          console.error('Error during Supabase upload:', error);
          resolve(false);
        }
      });
      
      // Add a timeout to prevent hanging if Supabase is unresponsive
      const timeoutPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => {
          console.warn('Supabase upload timed out after 5 seconds');
          resolve(false);
        }, 5000);
      });
      
      // Race the Supabase upload against the timeout
      supabaseSuccess = await Promise.race([supabasePromise, timeoutPromise]);
    } catch (supabaseError) {
      console.error('Error saving to Supabase:', supabaseError);
      supabaseSuccess = false;
    }
    
    // If Supabase failed, fall back to localStorage
    if (!supabaseSuccess) {
      console.log('Supabase upload failed or timed out, falling back to localStorage');
      
      try {
        const objectUrl = URL.createObjectURL(recordedBlob);
        
        // Create a recording object for localStorage
        const localRecording = {
          id: `local_${Date.now()}`,
          name: fileName,
          date: new Date().toISOString(),
          url: objectUrl,
          emotion_data: sanitizedEmotionData,
          duration
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
      const processedData = data.map(recording => {
        // Fix public URL if needed
        let fixedUrl = recording.public_url || '';
        
        // Fix any incorrect paths in the URL
        if (fixedUrl.includes('/public/public/')) {
          fixedUrl = fixedUrl.replace('/public/public/', '/public/');
          console.log('Fixed incorrect path in URL during processing:', fixedUrl);
        }
        
        return {
          ...recording,
          // Ensure path is correct for later use
          file_path: recording.file_path || recording.file_name,
          // Make sure public_url is available and correctly formatted
          public_url: fixedUrl
        };
      });
      
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
        file_path: local.name // Use name as file_path for consistency
      }));
      
      console.log(`Successfully fetched ${recordings.length} recordings from localStorage`);
      return recordings;
    }
  } catch (error) {
    console.error('Error fetching recordings:', error);
    return [];
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