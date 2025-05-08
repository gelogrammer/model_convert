#!/bin/bash
# Script to deploy to Render

echo "Preparing to deploy to Render..."

# Ensure all files are committed
echo "Checking for uncommitted changes..."
git status

# Ask the user to confirm deployment
read -p "Do you want to proceed with deployment to Render? (y/n): " confirm
if [[ $confirm != "y" && $confirm != "Y" ]]; then
    echo "Deployment canceled."
    exit 1
fi

# Check if render CLI is installed
if ! command -v render &> /dev/null; then
    echo "Render CLI not found. Install it using: npm install -g @render/cli"
    exit 1
fi

# Deploy using render.yaml
echo "Deploying to Render using render.yaml configuration..."
render deploy

echo "Deployment initiated."
echo ""
echo "REMINDER:"
echo "1. Make sure to set the model URLs in the Render dashboard:"
echo "   - SER_MODEL_URL"
echo "   - ASR_MODEL_URL"
echo ""
echo "2. You can monitor your deployment status in the Render dashboard."
echo ""
echo "3. Once deployed, your API will be available at the URL provided by Render." 