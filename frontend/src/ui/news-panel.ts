/**
 * The Headlines panel: the events on the globe as a list you can read, each headline word for
 * word with who reported it, where and when, plus how fresh the data is. Choosing a row flies
 * the globe there and opens the event's card.
 */

import { compareByNewest, compareBySeverity } from '../events';
import { describeFreshness, relativeTime, type FeedsReport } from '../feeds';
import { SEVERITY_STYLES } from '../severity';
import { KIND_LABELS, hazardLabel, type GlobeEvent } from '../types';
import { el, severityDot, stateBadge, timeFormat } from './dom';

export interface NewsPanelView {
  /** What the globe shows now (filters, place, time window). */
  events: GlobeEvent[];
  /** Readable names of the chosen place, widest first; empty for the whole world. */
  place: string[];
  /** When the events on screen were written, or null if unknown. */
  dataTime: string | null;
  /** Whether "Clear filters" would change anything. */
  canClear: boolean;
  /** The events could not be loaded at all. */
  failed: boolean;
}

export interface NewsPanelHandlers {
  onPick: (event: GlobeEvent) => void;
  onClear: () => void;
  /** Called when the panel opens, before it draws. */
  onOpen: () => void;
  /** Called after it opens or closes. */
  onToggle: () => void;
}

export interface NewsPanel {
  render(view: NewsPanelView): void;
  setFeeds(report: FeedsReport): void;
  /** Opens the panel; with `focus`, moves the keyboard there (to a row, if `eventId` is given). */
  open(focus: boolean, eventId?: string): void;
  close(): void;
  readonly isOpen: boolean;
}

type SortOrder = 'severity' | 'newest';

/** The latest events failed to load, but older day files did. */
const PARTIAL_DATA = "The latest events couldn't be loaded, so these may be older.";

const COMPARE: Record<SortOrder, (a: GlobeEvent, b: GlobeEvent) => number> = {
  severity: compareBySeverity,
  newest: compareByNewest,
};

/** "142 events · Europe › Belgium". */
export function countLine(count: number, place: string[]): string {
  return `${count} event${count === 1 ? '' : 's'} · ${place.join(' › ') || 'Whole world'}`;
}

/** The lead source and how many others report it: "BBC News +2 more", or null if none. */
export function sourceSummary(event: Pick<GlobeEvent, 'sources' | 'coverage'>): string | null {
  const lead = event.sources[0];
  if (!lead) return null;
  const others = (event.coverage ?? new Set(event.sources.map((s) => s.name)).size) - 1;
  return others > 0 ? `${lead.name} +${others} more` : lead.name;
}

/** The line under a headline: "Earthquake · High · Data feed · USGS". */
export function rowMeta(event: GlobeEvent): string {
  return [
    hazardLabel(event),
    SEVERITY_STYLES[event.severity].label,
    KIND_LABELS[event.kind],
    sourceSummary(event),
  ]
    .filter(Boolean)
    .join(' · ');
}

function row(event: GlobeEvent, now: number, onPick: (event: GlobeEvent) => void): HTMLLIElement {
  const button = el('button', 'card-list-item');
  button.type = 'button';
  button.dataset.eventId = event.id;

  const meta = el('span', 'card-list-meta', rowMeta(event));
  // Only about the outlet named here; the card labels every source.
  if (event.sources[0]?.state_affiliated) meta.append(' ', stateBadge());

  const time = el('time', '', relativeTime(event.published, now));
  time.dateTime = event.published;
  time.title = timeFormat.format(new Date(event.published));
  const where = el('span', 'card-list-meta', `${event.place} · `);
  where.append(time);

  const text = el('span', 'card-list-text');
  text.append(el('span', 'card-list-title', event.title), meta, where);
  button.append(severityDot(event.severity), text);
  button.addEventListener('click', () => onPick(event));

  const item = el('li', 'news-row');
  item.append(button);
  return item;
}

function part<T extends HTMLElement>(root: HTMLElement, name: string): T {
  const node = root.querySelector<T>(`[data-news=${name}]`);
  if (!node) throw new Error(`Missing data-news=${name} in index.html`);
  return node;
}

export function createNewsPanel(
  root: HTMLElement,
  toggle: HTMLButtonElement,
  handlers: NewsPanelHandlers,
): NewsPanel {
  const title = part(root, 'title');
  const count = part(root, 'count');
  const updated = part(root, 'updated');
  const details = part(root, 'details');
  const warnings = part(root, 'warnings');
  const body = part(root, 'body');
  const sortButtons: Record<SortOrder, HTMLButtonElement> = {
    severity: part<HTMLButtonElement>(root, 'sort-severity'),
    newest: part<HTMLButtonElement>(root, 'sort-newest'),
  };

  let isOpen = false;
  let order: SortOrder = 'severity';
  let view: NewsPanelView | null = null;
  let feeds: FeedsReport | null = null;
  // The list on screen no longer matches the events (nothing is drawn while closed).
  let outdated = true;
  let scrollTop = 0;

  const drawStatus = (): void => {
    if (!view) return;
    const now = Date.now();
    const fresh = describeFreshness(view.dataTime, feeds, now);
    count.textContent = countLine(view.events.length, view.place);
    updated.textContent = fresh.updated;
    details.textContent = fresh.details;
    details.hidden = fresh.details === '';
    const lines =
      view.failed && view.events.length > 0 ? [PARTIAL_DATA, ...fresh.warnings] : fresh.warnings;
    warnings.replaceChildren(...lines.map((line) => el('p', 'news-warning', line)));
    for (const time of body.querySelectorAll('time')) {
      time.textContent = relativeTime(time.dateTime, now);
    }
  };

  const emptyState = (current: NewsPanelView): HTMLElement => {
    const box = el('div', 'news-empty');
    if (current.failed) {
      box.append(
        el('p', '', "The latest events couldn't be loaded. Please try again in a few minutes."),
      );
    } else if (current.canClear) {
      box.append(el('p', '', 'No events match these filters.'));
      const clear = el('button', 'card-back', 'Clear filters');
      clear.type = 'button';
      clear.addEventListener('click', () => {
        handlers.onClear();
        title.focus();
      });
      box.append(clear);
    } else {
      box.append(el('p', '', 'No events in this time window.'));
    }
    return box;
  };

  const draw = (): void => {
    if (!view) return;
    outdated = false;
    if (view.events.length === 0) {
      body.replaceChildren(emptyState(view));
    } else {
      const now = Date.now();
      const list = el('ul', 'card-list');
      list.append(
        ...[...view.events].sort(COMPARE[order]).map((event) => row(event, now, handlers.onPick)),
      );
      body.replaceChildren(list);
    }
    drawStatus();
  };

  const showOrder = (): void => {
    for (const [name, button] of Object.entries(sortButtons)) {
      button.setAttribute('aria-pressed', String(name === order));
    }
  };

  const setOpen = (open: boolean): void => {
    if (open === isOpen) return;
    isOpen = open;
    if (open) {
      handlers.onOpen();
      root.hidden = false;
      if (outdated) draw();
      else drawStatus();
      body.scrollTop = scrollTop;
    } else {
      scrollTop = body.scrollTop;
      root.hidden = true;
    }
    toggle.setAttribute('aria-expanded', String(open));
    handlers.onToggle();
  };

  const closeToToggle = (): void => {
    setOpen(false);
    toggle.focus();
  };

  for (const [name, button] of Object.entries(sortButtons)) {
    button.addEventListener('click', () => {
      order = name as SortOrder;
      showOrder();
      draw();
      body.scrollTop = 0;
    });
  }
  showOrder();

  toggle.addEventListener('click', () => {
    if (isOpen) {
      setOpen(false);
    } else {
      setOpen(true);
      title.focus();
    }
  });
  part(root, 'close').addEventListener('click', closeToToggle);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeToToggle();
  });

  // "12 min ago" keeps counting while the page stays open.
  window.setInterval(() => {
    if (isOpen) drawStatus();
  }, 60_000);

  return {
    render(next) {
      view = next;
      outdated = true;
      scrollTop = 0;
      if (isOpen) {
        draw();
        body.scrollTop = 0;
      }
    },
    setFeeds(report) {
      feeds = report;
      if (isOpen) drawStatus();
    },
    open(focus, eventId) {
      setOpen(true);
      if (!focus) return;
      const target = eventId
        ? [...body.querySelectorAll<HTMLElement>('[data-event-id]')].find(
            (b) => b.dataset.eventId === eventId,
          )
        : null;
      (target ?? title).focus();
    },
    close: () => setOpen(false),
    get isOpen() {
      return isOpen;
    },
  };
}
