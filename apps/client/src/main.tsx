import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/800.css';
import './index.css';
import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { routes } from './app/router';
import { MotionProvider } from './app/motion';
import { ThemeProvider } from './app/theme';

const router = createBrowserRouter(routes);

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado');

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <MotionProvider>
        <RouterProvider router={router} />
      </MotionProvider>
    </ThemeProvider>
  </StrictMode>,
);
