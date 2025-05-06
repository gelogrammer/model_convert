// This script ensures environment variables are properly injected during build
const fs = require('fs');

// Create window.__env with environment variables
const envConfigContent = `
window.__env = {
  VITE_API_URL: "${process.env.VITE_API_URL || 'https://name-model-convert-backend.onrender.com'}",
  VITE_BACKEND_URL: "${process.env.VITE_BACKEND_URL || 'https://name-model-convert-backend.onrender.com'}"
};
`;

// Write to a file that will be included in the HTML
fs.writeFileSync('./public/env-config.js', envConfigContent);
console.log('Environment configuration written to public/env-config.js'); 