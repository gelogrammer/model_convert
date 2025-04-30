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
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('recordings', 'recordings', true);
    
    result := json_build_object('success', true, 'message', 'Recordings bucket created successfully');
  ELSE
    result := json_build_object('success', true, 'message', 'Recordings bucket already exists');
  END IF;
  
  RETURN result;
END;
$$;

-- Grant permission to execute this function to authenticated users
GRANT EXECUTE ON FUNCTION create_recordings_bucket_if_not_exists() TO authenticated;
GRANT EXECUTE ON FUNCTION create_recordings_bucket_if_not_exists() TO anon;
 