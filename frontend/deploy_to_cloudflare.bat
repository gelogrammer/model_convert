@echo off
echo Building frontend for production...
cd "%~dp0"
call npm run build

echo Deploying to Cloudflare Pages...
npx wrangler pages deploy dist --project-name=model-convert-app --commit-dirty=true

echo Deployment complete!
echo Visit your site at https://model-convert-app.pages.dev
pause 