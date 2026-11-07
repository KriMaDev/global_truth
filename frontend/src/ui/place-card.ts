/**
 * "About this place": the card for a country, ocean, sea, mountain range, desert or peak in
 * the geography view. The Wikipedia text is shown word for word, with the article revision
 * and its licence (CC BY-SA 4.0); the facts come from Wikidata (CC0). Without data for a
 * place, the card says so and shows only Natural Earth's name and type: no invented text.
 * Built from text nodes only.
 */

import { factRows, type MapLabel, type PlaceFacts } from "../geography";

export interface PlaceCardInput {
  label: MapLabel;
  /** Countries: "Southern Asia · Asia". */
  where?: string | null;
  facts?: PlaceFacts;
  /** When the facts and text were fetched (YYYY-MM-DD). */
  asOf?: string | null;
  /** Countries: their current events, and a way to show only those. */
  events?: { summary: string; onShow?: () => void } | null;
}

const LICENCE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(text: string, href: string): HTMLAnchorElement {
  const a = el("a", "", text);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

/** The card's content (the card itself adds the close button). */
export function placeCardParts(input: PlaceCardInput): HTMLElement[] {
  const { label, facts } = input;
  const parts: HTMLElement[] = [];
  parts.push(el("p", "card-kind", input.where ? `${label.type} · ${input.where}` : label.type));
  const title = el("h2", "card-title", label.name);
  title.id = "event-card-title";
  title.tabIndex = -1;
  parts.push(title);

  // Short things first (the description, facts and events), then the article's text.
  const wiki = facts?.wikipedia;
  if (wiki?.description) parts.push(el("p", "card-place", wiki.description));

  const rows = factRows(label, facts);
  if (rows.length) {
    const list = el("dl", "place-facts");
    for (const [name, value] of rows) list.append(el("dt", "", name), el("dd", "", value));
    parts.push(list);
  }
  if (!wiki && rows.length === 0) {
    parts.push(el("p", "card-reason", "No description is available for this place yet."));
  }

  if (input.events) {
    const block = el("div", "place-events");
    block.append(el("h3", "card-subtitle", "Events here now"), el("p", "", input.events.summary));
    if (input.events.onShow) {
      const show = el("button", "card-back", "Show only these events");
      show.type = "button";
      show.addEventListener("click", input.events.onShow);
      block.append(show);
    }
    parts.push(block);
  }

  if (wiki?.extract) parts.push(el("p", "card-snippet place-text", wiki.extract));

  // Credits: what came from where, with links.
  const credits = el("p", "card-notes place-credits");
  if (wiki) {
    const revision = wiki.revision
      ? `${wiki.url.replace(/\/wiki\/.*/, "")}/w/index.php?oldid=${encodeURIComponent(wiki.revision)}`
      : wiki.url;
    credits.append(
      "Text: from the Wikipedia article ",
      link(`“${wiki.title}”`, revision),
      " by its contributors, ",
      link("CC BY-SA 4.0", LICENCE_URL),
      ". ",
    );
  }
  if (rows.length && label.wikidata) {
    credits.append("Facts: ", link("Wikidata", `https://www.wikidata.org/wiki/${label.wikidata}`), " (CC0). ");
  }
  if (input.asOf && (wiki || rows.length)) credits.append(`As of ${input.asOf}. `);
  credits.append(label.kind === "peak" ? "Name, position and elevation: Natural Earth." : "Name and position: Natural Earth.");
  parts.push(credits);
  return parts;
}
