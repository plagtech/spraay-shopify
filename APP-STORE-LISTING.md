# Spraay — Batch Crypto Payouts · App Store Listing

> **Note:** This listing copy was prepared for a Shopify App Store submission. The
> app is now distributed as open-source via GitHub — merchants self-host it and
> install it on their store as a custom distribution app. See the
> [README](README.md) for setup. The copy below is kept for reference and for
> anyone who forks this app and wants to pursue a listing of their own.

## App Name
Spraay — Batch Crypto Payouts

## Tagline
_(max 100 characters)_

Batch crypto payouts — pay multiple wallets at once in a single USDC transaction.

## App Card Subtitle
_(short benefit line shown on the listing card — sells the outcome, not the feature)_

Pay all your affiliates, creators, and suppliers at once — sub-cent fees, no monthly subscription.

## Detailed Description

Spraay is batch crypto payments for Shopify — the fast way to pay multiple
wallets at once. Instead of sending one transfer at a time, you upload a CSV (or
paste a list), review the totals, and run a single crypto mass payout that pays
every recipient together. Payouts settle in USDC on Base, so a bulk crypto
payout of ten or ten thousand recipients goes out in one USDC payout transaction.

Spraay is built for paying people *out*, not taking payments in. Use it for
affiliate payout crypto programs, influencer commissions, creator royalties,
supplier payments crypto, contractor wages, and team payroll — anywhere you owe
many recipients at once. Most crypto apps on Shopify are checkout tools for
accepting money from customers; Spraay is the inverse, purpose-built for
merchants who need to send bulk crypto payments to a long list of wallets.

The economics are simple: one transaction instead of dozens. Because every
recipient settles in the same on-chain batch, you pay network gas once, and USDC
on Base keeps fees at a fraction of a cent per recipient with funds arriving in
seconds. Recipients need no crypto knowledge — they just receive USDC in the
wallet they already have. Pricing is a flat 0.3% per payout with no monthly
subscription, so you only pay when you actually send.

## Key Features

- **Batch crypto payments in one transaction** — pay multiple wallets at once and only pay network gas a single time.
- **Crypto mass payout in USDC on Base** — stablecoin USDC payouts with sub-cent fees that settle in seconds.
- **CSV upload or paste** — import a recipient list for bulk crypto payments, or paste wallet addresses and amounts directly; download a ready-made template.
- **Built for affiliate & supplier payouts** — pay affiliate commissions, creator royalties, supplier payments, and contractor wages from one screen.
- **Clear review before you send** — see recipient count, payout total, the 0.3% fee, and total cost before approving anything.
- **Bring your own wallet + full history** — connect MetaMask, Coinbase Smart Wallet, and more (you always hold your own funds), and track every batch with an on-chain link on BaseScan.

## How It Works

1. **Connect your wallet** — link MetaMask, Coinbase Smart Wallet, or another supported wallet on Base.
2. **Add recipients** — upload a CSV or paste a list of wallet addresses and amounts to pay multiple wallets at once.
3. **Review totals + fee** — Spraay parses your list and shows the recipient count, payout total, 0.3% fee, and total cost.
4. **Approve USDC** — authorize the batch contract to spend the required USDC.
5. **Execute the batch** — run the crypto mass payout, sending to every recipient in one transaction.
6. **Track in history** — follow the status and view the USDC payout transaction on BaseScan any time.

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

1. batch crypto payments
2. mass payout
3. USDC payments
4. affiliate payout
5. bulk wallet payments

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
