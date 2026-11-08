/**
 * Reduced motion follows the device's own setting: with "reduce animations" on, the globe
 * starts still and the pulses stop. Rotate (in the top row) still works for anyone who wants it.
 */

const query = window.matchMedia('(prefers-reduced-motion: reduce)');

export function initialReducedMotion(): boolean {
  return query.matches;
}

/** Until Nov 2026 a button stored a choice here; it is gone, so nobody stays stuck with it. */
function forgetOldChoice(): void {
  try {
    window.localStorage.removeItem('wng-reduce-motion');
  } catch {
    // Storage may be blocked; then nothing was stored either.
  }
}

export function followDeviceMotion(onChange: (on: boolean) => void): void {
  forgetOldChoice();
  const apply = (): void => {
    document.documentElement.classList.toggle('reduce-motion', query.matches);
  };
  apply();
  query.addEventListener('change', () => {
    apply();
    onChange(query.matches);
  });
}
