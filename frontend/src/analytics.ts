/**
 * Cloudflare Web Analytics, set up as on krimadev.com: no cookies, nothing stored in the
 * browser, and the visit counted only on the real site. The token is public (it is in every
 * page), from Cloudflare → Web Analytics → the site → "Manage site". Empty = no beacon.
 */
const WEB_ANALYTICS = { token: "", hostname: "globe.krimadev.com" };

/** Loads the beacon a second after the page, so it never competes with the page's own files. */
export function startAnalytics(): void {
  if (!WEB_ANALYTICS.token || window.location.hostname !== WEB_ANALYTICS.hostname) return;
  const load = (): void => {
    const beacon = document.createElement("script");
    beacon.type = "module";
    beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
    // spa: false, or every filter click (which rewrites the address) could count as a page view.
    beacon.dataset.cfBeacon = JSON.stringify({ token: WEB_ANALYTICS.token, spa: false });
    document.head.append(beacon);
  };
  const later = (): void => void window.setTimeout(load, 1000);
  if (document.readyState === "complete") later();
  else window.addEventListener("load", later, { once: true });
}
