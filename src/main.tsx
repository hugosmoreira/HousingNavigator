import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import AnalyticsPageView from './components/AnalyticsPageView.tsx';
import {setupGlobalErrorMonitoring} from './lib/analytics.ts';
import './index.css';

setupGlobalErrorMonitoring();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AnalyticsPageView />
      <App />
    </BrowserRouter>
  </StrictMode>,
);
