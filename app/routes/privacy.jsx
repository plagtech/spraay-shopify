/**
 * Public privacy policy page for Spraay.
 *
 * This route intentionally does NOT call `authenticate.*` — it must be reachable
 * by Shopify reviewers and merchants without an embedded session. It renders a
 * self-contained page (no Polaris, which is only loaded inside the /app layout).
 */

export const meta = () => [
  { title: "Privacy Policy · Spraay" },
  { name: "robots", content: "index" },
];

const LAST_UPDATED = "July 7, 2026";

export default function Privacy() {
  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "48px 24px 96px",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: "#1a1a1a",
        lineHeight: 1.6,
      }}
    >
      <header style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "32px", margin: "0 0 8px", fontWeight: 700 }}>
          Privacy Policy
        </h1>
        <p style={{ color: "#616161", margin: 0 }}>
          Spraay — Batch USDC Payouts · Last updated {LAST_UPDATED}
        </p>
      </header>

      <p>
        Spraay (&ldquo;the App&rdquo;) is a Shopify embedded app that lets
        merchants send batch USDC payouts to multiple recipients in a single
        transaction on the Base blockchain. The App is developed and operated by
        PlagTech (&ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy explains what
        data we collect, how we use it, and the choices you have.
      </p>

      <Section title="Data we collect">
        <ul>
          <li>
            <strong>Shopify store information</strong> — your shop domain and the
            merchant email associated with your store, used to authenticate the
            App and provide its functionality.
          </li>
          <li>
            <strong>Wallet addresses</strong> — the blockchain wallet addresses
            you connect and the recipient addresses you enter for payouts.
          </li>
          <li>
            <strong>Payout transaction records</strong> — details of batches you
            create, such as amounts, recipient counts, fees, on-chain transaction
            hashes, and status.
          </li>
        </ul>
      </Section>

      <Section title="Data we do NOT collect">
        <ul>
          <li>
            <strong>Customer personal data.</strong> The App does not access,
            store, or process your customers&rsquo; names, emails, addresses, or
            order details.
          </li>
          <li>
            <strong>Payment card information.</strong> Payouts settle on-chain in
            USDC; we never handle credit or debit card data.
          </li>
        </ul>
      </Section>

      <Section title="How we use your data">
        <p>
          We use the data above solely to operate the App: authenticating your
          store, letting you build and review payout batches, submitting
          transactions to the Base network, and showing your payout history. We
          do not sell your data or use it for advertising.
        </p>
      </Section>

      <Section title="Third-party services">
        <ul>
          <li>
            <strong>Supabase</strong> — hosts the PostgreSQL database where your
            merchant settings and payout records are stored.
          </li>
          <li>
            <strong>Base blockchain</strong> — a public ledger. Wallet addresses,
            amounts, and transaction hashes for payouts you execute are recorded
            publicly on-chain and are outside our control once submitted.
          </li>
        </ul>
      </Section>

      <Section title="Data retention">
        <p>
          We retain your payout records and settings for as long as the App is
          installed. When you uninstall the App, Shopify sends us a{" "}
          <code>shop/redact</code> request and we delete your merchant settings
          and payout records from our database. Data already written to the Base
          blockchain is public and permanent and cannot be deleted.
        </p>
      </Section>

      <Section title="GDPR &amp; CCPA compliance">
        <p>
          We support the mandatory Shopify privacy webhooks
          (<code>customers/data_request</code>, <code>customers/redact</code>,
          and <code>shop/redact</code>). Because the App stores no customer
          personal data, customer data-request and redaction requests have
          nothing to export or delete. Merchants may request export or deletion
          of their own data at any time by contacting us.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions or requests about this policy or your data can be sent to{" "}
          <a href="mailto:support@spraay.app">support@spraay.app</a>.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginTop: "32px" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 12px" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
