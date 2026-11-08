/** The document pages (About, Sources, Legal): the site's fonts and styles, and the build version. */

import '@fontsource/michroma/400.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './style.css';
import { startAnalytics } from './analytics';

startAnalytics();

const link = document.getElementById('version');
if (link instanceof HTMLAnchorElement) {
  link.textContent = `Version ${__BUILD_DATE__} · ${__BUILD_COMMIT__}`;
  const sha = __BUILD_COMMIT__.replace('+', '');
  if (/^[0-9a-f]{7}$/.test(sha))
    link.href = `https://github.com/KriMaDev/world_news_globe/commit/${sha}`;
}
