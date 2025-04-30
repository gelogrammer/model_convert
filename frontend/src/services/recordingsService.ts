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
    
    try {
      // Try Supabase first
      console.log('Attempting to save to Supabase...');
      console.log('Audio blob type:', recordedBlob.type);
      console.log('Audio blob size:', recordedBlob.size, 'bytes');
      
      // First check if we can access the bucket
      const { supabase } = await import('./supabaseService');
      try {
        const { error: bucketError } = await supabase.storage.getBucket('recordings');
        if (bucketError) {
          console.error('Storage bucket access error:', bucketError);
          console.log('Will attempt upload anyway, bucket might still be accessible');
        } else {
          console.log('Storage bucket is accessible');
        }
      } catch (bucketCheckError) {
        console.warn('Error checking bucket access:', bucketCheckError);
      }
      
      // Create a small test blob to verify the upload functionality
      const testBlob = new Blob(['test'], { type: 'text/plain' });
      const testResult = await supabase.storage
        .from('recordings')
        .upload('test_upload.txt', testBlob, { upsert: true });
      
      if (testResult.error) {
        console.warn('Test upload failed:', testResult.error);
      } else {
        console.log('Test upload succeeded:', testResult.data);
      }
      
      // Now attempt the upload
      const { error } = await uploadRecording(recordedBlob, fileName, {
        duration,
        emotionData: sanitizedEmotionData
      });
      
      if (error) {
        console.error('Supabase upload error:', error);
        
        // Detailed error logging
        if (error.message) {
          if (error.message.includes('storage bucket')) {
            console.error('Storage bucket issue. Please make sure the recordings bucket exists.');
          } else if (error.message.includes('Database insert failed')) {
            console.error('Database insert issue. Please check table schema matches the insert operation.');
          } else if (error.message.includes('row-level security policy')) {
            console.error('RLS policy error. Check anonymous access is enabled for the table and bucket.');
          }
        }
        
        throw new Error(`Supabase upload failed: ${error.message || 'Unknown error'}`);
      }
      
      console.log('Successfully saved to Supabase');
      return true;
    } catch (supabaseError) {
      console.error('Error saving to Supabase, falling back to localStorage:', supabaseError);
      
      // Check if localStorage is available
      if (typeof localStorage === 'undefined') {
        console.error('localStorage is not available in this environment');
        throw new Error('Cannot save recording: localStorage not available');
      }
      
      // Fallback to localStorage
      try {
        const objectUrl = URL.createObjectURL(recordedBlob);
        
        // Create a recording object for localStorage
        const localRecording: LocalRecording = {
          id: `local_${Date.now()}`,
          name: fileName,
          date: new Date().toISOString(),
          url: objectUrl,
          emotion_data: sanitizedEmotionData,
          duration
        };
        
        // Get existing recordings from localStorage
        const existingRecordingsStr = localStorage.getItem('audioRecordings');
        const existingRecordings: LocalRecording[] = existingRecordingsStr ? JSON.parse(existingRecordingsStr) : [];
        
        // Add new recording and save to localStorage
        localStorage.setItem('audioRecordings', JSON.stringify([localRecording, ...existingRecordings]));
        
        console.log('Successfully saved to localStorage as fallback');
        return true;
      } catch (localStorageError) {
        console.error('Error saving to localStorage:', localStorageError);
        throw localStorageError; 
      }
    }
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