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
    
    try {
      // Test if we can access the bucket before attempting upload
      console.log('Checking if recordings bucket exists...');
      const { data: bucketData, error: bucketError } = await supabase.storage.getBucket('recordings');
      
      if (bucketError) {
        console.error('Storage bucket check failed:', bucketError);
        
        // Try to create the bucket if it doesn't exist
        console.log('Attempting to create recordings bucket...');
        try {
          const { data: createBucketData, error: createBucketError } = await supabase.rpc('create_recordings_bucket_if_not_exists');
          
          if (createBucketError) {
            console.error('Failed to create recordings bucket:', createBucketError);
            return { data: null, error: { message: `Failed to create recordings bucket: ${createBucketError.message}`, details: createBucketError } };
          }
          
          console.log('Created or verified bucket:', createBucketData);
        } catch (bucketCreateError: any) {
          console.error('Error creating bucket:', bucketCreateError);
          return { data: null, error: { message: `Error creating storage bucket: ${bucketCreateError.message}`, details: bucketCreateError } };
        }
      } else {
        console.log('Recordings bucket exists:', bucketData);
      }
    } catch (bucketCheckError: any) {
      console.warn('Error checking bucket existence, will try upload anyway:', bucketCheckError);
    }
    
    // First upload the file to storage
    console.log('Uploading file to storage path:', fileName);
    let storageData;
    let storageError;
    
    try {
      const result = await supabase.storage
        .from('recordings')
        .upload(`${fileName}`, file, {
          contentType: file.type || 'audio/webm',
          upsert: true, // Changed to true to replace existing files with same name
        });
        
      storageData = result.data;
      storageError = result.error;
    } catch (uploadError: any) {
      console.error('Upload operation failed:', uploadError);
      storageError = uploadError;
    }

    if (storageError) {
      console.error('Storage error:', storageError);
      // Try to create the recordings table if it doesn't exist yet
      if (storageError.message && (storageError.message.includes('does not exist') || 
                                  storageError.message.includes('not found'))) {
        try {
          console.log('Trying to create recordings bucket as it might not exist...');
          const { error: createError } = await supabase.rpc('create_recordings_bucket_if_not_exists');
          
          if (createError) {
            console.error('Failed to create recordings bucket:', createError);
          } else {
            console.log('Successfully created recordings bucket, trying upload again...');
            
            // Try upload again
            const { data: retryData, error: retryError } = await supabase.storage
              .from('recordings')
              .upload(`${fileName}`, file, {
                contentType: file.type || 'audio/webm',
                upsert: true,
              });
              
            if (retryError) {
              console.error('Retry storage error:', retryError);
              return { data: null, error: { message: `Storage upload failed after retry: ${retryError.message}`, details: retryError } };
            }
            
            storageData = retryData;
            storageError = null;
          }
        } catch (createErr: any) {
          console.error('Error creating recordings bucket:', createErr);
        }
      }
      
      if (storageError) {
        return { data: null, error: { message: `Storage upload failed: ${storageError.message}`, details: storageError } };
      }
    }

    console.log('File uploaded successfully:', storageData);

    // Get the public URL
    const { data: publicUrlData } = supabase.storage
      .from('recordings')
      .getPublicUrl(`${fileName}`);
      
    console.log('Generated public URL:', publicUrlData);
    
    // Ensure the URL is correctly formatted and doesn't contain double public paths
    let publicUrl = publicUrlData?.publicUrl || '';
    
    // Fix the URL if it contains 'public/public' or an incorrect path
    if (publicUrl.includes('/public/public/')) {
      publicUrl = publicUrl.replace('/public/public/', '/public/');
      console.log('Fixed duplicate public path in URL:', publicUrl);
    }
    
    // Check if URL is valid - log warning if not
    if (!publicUrl) {
      console.warn('Failed to generate valid public URL for recording. Check Supabase storage settings.');
      return { data: null, error: { message: 'Failed to generate valid public URL for recording' } };
    }
    
    console.log('Final public URL to be stored:', publicUrl);

    // Check if recordings table exists
    try {
      console.log('Checking if recordings table exists...');
      const { count, error: countError } = await supabase
        .from('recordings')
        .select('*', { count: 'exact', head: true });
        
      if (countError) {
        console.error('Error checking recordings table:', countError);
        if (countError.message.includes('does not exist')) {
          console.log('Recordings table does not exist. Creating it...');
          
          try {
            const { error: createTableError } = await supabase.rpc('create_recordings_table_if_not_exists');
            
            if (createTableError) {
              console.error('Failed to create recordings table:', createTableError);
              return { data: null, error: { message: `Failed to create recordings table: ${createTableError.message}`, details: createTableError } };
            }
            
            console.log('Successfully created recordings table');
          } catch (createErr: any) {
            console.error('Error creating recordings table:', createErr);
            return { data: null, error: { message: `Error creating recordings table: ${createErr.message}`, details: createErr } };
          }
        }
      } else {
        console.log(`Recording table exists with approximately ${count} records`);
      }
    } catch (e: any) {
      console.warn('Error checking recordings table existence, will try insert anyway:', e);
    }

    // Then insert record in the database
    console.log('Inserting record into database with data:', {
      file_name: fileName,
      file_path: fileName,
      public_url: publicUrl,
      duration: metadata.duration
    });
    
    // Check if user is authenticated
    const session = await supabase.auth.getSession();
    const isAuthenticated = !!session?.data?.session;
    
    // Prepare the record - if authenticated, user_id will be set automatically
    // For anonymous users, user_id will be NULL which requires the Anonymous policy
    const recordingData = {
      file_name: fileName,
      file_path: fileName,
      public_url: publicUrl,
      duration: metadata.duration,
      recorded_at: new Date().toISOString(),
      emotion_data: metadata.emotionData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    console.log('User authentication status:', isAuthenticated ? 'Authenticated' : 'Anonymous');
    
    let dbData = null;
    let dbError = null;
    
    try {
      const result = await supabase
        .from('recordings')
        .insert([recordingData]);
        
      dbData = result.data;
      dbError = result.error;
    } catch (insertError: any) {
      console.error('Insert operation failed:', insertError);
      dbError = insertError;
    }

    if (dbError) {
      console.error('Database error:', dbError);
      
      if (dbError.message && dbError.message.includes('violates row-level security policy')) {
        console.error('RLS policy error. Make sure appropriate RLS policies are configured.');
        
        if (!isAuthenticated) {
          console.error('Anonymous user upload failed. Check if anonymous policies are enabled.');
        } else {
          console.error('Authenticated user upload failed. Check user_id constraint and policies.');
        }
      } else if (dbError.message && dbError.message.includes('does not exist')) {
        // The table doesn't exist - try creating it
        try {
          console.log('Trying to create recordings table...');
          const { error: createError } = await supabase.rpc('create_recordings_table_if_not_exists');
          
          if (createError) {
            console.error('Failed to create recordings table:', createError);
          } else {
            console.log('Successfully created recordings table, trying insert again...');
            
            // Try insert again
            const { data: retryData, error: retryError } = await supabase
              .from('recordings')
              .insert([recordingData]);
              
            if (retryError) {
              console.error('Retry database error:', retryError);
              return { data: null, error: { message: `Database insert failed after retry: ${retryError.message}`, details: retryError } };
            }
            
            dbData = retryData;
            dbError = null;
          }
        } catch (createErr: any) {
          console.error('Error creating recordings table:', createErr);
        }
      }
      
      if (dbError) {
        return { data: null, error: { message: `Database insert failed: ${dbError.message}`, details: dbError } };
      }
    }

    console.log('Database record created successfully:', dbData);
    return { data: { storage: storageData, db: dbData }, error: null };
  } catch (error: any) {
    console.error('Error uploading recording:', error);
    return { data: null, error: { message: `Unexpected error: ${error.message}`, details: error } };
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
} 