#!/bin/bash
echo "Building frontend for production..."
cd "$(dirname "$0")"
npm run build

echo "Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist --project-name=model-convert-app

echo "Deployment complete!"
echo "Visit your site at https://model-convert-app.pages.dev (or your custom domain if configured)" 