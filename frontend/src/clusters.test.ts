import { describe, expect, it } from "vitest";
import { angularDistance, clusterDegrees, clusterEvents, clusterOf } from "./clusters";
import type { GlobeEvent, Severity } from "./types";

function event(id: string, lat: number, lng: number, severity: Severity = "low", published = "2026-11-07T10:00:00Z"): GlobeEvent {
  return {
    id,
    title: `Event ${id}`,
    snippet: "",
    place: "Somewhere",
    lat,
    lng,
    severity,
    categories: ["politics"],
    kind: "news",
    published,
    sources: [{ name: "Outlet", url: "https://example.com/" + id }],
  };
}

describe("clusterDegrees", () => {
  it("groups less as the camera comes closer", () => {
    expect([3, 2, 1.5, 1, 0.7, 0.5, 0.3].map(clusterDegrees)).toEqual([4, 4, 2, 2, 1, 1, 0]);
  });
});

describe("angularDistance", () => {
  it("measures degrees on the globe", () => {
    expect(angularDistance(0, 0, 0, 10)).toBeCloseTo(10, 5);
    expect(angularDistance(0, 179, 0, -179)).toBeCloseTo(2, 5);
  });
});

describe("clusterEvents", () => {
  const hyderabad = event("hyd", 17.38, 78.48);
  const warangal = event("war", 17.97, 79.6, "moderate");
  const vizag = event("viz", 17.69, 83.22);
  const tokyo = event("tok", 35.68, 139.69);

  it("groups nearby events behind the most severe one", () => {
    const clusters = clusterEvents([hyderabad, warangal, vizag, tokyo], 2);
    const india = clusters.find((c) => c.events.length === 2);
    expect(india?.lead.id).toBe("war");
    expect(india?.id).toBe("group:war");
    expect(india?.severity).toBe("moderate");
    expect([india?.lat, india?.lng]).toEqual([warangal.lat, warangal.lng]);
    expect(clusters).toHaveLength(3); // the India pair, Visakhapatnam, Tokyo
  });

  it("groups more from far away", () => {
    expect(clusterEvents([hyderabad, warangal, vizag, tokyo], 4)).toHaveLength(2);
  });

  it("does not group when zoomed right in", () => {
    const clusters = clusterEvents([hyderabad, warangal], 0);
    expect(clusters.map((c) => c.id)).toEqual(["war", "hyd"]);
  });

  it("groups across the date line", () => {
    expect(clusterEvents([event("a", -17, 179.5), event("b", -17, -179.5)], 2)).toHaveLength(1);
  });

  it("does not depend on input order", () => {
    const a = clusterEvents([hyderabad, warangal, vizag, tokyo], 2).map((c) => c.id);
    const b = clusterEvents([tokyo, vizag, warangal, hyderabad], 2).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it("finds the group an event belongs to", () => {
    const clusters = clusterEvents([hyderabad, warangal, tokyo], 2);
    expect(clusterOf(clusters, "hyd")?.id).toBe("group:war");
    expect(clusterOf(clusters, "tok")?.id).toBe("tok");
  });
});
