import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import PosApp from './PosApp.tsx';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PosApp />
  </StrictMode>,
);
