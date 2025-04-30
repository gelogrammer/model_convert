-- First drop existing policies if you want to recreate them
DO $$ 
BEGIN
    -- Attempt to drop policies if they exist
    BEGIN
        DROP POLICY IF EXISTS "Anonymous users can insert recordings" ON public.recordings;
    EXCEPTION WHEN undefined_object THEN
        RAISE NOTICE 'Policy "Anonymous users can insert recordings" does not exist, skipping...';
    END;
    
    BEGIN
        DROP POLICY IF EXISTS "Anonymous users can view recordings" ON public.recordings;
    EXCEPTION WHEN undefined_object THEN
        RAISE NOTICE 'Policy "Anonymous users can view recordings" does not exist, skipping...';
    END;
END $$;

-- Policy for anonymous users to insert recordings (if needed)
-- Only use this if you want to allow non-authenticated users to upload
CREATE POLICY "Anonymous users can insert recordings" 
ON public.recordings 
FOR INSERT 
WITH CHECK (true);  -- Caution: this allows anyone to insert

-- Policy for anonymous users to view recordings (if needed)
CREATE POLICY "Anonymous users can view recordings" 
ON public.recordings 
FOR SELECT 
USING (true);  -- Caution: this allows anyone to view all recordings

-- NOTE: Storage bucket policies must be configured through the Supabase dashboard
-- or using the Supabase Management API instead of direct SQL 
-- as the storage schema varies between Supabase versions.
-- For anonymous access, please configure in the Supabase Dashboard:
-- 1. Enable public access to the 'recordings' bucket
-- 2. Add policy for anonymous uploads if needed
RAISE NOTICE 'Please configure anonymous storage access through the Supabase Dashboard Storage section'; 