# SpeechSense AI Database Fix Instructions

## Problem
You're experiencing an issue where recordings cannot be saved or fetched because:
1. The required database table structure is missing
2. The storage bucket for recordings doesn't exist

## Solution

### Option 1: Using Supabase SQL Editor (Recommended)

1. **Access the SQL Editor**:
   - Go to: https://pztstrmccavxrgccvmjq.supabase.co/project/sql
   - Log in with your Supabase credentials

2. **Create a New SQL Query**:
   - Click the "+ New Query" button
   - Copy ALL the content from the file `create_bucket_sql.sql` 
   - Paste it into the SQL Editor

3. **Execute the Query**:
   - Click the "Run" button
   - You should see success notices for each step

4. **Restart the Application**:
   - Refresh or restart the SpeechSense AI application
   - Try recording and saving again

### Option 2: Manual Fix

If Option 1 doesn't work, you can try these manual steps:

1. **Create the Recordings Table**:
   - Go to the "Table Editor" in Supabase
   - Click "Create a new table"
   - Name: `recordings`
   - Columns:
     - `id` (type: bigint, primary key, identity)
     - `user_id` (type: uuid, nullable, default: auth.uid(), references: auth.users.id)
     - `file_name` (type: text, not null)
     - `file_path` (type: text, not null)
     - `public_url` (type: text, not null)
     - `duration` (type: bigint, not null)
     - `recorded_at` (type: timestamp with time zone, default: now())
     - `emotion_data` (type: jsonb, nullable)
     - `created_at` (type: timestamp with time zone, default: now())
     - `updated_at` (type: timestamp with time zone, default: now())

2. **Create the Storage Bucket**:
   - Go to the "Storage" section in Supabase
   - Click "Create new bucket"
   - Name: `recordings`
   - Check "Public bucket" option
   - Set file size limit to 50MB
   - Set allowed MIME types to: audio/webm, audio/mp3, audio/mpeg, audio/wav

3. **Set up RLS Policies**:
   - For both the table and bucket, enable anonymous access policies
   - Make sure "INSERT" permissions are allowed for anonymous users

## Verification

After completing either option, open your browser developer console (F12) and check for any errors related to Supabase when trying to save a recording. If you see errors about "relation does not exist" or "bucket not found", it means the setup wasn't successful.

## Need Further Help?

If you're still experiencing issues:
1. Check if the Supabase project is active and accessible
2. Verify your API credentials in the .env file
3. Look for any network errors in the browser console
4. Consider contacting support if the problem persists 