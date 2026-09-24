import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { AlertsProvider } from './context/AlertsContext';
import { ArchiveProvider } from './context/ArchiveContext';
import { SurveillanceProvider } from './context/SurveillanceContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AlertsProvider>
        <ArchiveProvider>
          <SurveillanceProvider>
            <App />
          </SurveillanceProvider>
        </ArchiveProvider>
      </AlertsProvider>
    </AuthProvider>
  </StrictMode>,
);
