import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * GDPR / privacy compliance webhooks (mandatory for App Store submission).
 *
 * Shopify delivers all three mandatory compliance topics to this single
 * endpoint (configured via `compliance_topics` in shopify.app.toml):
 *   - CUSTOMERS_DATA_REQUEST
 *   - CUSTOMERS_REDACT
 *   - SHOP_REDACT
 *
 * `authenticate.webhook()` verifies the Shopify HMAC signature before we get
 * here. If the signature is missing or invalid it throws a 401 Response, so any
 * request that reaches our handler code is already authenticated.
 *
 * Spraay stores NO customer personal data — only merchant settings, wallet
 * addresses, and payout transaction records — so the customer topics have
 * nothing to export or delete. `shop/redact` deletes the merchant's data.
 */
export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} compliance webhook for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      // We do not collect or store any customer personal data, so there is
      // nothing to export. Acknowledge the request.
      console.log(
        `customers/data_request for ${shop}: no customer PII stored — nothing to export`,
        { customer: payload?.customer?.id, ordersRequested: payload?.orders_requested },
      );
      break;

    case "CUSTOMERS_REDACT":
      // No customer PII is stored, so there is nothing to redact/delete.
      console.log(
        `customers/redact for ${shop}: no customer PII stored — nothing to delete`,
        { customer: payload?.customer?.id },
      );
      break;

    case "SHOP_REDACT":
      // Merchant uninstalled and the 48h grace period has passed. Delete all of
      // their data: payout records, recipients, merchant settings, and sessions.
      await redactShop(shop);
      break;

    default:
      // Unknown/unhandled compliance topic — acknowledge so Shopify does not retry.
      console.warn(`Unhandled compliance webhook topic: ${topic}`);
  }

  // Always 200 once authenticated so Shopify marks the webhook as delivered.
  return new Response();
};

/**
 * Delete every record tied to a shop. Children are removed before parents
 * because the schema has no ON DELETE CASCADE. Runs in a transaction so a
 * partial delete can't leave orphaned rows.
 */
async function redactShop(shop) {
  const merchant = await db.merchant.findUnique({ where: { shop } });

  if (merchant) {
    await db.$transaction([
      // Recipients -> PayoutBatches -> Merchant (FK order).
      db.recipient.deleteMany({ where: { batch: { merchantId: merchant.id } } }),
      db.payoutBatch.deleteMany({ where: { merchantId: merchant.id } }),
      db.merchant.delete({ where: { id: merchant.id } }),
    ]);
    console.log(`shop/redact for ${shop}: deleted merchant ${merchant.id} and payout records`);
  } else {
    console.log(`shop/redact for ${shop}: no merchant record found`);
  }

  // Remove any lingering Shopify sessions for the shop.
  await db.session.deleteMany({ where: { shop } });
}
