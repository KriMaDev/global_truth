import { describe, expect, it } from "vitest";
import { coverageHeading, parseOutletDirectory, sourceDetails } from "./outlets";

const dir = parseOutletDirectory({
  outlets: [
    { name: "BBC News", slug: "bbc-news", domain: "bbc.co.uk", country: "United Kingdom", region: "Europe", ownership: "public", ownership_label: "Public", events: 12 },
    { name: "The Guardian", slug: "the-guardian", domain: "theguardian.com", country: "United Kingdom", region: "Europe", ownership: "private", ownership_label: "Private", events: 4 },
    { name: "Xinhua", slug: "xinhua", domain: "xinhuanet.com", country: "China", region: "Asia", ownership: "state", ownership_label: "State-affiliated", events: 9 },
    { name: "Broken", slug: "Bad Slug!", domain: "x", country: "X", region: "X", ownership: "public", ownership_label: "Public", events: 1 },
  ],
  providers: [
    { name: "USGS", credit: "U.S. Geological Survey", homepage: "https://earthquake.usgs.gov/" },
    { name: "Evil", credit: "x", homepage: "javascript:alert(1)" },
  ],
});

describe("outlet directory", () => {
  it("keeps only well-formed entries", () => {
    expect([...dir.outlets.keys()]).toEqual(["BBC News", "The Guardian", "Xinhua"]);
    expect([...dir.providers.keys()]).toEqual(["USGS"]);
    expect(parseOutletDirectory(null).outlets.size).toBe(0);
  });

  it("describes an outlet by country and ownership, linked to its row", () => {
    expect(sourceDetails({ name: "BBC News", url: "https://bbc.co.uk/x" }, dir)).toEqual({
      text: "United Kingdom · Public",
      href: "/sources/#outlet-bbc-news",
    });
    // State-affiliated has its own badge.
    expect(sourceDetails({ name: "Xinhua", url: "https://x" }, dir)?.text).toBe("China");
  });

  it("gives a data provider's credit line", () => {
    expect(sourceDetails({ name: "USGS", url: "https://x" }, dir)).toEqual({
      text: "Data: U.S. Geological Survey",
      href: "https://earthquake.usgs.gov/",
    });
    expect(sourceDetails({ name: "Unknown", url: "https://x" }, dir)).toBeNull();
    expect(sourceDetails({ name: "BBC News", url: "https://x" }, null)).toBeNull();
  });

  it("says how many outlets in how many countries reported it", () => {
    const one = { sources: [{ name: "BBC News", url: "https://a" }] };
    expect(coverageHeading(one, dir)).toBe("Source");
    const three = {
      sources: [
        { name: "BBC News", url: "https://a" },
        { name: "The Guardian", url: "https://b" },
        { name: "Xinhua", url: "https://c" },
      ],
    };
    expect(coverageHeading(three, dir)).toBe("Reported by 3 outlets in 2 countries");
    expect(coverageHeading(three, null)).toBe("Reported by 3 outlets");
  });
});
