# Spraay — Batch USDC Payouts · App Store Listing

## App Name
Spraay — Batch USDC Payouts

## Tagline
_(max 100 characters)_

Pay hundreds of recipients in one USDC transaction — low fees, no crypto expertise required.

## Detailed Description

Spraay lets Shopify merchants send USDC to many recipients at once — in a single
on-chain transaction on Base. Whether you're paying affiliates, creators,
suppliers, contractors, or cashback to customers, you upload a CSV (or paste a
list), review the totals and fee, approve, and send. One click pays everyone,
instead of sending dozens of individual transfers.

Batching is what makes Spraay cheap and fast. Every extra recipient in a normal
payout means another transaction and another gas fee; with Spraay they all
settle together, so you pay network gas once. Because payouts use USDC on Base —
a low-cost Ethereum Layer 2 — fees are a fraction of a cent per recipient and
funds arrive in seconds, not days. There are no wire fees, no FX markups, and no
minimum batch size.

Spraay is built for merchants, not crypto engineers. The interface is
Polaris-native, so it looks and behaves like the rest of your Shopify admin. You
connect a wallet you already own (MetaMask, Coinbase Smart Wallet, and more),
and Spraay walks you through each step with plain-language guidance and
up-front totals. Your customers' data is never touched — Spraay only ever sees
wallet addresses and payout amounts you provide.

## Key Features

- **Batch payouts in one transaction** — pay hundreds of recipients at once and only pay network gas a single time.
- **USDC on Base** — stablecoin payments with sub-cent fees that settle in seconds.
- **CSV upload or paste** — import a recipient list, or paste addresses and amounts directly; download a ready-made template.
- **Clear review before you send** — see recipient count, payout total, the 0.3% fee, and total cost before approving anything.
- **Bring your own wallet** — connect MetaMask, Coinbase Smart Wallet, and other popular wallets; you always hold your own funds.
- **Payout history & tracking** — every batch is recorded with status and a link to the on-chain transaction on BaseScan.

## How It Works

1. **Connect your wallet** — link MetaMask, Coinbase Smart Wallet, or another supported wallet on Base.
2. **Add recipients** — upload a CSV or paste a list of wallet addresses and amounts.
3. **Review totals + fee** — Spraay parses your list and shows the recipient count, payout total, 0.3% fee, and total cost.
4. **Approve USDC** — authorize the batch contract to spend the required USDC.
5. **Execute the batch** — send to every recipient in one transaction.
6. **Track in history** — follow the status and view the transaction on BaseScan any time.

## Pricing

**Free** — no monthly subscription. Spraay charges a **0.3% fee per payout**,
collected on-chain as part of each batch transaction. You only pay when you send.

> Configured as a Shopify **managed (App Pricing) free plan** in the Partner
> Dashboard. A free managed plan requires no Billing API code in the app — see
> the Billing note below. Paid tiers can be added later without changing the app.

## Category Suggestion
Finances (alternatively: Payments)

## Search Terms
_(5 terms, one idea each, complete words only)_

1. payouts
2. usdc
3. batch payments
4. affiliate payments
5. crypto payments

---

## Billing Note (internal — not part of the public listing)

As of April 2026, Shopify recommends **Shopify App Pricing (managed pricing)**
for new apps, configured in the **Partner Dashboard** (App → Pricing), rather
than the legacy Billing API mutations (`appSubscriptionCreate`, etc.).

For Spraay we are launching with a **single Free plan** to drive adoption:

- **No in-app billing code is required.** A managed free plan needs no
  `billing` config in `shopify.server.js` and no billing mutations. The app can
  ship as-is.
- Revenue comes from the on-chain **0.3% per-payout fee**, which is handled by
  the batch smart contract on Base — not through Shopify billing.
- To add paid tiers later, define them under **Managed Pricing** in the Partner
  Dashboard; only introduce Billing API code if we need usage-based or
  metered charges that managed pricing can't express.

**Action for submission:** In the Partner Dashboard, set the app's pricing to a
Free plan before submitting for review. No code change needed.
