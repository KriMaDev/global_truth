import { describe, expect, it } from "vitest";
import sampleEvents from "./data/sample-events.json";
import { compareBySeverity, isGlobeEvent, parseEvents } from "./events";
import { CATEGORIES, SEVERITIES, hazardLabel, type GlobeEvent } from "./types";

const valid: GlobeEvent = {
  id: "x-1",
  title: "A headline",
  snippet: "A short snippet.",
  place: "Sofia, Bulgaria",
  lat: 42.7,
  lng: 23.3,
  severity: "moderate",
  categories: ["politics"],
  kind: "news",
  published: "2026-11-07T10:00:00Z",
  sources: [{ name: "Example News", url: "https://example.com/story" }],
};

describe("isGlobeEvent", () => {
  it("accepts a complete event", () => {
    expect(isGlobeEvent(valid)).toBe(true);
  });

  it.each([
    ["latitude out of range", { lat: 91 }],
    ["longitude out of range", { lng: -181 }],
    ["unknown severity", { severity: "extreme" }],
    ["unknown category", { categories: ["gossip"] }],
    ["a category basis for an unknown category", { category_basis: { gossip: "headline" } }],
    ["a category basis that is not text", { category_basis: { war: 3 } }],
    ["unknown kind", { kind: "opinion" }],
    ["unreadable time", { published: "yesterday" }],
    ["empty title", { title: "  " }],
    ["snippet over 280 characters", { snippet: "x".repeat(281) }],
    ["a source link that is not http(s)", { sources: [{ name: "Bad", url: "javascript:alert(1)" }] }],
  ])("rejects %s", (_, change) => {
    expect(isGlobeEvent({ ...valid, ...change })).toBe(false);
  });

  it("accepts the pipeline's full format", () => {
    const full = {
      ...valid,
      severity_reason: "Headline reports 22 or more deaths",
      feed: "gdelt",
      hazard: null,
      first_seen: "2026-11-07T10:05:00Z",
      coverage: 2,
      geo: {
        continent: "Europe",
        region: "Eastern Europe",
        country: "Bulgaria",
        country_code: "BG",
        admin1: null,
        city: "Sofia",
        precision: "city",
      },
      location_method: "machine-coded",
      category_basis: { politics: "section:politics" },
      sources: [{ name: "Example News", url: "https://example.com/a", state_affiliated: true }],
    };
    expect(isGlobeEvent(full)).toBe(true);
    expect(isGlobeEvent({ ...full, geo: { ...full.geo, precision: "street" } })).toBe(false);
    expect(isGlobeEvent({ ...full, coverage: 0 })).toBe(false);
    expect(isGlobeEvent({ ...full, location_method: "guessed" })).toBe(false);
  });

  it("requires a source for real events and none for samples", () => {
    expect(isGlobeEvent({ ...valid, sources: [] })).toBe(false);
    expect(isGlobeEvent({ ...valid, kind: "sample", sources: [] })).toBe(true);
  });

  it("drops malformed events and keeps the rest", () => {
    expect(parseEvents([valid, { ...valid, lat: "north" }, null])).toEqual([valid]);
    expect(parseEvents({ not: "a list" })).toEqual([]);
  });
});

describe("compareBySeverity", () => {
  it("puts the most severe first, then the newest", () => {
    const older = { ...valid, id: "a", severity: "high" as const, published: "2026-11-06T00:00:00Z" };
    const newer = { ...valid, id: "b", severity: "high" as const, published: "2026-11-07T00:00:00Z" };
    const low = { ...valid, id: "c", severity: "low" as const };
    const critical = { ...valid, id: "d", severity: "critical" as const };
    expect([low, older, critical, newer].sort(compareBySeverity).map((e) => e.id)).toEqual([
      "d",
      "b",
      "a",
      "c",
    ]);
  });
});

describe("sample data", () => {
  const events = parseEvents(sampleEvents);

  it("is entirely well formed", () => {
    expect(events).toHaveLength((sampleEvents as unknown[]).length);
  });

  it("is clearly marked as sample data, with no source links", () => {
    for (const event of events) {
      expect(event.kind).toBe("sample");
      expect(event.title.startsWith("Sample: ")).toBe(true);
      expect(event.sources).toEqual([]);
    }
  });

  it("has unique ids", () => {
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });

  it("covers every severity level and every category", () => {
    expect(new Set(events.map((e) => e.severity))).toEqual(new Set(SEVERITIES));
    expect(new Set(events.flatMap((e) => e.categories))).toEqual(new Set(CATEGORIES));
  });
});

describe("hazardLabel", () => {
  it("names the disaster type, and nothing for unknown or missing codes", () => {
    expect(hazardLabel({ hazard: "EQ" })).toBe("Earthquake");
    expect(hazardLabel({ hazard: "TC" })).toBe("Tropical cyclone");
    expect(hazardLabel({ hazard: "XX" })).toBeNull();
    expect(hazardLabel({ hazard: null })).toBeNull();
    expect(hazardLabel({})).toBeNull();
  });
});
