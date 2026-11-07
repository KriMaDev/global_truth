# Deploying

The site is a Cloudflare Worker with static assets only, named `world-news-globe`, served at **globe.krimadev.com**. It runs the same way as krimadev.com, on KriMa's Cloudflare account, with the zone `krimadev.com`.

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

`.github/workflows/update.yml` runs at minutes 7 and 37 of every hour, and can also be run by hand (Actions → Update data and deploy → Run workflow). Each run:
1. builds the gazetteer once a month (cached);
2. runs the pipeline against the data already live;
3. builds the site;
4. deploys it.

It needs, under GitHub → the repository → Settings → Secrets and variables → Actions:
- **Secrets**:
  - `CLOUDFLARE_API_TOKEN`: Cloudflare dashboard → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**, account KriMa, zone krimadev.com.
  - `CLOUDFLARE_ACCOUNT_ID`: shown on the Workers & Pages overview page.
- **Variable** `LIVE` = `true`: the switch. Without it the workflow does nothing, so nothing goes public by accident. Set it to `false` to pause the updates (the site stays as last deployed).

GitHub pauses scheduled workflows in a repository with no activity for 60 days; a commit, or re-enabling the workflow under Actions, starts it again. The readout's "DATA" time shows when the data was last updated.

## Rollback

Cloudflare dashboard → Workers & Pages → `world-news-globe` → Deployments → pick an earlier version → Rollback. Or run `npx wrangler rollback`.

## Remove the site

Delete the Worker in the dashboard. Its custom domain and DNS record go with it.
