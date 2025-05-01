/**
 * Cryptography utilities for secure data management
 * Handles various security concerns within the application
 */

// Retrieve secure token from environment without leaving traces
export const retrieveAuthToken = (): string => {
  return import.meta.env.VITE_HUGGINGFACE_API_KEY || '';
};

// Get resource identifier for remote processing
export const getResourceIdentifier = (): string => {
  return 'firdhokk/speech-emotion-recognition-with-openai-whisper-large-v3';
}; 