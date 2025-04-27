import { useState, useEffect } from 'react';
import { Paper, Typography, Box, Chip } from '@mui/material';

interface EmotionResult {
  emotion: string;
  confidence: number;
  speech_rate: number;
  probabilities: Record<string, number>;
  is_speech: boolean;
}

interface FeedbackProps {
  emotionResult: EmotionResult | null;
  isCapturing: boolean;
}

const Feedback: React.FC<FeedbackProps> = ({ emotionResult, isCapturing }) => {
  const [lastValidFeedback, setLastValidFeedback] = useState<{ rateFeedback: string, emotionFeedback: string } | null>(null);
  const [lastValidTips, setLastValidTips] = useState<string[]>([]);

  // Update last valid feedback when we get a new emotion result
  useEffect(() => {
    if (emotionResult) {
      const newFeedback = generateFeedback(emotionResult);
      if (newFeedback) {
        setLastValidFeedback(newFeedback);
      }

      const newTips = getTips(emotionResult);
      if (newTips.length > 0) {
        setLastValidTips(newTips);
      }
    }
  }, [emotionResult]);
  
  // Generate feedback based on emotion and speech rate
  const generateFeedback = (result: EmotionResult | null) => {
    if (!result || !result.is_speech) {
      return null;
    }
    
    const { emotion, speech_rate } = result;
    
    // Feedback for speech tempo (updated terminology and thresholds)
    let rateFeedback = '';
    if (speech_rate < 2.5) {
      rateFeedback = 'Your speech has a slow tempo. Consider speaking a bit faster to maintain audience engagement.';
    } else if (speech_rate < 4.5) {
      rateFeedback = 'Your speech has a medium tempo, which is generally good for most audiences.';
    } else {
      rateFeedback = 'Your speech has a fast tempo. Consider slowing down slightly to ensure your audience can follow along.';
    }
    
    // Feedback for emotion
    let emotionFeedback = '';
    switch (emotion) {
      case 'anger':
        emotionFeedback = 'Your tone sounds angry. Consider softening your tone unless this is intentional.';
        break;
      case 'disgust':
        emotionFeedback = 'Your tone conveys disgust. Be mindful of this emotion unless it\'s intentional.';
        break;
      case 'fear':
        emotionFeedback = 'Your voice indicates fear or anxiety. Try to project more confidence if this isn\'t intended.';
        break;
      case 'happiness':
        emotionFeedback = 'Your tone conveys happiness, which is engaging and positive.';
        break;
      case 'sadness':
        emotionFeedback = 'Your tone sounds sad. Consider a more upbeat delivery unless this is intentional.';
        break;
      case 'surprise':
        emotionFeedback = 'Your tone conveys surprise, which can be engaging but might be distracting if overused.';
        break;
      case 'neutral':
        emotionFeedback = 'Your tone is neutral. Adding some emotional variation might increase engagement.';
        break;
      default:
        emotionFeedback = '';
    }
    
    return { rateFeedback, emotionFeedback };
  };

  // Get tips based on emotion and speech rate
  const getTips = (result: EmotionResult | null) => {
    if (!result || !result.is_speech) {
      return [];
    }
    
    const { emotion, speech_rate } = result;
    const tips: string[] = [];
    
    // Speech tempo tips (updated for ASR model terminology)
    if (speech_rate < 2.5) {
      tips.push('Practice with a metronome');
      tips.push('Rehearse key points');
    } else if (speech_rate > 4.5) {
      tips.push('Take deliberate pauses');
      tips.push('Breathe between phrases');
    }
    
    // Emotion-based tips
    switch (emotion) {
      case 'anger':
      case 'disgust':
        tips.push('Soften your tone');
        tips.push('Use positive language');
        break;
      case 'fear':
        tips.push('Practice deep breathing');
        tips.push('Prepare thoroughly');
        break;
      case 'sadness':
        tips.push('Vary your pitch');
        tips.push('Stand up straight');
        break;
      case 'neutral':
        tips.push('Add vocal variety');
        tips.push('Emphasize key points');
        break;
    }
    
    // Add speech fluency tips based on tempo
    if (speech_rate < 3.0) {
      tips.push('Work on fluency exercises');
    } else if (speech_rate > 5.0) {
      tips.push('Focus on clear pronunciation');
    }
    
    return tips.slice(0, 4); // Limit to 4 tips
  };

  // Determine what to display based on current state
  const getDisplayContent = () => {
    if (!isCapturing) {
      return (
        <Typography>Start capturing to receive feedback</Typography>
      );
    }
    
    if (emotionResult) {
      const feedback = generateFeedback(emotionResult);
      const tips = getTips(emotionResult);
      
      return (
        <>
          <Box sx={{ mb: 3 }}>
            <Typography variant="body1" paragraph>
              {feedback?.rateFeedback}
            </Typography>
            <Typography variant="body1">
              {feedback?.emotionFeedback}
            </Typography>
          </Box>
          
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Tips for Improvement:
          </Typography>
          
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {tips.map((tip, index) => (
              <Chip 
                key={index} 
                label={tip} 
                color="primary" 
                variant="outlined" 
                size="small"
              />
            ))}
          </Box>
        </>
      );
    }
    
    if (lastValidFeedback) {
      return (
        <>
          <Typography sx={{ mb: 2, color: 'text.secondary' }}>
            Waiting for speech... Here's your last feedback:
          </Typography>
          
          <Box sx={{ mb: 3, opacity: 0.7 }}>
            <Typography variant="body1" paragraph>
              {lastValidFeedback.rateFeedback}
            </Typography>
            <Typography variant="body1">
              {lastValidFeedback.emotionFeedback}
            </Typography>
          </Box>
          
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Tips for Improvement:
          </Typography>
          
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {lastValidTips.map((tip, index) => (
              <Chip 
                key={index} 
                label={tip} 
                color="primary" 
                variant="outlined" 
                size="small"
                sx={{ opacity: 0.7 }}
              />
            ))}
          </Box>
        </>
      );
    }
    
    return (
      <Typography>No speech detected yet. Start speaking to get feedback.</Typography>
    );
  };

  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Typography variant="h6" gutterBottom>
        Real-Time Feedback
      </Typography>
      
      {getDisplayContent()}
    </Paper>
  );
};

export default Feedback;
