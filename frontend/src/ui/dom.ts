/** Small helpers shared by the panels. Text always goes in as text nodes, since it comes from
 * outside. */

import { SEVERITY_STYLES } from '../severity';
import type { Severity } from '../types';

export const timeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The small glowing dot in a severity's colour (decorative: the word is always there too). */
export function severityDot(severity: Severity): HTMLSpanElement {
  const dot = el('span', 'card-dot');
  dot.setAttribute('aria-hidden', 'true');
  dot.style.setProperty('--dot-color', SEVERITY_STYLES[severity].color);
  return dot;
}

/** The "State-affiliated" label on a source. */
export function stateBadge(): HTMLSpanElement {
  const badge = el('span', 'badge-state', 'State-affiliated');
  badge.title = 'Funded and editorially controlled by a government (see Sources)';
  return badge;
}
