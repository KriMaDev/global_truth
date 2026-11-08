import { describe, expect, it } from "vitest";
import { categoryBasisLines } from "./category-basis";

describe("categoryBasisLines", () => {
  it("says where each category came from, grouped", () => {
    expect(
      categoryBasisLines({
        categories: ["war", "politics", "economic"],
        category_basis: { war: "headline", politics: "headline", economic: "section:business" },
      }),
    ).toEqual([
      "War and Politics from words in the headline.",
      'Economic from the outlet\'s own section "business".',
    ]);
  });

  it("names GDELT's reading and the sport section", () => {
    expect(
      categoryBasisLines({ categories: ["humanitarian"], category_basis: { humanitarian: "topics" } }),
    ).toEqual(["Humanitarian & migration from GDELT's reading of the whole article."]);
    expect(categoryBasisLines({ categories: ["sport"], category_basis: { sport: "sport-section" } })).toEqual([
      "Sport from the outlet's sport section.",
    ]);
  });

  it("says nothing without a recorded basis, or for unknown kinds", () => {
    expect(categoryBasisLines({ categories: ["war"] })).toEqual([]);
    expect(categoryBasisLines({ categories: ["war"], category_basis: { war: "guess" } })).toEqual([]);
  });
});
