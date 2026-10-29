import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage({ type: 'CACHE_MANIFEST' });
      })
      .catch((error) => console.warn('Service worker registration failed:', error));
  });
}
