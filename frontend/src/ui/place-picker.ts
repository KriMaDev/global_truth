/**
 * The place drill-down in the Filters panel: a breadcrumb to step back up, and a list of the
 * next level's places with their event counts. Built once and updated in place.
 */

import { PLACE_LEVELS } from '../filters';
import { LEVEL_NAMES, placeNames, placeOptions } from '../places';
import type { GlobeEvent } from '../types';

export interface PlacePicker {
  /** `events`: those in the time window that pass the other filters. */
  update(path: string[], events: GlobeEvent[]): void;
}

export function createPlacePicker(
  root: HTMLElement,
  onChoose: (path: string[]) => void,
): PlacePicker {
  const crumbs = document.createElement('nav');
  crumbs.className = 'place-crumbs';
  crumbs.setAttribute('aria-label', 'Chosen place');
  const select = document.createElement('select');
  select.className = 'place-select';
  select.id = 'place-select';
  const label = document.createElement('label');
  label.className = 'sr-only';
  label.htmlFor = select.id;
  root.replaceChildren(crumbs, label, select);

  let current: string[] = [];
  select.addEventListener('change', () => {
    if (select.value) onChoose([...current, select.value]);
  });

  const crumb = (text: string, path: string[], isLast: boolean): HTMLElement => {
    if (isLast) {
      const span = document.createElement('span');
      span.className = 'place-crumb is-current';
      span.textContent = text;
      span.setAttribute('aria-current', 'location');
      return span;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'place-crumb';
    button.textContent = text;
    button.addEventListener('click', () => onChoose(path));
    return button;
  };

  return {
    update(path, events) {
      current = path;
      const names = placeNames(events, path);
      const parts: (HTMLElement | string)[] = [crumb('All', [], path.length === 0)];
      names.forEach((name, i) =>
        parts.push(' › ', crumb(name, path.slice(0, i + 1), i === names.length - 1)),
      );
      crumbs.replaceChildren(...parts);

      const options = placeOptions(events, path);
      const level = PLACE_LEVELS[path.length];
      select.hidden = !level || options.length === 0;
      if (select.hidden) return;
      label.textContent = `Choose a ${LEVEL_NAMES[level].toLowerCase()}`;
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = `${LEVEL_NAMES[level]}…`;
      select.replaceChildren(
        placeholder,
        ...options.map((option) => {
          const element = document.createElement('option');
          element.value = option.value;
          element.textContent = `${option.label} (${option.count})`;
          return element;
        }),
      );
      select.value = '';
    },
  };
}
