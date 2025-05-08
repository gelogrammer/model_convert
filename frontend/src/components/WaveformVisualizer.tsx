import React, { useRef, useEffect } from 'react';
import { Box } from '@mui/material';
import { getAudioVisualizationData } from '../services/audioService';

interface WaveformVisualizerProps {
  isCapturing: boolean;
  height?: number;
  width?: number;
  barColor?: string;
}

/**
 * A component that visualizes audio waveform
 */
const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  isCapturing,
  height = 150,
  width = 500,
  barColor = 'gradient'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  
  // Start and stop visualization based on isCapturing prop
  useEffect(() => {
    if (isCapturing) {
      startVisualization();
    } else {
      stopVisualization();
    }
    
    return () => {
      stopVisualization();
    };
  }, [isCapturing]);

  // Function to start the visualization
  const startVisualization = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    const draw = () => {
      const dataArray = getAudioVisualizationData();
      
      if (!dataArray) return;
      
      // Clear canvas with dark background
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw visualization only when actively capturing
      if (isCapturing && dataArray.length > 0) {
        // Calculate the number of bars to display - use a safe value to avoid errors
        const visualizationBars = Math.max(1, Math.min(5, dataArray.length - 1));
        
        const barWidth = (canvas.width / visualizationBars) * 2.5;
        let x = 0;
        
        // Only loop through the number of bars we determined is safe
        for (let i = 0; i < visualizationBars; i++) {
          // Get data safely with bounds check
          const dataIndex = Math.min(i, dataArray.length - 1);
          const barHeight = (dataArray[dataIndex] / 255) * canvas.height;
          
          // Create a gradient effect with colors that work well on dark background
          const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
          
          if (barColor === 'gradient') {
            // Use themed colors
            const hue = i / visualizationBars * 360;
            const saturation = 80; 
            const lightness = 65;
            
            gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, 0.8)`);
            gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness + 10}%, 0.6)`);
          } else {
            // Use solid color if specified
            gradient.addColorStop(0, barColor);
            gradient.addColorStop(1, barColor);
          }
          
          ctx.fillStyle = gradient;
          
          // Draw rounded top bars
          const barWidthActual = barWidth - 1;
          const radius = barWidthActual / 2;
          
          ctx.beginPath();
          ctx.moveTo(x + radius, canvas.height - barHeight);
          ctx.lineTo(x + barWidthActual - radius, canvas.height - barHeight);
          ctx.quadraticCurveTo(x + barWidthActual, canvas.height - barHeight, x + barWidthActual, canvas.height - barHeight + radius);
          ctx.lineTo(x + barWidthActual, canvas.height);
          ctx.lineTo(x, canvas.height);
          ctx.lineTo(x, canvas.height - barHeight + radius);
          ctx.quadraticCurveTo(x, canvas.height - barHeight, x + radius, canvas.height - barHeight);
          ctx.closePath();
          ctx.fill();
          
          x += barWidth + 1;
        }
      }
      
      if (isCapturing) {
        animationRef.current = requestAnimationFrame(draw);
      }
    };
    
    draw();
  };

  // Function to stop the visualization
  const stopVisualization = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  };

  return (
    <Box 
      sx={{ 
        width: '100%', 
        height: `${height}px`, 
        borderRadius: '8px',
        overflow: 'hidden'
      }}
    >
      <canvas 
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: '100%', height: '100%' }}
      />
    </Box>
  );
};

export default WaveformVisualizer; 