import { createClient } from '@supabase/supabase-js';

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
              allowedMimeTypes: ['audio/webm', 'audio/mpeg', 'audio/wav'],
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
  } catch (err) {
    console.error('Supabase connection test error:', err);
  }
})();

// Enable debug mode for troubleshooting database issues
// Set to true to get more detailed logs in the console
const ENABLE_DB_TROUBLESHOOTING = true;

// Function to log only in troubleshooting mode
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
      console.error('Invalid file: File is empty or null');
      return { data: null, error: new Error('Invalid file: File is empty or null') };
    }
    
    console.log('Starting upload to Supabase storage, file size:', file.size);
    console.log('File MIME type:', file.type);
    console.log('Recording duration:', metadata.duration);
    
    // Check if Supabase client is initialized
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase connection not properly initialized. Check environment variables.');
      return { data: null, error: new Error('Supabase connection not properly initialized') };
    }
    
    // Check if recordings table exists (we'll store metadata there)
    troubleshootLog('Testing if recordings table exists...');
    try {
      const { count, error: countError } = await supabase
        .from('recordings')
        .select('*', { count: 'exact', head: true })
        .limit(1);
      
      if (countError) {
        troubleshootLog('Error checking recordings table:', countError);
      } else {
        troubleshootLog(`Recordings table exists with approximately ${count} records`);
      }
    } catch (tableCheckError) {
      troubleshootLog('Error testing table existence via RPC, falling back to direct check...', tableCheckError);
    }
    
    // Try direct file upload without checking bucket first
    troubleshootLog('Attempting direct upload to recordings bucket');
    try {
      // Skip bucket check (it frequently causes errors) and try direct upload
      const result = await supabase.storage
        .from('recordings')
        .upload(`${fileName}`, file, {
          contentType: file.type || 'audio/webm',
          upsert: true,
        });
      
      const { data: uploadData, error: uploadError } = result;
      
      if (uploadError) {
        troubleshootLog('Direct upload failed:', uploadError);
        
        // Check for different error types and provide better error messages
        if (uploadError.message) {
          if (uploadError.message.includes('bucket') && uploadError.message.includes('not found')) {
            troubleshootLog('Error indicates bucket not found - this is a common issue');
          } else if (uploadError.message.includes('row-level security policy')) {
            troubleshootLog('Error indicates RLS policy issue - check Supabase settings');
          }
        }
        
        // Save metadata to database even if file upload failed
        troubleshootLog('Attempting to at least save metadata to database');
        try {
          const { error: metadataError } = await supabase
            .from('recordings')
            .insert({
              file_name: fileName,
              duration: metadata.duration,
              public_url: null, // File upload failed, so no URL
              emotion_data: metadata.emotionData,
              file_path: fileName,
            });
          
          if (metadataError) {
            troubleshootLog('Failed to save metadata:', metadataError);
          } else {
            troubleshootLog('Successfully saved metadata without file upload');
            // Return partial success since we at least saved the metadata
            return { 
              data: { partial: true, message: 'Metadata saved but file upload failed' }, 
              error: null 
            };
          }
        } catch (metadataErr) {
          troubleshootLog('Error saving metadata:', metadataErr);
        }
        
        return { data: null, error: uploadError };
      }
      
      troubleshootLog('Upload successful:', uploadData);
      
      // Get the public URL
      const { data: publicUrlData } = supabase.storage
        .from('recordings')
        .getPublicUrl(`${fileName}`);
      
      const publicUrl = publicUrlData?.publicUrl || '';
      troubleshootLog('Generated public URL:', publicUrl);
      
      // Insert record into database
      troubleshootLog('Saving recording metadata to database');
      const { data: recordData, error: recordError } = await supabase
        .from('recordings')
        .insert({
          file_name: fileName,
          public_url: publicUrl,
          duration: metadata.duration,
          emotion_data: metadata.emotionData,
          file_path: fileName,
        })
        .select()
        .single();
      
      if (recordError) {
        troubleshootLog('Database insert error:', recordError);
        return { 
          data: { fileUploaded: true, metadataSaved: false }, 
          error: { message: 'File uploaded but database insert failed', details: recordError } 
        };
      }
      
      troubleshootLog('Successfully saved recording with ID:', recordData?.id);
      return { data: recordData, error: null };
    } catch (directUploadError) {
      troubleshootLog('Direct upload operation failed:', directUploadError);
      return { data: null, error: directUploadError };
    }
  } catch (error) {
    console.error('Unexpected error in uploadRecording:', error);
    return { data: null, error };
  }
};

// Function to get all recordings
export const getRecordings = async () => {
  try {
    console.log('Fetching recordings from Supabase table...');
    
    if (ENABLE_DB_TROUBLESHOOTING) {
      troubleshootLog('Checking Supabase connection and configuration...');
      troubleshootLog('Supabase URL:', supabaseUrl);
      troubleshootLog('Supabase Key exists:', !!supabaseKey);
      
      // Test authentication status
      const { data: authData } = await supabase.auth.getSession();
      troubleshootLog('Auth session:', authData);
      
      // Check if recordings table exists
      try {
        troubleshootLog('Testing if recordings table exists...');
        const { data: tableData, error: tableError } = await supabase.rpc('test_table_existence', { 
          table_name: 'recordings' 
        });
        
        if (tableError) {
          troubleshootLog('Error testing table existence via RPC, falling back to direct check...');
          
          // Fallback - try direct query to test table
          const { count, error: countError } = await supabase
            .from('recordings')
            .select('*', { count: 'exact', head: true });
            
          if (countError) {
            troubleshootLog('Direct table check error:', countError);
            
            if (countError.message.includes('does not exist')) {
              troubleshootLog('CRITICAL: Recordings table does not exist, needs to be created');
              // No need for alert here as we'll handle this in the try-catch block
            }
          } else {
            troubleshootLog(`Recordings table exists with approximately ${count} records`);
          }
        } else {
          troubleshootLog('Table existence test result:', tableData);
        }
      } catch (e) {
        troubleshootLog('Error checking table existence:', e);
      }
      
      // Check bucket
      try {
        troubleshootLog('Testing if recordings bucket exists...');
        const { data: bucketData, error: bucketError } = await supabase.storage.getBucket('recordings');
        
        if (bucketError) {
          troubleshootLog('Storage bucket error:', bucketError);
          if (bucketError.message.includes('not found')) {
            troubleshootLog('CRITICAL: Recordings bucket does not exist, needs to be created');
          }
        } else {
          troubleshootLog('Recordings bucket exists:', bucketData);
        }
      } catch (e) {
        troubleshootLog('Error checking bucket existence:', e);
      }
    }
    
    // First check if the recordings table exists and is accessible
    try {
      const { count, error: countError } = await supabase
        .from('recordings')
        .select('*', { count: 'exact', head: true });
        
      if (countError) {
        console.error('Error checking recordings table:', countError);
      } else {
        console.log(`Recording table contains approximately ${count} records`);
      }
    } catch (e) {
      console.error('Error checking recordings count:', e);
    }
    
    // Now get all recordings
    const response = await supabase
      .from('recordings')
      .select('*')
      .order('recorded_at', { ascending: false });
    
    console.log('Supabase getRecordings raw response:', response);
    
    // Debug the returned data
    if (response.data) {
      console.log(`Found ${response.data.length} recordings in Supabase`);
      response.data.forEach((rec, i) => {
        console.log(`Recording ${i+1}:`, {
          id: rec.id,
          file_name: rec.file_name,
          file_path: rec.file_path,
          public_url: rec.public_url,
          duration: rec.duration
        });
      });
    } else {
      console.warn('No data returned from Supabase recordings table');
    }
    
    if (response.error) {
      console.error('Error fetching recordings:', response.error);
    }
    
    return response;
  } catch (error) {
    console.error('Error fetching recordings from Supabase:', error);
    return { data: [], error: error };
  }
};

// Function to delete a recording
export const deleteRecording = async (id: number, filePath: string) => {
  try {
    // Extract the file name from the path if needed
    const fileName = filePath.includes('/') ? filePath.split('/').pop() : filePath;
    
    console.log('Deleting file from storage:', fileName);
    
    // First delete from storage
    const { error: storageError } = await supabase.storage
      .from('recordings')
      .remove([fileName || '']);

    if (storageError) {
      console.error('Storage delete error:', storageError);
      return { data: null, error: storageError };
    }

    console.log('File deleted from storage, now deleting from database, id:', id);
    
    // Then delete from database
    const { data, error } = await supabase
      .from('recordings')
      .delete()
      .eq('id', id);
      
    return { data, error };
  } catch (error) {
    console.error('Error during deletion:', error);
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
} 