import { describe, expect, it } from "vitest";
import { describeFreshness, parseFeeds, relativeTime } from "./feeds";

const NOW = Date.parse("2026-11-08T12:00:00Z");

function feed(id: string, status = "ok", last_success = "2026-11-08T11:48:00Z") {
  return { id, name: `${id} long name`, kind: "news", homepage: "https://example.com", status, last_success };
}

describe("relativeTime", () => {
  it.each([
    ["2026-11-08T11:59:40Z", "just now"],
    ["2026-11-08T11:48:00Z", "12 min ago"],
    ["2026-11-08T07:00:00Z", "5 h ago"],
    ["2026-11-05T11:00:00Z", "3 days ago"],
    // A clock slightly ahead of the visitor's must not read "-3 min ago".
    ["2026-11-08T12:03:00Z", "just now"],
  ])("%s reads %s", (time, expected) => {
    expect(relativeTime(time, NOW)).toBe(expected);
  });
});

describe("parseFeeds", () => {
  it("keeps well-formed feeds and drops the rest", () => {
    const report = parseFeeds({
      generated: "2026-11-08T11:48:00Z",
      feeds: [feed("usgs"), { id: 3 }, "nonsense", { ...feed("gdacs"), last_success: "soon" }],
    });
    expect(report.generated).toBe("2026-11-08T11:48:00Z");
    expect(report.feeds.map((f) => f.id)).toEqual(["usgs"]);
  });

  it.each([[null], ["text"], [{ feeds: "no" }]])("survives malformed input %j", (input) => {
    expect(parseFeeds(input)).toEqual({ generated: null, feeds: [] });
  });
});

describe("describeFreshness", () => {
  it("says when each feed updated, with no warnings on fresh data", () => {
    const result = describeFreshness(
      "2026-11-08T11:48:00Z",
      { generated: "2026-11-08T11:48:00Z", feeds: [feed("usgs"), feed("gdelt")] },
      NOW,
    );
    expect(result.updated).toBe("Updated 12 min ago");
    expect(result.details).toBe("USGS 12 min ago · GDELT 12 min ago");
    expect(result.warnings).toEqual([]);
  });

  it("warns only after 2 hours", () => {
    expect(describeFreshness("2026-11-08T10:00:00Z", null, NOW).warnings).toEqual([]);
    expect(describeFreshness("2026-11-08T09:59:00Z", null, NOW).warnings).toEqual([
      "Data may be out of date: the last update was 2 h ago.",
    ]);
  });

  it("names a failed feed and how old its data is", () => {
    const failed = feed("gdacs", "error", "2026-11-08T09:00:00Z");
    expect(describeFreshness("2026-11-08T11:48:00Z", { generated: null, feeds: [failed] }, NOW).warnings).toEqual([
      "GDACS failed in the last update. Its latest good data is from 3 h ago.",
    ]);
  });

  it("works without feeds.json and without any time", () => {
    expect(describeFreshness("2026-11-08T11:48:00Z", null, NOW).details).toBe("");
    expect(describeFreshness(null, null, NOW).updated).toBe("Update time unknown");
  });
});
