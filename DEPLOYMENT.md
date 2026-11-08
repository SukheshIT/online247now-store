# Deployment (free): Netlify site + Render free API + Turso database

```
Visitor ──► online247now.netlify.app (static React site, Netlify)
                 │  /api/*  (Netlify proxy, same origin → cookies + wallet sign-in work)
                 ▼
            Render free web service (server/index.js)
                 │
                 ▼
            Turso free database (orders, sessions, products AND product files)
```

Free-plan behaviour: Render sleeps after 15 idle minutes; the first visit afterwards takes
about a minute while the site shows "Connecting to the store…".

## 1. Turso (database) – done by the owner
1. Sign up at https://turso.tech (free) → Create database `online247now` (region near you).
2. Copy the database URL (`libsql://online247now-<name>.turso.io`) and create an auth token.
   Keep both private – they go only into Render's Environment settings.

## 2. GitHub
Create a private repository (e.g. `online247now-store`) and push this folder
(`node_modules`, `dist`, `data`, `review`, `.env` are git-ignored).

## 3. Render (API)
Render → New → Blueprint → pick the repository (uses `render.yaml`), or New → Web Service:
- Runtime Node, Plan **Free**, Build `npm ci && npm run build`, Start `node server/index.js`,
  Health check path `/api/health`.
- Environment:
  | Key | Value |
  |---|---|
  | NODE_ENV | production |
  | APP_ORIGIN | https://online247now.netlify.app |
  | TURSO_DATABASE_URL / TURSO_AUTH_TOKEN | from Turso (enter yourself) |
  | ADMIN_WALLETS | your owner wallet address (can publish products) |
  | PAYOUT_WALLET | the wallet that receives USDC on Base |
  | RPC_URL | https://mainnet.base.org (or a free Alchemy/QuickNode Base URL) |
  | CONFIRMATIONS | 12 |
  | SUPPORT_EMAIL | your support email |
  | PAYMENTS_ENABLED | false at first; true after the test purchase |
- After deploy, open `https://<service>.onrender.com/api/health` – it must return JSON.

## 4. Netlify (site)
Edit `public/_redirects`: replace the `/api/*  /api-offline.json  404` line with
`/api/*  https://<service>.onrender.com/api/:splat  200`, run `npm run build`,
and drag the `dist` folder onto Netlify → Deploys.

## 5. Go live
1. Open the site, connect the owner wallet → **Publish** appears → upload a real product (≤ 50 MB).
2. Set `PAYMENTS_ENABLED=true` on Render.
3. From a second wallet, buy it for a small amount (e.g. $0.50 test product), wait for
   confirmations, download, refresh, and check it reappears in My library. Then delete/unpublish
   the test product only through the database if needed.

## Facts
- Network Base mainnet (chain 8453); USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Circle native USDC).
- The server marks an order paid only after it finds, on-chain, an exact USDC `Transfer` from the
  signed-in wallet to the payout wallet for the order amount, mined after the order was created,
  with the required confirmations. No private keys are ever requested or stored.
