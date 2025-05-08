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

echo Creating direct deployment...
npx wrangler pages project create model-convert-direct --production-branch production
npx wrangler pages deployment create dist --project-name=model-convert-direct --branch=production --commit-message="Direct production deployment"

echo Deployment complete!
echo The site should be accessible at https://model-convert-direct.pages.dev
pause 