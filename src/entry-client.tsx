import { hydrate } from '@solidjs/web';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('no root');
const variant = new URLSearchParams(location.search).get('variant') || 'subject';
hydrate(() => <App variant={variant} />, root);
