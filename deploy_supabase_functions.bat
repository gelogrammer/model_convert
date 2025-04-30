@echo off
echo Deploying Supabase SQL functions...

echo Using Supabase URL: https://pztstrmccavxrgccvmjq.supabase.co
echo Using JWT token from environment variables

echo.
echo Creating temporary directory for combining SQL files...
mkdir sql_temp 2>nul

echo.
echo Combining SQL files into one deployment file...
echo -- Combined SQL for deployment > sql_temp\combined.sql
echo. >> sql_temp\combined.sql
type create_recordings_table_if_not_exists.sql >> sql_temp\combined.sql
echo. >> sql_temp\combined.sql
echo. >> sql_temp\combined.sql
type create_recordings_bucket_if_not_exists.sql >> sql_temp\combined.sql

echo.
echo Deployment SQL file created at sql_temp\combined.sql
echo.
echo -----------------------------------------------------
echo NOTE: You need to manually execute this SQL in the Supabase SQL Editor
echo -----------------------------------------------------
echo.
echo 1. Go to https://pztstrmccavxrgccvmjq.supabase.co/project/sql
echo 2. Open a new SQL query
echo 3. Copy the contents of sql_temp\combined.sql
echo 4. Execute the query
echo.
echo After running the SQL, you can test the functions with:
echo node test_supabase_functions.js
echo.

echo Opening the combined SQL file...
start notepad sql_temp\combined.sql

pause 