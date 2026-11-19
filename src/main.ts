import './boot';
import './style.css';

const versionEl = document.getElementById('rs-about-version');
if (versionEl) versionEl.textContent = `v${__APP_VERSION__}`;

void import('./app');
