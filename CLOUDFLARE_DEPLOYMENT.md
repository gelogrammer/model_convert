# Deploying to Cloudflare Pages

This guide provides step-by-step instructions for deploying the application to Cloudflare Pages.

## Prerequisites

1. A Cloudflare account
2. Node.js and npm installed
3. Cloudflare CLI (Wrangler) - installed as a dev dependency

## Option 1: Automatic Deployment

### Windows

1. Navigate to the project root directory
2. Run the deployment script:
   ```
   cd frontend
   .\deploy_to_cloudflare.bat
   ```

### MacOS/Linux

1. Navigate to the project root directory
2. Run the deployment script:
   ```
   cd frontend
   chmod +x deploy_to_cloudflare.sh
   ./deploy_to_cloudflare.sh
   ```

## Option 2: Manual Deployment

### Installing Wrangler CLI globally (optional)

```
npm install -g wrangler
```

### Build and deploy

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Build the project:
   ```
   npm run build
   ```

3. Deploy to Cloudflare Pages:
   ```
   npm run deploy
   ```
   
   Or using npx:
   ```
   npx wrangler pages deploy dist --project-name=model-convert-app
   ```

4. Follow the authentication prompts in your browser to log in to your Cloudflare account.

## Environment Variables

To configure environment variables in Cloudflare Pages:

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select your Pages project
3. Go to Settings > Environment variables
4. Add your environment variables:
   - VITE_BACKEND_URL: URL to your backend API

## Custom Domain (Optional)

To set up a custom domain for your deployed site:

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select your Pages project
3. Go to Custom domains
4. Click "Set up a custom domain"
5. Follow the instructions to add and verify your domain

## Troubleshooting

- If authentication fails, run `npx wrangler login` before deploying
- Check the deployment logs in the Cloudflare Dashboard for any errors
- Ensure all environment variables are correctly set
- Make sure your build process completes successfully before deployment 