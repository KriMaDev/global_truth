/**
 * The Filters panel: category and severity chips (multi-select), with room for the time
 * window and the place drill-down (rendered by ui/timeline.ts and ui/place-picker.ts).
 */

import type { FilterState } from '../filters';
import { SEVERITY_STYLES } from '../severity';
import { CATEGORIES, CATEGORY_LABELS, SEVERITIES, type Category, type Severity } from '../types';

export interface Counts {
  categories: Record<Category, number>;
  severities: Record<Severity, number>;
}

export interface FilterPanel {
  /** Redraws the chips for a state, with event counts. */
  render(state: FilterState, counts: Counts, activeFilters: number): void;
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

function chip(
  label: string,
  count: number,
  pressed: boolean,
  onClick: () => void,
  color?: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chip';
  button.setAttribute('aria-pressed', String(pressed));
  if (color) {
    const dot = document.createElement('span');
    dot.className = 'card-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.setProperty('--dot-color', color);
    button.append(dot);
  }
  const name = document.createElement('span');
  name.textContent = label;
  const number = document.createElement('span');
  number.className = 'chip-count';
  number.textContent = String(count);
  button.append(name, number);
  button.addEventListener('click', onClick);
  return button;
}

/** The "All on / All off" button: everything off while anything is on, else everything on. */
export function allToggled<T>(set: Set<T>, all: readonly T[]): Set<T> {
  return set.size > 0 ? new Set<T>() : new Set<T>(all);
}

function setAllButton(button: HTMLButtonElement | null, anyOn: boolean, what: string): void {
  if (!button) return;
  button.textContent = anyOn ? 'All off' : 'All on';
  button.setAttribute('aria-label', `${anyOn ? 'Turn off' : 'Turn on'} every ${what}`);
}

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function createFilterPanel(
  root: HTMLElement,
  toggle: HTMLButtonElement,
  onChange: (change: Partial<FilterState>) => void,
  onClear: () => void,
  onOpen: () => void,
): FilterPanel {
  const categories = root.querySelector<HTMLElement>('[data-filter=categories]');
  const severities = root.querySelector<HTMLElement>('[data-filter=severities]');
  const clear = root.querySelector<HTMLButtonElement>('[data-filter=clear]');
  const categoriesAll = root.querySelector<HTMLButtonElement>('[data-filter=categories-all]');
  const severitiesAll = root.querySelector<HTMLButtonElement>('[data-filter=severities-all]');
  // The current state, for the All on / All off buttons (set by render).
  let current: FilterState | null = null;
  categoriesAll?.addEventListener('click', () => {
    if (current) onChange({ categories: allToggled(current.categories, CATEGORIES) });
  });
  severitiesAll?.addEventListener('click', () => {
    if (current) onChange({ severities: allToggled(current.severities, SEVERITIES) });
  });
  const closeButton = root.querySelector<HTMLButtonElement>('[data-filter=close]');
  let isOpen = false;

  const setOpen = (open: boolean): void => {
    isOpen = open;
    root.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) onOpen();
  };
  toggle.addEventListener('click', () => setOpen(!isOpen));
  closeButton?.addEventListener('click', () => {
    setOpen(false);
    toggle.focus();
  });
  clear?.addEventListener('click', onClear);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      toggle.focus();
    }
  });

  return {
    render(state, counts, activeFilters) {
      current = state;
      setAllButton(categoriesAll, state.categories.size > 0, 'type of event');
      setAllButton(severitiesAll, state.severities.size > 0, 'severity level');
      categories?.replaceChildren(
        ...CATEGORIES.map((category) =>
          chip(
            CATEGORY_LABELS[category],
            counts.categories[category],
            state.categories.has(category),
            () => onChange({ categories: toggled(state.categories, category) }),
          ),
        ),
      );
      severities?.replaceChildren(
        ...[...SEVERITIES]
          .reverse()
          .map((severity) =>
            chip(
              SEVERITY_STYLES[severity].label,
              counts.severities[severity],
              state.severities.has(severity),
              () => onChange({ severities: toggled(state.severities, severity) }),
              SEVERITY_STYLES[severity].color,
            ),
          ),
      );
      toggle
        .querySelector('.toggle-count')
        ?.replaceChildren(activeFilters ? ` · ${activeFilters}` : '');
      if (clear) clear.disabled = activeFilters === 0;
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
    get isOpen() {
      return isOpen;
    },
  };
}
