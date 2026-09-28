import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './ui/legacy.css';
import './ui/components/components.css';
import './ui/screens.css';
import { App } from './ui/App';
import { ToastProvider } from './ui/components';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
