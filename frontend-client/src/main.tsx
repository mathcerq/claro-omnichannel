import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: { background: '#fff', color: '#111', border: '1px solid #e5e7eb', borderRadius: '12px' },
          success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
          error: { iconTheme: { primary: '#e3000f', secondary: '#fff' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>,
);
