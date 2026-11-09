/**
 * The A / A+ buttons: pinching can't enlarge the panels on the globe page, so these do. The
 * choice stays in this browser only, under the key below (stated on /legal/).
 */

const SIZE_KEY = 'wng-text-size';
const LARGE = 'large';

function savedAsLarge(): boolean {
  try {
    return window.localStorage.getItem(SIZE_KEY) === LARGE;
  } catch {
    return false;
  }
}

function remember(large: boolean): void {
  try {
    if (large) window.localStorage.setItem(SIZE_KEY, LARGE);
    else window.localStorage.removeItem(SIZE_KEY);
  } catch {
    // Storage may be blocked; the button still works for this visit.
  }
}

function apply(large: boolean): void {
  document.documentElement.classList.toggle('text-large', large);
}

/** Applies the saved size. Runs first in main.ts, as the security policy allows no inline script. */
export function applySavedTextSize(): void {
  apply(savedAsLarge());
}

export function setupTextSize(normal: HTMLButtonElement, large: HTMLButtonElement): void {
  const choose = (isLarge: boolean): void => {
    apply(isLarge);
    normal.setAttribute('aria-pressed', String(!isLarge));
    large.setAttribute('aria-pressed', String(isLarge));
  };
  choose(savedAsLarge());
  for (const [button, isLarge] of [
    [normal, false],
    [large, true],
  ] as const) {
    button.addEventListener('click', () => {
      choose(isLarge);
      remember(isLarge);
    });
  }
}
