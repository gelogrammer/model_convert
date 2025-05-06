// API configuration utilities
// Centralized API URL handling to avoid circular dependencies

/**
 * Get the API URL from environment variables
 */
export const getApiUrl = (): string => {
  // Check both environment variable names to ensure compatibility
  return import.meta.env.VITE_API_URL || 
         import.meta.env.VITE_BACKEND_URL || 
         (window as any).__env?.VITE_API_URL ||
         (window as any).__env?.VITE_BACKEND_URL ||
         'https://name-model-convert-backend.onrender.com';
};

/**
 * Create a full URL from a relative API path
 */
export const getFullApiUrl = (path: string): string => {
  const apiUrl = getApiUrl();
  return path.startsWith('/') ? `${apiUrl}${path}` : `${apiUrl}/${path}`;
};

/**
 * Silent fetch utility that doesn't output to console
 */
export const silentFetch = async (url: string, options: RequestInit): Promise<Response | null> => {
  try {
    // Ensure the URL starts with the API base URL if it's a relative path
    const fullUrl = url.startsWith('/') ? getFullApiUrl(url) : url;
    
    // Use the original window.fetch but catch and handle any errors silently
    return await fetch(fullUrl, options);
  } catch (error) {
    // Return null instead of throwing or logging to console
    return null;
  }
}; 