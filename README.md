# Real-Time Speech Rate and Emotion Feedback

This application provides real-time feedback on speech emotion and rate using deep reinforcement learning. It consists of a Flask backend for processing audio and a React frontend for visualization.

## Features

- Real-time speech emotion recognition
- Speech rate analysis
- Visual feedback and recommendations
- WebSocket communication for low-latency updates

## Project Structure

```
├── backend/                # Flask backend
│   ├── app.py              # Main Flask application
│   ├── audio_processor.py  # Audio processing utilities
│   ├── model_service.py    # Model service
│   ├── requirements.txt    # Python dependencies
│   └── run.py              # Run script
│
├── frontend/               # React frontend
│   ├── public/             # Static files
│   ├── src/                # Source code
│   │   ├── components/     # React components
│   │   ├── services/       # Service modules
│   │   ├── App.tsx         # Main App component
│   │   └── main.tsx        # Entry point
│   ├── package.json        # Node.js dependencies
│   └── vite.config.ts      # Vite configuration
│
├── render.yaml             # Render deployment configuration
└── README.md               # This file
```

## Prerequisites

- Python 3.8+ with pip
- Node.js 16+ with npm
- TensorFlow 2.x
- A trained emotion recognition model

## Setup and Installation

### Backend Setup

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install the required Python packages:
   ```
   pip install -r requirements.txt
   ```

3. Place your trained emotion model in the `models` directory:
   ```
   mkdir -p models
   # Copy your model file to models/emotion_model.h5
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install the required Node.js packages:
   ```
   npm install
   ```

3. Set up environment variables:
   ```
   # Create a .env file in the frontend directory
   cp .env.example .env
   
   # Edit the .env file and add your Hugging Face API key
   # VITE_HUGGINGFACE_API_KEY=your_api_key_here
   ```

> **SECURITY NOTE**: Never commit API keys or sensitive tokens to the repository. 
> Always use environment variables and keep .env files out of version control.
> If you accidentally expose a key, rotate it immediately through the service provider.

## Running the Application

### Start the Backend

1. From the backend directory:
   ```
   python run.py
   ```
   This will start the Flask server on http://localhost:5000

### Start the Frontend

1. From the frontend directory:
   ```
   npm run dev
   ```
   This will start the development server, typically on http://localhost:5173

2. Open your browser and navigate to the URL shown in the terminal.

## Deployment

### Deploying to Render

The backend is configured for deployment to Render using the included `render.yaml` configuration file.

1. Ensure you have a Render account at https://render.com/
2. Connect your Git repository to Render
3. Deploy using one of the following methods:

   **Option 1**: Use the deployment scripts
   ```
   # On Windows
   deploy_to_render.bat
   
   # On Linux/macOS
   ./deploy_to_render.sh
   ```

   **Option 2**: Manual deployment through Render Dashboard
   - Create a new Web Service
   - Connect your repository
   - Select "Use render.yaml"

4. Configure the environment variables in your Render dashboard:
   - `SER_MODEL_URL`: URL to download the SER.h5 model
   - `ASR_MODEL_URL`: URL to download the ASR.pth model

For more detailed deployment instructions, see `RENDER_DEPLOYMENT.md`.

## Usage

1. Click the "Start Capturing" button to begin audio capture.
2. Speak into your microphone.
3. The application will display:
   - Detected emotion with confidence levels
   - Speech rate analysis
   - Real-time feedback and tips for improvement

## Troubleshooting

- If you encounter microphone permission issues, make sure your browser has permission to access your microphone.
- If the backend fails to start, check that all dependencies are installed and that the port 5000 is not in use.
- If the model fails to load, ensure that the model file is correctly placed in the `models` directory.
- For deployment issues, check the logs in your Render dashboard.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
