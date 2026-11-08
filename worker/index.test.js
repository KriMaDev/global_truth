import { describe, expect, it, vi } from "vitest";
import worker, { DISPATCH_URL, startUpdate } from "./index.js";

describe("startUpdate", () => {
  it("asks GitHub to run the update workflow on main", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await startUpdate("secret-token", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(DISPATCH_URL);
    expect(url).toContain("/repos/KriMaDev/global_truth/actions/workflows/update.yml/dispatches");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer secret-token");
    expect(init.headers["User-Agent"]).toBe("world-news-globe-cron");
    expect(JSON.parse(init.body)).toEqual({ ref: "main" });
  });

  it("throws when GitHub refuses, so the logs show it", async () => {
    const fetchImpl = vi.fn(async () => new Response("Bad credentials", { status: 401 }));
    await expect(startUpdate("expired", fetchImpl)).rejects.toThrow(/401.*Bad credentials/);
  });

  it("throws without a token, before calling GitHub", async () => {
    const fetchImpl = vi.fn();
    await expect(startUpdate(undefined, fetchImpl)).rejects.toThrow(/GITHUB_TOKEN/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("fetch", () => {
  it("hands every request to the static files", async () => {
    const answer = new Response("ok");
    const env = { ASSETS: { fetch: vi.fn(async () => answer) } };
    const request = new Request("https://globe.krimadev.com/missing");
    expect(await worker.fetch(request, env)).toBe(answer);
    expect(env.ASSETS.fetch).toHaveBeenCalledWith(request);
  });
});
