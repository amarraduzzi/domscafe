import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import OwnerApp from './OwnerApp.tsx';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OwnerApp />
  </StrictMode>,
);
