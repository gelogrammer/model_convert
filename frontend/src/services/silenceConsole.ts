/**
 * Utility to silence console errors without affecting functionality
 * This helps prevent distracting error messages in the console during development
 */

// Store original console methods
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

// List of error patterns to silence
const silencedPatterns = [
  'WebSocket connection error',
  'POST http://localhost:3000/api/proxy/huggingface 503',
  'ping timeout',
  'timeout',
  'WebSocket is closed',
  'WebSocket connection to',
  'AbortError',
  'signal is aborted'
];

// Override console methods to filter out specific errors
export const setupConsoleSilencing = () => {
  // Replace console.error with filtered version
  console.error = function(...args: any[]) {
    const errorString = args.join(' ');
    // Only display errors that don't match silenced patterns
    if (!silencedPatterns.some(pattern => errorString.includes(pattern))) {
      originalConsoleError.apply(console, args);
    }
  };

  // Replace console.warn with filtered version
  console.warn = function(...args: any[]) {
    const warnString = args.join(' ');
    // Only display warnings that don't match silenced patterns
    if (!silencedPatterns.some(pattern => warnString.includes(pattern))) {
      originalConsoleWarn.apply(console, args);
    }
  };

  // Replace console.log with filtered version
  console.log = function(...args: any[]) {
    const logString = args.join(' ');
    // Only display logs that don't match silenced patterns
    if (!silencedPatterns.some(pattern => logString.includes(pattern))) {
      originalConsoleLog.apply(console, args);
    }
  };
};

// Restore original console behavior if needed
export const restoreConsole = () => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
}; 