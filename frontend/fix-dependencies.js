// This is a fix for MUI icon imports and Vite caching issues
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Ensure the .vite directory is removed
try {
  if (fs.existsSync(path.join(__dirname, 'node_modules', '.vite'))) {
    console.log('Removing .vite cache...');
    fs.rmSync(path.join(__dirname, 'node_modules', '.vite'), { recursive: true, force: true });
  }
} catch (err) {
  console.error('Error removing .vite cache:', err);
}

// Create an empty mui-icons-wrapper.js to resolve missing MUI icon imports
try {
  console.log('Creating empty icon wrappers...');
  
  // List of icons that might be missing
  const icons = [
    'Mic', 'PlayArrow', 'Pause', 'Delete', 'Stop', 
    'FileUpload', 'Tune', 'Save'
  ];
  
  // Create the wrapper directory if it doesn't exist
  const wrapperDir = path.join(__dirname, 'src', 'mui-wrappers');
  if (!fs.existsSync(wrapperDir)) {
    fs.mkdirSync(wrapperDir, { recursive: true });
  }
  
  // Create a wrapper file for each icon
  icons.forEach(icon => {
    const wrapperContent = `
      import React from 'react';
      
      // Fallback icon component for ${icon}
      const ${icon}Icon = (props) => (
        <svg 
          viewBox="0 0 24 24" 
          width="24" 
          height="24" 
          fill="currentColor"
          {...props}
        >
          <rect width="24" height="24" fill="none" />
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
        </svg>
      );
      
      export default ${icon}Icon;
    `;
    
    fs.writeFileSync(path.join(wrapperDir, `${icon}Icon.jsx`), wrapperContent);
    console.log(`Created wrapper for ${icon}Icon`);
  });
  
  // Create an index file to export all icons
  const indexContent = icons.map(icon => 
    `export { default as ${icon}Icon } from './${icon}Icon';`
  ).join('\n');
  
  fs.writeFileSync(path.join(wrapperDir, 'index.js'), indexContent);
  console.log('Created index file for icon wrappers');
  
} catch (err) {
  console.error('Error creating icon wrappers:', err);
}

// Run npm install to ensure all dependencies are installed
try {
  console.log('Reinstalling dependencies...');
  execSync('npm install', { stdio: 'inherit' });
  
  console.log('Installing @mui/icons-material...');
  execSync('npm install @mui/icons-material', { stdio: 'inherit' });
  
} catch (err) {
  console.error('Error installing dependencies:', err);
}

console.log('Dependency fix complete. Please restart your development server with: npm run dev'); 