import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import './index.css'
import App from './App.tsx'

// Silence specific console messages
import { setupConsoleSilencing } from './services/silenceConsole'
setupConsoleSilencing()

// Ensure Supabase service is initialized
import './services/supabaseService'

// Check environment variables
import checkEnvironmentVariables from './utils/envCheck'
checkEnvironmentVariables()

// Create a theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#2196f3',
    },
    secondary: {
      main: '#f50057',
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
