#!/bin/bash
# Build script for Cloudflare Pages

echo "Installing dependencies..."
npm install

echo "Building React app..."
npm run build

echo "Copy _redirects and _headers to dist if they don't exist in dist..."
[ -f "dist/_redirects" ] || cp public/_redirects dist/_redirects
[ -f "dist/_headers" ] || cp public/_headers dist/_headers

echo "Build complete!" 