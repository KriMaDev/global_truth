# Deploying

The site is a Cloudflare Worker with static assets only, named `world-news-globe`, served at **globe.krimadev.com**. It runs the same way as krimadev.com, on KriMa's Cloudflare account, with the zone `krimadev.com`.

## By hand, from this computer

```powershell
$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:Path
npm ci
npm run deploy        # builds frontend/dist, then `wrangler deploy`
```

`wrangler login` is already done on this PC. The custom-domain route in `wrangler.jsonc` makes Cloudflare create the `globe` DNS record and its certificate on the first deploy, so no DNS work is needed by hand.

## Automatically (from milestone 3)

`.github/workflows/update.yml` runs every 30 minutes: it runs the pipeline, builds the site with the fresh data, and deploys. It needs two repository secrets (GitHub → Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN`: Cloudflare dashboard → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**, account KriMa, zone krimadev.com.
- `CLOUDFLARE_ACCOUNT_ID`: shown on the Workers & Pages overview page.

## Rollback

Cloudflare dashboard → Workers & Pages → `world-news-globe` → Deployments → pick an earlier version → Rollback. Or run `npx wrangler rollback`.

## Remove the site

Delete the Worker in the dashboard. Its custom domain and DNS record go with it.
