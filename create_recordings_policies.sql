-- Enable Row Level Security (if not already enabled)
ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and you want to recreate them
DO $$ 
BEGIN
    -- Attempt to drop policies if they exist
    BEGIN
        DROP POLICY IF EXISTS "Users can view their own recordings" ON public.recordings;
    EXCEPTION WHEN undefined_object THEN
        RAISE NOTICE 'Policy "Users can view their own recordings" does not exist, skipping...';
    END;
    
    BEGIN
        DROP POLICY IF EXISTS "Users can insert their own recordings" ON public.recordings;
    EXCEPTION WHEN undefined_object THEN
        RAISE NOTICE 'Policy "Users can insert their own recordings" does not exist, skipping...';
    END;
    
    BEGIN
        DROP POLICY IF EXISTS "Users can update own recordings" ON public.recordings;
    EXCEPTION WHEN undefined_object THEN
        RAISE NOTICE 'Policy "Users can update own recordings" does not exist, skipping...';
    END;
    
    BEGIN
        DROP POLICY IF EXISTS "Users can delete own recordings" ON public.recordings;
    EXCEPTION WHEN undefined_object THEN
        RAISE NOTICE 'Policy "Users can delete own recordings" does not exist, skipping...';
    END;
    
    BEGIN
        DROP POLICY IF EXISTS "Service role can manage all recordings" ON public.recordings;
    EXCEPTION WHEN undefined_object THEN
        RAISE NOTICE 'Policy "Service role can manage all recordings" does not exist, skipping...';
    END;
END $$;

-- Now create the policies
CREATE POLICY "Users can view their own recordings" 
ON public.recordings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recordings" 
ON public.recordings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recordings" 
ON public.recordings 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own recordings" 
ON public.recordings 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create or replace the service role function
CREATE OR REPLACE FUNCTION is_service_role()
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if the auth role is 'service_role'
  RETURN (SELECT current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');
END;
$$;

-- Create policy for service role
CREATE POLICY "Service role can manage all recordings" 
ON public.recordings 
USING (is_service_role());

-- NOTE: Storage bucket policies must be configured through the Supabase dashboard
-- or using the Supabase Management API instead of direct SQL 
-- as the storage schema varies between Supabase versions.
-- Please use the Supabase Dashboard to:
-- 1. Enable public access to the 'recordings' bucket
-- 2. Create appropriate bucket policies
RAISE NOTICE 'Please configure storage bucket permissions through the Supabase Dashboard Storage section'; 