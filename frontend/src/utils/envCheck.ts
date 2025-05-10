/**
 * Verifies that required environment variables are set
 * Logs warnings for missing environment variables
 */
export const checkEnvironmentVariables = (): void => {
  const requiredVariables = [
    'VITE_BACKEND_URL',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_KEY',
    'VITE_ML_SERVICE_KEY'
  ];

  const missingVariables = requiredVariables.filter(
    varName => !import.meta.env[varName]
  );

  if (missingVariables.length > 0) {
    console.warn(`WARNING: Missing environment variables: ${missingVariables.join(', ')}`);
    console.warn('Some features may not work correctly. Please check your .env file.');
  }

  // Check specifically for the Hugging Face API key
  if (!import.meta.env.VITE_ML_SERVICE_KEY) {
    console.warn('VITE_ML_SERVICE_KEY is not set. Advanced emotion analysis will not be available.');
  }
};

export default checkEnvironmentVariables; 