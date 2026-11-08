# Deploying

The site is a Cloudflare Worker with static assets and a small timer script (`worker/index.js`), named `world-news-globe`, served at **globe.krimadev.com**. It runs the same way as krimadev.com, on KriMa's Cloudflare account, with the zone `krimadev.com`.

## By hand, from this computer

```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:Path
$env:CLOUDFLARE_ACCOUNT_ID = "<account ID from the Cloudflare dashboard>"
cd pipeline; .venv\Scripts\python -m globe_pipeline.run --out ..\frontend\public\data; cd ..
npm ci
npm run deploy        # builds frontend/dist (with the data), then `wrangler deploy`
```

`wrangler login` is already done on this PC. The custom-domain route in `wrangler.jsonc` makes Cloudflare create the `globe` DNS record and its certificate on the first deploy, so no DNS work is needed by hand. **Never deploy without fresh data**: a build without `frontend/public/data/` shows "Couldn't load the latest events".

## Automatically (every 30 minutes)

**Timer.** A Cloudflare Cron Trigger on the Worker (`wrangler.jsonc`, `worker/index.js`) fires at minutes 7 and 37 of every hour and asks GitHub's API to start `.github/workflows/update.yml` (a `workflow_dispatch`). GitHub's own scheduler started only 3 of about 16 planned runs on 7 Nov 2026, so it is kept only as a **backup**: every 3 hours at minute 52, and that run stops early when the live data is less than 40 minutes old. The workflow can also be run by hand (Actions → Update data and deploy → Run workflow).

The timer needs one Worker secret, **`GITHUB_TOKEN`**:
1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access: **Only select repositories** → `KriMaDev/global_truth`. Permissions → Repository permissions → **Actions: Read and write** (nothing else). Expiration: the longest offered; write the date in CLAUDE.md.
3. In the project folder: `npx wrangler secret put GITHUB_TOKEN`, then paste the token when asked. It is stored by Cloudflare only, never in a file. Secrets survive deploys.
4. When the token expires (or is revoked), the timer's runs fail with "401" in the Worker's logs (Cloudflare dashboard → Workers & Pages → `world-news-globe` → Logs), and the backup schedule keeps the site updated every 3 hours until a new token is set the same way.

Cloudflare's free plan includes Cron Triggers (a few per account). The timer is installed by `wrangler deploy` itself, so the next deploy after a change to `triggers` applies it.

Each run:
1. builds the gazetteer once a month (cached);
2. runs the pipeline against the data already live;
3. builds the site;
4. deploys it.

It needs, under GitHub → the repository → Settings → Secrets and variables → Actions:
- **Secrets**:
  - `CLOUDFLARE_API_TOKEN`: Cloudflare dashboard → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**, account KriMa, zone krimadev.com.
  - `CLOUDFLARE_ACCOUNT_ID`: shown on the Workers & Pages overview page.
- **Variable** `LIVE` = `true`: the switch. Without it the workflow does nothing, so nothing goes public by accident. Set it to `false` to pause the updates (the site stays as last deployed).

GitHub pauses *scheduled* workflows in a repository with no activity for 60 days; that only stops the backup, not the Cloudflare timer. The readout's "DATA" time shows when the data was last updated.

## Rollback

Cloudflare dashboard → Workers & Pages → `world-news-globe` → Deployments → pick an earlier version → Rollback. Or run `npx wrangler rollback`.

## Remove the site

Delete the Worker in the dashboard. Its custom domain and DNS record go with it.
