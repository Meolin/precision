import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { GameRuntime } from './game/core/GameRuntime';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Application root is missing.');

// Runtime belongs to the application, independently of component render cycles.
const runtime = new GameRuntime();
createRoot(rootElement).render(<App runtime={runtime} />);
