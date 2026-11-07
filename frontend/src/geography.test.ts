import { describe, expect, it } from "vitest";
import {
  countryCounts,
  countrySeverity,
  factRows,
  formatPopulation,
  labelLevel,
  labelPriority,
  labelsFor,
  type GeographyData,
} from "./geography";
import type { GlobeEvent, Severity } from "./types";

function event(id: string, code: string | null, severity: Severity): GlobeEvent {
  return {
    id,
    title: id,
    snippet: "",
    place: "",
    lat: 0,
    lng: 0,
    severity,
    categories: ["war"],
    kind: "news",
    published: "2026-11-08T10:00:00Z",
    sources: [{ name: "Outlet", url: "https://example.com/" + id }],
    geo: { continent: null, region: null, country: null, country_code: code, admin1: null, city: null, precision: "country" },
  };
}

describe("countrySeverity", () => {
  it("colours each country by its most severe event", () => {
    const map = countrySeverity([
      event("a", "UA", "low"),
      event("b", "UA", "high"),
      event("c", "UA", "moderate"),
      event("d", "JP", "low"),
      event("e", null, "critical"),
    ]);
    expect(Object.fromEntries(map)).toEqual({ UA: "high", JP: "low" });
  });

  it("counts a country's events by severity", () => {
    expect(countryCounts([event("a", "UA", "low"), event("b", "UA", "high")], "UA")).toEqual({
      low: 1,
      moderate: 0,
      high: 1,
      critical: 0,
    });
  });
});

const data: GeographyData = {
  countries: [
    { iso2: "RU", name: "Russia", continent: "Europe", region: "Eastern Europe", label: [44, 58], rank: 2, polygons: [] },
    { iso2: "LU", name: "Luxembourg", continent: "Europe", region: "Western Europe", label: [6, 49.7], rank: 6, polygons: [] },
  ],
  labels: {
    seas: [
      { name: "INDIAN OCEAN", kind: "ocean", rank: 0, at: [82, -33] },
      { name: "Gulf of Aden", kind: "gulf", rank: 3, at: [48, 12] },
    ],
    regions: [{ name: "HIMALAYAS", kind: "range", rank: 1, at: [85, 28] }],
    peaks: [
      { name: "Mount Everest", elevation: 8848, rank: 1, at: [86.9, 27.98] },
      { name: "Small Hill", elevation: 1200, rank: 9, at: [0, 0] },
    ],
  },
};

describe("labelsFor", () => {
  it("shows only the most important from far away", () => {
    expect(labelsFor(2.4, data).map((l) => l.text)).toEqual([
      "Russia",
      "Indian Ocean",
      "Himalayas",
      "Mount Everest 8,848 m",
    ]);
  });

  it("adds smaller places when zooming in", () => {
    const close = labelsFor(0.6, data).map((l) => l.text);
    expect(close).toContain("Luxembourg");
    expect(close).toContain("Gulf of Aden");
    expect(close).not.toContain("Small Hill 1,200 m");
  });

  it("has five zoom levels", () => {
    expect([3, 1.5, 1.2, 0.9, 0.3].map(labelLevel)).toEqual([0, 1, 2, 3, 4]);
  });

  it("puts oceans first, then countries by rank, and peaks last", () => {
    const order = labelsFor(0.3, data)
      .sort((a, b) => labelPriority(a) - labelPriority(b))
      .map((l) => l.text);
    expect(order[0]).toBe("Indian Ocean");
    expect(order.indexOf("Russia")).toBeLessThan(order.indexOf("Luxembourg"));
    expect(order.at(-1)).toBe("Mount Everest 8,848 m");
  });
});

describe("place facts", () => {
  it("formats a country's facts in a fixed order", () => {
    const rows = factRows(
      { kind: "country" },
      {
        capital: "Capital City",
        population: 1_428_627_663,
        population_year: 2023,
        area_m2: 3_287_263_000_000,
        languages: ["Language A", "Language B"],
        currency: ["Coin"],
      },
    );
    expect(rows).toEqual([
      ["Capital", "Capital City"],
      ["Population", "1.43 billion (2023)"],
      ["Area", "3,287,263 km²"],
      ["Official languages", "Language A, Language B"],
      ["Currency", "Coin"],
    ]);
  });

  it("gives seas, ranges and peaks their own facts", () => {
    expect(factRows({ kind: "sea" }, { max_depth_m: 4652.4, countries: ["A", "B"] })).toEqual([
      ["Greatest depth", "4,652 m"],
      ["Bordering countries", "A, B"],
    ]);
    expect(factRows({ kind: "range" }, { length_m: 2_400_000, highest_point: "Peak X" })).toEqual([
      ["Highest point", "Peak X"],
      ["Length", "2,400 km"],
    ]);
    expect(factRows({ kind: "peak", elevation: 8848 }, { prominence_m: 8848 })).toEqual([
      ["Elevation", "8,848 m"],
      ["Prominence", "8,848 m"],
    ]);
  });

  it("shows nothing it does not know", () => {
    expect(factRows({ kind: "country" }, undefined)).toEqual([]);
    expect(factRows({ kind: "desert" }, {})).toEqual([]);
  });

  it("writes populations readably", () => {
    expect([1_430_000_000, 67_400_000, 889_953].map(formatPopulation)).toEqual([
      "1.43 billion",
      "67.4 million",
      "889,953",
    ]);
  });
});
