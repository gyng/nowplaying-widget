import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

// NOTE: deliberately NOT wrapped in <React.StrictMode>. The Canvas init runs non-idempotent Tauri
// side-effects (window sizing, overlay reconcile, listen() registration, source startup) and
// StrictMode double-invokes effects in dev, which would double-spawn overlays/listeners. Re-enable
// once every effect is proven cleanup-correct (see the migration notes).
const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
