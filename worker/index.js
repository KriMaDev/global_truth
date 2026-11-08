/**
 * The timer Worker (world-news-globe-timer, config in ./wrangler.jsonc). Its Cron Trigger, at
 * minutes 7 and 37, asks GitHub to start the "Update data and deploy" workflow, which is far
 * more punctual than GitHub's own scheduler. The pipeline still runs on GitHub Actions, and
 * the site stays plain static files in its own Worker (docs/deploy.md).
 *
 * It has no web address and no fetch handler: only the cron runs it.
 *
 * Secret: GITHUB_TOKEN, a fine-grained token for KriMaDev/world_news_globe with "Actions: Read
 * and write" only, set with `npx wrangler secret put GITHUB_TOKEN -c worker/wrangler.jsonc`.
 * Never in a file.
 */

export const DISPATCH_URL =
  "https://api.github.com/repos/KriMaDev/world_news_globe/actions/workflows/update.yml/dispatches";

/**
 * Asks GitHub to run the update workflow on main. Throws when the token is missing or GitHub
 * refuses, so the failure shows in the Worker's logs.
 * @param {string | undefined} token
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<void>}
 */
export async function startUpdate(token, fetchImpl = fetch) {
  if (!token) throw new Error("GITHUB_TOKEN is not set (npx wrangler secret put GITHUB_TOKEN -c worker/wrangler.jsonc)");
  const response = await fetchImpl(DISPATCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "world-news-globe-cron",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`GitHub refused to start the update (${response.status}): ${detail}`);
  }
  console.log(`Update workflow started (GitHub answered ${response.status})`);
}

export default {
  /**
   * @param {unknown} _controller
   * @param {{ GITHUB_TOKEN?: string }} env
   */
  async scheduled(_controller, env) {
    await startUpdate(env.GITHUB_TOKEN);
  },
};
