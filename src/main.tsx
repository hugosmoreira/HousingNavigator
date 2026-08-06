import {StrictMode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import AnalyticsPageView from './components/AnalyticsPageView.tsx';
import {setupGlobalErrorMonitoring} from './lib/analytics.ts';
import './index.css';

setupGlobalErrorMonitoring();

const root = document.getElementById('root')!;
const application = (
  <StrictMode>
    <BrowserRouter>
      <AnalyticsPageView />
      <App />
    </BrowserRouter>
  </StrictMode>
);

if (root.dataset.ssr === 'true') {
  hydrateRoot(root, application);
} else {
  createRoot(root).render(application);
}
