-- Create this function in your Supabase SQL editor
-- This must be run as an admin/superuser

CREATE OR REPLACE FUNCTION create_recordings_bucket_if_not_exists()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- This is important - runs with definer privileges
AS $$
DECLARE
  bucket_exists boolean;
  result json;
BEGIN
  -- Check if bucket exists
  SELECT EXISTS (
    SELECT 1 FROM storage.buckets WHERE name = 'recordings'
  ) INTO bucket_exists;
  
  -- Create bucket if it doesn't exist
  IF NOT bucket_exists THEN
    -- Create the bucket
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'recordings',
      'recordings',
      true,
      52428800, -- 50MB file size limit
      '{audio/webm,audio/mp3,audio/mpeg,audio/wav}'
    );
    
    -- Create storage policies
    -- Policy for public viewing
    EXECUTE 'CREATE POLICY "Anyone can view recordings" ON storage.objects FOR SELECT USING (bucket_id = ''recordings'')';
    
    -- Policy for anonymous uploads (for testing)
    EXECUTE 'CREATE POLICY "Anonymous users can upload recordings" ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''recordings'')';
    
    -- Policy for anonymous updates (for testing)
    EXECUTE 'CREATE POLICY "Anonymous users can update recordings" ON storage.objects FOR UPDATE USING (bucket_id = ''recordings'')';
    
    -- Policy for anonymous deletes (for testing)
    EXECUTE 'CREATE POLICY "Anonymous users can delete recordings" ON storage.objects FOR DELETE USING (bucket_id = ''recordings'')';
    
    -- Policy for authenticated users
    EXECUTE 'CREATE POLICY "Authenticated users can upload recordings" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''recordings'')';
    
    -- Policy for authenticated users to update their own recordings
    EXECUTE 'CREATE POLICY "Users can update their own recordings" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''recordings'' AND owner = auth.uid())';
    
    -- Policy for authenticated users to delete their own recordings
    EXECUTE 'CREATE POLICY "Users can delete their own recordings" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''recordings'' AND owner = auth.uid())';
    
    result := json_build_object('success', true, 'message', 'Recordings bucket created successfully');
  ELSE
    result := json_build_object('success', true, 'message', 'Recordings bucket already exists');
  END IF;
  
  RETURN result;
END;
$$;

-- Grant permission to execute this function to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION create_recordings_bucket_if_not_exists() TO authenticated;
GRANT EXECUTE ON FUNCTION create_recordings_bucket_if_not_exists() TO anon; 