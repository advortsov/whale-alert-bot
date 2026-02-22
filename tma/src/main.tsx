import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';
import { AuthProvider } from './providers/AuthProvider';
import { QueryProvider } from './providers/QueryProvider';
import './styles.css';

const rootElement: HTMLElement | null = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Root element #root was not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AuthProvider>
      <QueryProvider>
        <App />
      </QueryProvider>
    </AuthProvider>
  </React.StrictMode>,
);
