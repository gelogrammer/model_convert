# Speech Analysis Backend

This backend provides real-time speech analysis including fluency, tempo, and pronunciation metrics.

## Features

- Real-time speech analysis
- Speech rate detection
- Fluency assessment
- Tempo classification
- Pronunciation clarity evaluation

## Setup Instructions

1. Create a Python virtual environment:
   ```
   python -m venv venv
   ```

2. Activate the virtual environment:
   - Windows:
     ```
     venv\Scripts\activate
     ```
   - Linux/Mac:
     ```
     source venv/bin/activate
     ```

3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

4. Create a models directory and add your ASR model:
   ```
   mkdir -p models
   ```

   If you have an existing model, place it in the models directory as `ASR.pth`.

## Running the Backend

1. Start the Flask server:
   ```
   python api/speech_analyzer.py
   ```

   This will start the server on http://localhost:5000

## API Endpoints

### POST /api/analyze

Analyzes speech audio and returns metrics.

**Request:**
- Content-Type: `multipart/form-data`
- Parameters:
  - `audio`: WAV audio file
  - `confidence_threshold`: Speech detection threshold (default: 0.2)
  - `boost_sensitivity`: Enable higher sensitivity (default: false)

**Response:**
```json
{
  "status": "success",
  "speech_rate": 120.5,
  "is_speech": true,
  "speech_characteristics": {
    "fluency": {
      "category": "Medium Fluency",
      "confidence": 0.75
    },
    "tempo": {
      "category": "Medium Tempo",
      "confidence": 0.82
    },
    "pronunciation": {
      "category": "Clear Pronunciation",
      "confidence": 0.68
    }
  }
}
```

### POST /api/initialize

Initializes the ASR model.

**Response:**
```json
{
  "status": "success",
  "message": "ASR model initialized successfully"
}
```

## Integration with Frontend

The backend is designed to work with the React frontend, providing real-time speech analysis as you speak. The frontend will send audio chunks to the backend for analysis and display the results in the Speech Characteristics section.

## Troubleshooting

- Make sure you have the appropriate model file in the models directory
- Check that you're using Python 3.8 or newer
- Ensure all dependencies are installed correctly
- Check the console logs for error messages 