import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/frank-ruhl-libre/hebrew-500.css';
import '@fontsource/frank-ruhl-libre/hebrew-700.css';
import '@fontsource/heebo/hebrew-400.css';
import '@fontsource/heebo/hebrew-500.css';
import '@fontsource/heebo/hebrew-700.css';
import '@fontsource/heebo/latin-400.css';
import '@fontsource/heebo/latin-700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/admin.css';
import { App } from './app/App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
