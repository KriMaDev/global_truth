/**
 * When a scrolling panel's heading has scrolled away, its name appears in the gap between the
 * top row and the panel, so people always know where they are. Where there is no gap (wide or
 * short screens) the heading simply scrolls away.
 */

function headingOf(panel: HTMLElement): HTMLElement | null {
  return panel.querySelector<HTMLElement>('.filter-head');
}

function headingScrolledAway(panel: HTMLElement): boolean {
  const heading = headingOf(panel);
  if (!heading) return false;
  return heading.getBoundingClientRect().bottom <= panel.getBoundingClientRect().top + 1;
}

export function setupFloatingPanelTitle(topRow: HTMLElement, panels: HTMLElement[]): void {
  const title = document.createElement('p');
  title.id = 'panel-float-title';
  title.className = 'panel-float-title label';
  title.setAttribute('aria-hidden', 'true'); // The real heading is still there for screen readers.
  title.hidden = true;
  document.body.append(title);

  const update = (): void => {
    const panel = panels.find((p) => !p.hidden && headingScrolledAway(p));
    if (!panel) {
      title.hidden = true;
      return;
    }
    title.textContent = headingOf(panel)?.querySelector('h2')?.textContent ?? '';
    title.hidden = false;
    const top = panel.getBoundingClientRect().top - title.offsetHeight - 6;
    title.style.top = `${top}px`;
    title.hidden = top < topRow.getBoundingClientRect().bottom + 2;
  };

  const opened = new MutationObserver(update);
  for (const panel of panels) {
    panel.addEventListener('scroll', update, { passive: true });
    opened.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  }
  window.addEventListener('resize', update);
}
