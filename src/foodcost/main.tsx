import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import FoodcostApp from './FoodcostApp.tsx';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FoodcostApp />
  </StrictMode>,
);
