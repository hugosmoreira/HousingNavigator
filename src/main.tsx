import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import {IntakeProvider} from './context/IntakeContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <IntakeProvider>
        <App />
      </IntakeProvider>
    </BrowserRouter>
  </StrictMode>,
);
