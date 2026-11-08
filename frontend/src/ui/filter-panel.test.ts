import { describe, expect, it } from "vitest";
import { SEVERITIES } from "../types";
import { allToggled, categoryChipLabel } from "./filter-panel";

describe("allToggled", () => {
  it("turns everything off while anything is on", () => {
    expect(allToggled(new Set(["high"]), SEVERITIES).size).toBe(0);
    expect(allToggled(new Set(SEVERITIES), SEVERITIES).size).toBe(0);
  });

  it("turns everything on when nothing is", () => {
    expect([...allToggled(new Set<string>(), SEVERITIES)]).toEqual([...SEVERITIES]);
  });
});

describe("categoryChipLabel", () => {
  it("says which categories are off by default", () => {
    expect(categoryChipLabel("sport")).toBe("Sport (off by default)");
    expect(categoryChipLabel("war")).toBe("War");
  });
});
