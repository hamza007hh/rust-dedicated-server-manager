import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Prevent default browser/webview context menu on right click
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
}, { capture: true });

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Epic Launcher encountered a display issue">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

