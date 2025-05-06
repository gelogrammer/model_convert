#!/bin/bash
# Script to prepare ML models for deployment to Render
# This script helps upload large model files to external storage

echo "Preparing models for deployment..."

# Check if required commands are available
command -v curl >/dev/null 2>&1 || { echo "Error: curl is required but not installed. Please install curl and try again."; exit 1; }

# Create models directory if it doesn't exist
mkdir -p models

# Check if models exist
if [ ! -f "models/SER.h5" ]; then
    echo "Error: models/SER.h5 not found. Please make sure your models are in the correct location."
    exit 1
fi

if [ ! -f "models/ASR.pth" ]; then
    echo "Error: models/ASR.pth not found. Please make sure your models are in the correct location."
    exit 1
fi

echo "Models found. You have two options for deploying your models:"
echo ""
echo "1. Upload models to an external service (recommended for large models)"
echo "2. Include models in your Git repository (only if models are small)"
echo ""
read -p "Choose an option (1/2): " option

if [ "$option" = "1" ]; then
    echo ""
    echo "You can upload your models to services like:"
    echo "- AWS S3 (https://aws.amazon.com/s3/)"
    echo "- Google Cloud Storage (https://cloud.google.com/storage)"
    echo "- Azure Blob Storage (https://azure.microsoft.com/en-us/products/storage/blobs)"
    echo "- Backblaze B2 (https://www.backblaze.com/b2/cloud-storage.html)"
    echo ""
    echo "After uploading, create a build.sh script with this content:"
    echo ""
    echo "#!/bin/bash"
    echo "mkdir -p models"
    echo "curl -L -o models/SER.h5 YOUR_SER_MODEL_URL"
    echo "curl -L -o models/ASR.pth YOUR_ASR_MODEL_URL"
    echo "pip install -r requirements.txt"
    echo ""
    echo "Then set this as your build command in Render:"
    echo "chmod +x build.sh && ./build.sh"
    
    read -p "Would you like to create this build.sh file now? (y/n): " create_build
    
    if [ "$create_build" = "y" ] || [ "$create_build" = "Y" ]; then
        # Create the build.sh file
        cat > build.sh << 'EOL'
#!/bin/bash
# Create models directory
mkdir -p models

# Download models from storage service
# Replace these URLs with your actual model URLs after uploading
curl -L -o models/SER.h5 YOUR_SER_MODEL_URL
curl -L -o models/ASR.pth YOUR_ASR_MODEL_URL

# Install requirements
pip install -r requirements.txt
EOL
        chmod +x build.sh
        echo "Created build.sh - make sure to replace the placeholder URLs with your actual model URLs."
    fi
    
elif [ "$option" = "2" ]; then
    echo ""
    echo "To include models in your Git repository:"
    echo ""
    echo "1. Check your model sizes:"
    ls -lh models/SER.h5 models/ASR.pth
    echo ""
    echo "2. If your models are larger than 100MB combined, consider option 1 instead."
    echo "3. If you still want to include them, make sure your .gitignore doesn't exclude them."
    echo "4. Add and commit your models to your repository:"
    echo "   git add models/*.h5 models/*.pth"
    echo "   git commit -m \"Add ML models for deployment\""
    echo ""
    echo "Note: GitHub has a 100MB file size limit for individual files."
    echo "Large files may require Git LFS: https://git-lfs.github.com/"
else
    echo "Invalid option selected. Please run the script again."
    exit 1
fi

echo ""
echo "For more information on deploying ML models on Render, see:"
echo "https://render.com/docs/deploy-machine-learning-models"
echo "" 