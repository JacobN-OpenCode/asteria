/**
 * Compatibility shim. The old dashboard lived here; the site is now built in
 * site.js. Kept so existing imports (and tests) keep a single entry point.
 */
export { renderApp as renderDashboardHtml } from './site.js';
