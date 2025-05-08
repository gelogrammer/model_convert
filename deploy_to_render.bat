@echo off
REM Script to deploy to Render

echo Preparing to deploy to Render...

REM Ensure all files are committed
echo Checking for uncommitted changes...
git status

REM Ask the user to confirm deployment
set /p confirm=Do you want to proceed with deployment to Render? (y/n): 
if /i not "%confirm%"=="y" (
    echo Deployment canceled.
    exit /b 1
)

REM Check if render CLI is installed
where render >nul 2>nul
if %errorlevel% neq 0 (
    echo Render CLI not found. Install it using: npm install -g @render/cli
    exit /b 1
)

REM Deploy using render.yaml
echo Deploying to Render using render.yaml configuration...
render deploy

echo Deployment initiated.
echo.
echo REMINDER:
echo 1. Make sure to set the model URLs in the Render dashboard:
echo    - SER_MODEL_URL
echo    - ASR_MODEL_URL
echo.
echo 2. You can monitor your deployment status in the Render dashboard.
echo.
echo 3. Once deployed, your API will be available at the URL provided by Render. 