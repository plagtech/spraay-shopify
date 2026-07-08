# Spraay Shopify Batch Payout App — Project Context

## What this is
A Shopify embedded app that lets merchants send batch USDC payouts to multiple recipients in one transaction on Base network. Built with Remix + Shopify App Bridge + Polaris + wagmi + viem.

## Repo & Structure
- GitHub: `plagtech/spraay-shopify`
- The working v3 app lives in the `spraay/` subfolder (NOT the root-level `app/` folder, which is an old scaffold)
- The root-level `shopify.web.toml` was deleted to avoid conflicts — the only valid one is `spraay/shopify.web.toml`
- Dev command: `npm run dev` from the root `spraay-shopify/` directory

## Stack
- **Framework**: Remix (via `@shopify/shopify-app-remix`), Vite
- **UI**: Shopify Polaris React components (`@shopify/polaris`)
- **Wallet**: wagmi v3.6.17, viem v2.53.1
- **Chain**: Base (chain ID 8453)
- **DB**: Supabase PostgreSQL via Prisma (schema in `spraay/prisma/schema.prisma`)
- **Auth**: Shopify App Bridge (handled by `shopify.server.js`)

## Key Files (all paths relative to `spraay/`)
- `app/routes/app.payouts.new.jsx` — Main payout flow (upload CSV → review → approve → execute → record)
- `app/routes/app._index.jsx` — Dashboard with stats cards
- `app/routes/app.history.jsx` — Payout history with filters
- `app/routes/app.settings.jsx` — Wallet config, API key
- `app/routes/app.jsx` — Layout with nav menu, wraps WalletProvider
- `app/components/WalletButton.jsx` — Wallet connect button with SSR hydration guard
- `app/components/WalletProvider.jsx` — wagmi + react-query provider
- `app/lib/wagmi.config.js` — wagmi config (chains, connectors, transports)
- `app/lib/spraay.js` — Batch contract ABI, USDC address, parseCSV helper, sample CSV
- `app/shopify.server.js` — Shopify auth config
- `app/db.server.js` — Prisma client singleton

## Smart Contracts
- Batch contract on Base: `0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC`
- USDC on Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Fee recipient wallet: `0x033d3ce3BFd69B1d180869308822075219e771b5` (williedontstop.eth)
- Batch contract function: `sprayToken(address token, Recipient[] recipients)` where Recipient is `{address to, uint256 amount}`

## What's Working (verified on the Dell Hp laptop — old machine)
- ✅ Dashboard renders with stats cards, empty state, "Create Payout" link
- ✅ New Payout page renders: wallet buttons, CSV upload/paste, file drop zone
- ✅ CSV parse works: Load Sample → Parse & Review shows recipients table with totals/fees
- ✅ MetaMask wallet connect works (popup appears, address + balance shown)
- ✅ Coinbase Smart Wallet, Keplr, Phantom popups work
- ✅ Review screen shows: recipients count, payout total, fee (0.3%), total cost, data table
- ✅ Supabase DB connected and querying
- ✅ History page renders with status filters
- ✅ Settings page renders
- ✅ Nav menu works (Dashboard, New Payout, History, Settings)
- ✅ No white screen — all routes render in Shopify admin iframe

## Recent Fixes Applied (in this session, on old machine only — NOT pushed to GitHub)
1. **`app/routes/app.payouts.new.jsx`** — Full rewrite. Old version had auto-advance logic firing inside render cycle causing React state bugs. New version uses useEffect state machine with refs: UPLOAD → REVIEW → APPROVING → EXECUTING → RECORDING → DONE → ERROR. Added balance checking, CSV template download, crypto-beginner help text.
2. **`app/components/WalletButton.jsx`** — Added SSR hydration guard (mounted state), loading spinner, friendly labels (🔵 Coinbase Smart Wallet, 🦊 MetaMask / Browser Wallet).
3. **`app/routes/app._index.jsx`** — Dashboard stats now count both "confirmed" and "submitted" batches.
4. **`app/routes/app.history.jsx`** — Consolidated filter tabs to All/Pending/Confirmed/Failed.
5. **`app/lib/wagmi.config.js`** — Changed `smartWalletOnly` to `all` for Coinbase. NEEDS ONE MORE FIX (see below).

## Immediate Fix Needed
**`app/lib/wagmi.config.js`**: Change `injected()` to `injected({ target: "metaMask" })`. The generic `injected()` connector gets hijacked by Trust Wallet extension if installed, opening Trust Wallet instead of MetaMask. The explicit target forces MetaMask.

Current file should be:
```js
import { http, createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

export const config = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: "Spraay Payouts",
      preference: "all",
    }),
    injected({ target: "metaMask" }),
  ],
  transports: {
    [base.id]: http(),
  },
  ssr: true,
});
```

NOTE: Do NOT use `metaMask()` from `wagmi/connectors` — it doesn't exist in wagmi 3.6.17. Use `injected({ target: "metaMask" })` instead.

## Remaining TODO (in priority order)
1. **Fix wagmi config** (the metaMask target fix above)
2. **Test wallet connection** — MetaMask should connect, show address + USDC balance on Base
3. **Test a real batch payout** — Use small amounts of USDC on Base. The flow: connect wallet → load CSV → parse → review → approve USDC spend → execute sprayToken → record to DB
4. **Polish UI styling** — Currently functional but unstyled beyond default Polaris. Could improve layout, spacing, the wallet card design
5. **Railway deployment** — Dockerfile needs `node:20-alpine` (not node:18). Add Procfile. Set env vars on Railway (DATABASE_URL, DIRECT_URL, SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, NODE_ENV=production)
6. **Push all changes to GitHub** — Nothing from this session was pushed
7. **Shopify App Store submission** — After Railway is live

## Railway Deployment Gotchas
- **`PORT=3000` MUST be set as a Railway service variable.** The Dockerfile's
  `EXPOSE 3000` set the service domain's `targetPort` to 3000, but `remix-serve`
  otherwise binds to Railway's injected `PORT` (8080). The mismatch makes
  Railway's proxy route to :3000 where nothing listens → **502 "Application
  failed to respond" on every route**. Pinning `PORT=3000` makes remix-serve
  bind to 3000, matching `targetPort` and `EXPOSE`. This variable is
  load-bearing — if the service is recreated, re-add it (or set the domain's
  target port to whatever the app binds).
- A 502 with the deployment showing "Online"/instance RUNNING is a port/proxy
  mismatch, NOT a crash. Check logs first: if `prisma migrate deploy` succeeds
  and `remix-serve` prints its listen URL, the app is healthy and the problem is
  routing. (The Supabase password rotation was a red herring — Railway's
  DATABASE_URL/DIRECT_URL connect fine via the pooler host.)
- Diagnose with: `railway link -p pretty-rebirth -e production -s spraay-shopify`,
  then `railway logs` and `railway status --json` (look for `targetPort`). The
  Railway service `spraay-shopify` lives in project **pretty-rebirth**.

## Gotchas
- The `spraay/` subfolder structure means file paths in commands need to account for it
- Root-level `shopify.web.toml` must NOT exist (causes "conflicting configurations" error)
- Root-level `app/` folder is OLD scaffold — ignore it, work only in `spraay/app/`
- Prisma needs `.env` with DATABASE_URL and DIRECT_URL (Supabase connection strings)
- The Shopify app client_id is `955895a982d9e495af60ecf5e4f0d9c1`
- Dev store is `spraay-test.myshopify.com`
- Shopify CLI auto-updates sometimes — currently on 4.3.0
