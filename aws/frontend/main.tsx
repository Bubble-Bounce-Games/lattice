import { createRoot } from 'react-dom/client';
import { App } from './app';
import '../../src/app/globals.css';
import './signin.css';

createRoot(document.getElementById('root')!).render(<App />);
