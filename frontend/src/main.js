import { mount } from 'svelte';
import '@xterm/xterm/css/xterm.css';
import App from './App.svelte';
import { registerServiceWorker } from './lib/service-worker.js';

const app = mount(App, { target: document.getElementById('app') });
registerServiceWorker();

export default app;
