import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import TvApp from './TvApp.tsx';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TvApp />
  </StrictMode>,
);
