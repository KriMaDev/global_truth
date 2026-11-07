/**
 * The "Reduce motion" switch. It follows the device's setting until the visitor chooses,
 * and the choice is remembered in this browser only (a display preference, nothing personal).
 */

const STORAGE_KEY = "wng-reduce-motion";
const query = window.matchMedia("(prefers-reduced-motion: reduce)");

function storedChoice(): boolean | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "1" ? true : value === "0" ? false : null;
  } catch {
    return null;
  }
}

function store(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Storage may be blocked; the switch still works for this visit.
  }
}

export function initialReducedMotion(): boolean {
  return storedChoice() ?? query.matches;
}

export function setupMotionToggle(button: HTMLButtonElement, onChange: (on: boolean) => void): void {
  let on = initialReducedMotion();
  const apply = (): void => {
    button.setAttribute("aria-pressed", String(on));
    document.documentElement.classList.toggle("reduce-motion", on);
  };
  apply();

  button.addEventListener("click", () => {
    on = !on;
    store(on);
    apply();
    onChange(on);
  });

  // Follow the device's setting while the visitor has not chosen.
  query.addEventListener("change", () => {
    if (storedChoice() !== null) return;
    on = query.matches;
    apply();
    onChange(on);
  });
}
