/**
 * Where an event's categories came from, in plain words for its card (the pipeline's
 * category_basis, docs/categories.md): the outlet's own section, words in the headline,
 * GDELT's reading of the whole article, or the outlet's sport section.
 */

import { CATEGORY_LABELS, type Category, type GlobeEvent } from "../types";

function list(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function describe(basis: string): string | null {
  if (basis === "headline") return "from words in the headline";
  if (basis === "topics") return "from GDELT's reading of the whole article";
  if (basis === "sport-section") return "from the outlet's sport section";
  if (basis.startsWith("section:")) return `from the outlet's own section "${basis.slice(8)}"`;
  return null;
}

/** One line per kind of basis, e.g. 'Economic from the outlet's own section "business".'
 * Empty for events without a recorded basis (data feeds, older data). */
export function categoryBasisLines(event: Pick<GlobeEvent, "categories" | "category_basis">): string[] {
  const basis = event.category_basis;
  if (!basis) return [];
  const groups = new Map<string, Category[]>();
  for (const category of event.categories) {
    const how = basis[category];
    if (!how || !describe(how)) continue;
    groups.set(how, [...(groups.get(how) ?? []), category]);
  }
  return [...groups].map(
    ([how, categories]) => `${list(categories.map((c) => CATEGORY_LABELS[c]))} ${describe(how)}.`,
  );
}
