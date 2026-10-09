import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { useTheme, applyTheme } from './store/ui'
import './index.css'

// Apply the persisted theme before the first paint so there is no flash of the
// wrong colour scheme while React boots.
applyTheme(useTheme.getState().theme)

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
