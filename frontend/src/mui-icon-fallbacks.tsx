import React from 'react';

// Generic icon fallback component
interface IconProps {
  color?: string;
  fontSize?: string | number;
  style?: React.CSSProperties;
  className?: string;
  [key: string]: any;
}

const IconFallback = (props: IconProps) => (
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

// Create fallbacks for common MUI icons
export const MicIcon = IconFallback;
export const PlayArrowIcon = IconFallback;
export const PauseIcon = IconFallback;
export const DeleteIcon = IconFallback;
export const StopIcon = IconFallback;
export const FileUploadIcon = IconFallback;
export const TuneIcon = IconFallback;
export const SaveIcon = IconFallback;

// Helper function to safely import MUI icons with fallbacks
export function safeImport(iconPath: string, fallback: React.ComponentType<IconProps> = IconFallback) {
  try {
    return require(iconPath).default;
  } catch (error) {
    console.warn(`Failed to load icon: ${iconPath}, using fallback`);
    return fallback;
  }
}

// Export the fallback for use in other components
export default IconFallback; 