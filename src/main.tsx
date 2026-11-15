import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register Service Worker only on real web origins (skip inside Capacitor Android localhost WebView to prevent WebView flickering)
if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  window.location.hostname !== 'localhost' &&
  window.location.protocol === 'https:'
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ignore SW registration errors in restricted preview frames
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
