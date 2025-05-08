@echo off
echo Building frontend for production...
cd "%~dp0"
call npm run build

echo Copying critical files to dist...
if not exist "dist\_redirects" (
  copy "public\_redirects" "dist\_redirects"
)
if not exist "dist\_headers" (
  copy "public\_headers" "dist\_headers"
)

echo Deploying to Cloudflare Pages...
npx wrangler pages deployment create dist --project-name=model-convert-direct --branch=production --commit-message="Production deployment" --commit-dirty=true

echo Deployment complete!
echo Visit your site at https://model-convert-direct.pages.dev
pause 