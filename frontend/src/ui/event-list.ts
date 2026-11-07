/**
 * Every event as a button, most severe first. On the globe view the buttons are hidden until
 * focused, so keyboard users can Tab through the lights (each focus flies the globe there)
 * and press Enter to open one. Without 3D graphics the same list is shown as a plain list.
 */

import { SEVERITY_STYLES } from "../severity";
import { hazardLabel, type GlobeEvent } from "../types";

export interface EventListHandlers {
  onFocus?: (event: GlobeEvent) => void;
  onOpen: (event: GlobeEvent) => void;
}

export function renderEventList(
  root: HTMLElement,
  events: GlobeEvent[],
  handlers: EventListHandlers,
): void {
  const list = document.createElement("ul");
  list.className = "event-list-items";
  for (const event of events) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "event-list-button glass";
    button.dataset.eventId = event.id;
    const dot = document.createElement("span");
    dot.className = "card-dot";
    dot.setAttribute("aria-hidden", "true");
    dot.style.setProperty("--dot-color", SEVERITY_STYLES[event.severity].color);
    const text = document.createElement("span");
    const details = [hazardLabel(event), SEVERITY_STYLES[event.severity].label, event.place];
    text.textContent = `${event.title} (${details.filter(Boolean).join(", ")})`;
    button.append(dot, text);
    if (handlers.onFocus) {
      const onFocus = handlers.onFocus;
      button.addEventListener("focus", () => onFocus(event));
    }
    button.addEventListener("click", () => handlers.onOpen(event));
    const item = document.createElement("li");
    item.append(button);
    list.append(item);
  }
  root.replaceChildren(list);
}
