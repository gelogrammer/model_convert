# SpeechSense AI Setup Instructions

## Issue: "Failed to save recording" in Audio Capture

If you're experiencing issues with saving recordings in the SpeechSense AI application, follow these steps to resolve the database setup issues:

## Step 1: Deploy SQL Functions to Supabase

1. Run the `deploy_supabase_functions.bat` script to generate the combined SQL file.
2. Go to the [Supabase SQL Editor](https://pztstrmccavxrgccvmjq.supabase.co/project/sql).
3. Create a new SQL query.
4. Paste the contents of `sql_temp/combined.sql` into the editor.
5. Execute the query by clicking "Run" button.

This will:
- Create a `create_recordings_table_if_not_exists()` function
- Create a `create_recordings_bucket_if_not_exists()` function
- Add proper access permissions for these functions

## Step 2: Test the SQL Functions

1. Run `node test_supabase_functions.js` to test if the functions are working.
2. You should see output indicating that the table and bucket were created successfully or already exist.

## Step 3: Verify Database Setup

1. In the Supabase dashboard, go to the "Table Editor" section.
2. Verify that the `recordings` table exists with the following columns:
   - id (primary key)
   - user_id (references auth.users)
   - file_name
   - file_path
   - public_url
   - duration
   - recorded_at
   - emotion_data
   - created_at
   - updated_at

3. Go to the "Storage" section in Supabase.
4. Verify that a bucket named `recordings` exists.
5. Check that appropriate storage policies are in place.

## Step 4: Restart the Application

1. Close and reopen the SpeechSense AI application.
2. Try recording and saving audio again.

## Troubleshooting

If you continue to experience issues:

1. Check browser console for detailed error messages
2. Verify that the Supabase URL and API key are correctly configured in your `.env` file
3. Check that the anonymous RLS policies are enabled if you're using the app without authentication
4. Verify network connectivity to the Supabase backend

## Technical Details

The issue is caused by missing database tables or storage buckets in Supabase. The SQL functions created in this setup process will:

1. Create the recordings table if it doesn't exist
2. Set up the necessary row-level security policies
3. Create the storage bucket for audio files
4. Set up appropriate storage policies

The application has been enhanced with improved error handling and automatic recovery to handle these scenarios more gracefully. 