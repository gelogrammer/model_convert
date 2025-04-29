// Define types for calibration
export interface CalibrationData {
  emotion: string;
  userFeedback: {
    correctness: 'correct' | 'incorrect' | 'unsure';
    actualEmotion?: string;
  };
  audioFeatures?: Record<string, number>;
  timestamp: number;
}

export interface ConfidenceThresholds {
  [emotion: string]: number;
}

// Default confidence thresholds
export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  anger: 0.6,
  disgust: 0.6,
  fear: 0.6,
  happiness: 0.6,
  sadness: 0.6,
  surprise: 0.6,
  neutral: 0.5,
};

// Load calibration data from local storage
export const loadCalibrationData = (): CalibrationData[] => {
  try {
    const savedData = localStorage.getItem('emotionCalibrationData');
    return savedData ? JSON.parse(savedData) : [];
  } catch (e) {
    console.error('Failed to load calibration data:', e);
    return [];
  }
};

// Save calibration data to local storage
export const saveCalibrationData = (data: CalibrationData[]): void => {
  try {
    localStorage.setItem('emotionCalibrationData', JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save calibration data:', e);
  }
};

// Load confidence thresholds from local storage
export const loadConfidenceThresholds = (): ConfidenceThresholds => {
  try {
    const savedThresholds = localStorage.getItem('emotionConfidenceThresholds');
    return savedThresholds 
      ? JSON.parse(savedThresholds) 
      : DEFAULT_CONFIDENCE_THRESHOLDS;
  } catch (e) {
    console.error('Failed to load confidence thresholds:', e);
    return DEFAULT_CONFIDENCE_THRESHOLDS;
  }
};

// Save confidence thresholds to local storage
export const saveConfidenceThresholds = (thresholds: ConfidenceThresholds): void => {
  try {
    localStorage.setItem('emotionConfidenceThresholds', JSON.stringify(thresholds));
  } catch (e) {
    console.error('Failed to save confidence thresholds:', e);
  }
};

// Apply calibration to incoming emotion results
export const applyCalibrationToResult = (
  rawResult: any, 
  thresholds: ConfidenceThresholds
): any => {
  if (!rawResult) return null;
  
  const { emotion, confidence } = rawResult;
  
  // Apply confidence threshold
  const threshold = thresholds[emotion] || 0.6;
  
  if (confidence < threshold) {
    // Below threshold, mark as uncertain
    // We could return a modified result here, or just add a flag
    return {
      ...rawResult,
      belowThreshold: true,
      filteredEmotion: 'uncertain'
    };
  }
  
  return rawResult;
};

// Send calibration data to backend API 
// (This would need to be implemented on the backend)
export const sendCalibrationToBackend = async (
  calibrationData: CalibrationData[]
): Promise<boolean> => {
  try {
    // This would be a real API call in a production environment
    // const response = await fetch('/api/calibrate-emotion-model', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify(calibrationData),
    // });
    // return response.ok;
    
    // For now, we'll just simulate success
    console.log('Would send calibration data to backend:', calibrationData);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return true;
  } catch (error) {
    console.error('Error sending calibration data to backend:', error);
    return false;
  }
};

// Get statistics from calibration data
export const getCalibrationStats = (calibrationData: CalibrationData[]) => {
  if (calibrationData.length === 0) return null;
  
  const total = calibrationData.length;
  const correct = calibrationData.filter(d => d.userFeedback.correctness === 'correct').length;
  const accuracy = (correct / total) * 100;
  
  const mostMisclassified: Record<string, number> = {};
  
  calibrationData
    .filter(d => d.userFeedback.correctness === 'incorrect' && d.userFeedback.actualEmotion)
    .forEach(d => {
      const key = `${d.emotion} → ${d.userFeedback.actualEmotion}`;
      mostMisclassified[key] = (mostMisclassified[key] || 0) + 1;
    });
  
  const misclassifications = Object.entries(mostMisclassified)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  return {
    total,
    correct,
    accuracy,
    misclassifications
  };
}; 