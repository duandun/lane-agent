import { createRoot } from 'react-dom/client';
import App from './App';
import '@core/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root missing');

createRoot(container).render(<App />);
