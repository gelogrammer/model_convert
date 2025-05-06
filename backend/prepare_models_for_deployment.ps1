# PowerShell script to prepare ML models for deployment to Render
# This script helps upload large model files to external storage

Write-Host "Preparing models for deployment..." -ForegroundColor Green

# Create models directory if it doesn't exist
if (-not (Test-Path -Path "models")) {
    New-Item -Path "models" -ItemType Directory | Out-Null
}

# Check if models exist
if (-not (Test-Path -Path "models/SER.h5")) {
    Write-Host "Error: models/SER.h5 not found. Please make sure your models are in the correct location." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -Path "models/ASR.pth")) {
    Write-Host "Error: models/ASR.pth not found. Please make sure your models are in the correct location." -ForegroundColor Red
    exit 1
}

Write-Host "Models found. You have two options for deploying your models:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Upload models to an external service (recommended for large models)"
Write-Host "2. Include models in your Git repository (only if models are small)"
Write-Host ""
$option = Read-Host "Choose an option (1/2)"

if ($option -eq "1") {
    Write-Host ""
    Write-Host "You can upload your models to services like:" -ForegroundColor Cyan
    Write-Host "- AWS S3 (https://aws.amazon.com/s3/)"
    Write-Host "- Google Cloud Storage (https://cloud.google.com/storage)"
    Write-Host "- Azure Blob Storage (https://azure.microsoft.com/en-us/products/storage/blobs)"
    Write-Host "- Backblaze B2 (https://www.backblaze.com/b2/cloud-storage.html)"
    Write-Host ""
    Write-Host "After uploading, create a build.sh script with this content:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "#!/bin/bash"
    Write-Host "mkdir -p models"
    Write-Host "curl -L -o models/SER.h5 YOUR_SER_MODEL_URL"
    Write-Host "curl -L -o models/ASR.pth YOUR_ASR_MODEL_URL"
    Write-Host "pip install -r requirements.txt"
    Write-Host ""
    Write-Host "Then set this as your build command in Render:" -ForegroundColor Yellow
    Write-Host "chmod +x build.sh && ./build.sh"
    
    $createBuild = Read-Host "Would you like to create this build.sh file now? (y/n)"
    
    if ($createBuild -eq "y" -or $createBuild -eq "Y") {
        # Create the build.sh file
        @"
#!/bin/bash
# Create models directory
mkdir -p models

# Download models from storage service
# Replace these URLs with your actual model URLs after uploading
curl -L -o models/SER.h5 YOUR_SER_MODEL_URL
curl -L -o models/ASR.pth YOUR_ASR_MODEL_URL

# Install requirements
pip install -r requirements.txt
"@ | Out-File -FilePath "build.sh" -Encoding utf8
        
        Write-Host "Created build.sh - make sure to replace the placeholder URLs with your actual model URLs." -ForegroundColor Green
    }
    
} elseif ($option -eq "2") {
    Write-Host ""
    Write-Host "To include models in your Git repository:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Check your model sizes:"
    Get-Item -Path "models/SER.h5", "models/ASR.pth" | Format-Table Name, @{Label="Size(MB)"; Expression={[math]::Round($_.Length / 1MB, 2)}}
    Write-Host ""
    Write-Host "2. If your models are larger than 100MB combined, consider option 1 instead."
    Write-Host "3. If you still want to include them, make sure your .gitignore doesn't exclude them."
    Write-Host "4. Add and commit your models to your repository:"
    Write-Host "   git add models/*.h5 models/*.pth"
    Write-Host "   git commit -m ""Add ML models for deployment"""
    Write-Host ""
    Write-Host "Note: GitHub has a 100MB file size limit for individual files." -ForegroundColor Yellow
    Write-Host "Large files may require Git LFS: https://git-lfs.github.com/"
} else {
    Write-Host "Invalid option selected. Please run the script again." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "For more information on deploying ML models on Render, see:" -ForegroundColor Cyan
Write-Host "https://render.com/docs/deploy-machine-learning-models"
Write-Host "" 