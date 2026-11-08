/**
 * The Info button on phones: opens the links and credits above the one-line footer. On wider
 * screens they are always shown and the button is hidden (by CSS).
 */

export function setupInfoPanel(footer: HTMLElement, button: HTMLButtonElement): void {
  const setOpen = (open: boolean): void => {
    footer.classList.toggle('info-open', open);
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => setOpen(!footer.classList.contains('info-open')));
  document.addEventListener('pointerdown', (event) => {
    if (!footer.contains(event.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
}
