import { createClient } from '@supabase/supabase-js';
import { AudioAnalysisData } from './recordingsService';

// Log available environment variables without exposing sensitive data
console.log('Environment variables available:', {
  VITE_SUPABASE_URL: !!import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_KEY: !!import.meta.env.VITE_SUPABASE_KEY && 'KEY EXISTS BUT NOT SHOWN'
});

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or key missing. Check your .env file.');
}

// Create the Supabase client
console.log('Initializing Supabase client with URL:', supabaseUrl);
export const supabase = createClient(supabaseUrl, supabaseKey);

// Function to ensure proper database policies are set
export const ensureDatabaseSetup = async (): Promise<boolean> => {
  try {
    // First try to run the apply_database_fixes RPC function
    const { error } = await supabase.rpc('apply_database_fixes');
    
    if (error) {
      console.error('Error applying database fixes via RPC:', error);
      
      // Try to directly apply Row Level Security policies as a fallback
      try {
        // Create policies for the recordings table
        const recordingsPolicies = [
          {
            name: "Anonymous users can select recordings",
            operation: "SELECT",
            definition: "true"
          },
          {
            name: "Anonymous users can insert recordings",
            operation: "INSERT",
            definition: "true"
          },
          {
            name: "Anonymous users can update recordings",
            operation: "UPDATE",
            definition: "true"
          },
          {
            name: "Anonymous users can delete recordings",
            operation: "DELETE",
            definition: "true"
          }
        ];

        // Try to create each policy
        for (const policy of recordingsPolicies) {
          try {
            try {
              const { error: policyError } = await supabase.rpc('create_policy_if_not_exists', { 
                table_name: 'recordings',
                policy_name: policy.name,
                operation: policy.operation,
                definition: policy.definition
              });
              
              if (policyError) {
                console.warn(`Failed to create policy "${policy.name}" via RPC:`, policyError);
              }
            } catch (rpcError) {
              console.warn(`Exception creating policy "${policy.name}":`, rpcError);
            }
          } catch (policyError) {
            console.warn(`Failed to create policy "${policy.name}":`, policyError);
          }
        }
        
        // Also try to fix storage bucket and policies
        try {
          const { error: bucketError } = await supabase.storage.createBucket('recordings', {
            public: true,
            allowedMimeTypes: ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/webm'],
            fileSizeLimit: 52428800 // 50MB
          });
          
          if (bucketError) {
            console.log('Bucket may already exist, continuing...', bucketError);
          } else {
            console.log('Successfully created recordings bucket');
          }
        } catch (bucketError) {
          console.log('Error creating bucket, it may already exist:', bucketError);
        }
        
        // Try to create storage policies manually
        const storagePolicies = [
          {
            name: "Anyone can view recordings",
            operation: "SELECT",
            definition: "bucket_id = 'recordings'"
          },
          {
            name: "Anonymous users can upload recordings",
            operation: "INSERT",
            definition: "bucket_id = 'recordings'"
          },
          {
            name: "Anonymous users can update recordings",
            operation: "UPDATE",
            definition: "bucket_id = 'recordings'"
          },
          {
            name: "Anonymous users can delete recordings",
            operation: "DELETE",
            definition: "bucket_id = 'recordings'"
          }
        ];
        
        // Try to apply storage policies
        for (const policy of storagePolicies) {
          try {
            const { error: storagePolicyError } = await supabase.rpc('create_storage_policy_if_not_exists', {
              policy_name: policy.name,
              operation: policy.operation,
              definition: policy.definition
            });
            
            if (storagePolicyError) {
              console.warn(`Failed to create storage policy "${policy.name}":`, storagePolicyError);
            }
          } catch (policyError) {
            console.warn(`Exception creating storage policy "${policy.name}":`, policyError);
          }
        }
        
        console.log('Attempted manual database setup as fallback');
      } catch (manualError) {
        console.error('Manual database setup also failed:', manualError);
        return false;
      }
    } else {
      console.log('Successfully applied database fixes via RPC');
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring database setup:', error);
    return false;
  }
};

// Test the connection and ensure the recordings table exists
(async () => {
  try {
    console.log('Testing Supabase connection...');
    
    // Test if we can access the recordings table
    const { data, error } = await supabase.from('recordings').select('*').limit(1);
    
    if (error) {
      console.error('Supabase connection test failed:', error);
      
      // Check if the error is because the table doesn't exist
      if (error.message.includes('does not exist')) {
        console.warn('Recordings table does not exist. Trying to create it...');
        
        try {
          // Try to create the recordings table
          const { error: createError } = await supabase.rpc('create_recordings_table_if_not_exists');
          
          if (createError) {
            console.error('Failed to create recordings table:', createError);
          } else {
            console.log('Successfully created recordings table');
          }
        } catch (createErr) {
          console.error('Error creating recordings table:', createErr);
        }
      }
    } else {
      console.log('Supabase connection successful - recordings table accessible:', data);
    }
    
    // Test if we can access the storage bucket
    const { data: bucketData, error: bucketError } = await supabase.storage.getBucket('recordings');
    if (bucketError) {
      console.error('Supabase storage bucket test failed:', bucketError);
      
      // Try to create the bucket if it doesn't exist
      if (bucketError.message.includes('not found') || bucketError.message.includes('violates row-level security policy')) {
        try {
          console.log('Attempting to create recordings bucket...');
          
          // Use direct API call with service role headers if available
          let createBucketResult;
          try {
            const { data: createBucketData, error: createBucketError } = await supabase.storage.createBucket('recordings', {
              public: true,
              allowedMimeTypes: ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/webm'],
              fileSizeLimit: 50000000 // 50MB limit
            });
            
            createBucketResult = { data: createBucketData, error: createBucketError };
          } catch (directError) {
            console.warn('Direct bucket creation failed, trying fallback method:', directError);
            
            // Fallback - try using RPC function if available
            const { data: rpcData, error: rpcError } = await supabase.rpc('create_recordings_bucket_if_not_exists');
            createBucketResult = { data: rpcData, error: rpcError };
          }
          
          const { data: createBucketData, error: createBucketError } = createBucketResult;
          
          if (createBucketError) {
            console.error('Failed to create recordings bucket:', createBucketError);
            
            if (createBucketError.message && createBucketError.message.includes('row-level security policy')) {
              console.warn('RLS policy preventing bucket creation. Check Supabase RLS policies or use Admin API.');
            }
          } else {
            console.log('Successfully created recordings bucket:', createBucketData);
          }
        } catch (createBucketErr) {
          console.error('Error creating recordings bucket:', createBucketErr);
        }
      }
    } else {
      console.log('Supabase storage bucket accessible:', bucketData);
    }
    
    // Try to ensure database is properly set up with correct policies
    console.log('Checking database policies and fixing if needed...');
    try {
      const fixSuccess = await ensureDatabaseSetup();
      if (fixSuccess) {
        console.log('Database setup successfully verified or fixed');
      } else {
        console.warn('Could not verify or fix database setup');
      }
    } catch (setupError) {
      console.error('Error during database setup check:', setupError);
    }
  } catch (err) {
    console.error('Supabase connection test error:', err);
  }
})();

// Enable debug mode for troubleshooting database issues
// Set to true to get more detailed logs in the console
const ENABLE_DB_TROUBLESHOOTING = true;

// Function to log only in troubleshooting mode
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const troubleshootLog = (message: string, data?: any) => {
  if (ENABLE_DB_TROUBLESHOOTING) {
    if (data) {
      console.log(`[TROUBLESHOOT] ${message}`, data);
    } else {
      console.log(`[TROUBLESHOOT] ${message}`);
    }
  }
};

// Function to upload audio recording to Supabase Storage
export const uploadRecording = async (
  file: Blob,
  fileName: string,
  metadata: RecordingMetadata
): Promise<{ data: any; error: any }> => {
  try {
    // Validate inputs
    if (!file || file.size === 0) {
      troubleshootLog('Upload validation failed: empty or null file');
      console.error('Invalid file: File is empty or null');
      return { data: null, error: new Error('Invalid file: File is empty or null') };
    }
    
    troubleshootLog('Starting upload process', { fileName, fileSize: file.size, mimeType: file.type });
    console.log('Starting upload to Supabase storage, file size:', file.size);
    console.log('File MIME type:', file.type);
    console.log('Recording duration:', metadata.duration);
    
    // CRITICAL: Never convert WAV files as this might be causing truncation
    // Just upload the original blob exactly as received from the recorder
    const uploadBlob = file;
    const contentType = file.type || metadata.mimeType || 'audio/wav';
    
    // Ensure the file extension matches the content type
    let fileExtension = 'wav';
    if (contentType.includes('mp3') || contentType.includes('mpeg')) {
      fileExtension = 'mp3';
    } else if (contentType.includes('webm')) {
      fileExtension = 'webm';
    } else if (contentType.includes('ogg')) {
      fileExtension = 'ogg';
    }
    
    // Ensure filename has correct extension
    if (!fileName.toLowerCase().endsWith(`.${fileExtension}`)) {
      fileName = fileName.split('.')[0] + `.${fileExtension}`;
    }
    
    console.log(`Uploading original file with content type: ${contentType}, filename: ${fileName}`);
    
    // Try the upload with multiple fallbacks
    try {
      console.log('Attempting primary upload method with original blob...');
      
      // Try with standard upload first
      let uploadData;
      let uploadError;
      
      try {
        const uploadResult = await supabase.storage
          .from('recordings')
          .upload(fileName, uploadBlob, {
            contentType,
            upsert: true,
            cacheControl: 'no-cache' // Prevent caching issues during playback
          });
          
        uploadData = uploadResult.data;
        uploadError = uploadResult.error;
      } catch (directUploadError) {
        console.error('Exception during direct upload:', directUploadError);
        uploadError = directUploadError;
      }
      
      // If the standard upload fails, try alternatives
      if (uploadError) {
        console.warn('Standard upload failed, trying alternative methods:', uploadError);
        
        // Try simpler upload with fewer options
        try {
          console.log('Attempting simplified upload...');
          // Generate a simpler filename with correct extension
          const simpleFileName = `audio_${Date.now()}.${fileExtension}`;
          
          const { data: altData, error: altError } = await supabase.storage
            .from('recordings')
            .upload(simpleFileName, uploadBlob, {
              contentType,
              cacheControl: 'no-cache'
            });
          
          if (altError) {
            console.error('Alternative upload also failed:', altError);
          } else {
            console.log('Alternative upload succeeded:', altData);
            uploadData = altData;
            fileName = simpleFileName; // Update filename for database entry
          }
        } catch (altUploadError) {
          console.error('Exception during alternative upload:', altUploadError);
        }
      }
      
      // If we still don't have upload data, return the error
      if (!uploadData) {
        return { 
          data: null, 
          error: uploadError || new Error('All upload attempts failed') 
        };
      }
      
      console.log('File uploaded successfully:', uploadData);
      
      // Get the public URL
      const { data: publicUrlData } = supabase.storage
        .from('recordings')
        .getPublicUrl(fileName);
      
      const publicUrl = publicUrlData?.publicUrl || '';
      console.log('Generated public URL:', publicUrl);
      
      // Record simplified metadata first in case of permission issues
      try {
        console.log('Saving recording metadata to database...');
        const { data: recordData, error: recordError } = await supabase
          .from('recordings')
          .insert({
            file_name: fileName,
            file_path: fileName,
            public_url: publicUrl,
            duration: metadata.duration || 0,
            emotion_data: metadata.emotionData || {},
            recorded_at: new Date().toISOString(),
            mime_type: contentType // Store the MIME type for better playback
          })
          .select()
          .single();
        
        if (recordError) {
          console.error('Database insert error:', recordError);
          
          // Try with minimal data if there's an error
          if (recordError.message && (
            recordError.message.includes('permission') || 
            recordError.message.includes('policy') || 
            recordError.message.includes('security')
          )) {
            console.log('Trying simplified database insert');
            const { data: minimalData, error: minimalError } = await supabase
              .from('recordings')
              .insert({
                file_name: fileName,
                file_path: fileName,
                public_url: publicUrl,
                duration: metadata.duration || 0,
                recorded_at: new Date().toISOString(),
                mime_type: contentType // Store the MIME type for better playback
              })
              .select()
              .single();
            
            if (minimalError) {
              console.error('Simplified insert also failed:', minimalError);
              return { 
                data: { 
                  fileUploaded: true, 
                  metadataSaved: false,
                  publicUrl,
                  fileName,
                  mimeType: contentType
                }, 
                error: minimalError 
              };
            } else {
              console.log('Simplified metadata insert succeeded:', minimalData);
              return { data: minimalData, error: null };
            }
          }
          
          // Return partial success - file uploaded but metadata failed
          return { 
            data: { 
              fileUploaded: true, 
              metadataSaved: false,
              publicUrl,
              fileName,
              mimeType: contentType
            }, 
            error: recordError 
          };
        }
        
        console.log('Recording saved to database successfully:', recordData);
        return { data: recordData, error: null };
      } catch (metadataError) {
        console.error('Exception during metadata save:', metadataError);
        return { 
          data: { 
            fileUploaded: true, 
            metadataSaved: false,
            publicUrl,
            fileName,
            mimeType: contentType
          }, 
          error: metadataError 
        };
      }
    } catch (error) {
      console.error('Error in upload process:', error);
      return { data: null, error };
    }
  } catch (error) {
    console.error('Unexpected error in uploadRecording:', error);
    return { data: null, error };
  }
};

// Fetch recordings from Supabase
export const getRecordings = async () => {
  try {
    console.log('Fetching recordings from Supabase...');
    
    // Fetch recordings from database
    const { data: recordings, error: recordingsError } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (recordingsError) {
      console.error('Error fetching recordings:', recordingsError);
      return { data: [], error: recordingsError };
    }
    
    if (!recordings || recordings.length === 0) {
      return { data: [], error: null };
    }
    
    // Fetch audio analysis data for all recordings
    const recordingIds = recordings.map(rec => rec.id);
    const { data: analysisData, error: analysisError } = await supabase
      .from('audio_analysis')
      .select('*')
      .in('recording_id', recordingIds);
    
    if (analysisError) {
      console.error('Error fetching audio analysis:', analysisError);
      // Continue with recordings but without analysis
    }
    
    // Create a lookup map for quick access to analysis data
    const analysisMap = new Map();
    if (analysisData && analysisData.length > 0) {
      analysisData.forEach(analysis => {
        analysisMap.set(analysis.recording_id, analysis);
      });
    }
    
    // Enhance recordings with audio analysis data
    const enhancedRecordings = recordings.map(recording => {
      const analysis = analysisMap.get(recording.id);
      
      if (analysis) {
        // If we have dedicated analysis data, add it to emotion_data
        const enhancedEmotionData = recording.emotion_data || {};
        
        // Convert from database format to the expected frontend format
        const analysisForFrontend = {
          duration: analysis.duration,
          averageVolume: analysis.average_volume,
          peakVolume: analysis.peak_volume,
          silenceDuration: analysis.silence_duration,
          speechRate: analysis.speech_rate,
          wordCount: analysis.word_count,
          speechRateCategory: {
            fluency: analysis.fluency,
            tempo: analysis.tempo,
            pronunciation: analysis.pronunciation
          },
          audioQuality: {
            clarity: analysis.audio_clarity,
            noiseLevel: analysis.noise_level,
            distortion: analysis.distortion
          },
          segments: analysis.segments || [],
          timestamp: analysis.created_at,
          dominantEmotion: analysis.dominant_emotion,
          emotionAnalysis: generateEmotionAnalysis(analysis.dominant_emotion)
        };
        
        return {
          ...recording,
          audio_analysis_id: analysis.id,
          emotion_data: {
            ...enhancedEmotionData,
            audioAnalysis: analysisForFrontend
          }
        };
      }
      
      return recording;
    });
    
    console.log(`Found ${enhancedRecordings.length} recordings with ${analysisMap.size} analysis records`);
    return { data: enhancedRecordings, error: null };
  } catch (error) {
    console.error('Error in getRecordings:', error);
    return { data: [], error };
  }
};

// Helper function to generate emotion analysis text based on emotion
function generateEmotionAnalysis(emotion: string): string {
  const emotionName = emotion?.toLowerCase() || 'unknown';
  
  switch(emotionName) {
    case 'happy':
      return "Your voice conveys happiness and positive energy. This upbeat tone helps create an engaging and optimistic atmosphere, which can be effective for motivational content and building rapport with listeners.";
    case 'sad':
      return "Your voice reflects a somber or melancholic tone. This emotional quality can create empathy and connection when discussing serious topics, though it may benefit from more variation for engaging longer conversations.";
    case 'angry':
      return "Your voice expresses intensity and strong conviction. This passionate delivery can be powerful for persuasive content, though moderating the tone for different segments might create better listener engagement over time.";
    case 'fear':
      return "Your voice conveys apprehension or concern. This cautious delivery style can be effective when discussing risks or warnings, though it may benefit from balancing with more confident tones in other segments.";
    case 'surprise':
      return "Your voice expresses wonder and curiosity. This engaged tone creates interest and can effectively maintain listener attention, particularly useful when introducing new concepts or unexpected information.";
    case 'disgust':
      return "Your voice conveys strong disapproval or aversion. This critical tone can be appropriate when discussing problematic issues, though balancing with constructive alternatives may create a more positive overall impression.";
    case 'neutral':
    case 'calm':
      return "Your speech tone is primarily neutral and measured. This balanced delivery is appropriate for informational content and creates a sense of credibility and objectivity.";
    default:
      if (emotionName !== 'unknown') {
        return `Your voice primarily expresses ${emotionName}, creating a distinctive emotional quality in your delivery. This emotional tone adds personality to your speech and helps create connection with listeners.`;
      }
      return "No emotion analysis available.";
  }
}

// Function to delete a recording
export const deleteRecording = async (id: number, filePath: string) => {
  try {
    console.log(`Deleting recording with ID ${id} and file path ${filePath}...`);
    
    // First delete the audio analysis if it exists
    // This should happen automatically due to the foreign key constraint with ON DELETE CASCADE,
    // but we'll do it explicitly to be safe
    const { error: analysisError } = await supabase
      .from('audio_analysis')
      .delete()
      .eq('recording_id', id);
    
    if (analysisError) {
      console.error('Error deleting audio analysis:', analysisError);
      // Continue with deletion anyway, as the recording is the primary resource
    }
    
    // Delete the actual recording entry
    const { data, error } = await supabase
      .from('recordings')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting recording from database:', error);
      return { data: null, error };
    }
    
    console.log('Recording deleted from database successfully');
    
    // Also attempt to delete the file from storage
    if (filePath) {
      try {
        console.log(`Attempting to delete file from storage: ${filePath}`);
        const { error: storageError } = await supabase.storage
          .from('recordings')
          .remove([filePath]);
        
        if (storageError) {
          console.error('Error deleting storage file:', storageError);
          // We don't fail the overall operation if just the storage deletion fails
        } else {
          console.log('Storage file deleted successfully');
        }
      } catch (storageErr) {
        console.error('Exception during storage file deletion:', storageErr);
      }
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('Exception in deleteRecording:', error);
    return { data: null, error };
  }
};

// Type for recording metadata
export interface RecordingMetadata {
  duration: number;
  emotionData?: any;
  settings?: {
    confidenceThreshold?: number;
    useSmoothing?: boolean;
  };
  mimeType?: string; // Type of the audio file for better browser compatibility
}

// Save audio analysis to Supabase
export const saveAudioAnalysis = async (analysisData: AudioAnalysisData) => {
  try {
    console.log('Saving audio analysis to Supabase:', analysisData);
    
    // Insert the analysis data into the audio_analysis table
    const { data, error } = await supabase
      .from('audio_analysis')
      .insert([
        {
          recording_id: analysisData.recording_id,
          duration: analysisData.duration,
          average_volume: analysisData.average_volume,
          peak_volume: analysisData.peak_volume,
          silence_duration: analysisData.silence_duration,
          speech_rate: analysisData.speech_rate,
          word_count: analysisData.word_count,
          fluency: analysisData.fluency,
          tempo: analysisData.tempo,
          pronunciation: analysisData.pronunciation,
          audio_clarity: analysisData.audio_clarity,
          noise_level: analysisData.noise_level,
          distortion: analysisData.distortion,
          dominant_emotion: analysisData.dominant_emotion,
          emotion_confidence: analysisData.emotion_confidence,
          segments: analysisData.segments
        }
      ])
      .select()
      .single();
    
    if (error) {
      console.error('Error saving audio analysis:', error);
      
      // If the record already exists (due to the unique constraint), perform an update instead
      if (error.code === '23505') {  // Unique violation code
        console.log('Recording analysis already exists, updating instead...');
        
        const { data: updateData, error: updateError } = await supabase
          .from('audio_analysis')
          .update({
            duration: analysisData.duration,
            average_volume: analysisData.average_volume,
            peak_volume: analysisData.peak_volume,
            silence_duration: analysisData.silence_duration,
            speech_rate: analysisData.speech_rate,
            word_count: analysisData.word_count,
            fluency: analysisData.fluency,
            tempo: analysisData.tempo,
            pronunciation: analysisData.pronunciation,
            audio_clarity: analysisData.audio_clarity,
            noise_level: analysisData.noise_level,
            distortion: analysisData.distortion,
            dominant_emotion: analysisData.dominant_emotion,
            emotion_confidence: analysisData.emotion_confidence,
            segments: analysisData.segments,
            updated_at: new Date().toISOString()
          })
          .eq('recording_id', analysisData.recording_id)
          .select()
          .single();
          
        if (updateError) {
          console.error('Error updating audio analysis:', updateError);
          return { data: null, error: updateError };
        }
        
        return { data: updateData, error: null };
      }
      
      return { data: null, error };
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('Exception saving audio analysis:', error);
    return { data: null, error };
  }
};

// Save analysis data to the audio_analysis table
export const saveViewAnalysis = async (analysisData: any) => {
  try {
    console.log('Saving audio analysis to Supabase:', analysisData);
    
    // Parse the confidence from the dominant emotion string (e.g., "Happy (85%)")
    let emotionConfidence = 0;
    let dominantEmotion = "Unknown";
    
    if (analysisData.dominantEmotion) {
      // Extract the emotion name without the percentage part
      dominantEmotion = analysisData.dominantEmotion.split(' ')[0];
      
      // Extract the confidence percentage if available
      if (analysisData.dominantEmotion.match(/\((\d+)%\)/)) {
        emotionConfidence = parseFloat(analysisData.dominantEmotion.match(/\((\d+)%\)/)[1]) / 100;
      }
    }
    
    // Insert the analysis data into the audio_analysis table
    const { data, error } = await supabase
      .from('audio_analysis')
      .insert([
        {
          recording_id: analysisData.recording_id,
          duration: analysisData.duration || 0,
          average_volume: analysisData.averageVolume || 0,
          peak_volume: analysisData.peakVolume || 0,
          silence_duration: analysisData.silenceDuration || 0,
          speech_rate: Math.round(analysisData.speechRate) || 0,
          word_count: analysisData.wordCount || 0,
          fluency: analysisData.speechRateCategory?.fluency || 'Medium Fluency',
          tempo: analysisData.speechRateCategory?.tempo || 'Medium Tempo',
          pronunciation: analysisData.speechRateCategory?.pronunciation || 'Clear Pronunciation',
          audio_clarity: analysisData.audioQuality?.clarity || 0.7,
          noise_level: analysisData.audioQuality?.noiseLevel || 0.3,
          distortion: analysisData.audioQuality?.distortion || 0.1,
          dominant_emotion: dominantEmotion,
          emotion_confidence: emotionConfidence,
          segments: analysisData.segments || []
        }
      ])
      .select();
    
    if (error) {
      // If the record already exists (due to the unique constraint), perform an update instead
      if (error.code === '23505') {  // Unique violation code
        console.log('Recording analysis already exists, updating instead...');
        
        const { data: updateData, error: updateError } = await supabase
          .from('audio_analysis')
          .update({
            duration: analysisData.duration || 0,
            average_volume: analysisData.averageVolume || 0,
            peak_volume: analysisData.peakVolume || 0,
            silence_duration: analysisData.silenceDuration || 0,
            speech_rate: Math.round(analysisData.speechRate) || 0,
            word_count: analysisData.wordCount || 0,
            fluency: analysisData.speechRateCategory?.fluency || 'Medium Fluency',
            tempo: analysisData.speechRateCategory?.tempo || 'Medium Tempo',
            pronunciation: analysisData.speechRateCategory?.pronunciation || 'Clear Pronunciation',
            audio_clarity: analysisData.audioQuality?.clarity || 0.7,
            noise_level: analysisData.audioQuality?.noiseLevel || 0.3,
            distortion: analysisData.audioQuality?.distortion || 0.1,
            dominant_emotion: dominantEmotion,
            emotion_confidence: emotionConfidence,
            segments: analysisData.segments || [],
            updated_at: new Date().toISOString()
          })
          .eq('recording_id', analysisData.recording_id)
          .select();
          
        if (updateError) {
          console.error('Error updating audio analysis:', updateError);
          return { data: null, error: updateError };
        }
        
        return { data: updateData, error: null };
      }
      
      console.error('Error saving audio analysis:', error);
      return { data: null, error };
    }
    
    return { data, error: null };
  } catch (error) {
    console.error('Exception saving audio analysis:', error);
    return { data: null, error };
  }
};

// Test Supabase connection status
export const testSupabaseConnection = async (): Promise<{ connected: boolean; message: string }> => {
  try {
    console.log('Testing Supabase connection...');
    
    // Check URL and key
    if (!supabaseUrl || !supabaseKey) {
      return {
        connected: false,
        message: 'Supabase URL or key missing. Check your .env file.'
      };
    }
    
    // Try to access the storage buckets
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    
    if (bucketError) {
      console.error('Error accessing Supabase storage:', bucketError);
      return {
        connected: false,
        message: `Storage error: ${bucketError.message}`
      };
    }
    
    // Try to check the recordings table
    const { count, error: tableError } = await supabase
      .from('recordings')
      .select('*', { count: 'exact', head: true })
      .limit(1);
    
    if (tableError) {
      console.error('Error accessing recordings table:', tableError);
      return {
        connected: false,
        message: `Database error: ${tableError.message}`
      };
    }
    
    // Check if recordings bucket exists
    const recordingsBucketExists = buckets?.some(b => b.name === 'recordings') || false;
    
    return {
      connected: true,
      message: `Connected successfully. Table has ${count || 0} recordings. Recordings bucket ${recordingsBucketExists ? 'exists' : 'does not exist'}.`
    };
  } catch (error) {
    console.error('Unexpected error testing Supabase connection:', error);
    return {
      connected: false,
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}; 