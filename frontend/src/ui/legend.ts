/**
 * The always-visible legend: what each severity means and what the markers are. Built from
 * SEVERITY_STYLES so the samples can never drift from the globe. Severity rows and marker rows
 * share one set of columns (sample, name, explanation).
 */

import { HAZARD_ICONS, iconSvg } from '../globe/hazard-icons';
import { SEVERITY_STYLES } from '../severity';
import { SEVERITIES, type Severity } from '../types';

/** Pillar height in pixels for the lowest level; grows like the pillars on the globe. */
const PILLAR_PX = 7;

/** What a level means, in short. The full rules are in docs/severity.md (keep in step). */
export const LEVEL_MEANING: Record<Severity, string> = {
  critical: '100+ dead · red alert',
  high: '10+ dead · orange alert',
  moderate: '1+ dead · listed danger',
  low: 'everything else',
};

/** Marker samples are grey: on the legend, as on the globe, colour only ever means severity. */
const SAMPLE_COLOR = '#a6a8a3';

function span(className: string, text?: string): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function paragraph(className: string, text: string): HTMLParagraphElement {
  const node = document.createElement('p');
  node.className = className;
  node.textContent = text;
  return node;
}

function heading(text: string, className = 'legend-title'): HTMLHeadingElement {
  const node = document.createElement('h2');
  node.className = className;
  node.textContent = text;
  return node;
}

/** One row: a sample of the marker, its name, and what it means. */
function row(sample: HTMLElement, name: string, how: string): HTMLLIElement {
  sample.setAttribute('aria-hidden', 'true');
  const item = document.createElement('li');
  item.append(sample, span('legend-name', name), span('legend-how', how));
  return item;
}

function rows(items: HTMLLIElement[]): HTMLUListElement {
  const list = document.createElement('ul');
  list.className = 'legend-list';
  list.append(...items);
  return list;
}

/** A small pillar of light, like those on the globe. */
function pillar(
  height: number,
  width: number,
  color: string,
  pulseSeconds: number | null = null,
): HTMLSpanElement {
  const node = span(pulseSeconds === null ? 'legend-pillar' : 'legend-pillar pulsing');
  node.style.setProperty('--pillar-h', `${height}px`);
  node.style.setProperty('--pillar-w', `${width.toFixed(1)}px`);
  node.style.setProperty('--dot-color', color);
  if (pulseSeconds !== null) node.style.setProperty('--pulse', `${pulseSeconds}s`);
  return node;
}

/** A small glass disc with a symbol, like those on the globe. */
export function symbolBadge(code: string): HTMLSpanElement {
  const badge = span('legend-symbol');
  badge.setAttribute('aria-hidden', 'true');
  const icon = HAZARD_ICONS.find((i) => i.code === code) ?? HAZARD_ICONS[HAZARD_ICONS.length - 1];
  badge.append(iconSvg(icon, SAMPLE_COLOR));
  return badge;
}

function severityRows(): HTMLUListElement {
  return rows(
    [...SEVERITIES].reverse().map((level) => {
      const style = SEVERITY_STYLES[level];
      const sample = pillar(
        Math.round(PILLAR_PX * style.size ** 1.6),
        3 * Math.sqrt(style.size),
        style.color,
        style.pulseSeconds,
      );
      return row(sample, style.label, LEVEL_MEANING[level]);
    }),
  );
}

function markerRows(): HTMLUListElement {
  return rows([
    row(pillar(16, 3, SAMPLE_COLOR), 'News', 'pillar of light'),
    row(symbolBadge('EQ'), 'Natural disaster', 'symbol shows its type'),
    row(span('legend-count', '3'), 'Group', 'events close together'),
  ]);
}

/** Every symbol by name, on request. */
function symbolList(): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'legend-symbols';
  const summary = document.createElement('summary');
  summary.textContent = 'Show disaster symbols';
  details.addEventListener('toggle', () => {
    summary.textContent = `${details.open ? 'Hide' : 'Show'} disaster symbols`;
  });
  const list = document.createElement('ul');
  for (const icon of HAZARD_ICONS) {
    const item = document.createElement('li');
    item.append(symbolBadge(icon.code), span('', icon.label));
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

const OPEN_KEY = 'wng-legend-open';

function wasLeftOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberOpen(open: boolean): void {
  try {
    if (open) window.localStorage.setItem(OPEN_KEY, '1');
    else window.localStorage.removeItem(OPEN_KEY);
  } catch {
    // Storage may be blocked; the button still works for this visit.
  }
}

/** The arrow that opens or closes the legend on phones (hidden by CSS on wider screens). */
function openButton(root: HTMLElement): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'legend-toggle';
  button.setAttribute('aria-controls', 'legend-more');
  button.append(span('legend-arrow'));
  const apply = (open: boolean): void => {
    root.classList.toggle('collapsed', !open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Show less of the legend' : 'Show the whole legend');
  };
  apply(wasLeftOpen());
  button.addEventListener('click', () => {
    const open = root.classList.contains('collapsed');
    apply(open);
    rememberOpen(open);
  });
  return button;
}

export function renderLegend(root: HTMLElement): void {
  const link = document.createElement('a');
  link.className = 'legend-link';
  link.href = '/about/#severity';
  link.textContent = 'How severity is decided';

  const summary = document.createElement('p');
  summary.className = 'legend-summary';
  summary.id = 'legend-summary';
  summary.hidden = true;

  const head = document.createElement('div');
  head.className = 'legend-head';
  head.append(
    heading('Severity'),
    paragraph('legend-note', 'How serious an event is. Each card says why it got its level.'),
    severityRows(),
    openButton(root),
  );

  const more = document.createElement('div');
  more.className = 'legend-more';
  more.id = 'legend-more';
  more.append(
    paragraph(
      'legend-note',
      'Deaths as stated in the headline; alerts from USGS and GDACS. More severe events are taller and pulse faster; high and critical also send out rings.',
    ),
    heading('On the globe', 'legend-title legend-section'),
    markerRows(),
    symbolList(),
    // Shown in the geography view only (by CSS, body.geo-view).
    paragraph('legend-geo-note', 'Countries take the colour of their most severe event.'),
    link,
  );

  root.replaceChildren(head, more, summary);
}

/** "Showing 37 of 412 events · Clear filters" while filters are on; hidden otherwise. */
export function renderSummary(
  shown: number,
  total: number,
  filtered: boolean,
  onClear: () => void,
): void {
  const summary = document.getElementById('legend-summary');
  if (!summary) return;
  summary.hidden = !filtered;
  if (!filtered) return;
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear';
  clear.addEventListener('click', onClear);
  summary.replaceChildren(`Showing ${shown} of ${total} events`, clear);
}
