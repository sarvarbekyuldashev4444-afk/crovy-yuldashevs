# Fly.io Deploy

1. Check real values in `config.txt`, or set the same keys as Fly secrets/env vars.
2. `fly auth login`
3. `fly volumes create data --size 1 --region fra`
4. `fly deploy`

The app serves the Telegram WebApp and API on port `8080`.
Before app startup, `scripts/prepare_market_db.py` automatically extracts `market.zip` to `/app/market.db`.
After that, on the first start, `market.db` and files from `webapp/uploads/` are copied into the Fly volume at `/data` if the volume is empty.
`config.txt` is ignored by git because it contains runtime values, but it is included in the Docker build context for direct `fly deploy` from this folder.
GitHub Actions deployments do not have `config.txt`, so set required values on Fly first, for example:

`fly secrets set BOT_TOKEN=... ADMIN_ID=... APP_URL=https://crovy-yuldashevs.fly.dev WEBAPP_URL=https://crovy-yuldashevs.fly.dev`

Production URL:

`https://crovy-yuldashevs.fly.dev`
