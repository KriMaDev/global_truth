/** The document pages (About, Sources, Legal): the site's fonts and styles, and the build version. */

import '@fontsource/michroma/400.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './style.css';
import { startAnalytics } from './analytics';
import { showVersion } from './version';

startAnalytics();
showVersion(document.getElementById('version'));
