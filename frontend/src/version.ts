/** The footer's version, the same on every page. */

/** What each release changed (CHANGELOG.md in the public repository). */
export const CHANGELOG_URL = 'https://github.com/KriMaDev/world_news_globe/blob/main/CHANGELOG.md';

/** "Version 1.9.0 · 2026-11-14": the release number and the build date. */
export function versionText(release: string, date: string): string {
  return `Version ${release} · ${date}`;
}

/** Fills the footer's version link, which leads to the changelog. */
export function showVersion(link: HTMLElement | null): void {
  if (!(link instanceof HTMLAnchorElement)) return;
  link.textContent = versionText(__BUILD_VERSION__, __BUILD_DATE__);
  link.href = CHANGELOG_URL;
}
